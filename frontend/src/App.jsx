import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import Replay from "./Replay.jsx";
import "./highway.css";
const HighwayReplay = lazy(() => import("./HighwayLab.jsx"));
const HIGHWAY_DEFAULTS = {kind:"highway",speed_kmh:115,traffic_kmh:85,speed_variation:23,spacing_m:85,exit_distance_m:950,aggressiveness:.9,traffic_phase:3};
const HIGHWAY_FIELDS = [["speed_kmh","Target speed",80,130,1,"km/h"],["traffic_kmh","Traffic speed",60,110,1,"km/h"],["speed_variation","Traffic speed variation",0,30,1,"km/h"],["spacing_m","Traffic spacing",25,90,1,"m"],["exit_distance_m","Distance to exit",350,1600,10,"m"],["aggressiveness","Aggressiveness",.1,1,.05,""],["traffic_phase","Traffic pattern phase",0,30,.5,"rad"]];

import { Comparison, Notebook, Modal, Outcome } from "./components.jsx";
const DEFAULTS = {
  speed_kmh: 45,
  van_gap: 3,
  emerge_s: 0.8,
  reaction_s: 0.3,
  ped_speed: 1.8,
  brake_mps2: 6,
  pedestrian: true,
};
async function request(path, data, signal) {
  const res = await fetch(path, {
    signal,
    ...(data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error || "Request failed.");
  return result;
}
export default function App() {
  const [scene, setScene] = useState("crosswalk");
  return <><nav className="scene-switch" aria-label="Simulation scene"><strong>BLINDSPOT · SCENARIO LAB</strong><button aria-pressed={scene === "crosswalk"} onClick={() => setScene("crosswalk")}>Street</button><button aria-pressed={scene === "highway"} onClick={() => setScene("highway")}>Highway</button></nav><ScenarioLab key={scene} scene={scene} /></>;
}
function ScenarioLab({scene}) {
  const highway = scene === "highway";
  const defaults = highway ? HIGHWAY_DEFAULTS : DEFAULTS;
  const storageKey = highway ? "blindspot-highway-runs-v1" : "blindspot-runs-v1";
  const [draft, setDraft] = useState(defaults),
    [pair, setPair] = useState(null),
    [dirty, setDirty] = useState(false),
    [replaySource, setReplaySource] = useState(highway ? "Manual highway scenario" : "Manual crosswalk scenario"),
    [replayChanges, setReplayChanges] = useState(null),
    [simulating, setSimulating] = useState(false);
  const [policy, setPolicy] = useState("reactive"),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [concern, setConcern] = useState(
    highway ? "Investigate repeated left–right lane changes near a right-side highway exit." : "A pedestrian steps out from behind a parked van. When does the car brake too late?",
  );
  const [connection, setConnection] = useState({}),
    [hosted, setHosted] = useState(false),
    [mode, setMode] = useState("ai"),
    [budget, setBudget] = useState(12),
    [seed, setSeed] = useState("17");
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [dialog, setDialog] = useState(null),
    [counter, setCounter] = useState(null),
    [inspecting, setInspecting] = useState(false),
    [message, setMessage] = useState(null);
  const [runs, setRuns] = useState(() => {
    try {
      const r = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(r)
        ? r.filter((x) => x && Array.isArray(x.rows) && x.summary).slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  const notebookRef = useRef(null),
    sequence = useRef(0),
    toastTimer = useRef(null),
    runLock = useRef(false),
    active = useRef(true),
    poll = useRef(null);
  const notify = useCallback((text, error = false) => {
    setMessage({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setMessage(null),
      error ? 9000 : 4000,
    );
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      sequence.current++;
      poll.current?.abort();
      clearTimeout(toastTimer.current);
    };
  }, []);
  const simulate = useCallback(
    async (s, auto = false, source = null, preferredPolicy = null, changes = null) => {
      const seq = ++sequence.current;
      setSimulating(true);
      try {
        const result = await request("/api/simulate", { scenario: s });
        if (seq !== sequence.current || !active.current) return;
        setPair(result);
        setReplaySource(source || (s.kind === "highway" ? "Manual highway scenario" : "Manual crosswalk scenario"));
        setReplayChanges(changes);
        if (preferredPolicy) setPolicy(preferredPolicy);
        setDraft(result.reactive.scenario);
        setDirty(false);
        setTime(0);
        setPlaying(auto);
        return true;
      } catch (e) {
        if (seq === sequence.current && active.current) notify(e.message, true);
        return false;
      } finally {
        if (seq === sequence.current && active.current) setSimulating(false);
      }
    },
    [notify],
  );
  useEffect(() => {
    let cancelled = false;
    request("/api/status")
      .then((status) => {
        if (cancelled) return;
        setConnection(status.connection);
        setHosted(status.deployment === "hosted");
        if (status.deployment === "hosted") setBudget(12);
      })
      .catch((e) => {
        if (!cancelled) notify(e.message, true);
      });
    simulate(defaults);
    return () => {
      cancelled = true;
    };
  }, [simulate, notify, defaults]);
  function edit(key, value) {
    setDraft((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }
  async function download(value, name) {
    try {
      const r = await request("/api/export", { artifact: value, name });
      if (r.download) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(r.download, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify("Export downloaded.");
      } else notify("Saved in BlindSpot: " + r.saved);
    } catch (e) {
      notify(e.message, true);
    }
  }
  async function investigate(selected) {
    if (runLock.current) return;
    if (selected === "ai" && !connection.configured) {
      setDialog("connection");
      return;
    }
    const n = Number(seed);
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) {
      notify("Enter a whole-number seed from 0 to 4294967295.", true);
      return;
    }
    if (hosted && selected === "ai" && budget > 12) {
      notify("Hosted AI runs allow at most 12 scenarios.", true);
      return;
    }
    runLock.current = true;
    setBusy(true);
    setProgress("Preparing investigation…");
    const controller = new AbortController();
    poll.current = controller;
    try {
      const job = await request(
        "/api/investigate",
        { mode: selected, seed: n, budget, concern, scene: highway ? "highway" : "street" },
        controller.signal,
      );
      while (active.current && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        if (controller.signal.aborted) break;
        const state = await request(
          "/api/jobs/" + job.job_id,
          undefined,
          controller.signal,
        );
        if (state.status === "error") throw Error(state.error);
        if (state.status === "done") {
          setRuns((current) => {
            const next = [state.result, ...current].slice(0, 8);
            return next;
          });
          if (selected === "ai") {
            const rows = state.result.rows;
            const chosen = highway ? rows.reduce((best,row)=>row.reactive.direction_reversals>best.reactive.direction_reversals?row:best,rows[0]) : rows.find((row) => row.reactive.collision || row.cautious.collision) || rows[0];
            const chosenPolicy = highway ? "reactive" : chosen?.reactive.collision ? "reactive"
              : chosen?.cautious.collision ? "cautious" : "reactive";
            setProgress("Investigation complete. Loading an AI-generated case into the replay…");
            const labels = highway ? Object.fromEntries(HIGHWAY_FIELDS.map(field=>[field[0],[field[1],field[5]]])) : { speed_kmh: ["Vehicle speed", "km/h"], van_gap: ["Van gap", "m"], emerge_s: ["Pedestrian starts at", "s"], reaction_s: ["Reaction delay", "s"], ped_speed: ["Pedestrian speed", "m/s"], brake_mps2: ["Braking strength", "m/s²"], pedestrian: ["Pedestrian present", ""] };
            const before = pair?.reactive.scenario || defaults;
            const changes = chosen ? Object.entries(labels).filter(([key]) => before[key] !== chosen.scenario[key]).map(([key, [label, unit]]) => {
              const display = (value) => typeof value === "boolean" ? (value ? "yes" : "no") : `${value} ${unit}`;
              return `${label}: ${display(before[key])} → ${display(chosen.scenario[key])}`;
            }) : [];
            const loaded = chosen && await simulate(chosen.scenario, true,
              `Live AI · case ${chosen.index} of ${rows.length} · ${highway ? "most direction reversals" : chosen.reactive.collision || chosen.cautious.collision ? "first collision found" : "first generated case; no collisions found"}`,
              chosenPolicy, changes);
            setProgress(loaded
              ? `Completed ${state.result.budget} tests. Replaying AI case ${chosen.index}; explore the other cases in the notebook.`
              : "Investigation saved. Replay could not load; try opening a case from the notebook.");
            if (loaded) document.getElementById("replaySection")?.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            setProgress(`Completed ${state.result.budget} tests. Open a case in the notebook below.`);
            notebookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          notify("Investigation complete. Results are calculated by the simulator.");
          break;
        }
        setProgress(
          `${state.progress.completed || 0} tests complete · ${state.progress.message}`,
        );
      }
    } catch (e) {
      if (e.name !== "AbortError" && active.current) {
        setProgress(`Investigation stopped: ${e.message}. The previous replay is still displayed.`);
        notify(e.message, true);
      }
    } finally {
      runLock.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(runs));
    } catch {
      notify("Browser storage is full; export the run to keep it.");
    }
  }, [runs, notify, storageKey]);
  async function inspect() {
    setInspecting(true);
    try {
      const result = await request("/api/counterfactuals", {
        scenario: pair.reactive.scenario,
        policy,
      });
      setCounter(result);
      setDialog("counter");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setInspecting(false);
    }
  }
  const aiUnavailable = connection.enabled === false
    ? "Live AI is disabled on this deployment. The owner must enable it in the server settings."
    : "Live AI is unavailable. Check the server connection and API key setup.";
  const methodHelp =
    mode === "ai"
      ? connection.configured
        ? "Live AI selected. Click Start AI investigation to generate tests in the selected environment using your concern. Uses API credits; a generated case automatically plays in the replay when the run finishes."
        : aiUnavailable
      : mode === "systematic"
        ? "Fixed low-discrepancy coverage across all ranges. No model calls; includes pedestrian-free controls."
        : highway ? "A seeded random sample of highway traffic, lane-change, and exit parameters." : "A seeded random sample across all parameter ranges. Includes cases without pedestrians.";
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="BlindSpot home">
          <span className="brandmark">
            b<span>•</span>
          </span>
          blindspot<span className="brandtag">RESEARCH LAB</span>
        </a>
        <nav>
          <button
            className="navlink active"
            id="labNav"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Scenario lab
          </button>
          <button
            className="navlink"
            id="runsNav"
            onClick={() =>
              notebookRef.current.scrollIntoView({ behavior: "smooth" })
            }
          >
            Investigations <span id="runCount">{runs.length}</span>
          </button>
        </nav>
        <button
          id="connectionBtn"
          onClick={() => setDialog("connection")}
          className="connection"
        >
          <span className="dot"></span>
          <span id="connectionLabel">
            {connection.configured
              ? "Nebius key configured"
              : "Local simulation"}
          </span>
          <span>↗</span>
        </button>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-cross">+</span> AUTONOMOUS DRIVING / POLICY
              EVALUATION
            </div>
            <h1>
              Find the failure.
              <br />
              <span>Understand the why.</span>
            </h1>
            <p>Explore driving decisions through reproducible simulated scenarios.</p>
          </div>
          <div className="intro-note">
            <span className="note-number">01 /</span>
            <div>
              <strong>{highway ? "Highway · lane-change tests" : "Street · crosswalk tests"}</strong>
              <p>
                {highway ? "Moving traffic. Measured outcomes." : "Original city scenery. Measured outcomes."}
                <br />{highway ? "Vary traffic, lane choices, and exits." : "Vary visibility, timing, and braking."}
              </p>
              <span className="tag">SIMULATED ENVIRONMENT</span>
            </div>
          </div>
        </div>
        <div className="workspace">
          <aside className="panel settings">
            <div className="panel-title">
              <h2>{highway ? "Configure the highway" : "Configure the crosswalk"}</h2>
              <span className="step">01</span>
            </div>
            <label htmlFor="concern" className="field-label">
              WHAT DO YOU WANT TO INVESTIGATE?
            </label>
            <textarea
              id="concern"
              maxLength="1000"
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
            />
            <p className="field-help">
              Describe your concern, then click Generate &amp; replay with AI.
              When it finishes, a generated case automatically plays in the replay.
              Typing alone does not change the scene.{" "}
              {highway ? "Highway supports traffic, lane-change, and exit tests." : "Street supports pedestrian-crossing and occlusion tests."} Parking is not supported yet.
              {highway ? "Random search does not use this text." : "Random and systematic searches do not use this text."}
            </p>
            <button
              id="generateReplayBtn"
              className="primary full"
              disabled={busy || simulating}
              onClick={() => { setMode("ai"); investigate("ai"); }}
            >
              {busy ? "Investigation running…" : "Generate & replay with AI"} <span>↗</span>
            </button>
            <p className="field-help">Uses Nebius credits. {connection.configured ? "" : aiUnavailable}</p>
            {progress && <p className="job-progress" role="status">{progress}</p>}
            <div className="divider"></div>
            <h3>Manual parameters</h3>
            <p className="field-help">Adjust the controls below to replay a case without AI. These controls do not use the prompt above.</p>
            {highway ? HIGHWAY_FIELDS.map(([key,label,min,max,step,unit])=><div className="control" key={key}><label htmlFor={key}>{label}<output>{draft[key]} {unit}</output></label><input id={key} type="range" min={min} max={max} step={step} value={draft[key]} onChange={e=>edit(key,Number(e.target.value))}/></div>) : <>
            <div className="control">
              <label htmlFor="speed">
                Vehicle speed{" "}
                <output id="speedOut">{draft.speed_kmh} km/h</output>
              </label>
              <input
                id="speed"
                type="range"
                min="15"
                max="65"
                step="0.0001"
                value={draft.speed_kmh}
                onChange={(e) => edit("speed_kmh", Number(e.target.value))}
              />
              <div className="range-ends">
                <span>15 km/h</span>
                <span>65 km/h</span>
              </div>
            </div>
            <div className="control">
              <label htmlFor="gap">
                Van → crosswalk <output id="gapOut">{draft.van_gap} m</output>
              </label>
              <input
                id="gap"
                type="range"
                min="1"
                max="12"
                step="0.0001"
                value={draft.van_gap}
                onChange={(e) => edit("van_gap", Number(e.target.value))}
              />
              <div className="range-ends">
                <span>1 m · obstructed</span>
                <span>12 m · open</span>
              </div>
            </div>
            <div className="control">
              <label htmlFor="emerge">
                Pedestrian starts walking{" "}
                <output id="emergeOut">{draft.emerge_s} s</output>
              </label>
              <input
                id="emerge"
                type="range"
                min="0"
                max="6"
                step="0.0001"
                value={draft.emerge_s}
                onChange={(e) => edit("emerge_s", Number(e.target.value))}
              />
            </div>
            <div className="control">
              <label htmlFor="reaction">
                Braking response delay{" "}
                <output id="reactionOut">{draft.reaction_s} s</output>
              </label>
              <input
                id="reaction"
                type="range"
                min="0"
                max="1"
                step="0.0001"
                value={draft.reaction_s}
                onChange={(e) => edit("reaction_s", Number(e.target.value))}
              />
            </div>
            <details className="advanced">
              <summary>
                More parameters <span>+</span>
              </summary>
              <div className="control">
                <label htmlFor="pedSpeed">
                  Walking speed{" "}
                  <output id="pedSpeedOut">{draft.ped_speed} m/s</output>
                </label>
                <input
                  id="pedSpeed"
                  type="range"
                  min="0.8"
                  max="2.5"
                  step="0.0001"
                  value={draft.ped_speed}
                  onChange={(e) => edit("ped_speed", Number(e.target.value))}
                />
              </div>
              <div className="control">
                <label htmlFor="brake">
                  Braking strength{" "}
                  <output id="brakeOut">{draft.brake_mps2} m/s²</output>
                </label>
                <input
                  id="brake"
                  type="range"
                  min="3"
                  max="9"
                  step="0.0001"
                  value={draft.brake_mps2}
                  onChange={(e) => edit("brake_mps2", Number(e.target.value))}
                />
              </div>
              <label className="checkbox">
                <input
                  id="pedestrian"
                  type="checkbox"
                  checked={draft.pedestrian}
                  onChange={(e) => edit("pedestrian", e.target.checked)}
                />{" "}
                Include pedestrian
              </label>
            </details>
            </>}
            <button
              className="primary full"
              id="simulateBtn"
              disabled={simulating}
              onClick={() => simulate(draft, true)}
            >
              Apply parameters &amp; replay{" "}
              <span>↗</span>
            </button>
            <button
              className="quiet full"
              id="resetBtn"
              onClick={() => simulate(defaults)}
            >
              Reset parameters
            </button>
          </aside>
          <section className="center" id="replaySection">
            <p className="field-help" role="status" id="replaySource">{replaySource}{dirty ? " · unapplied parameter changes" : ""}</p>
            {replayChanges !== null && (
              <div className="job-progress" id="replayChanges" role="status">
                <strong>Changes from the replay shown when you started this investigation</strong>
                {replayChanges.length ? <ul>{replayChanges.map((change) => <li key={change}>{change}</li>)}</ul>
                  : <p>This generated case has the same inputs as the previous replay. Choose another case in the notebook.</p>}
                <p>{highway ? "Generated inputs control traffic speeds, gaps, exit distance, and lane decisions." : "The street layout stays fixed. Generated inputs control the van position, car motion, and pedestrian timing."}</p>
                <button className="text-btn" onClick={() => { setTime(0); setPlaying(true); }}>Replay this AI case ↻</button>
              </div>
            )}
            {highway ? <Suspense fallback={<p>Loading replay…</p>}><HighwayReplay {...{pair,policy,setPolicy,time,setTime,playing,setPlaying}} /></Suspense> : <Replay
              pair={pair}
              policy={policy}
              setPolicy={setPolicy}
              time={time}
              setTime={setTime}
              playing={playing}
              setPlaying={setPlaying}
              dirty={dirty}
              notify={notify}
            />}
            <Comparison pair={pair} inspect={inspect} loading={inspecting} highway={highway} />
          </section>
          <aside className="panel investigator">
            <div className="panel-title">
              <h2>Find challenging cases</h2>
              <span className="step">02</span>
            </div>
            <div className="agent-orb">
              <span>✳</span>
              <div>
                <strong>Test. Observe. Refine.</strong>
                <p>
                  Turn one concern into a set
                  <br />
                  of reproducible experiments.
                </p>
              </div>
            </div>
            <label className="field-label" htmlFor="searchMode">
              INVESTIGATION METHOD
            </label>
            <select
              id="searchMode"
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value);
                if (hosted && e.target.value === "ai") setBudget(12);
              }}
              className="select-full"
            >
              <option value="random">Random search · no AI</option>
              {!highway && <option value="systematic">Systematic search · no AI</option>}
              <option value="ai">NVIDIA Nemotron · live AI</option>
            </select>
            <p className="field-help" id="methodHelp" role="status" aria-live="polite">
              {methodHelp}
            </p>
            <div className="small-fields">
              <label>
                Test budget
                <select
                  id="budget"
                  value={budget}
                  disabled={busy}
                  onChange={(e) => setBudget(Number(e.target.value))}
                >
                  <option value="12">12 scenarios</option>
                  <option value="24">24 scenarios</option>
                  <option value="48">48 scenarios</option>
                </select>
              </label>
              <label>
                Seed
                <input
                  id="seed"
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  value={seed}
                  disabled={busy || mode !== "random"}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </label>
            </div>
            <button
              id="investigateBtn"
              disabled={busy}
              onClick={() => investigate(mode)}
              className="dark full"
            >
              {mode === "ai"
                ? connection.configured ? "Start AI investigation" : "Check AI connection"
                : "Start investigation"} <span>↗</span>
            </button>
            <div
              id="jobProgress"
              className="job-progress"
              hidden={!progress}
              role="status"
            >
              {progress}
            </div>
            <div className="divider"></div>
            <div className="field-label">WHAT YOU’LL GET</div>
            <ul className="benefits">
              <li>
                <span>↗</span> Replayable failure cases
              </li>
              <li>
                <span>↔</span> Both controllers, same tests
              </li>
              <li>
                <span>↓</span> Exportable evidence
              </li>
            </ul>
            <div className="honesty">
              <span>i</span>
              <p>
                <strong>Measured, not staged.</strong> Outcomes come from
                simulation. Live AI proposes tests; it does not determine the
                results.
              </p>
            </div>
            {!highway && <button
              id="heldoutBtn"
              disabled={busy}
              onClick={() => investigate("held-out")}
              className="quiet full"
            >
              Run independent evaluation ↗
            </button>}
          </aside>
        </div>
        <section
          id="resultsSection"
          ref={notebookRef}
          className="results-section"
        >
          <div className="section-head">
            <div>
              <div className="eyebrow">THE EVIDENCE</div>
              <h2>Investigation notebook</h2>
            </div>
            <button
              id="exportAllBtn"
              className="outline"
              disabled={!pair}
              onClick={() =>
                download(
                  {
                    version: pair.reactive.version,
                    scenario: pair.reactive.scenario,
                    results: pair,
                  },
                  "blindspot-" + pair.reactive.id + ".json",
                )
              }
            >
              Export current case ↓
            </button>
          </div>
          <Notebook
            highway={highway}
            runs={runs}
            download={download}
            load={(s) => {
              simulate(s, false, "Saved investigation case");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </section>
        <footer>
          <span>
            <strong>blindspot</strong> / Experimental policy evaluation
          </span>
          <span>
            3D replay · 2D geometry · {highway ? "10" : "40"} Hz physics · simplified sensing · not
            real-world safety validation
          </span>
        </footer>
      </main>
      {message && (
        <div
          id="toast"
          className={"toast" + (message.error ? " error" : "")}
          role="status"
        >
          {message.text}
        </div>
      )}
      {dialog === "connection" && (
        <Modal
          id="connectionDialog"
          title="Connect the investigator."
          eyebrow="NEBIUS TOKEN FACTORY"
          close={() => setDialog(null)}
        >
          <p id="connectionDetail">
            {connection.configured
              ? "A key is configured on the server. Live inference is verified when an AI investigation runs."
              : aiUnavailable}
          </p>
          {hosted ? (
            <p>
              Hosting configuration is managed by the project owner. Hosted AI
              runs have a shared daily allowance.
            </p>
          ) : (
            <ol>
              <li>Get a Token Factory API key in your Nebius account.</li>
              <li>
                Create <code>.env.local</code> beside <code>server.py</code>{" "}
                with <code>NEBIUS_TOKEN_FACTORY_KEY=your-key</code>.
              </li>
              <li>Restart the local server and reload this page.</li>
            </ol>
          )}
          <p>
            Live AI sends your concern and synthetic test measurements to Nebius
            and consumes credits. Keys stay on the server. No real driving
            footage is uploaded.
          </p>
          <button
            className="dark full close-dialog"
            onClick={() => setDialog(null)}
          >
            Got it
          </button>
        </Modal>
      )}
      {dialog === "counter" && counter && (
        <Modal
          id="counterDialog"
          title="Change one thing."
          eyebrow="CONTROLLED COMPARISONS"
          close={() => setDialog(null)}
        >
          <p>
            Each test changes one input. These are measured comparisons, not AI
            explanations or globally minimal failures.
          </p>
          <div id="counterBody">
            <p>
              Selected controller: {counter.base.policy}. Original outcome:{" "}
              {counter.base.metrics.collision ? "collision" : "no collision"}.
            </p>
            {counter.interventions.map((v, i) => (
              <div key={i} className="counter-row">
                <span>
                  {
                    {
                      speed_kmh: "Speed (km/h)",
                      reaction_s: "Response delay (s)",
                      van_gap: "Van gap (m)",
                      pedestrian: "Pedestrian present",
                    }[v.change]
                  }
                  : {String(v.from)} → {String(v.to)}
                </span>
                <Outcome metrics={v.metrics} />
                <button
                  className="text-btn"
                  onClick={() => {
                    setDialog(null);
                    simulate(v.scenario, true);
                  }}
                >
                  Replay ↗
                </button>
              </div>
            ))}
            <button
              className="outline"
              onClick={() =>
                download(counter, "blindspot-input-comparisons.json")
              }
            >
              Export comparisons ↓
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
