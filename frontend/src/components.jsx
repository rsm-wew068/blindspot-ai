import { useEffect, useRef } from "react";
export const names = {
  random: "Random search",
  systematic: "Systematic search",
  ai: "NVIDIA Nemotron investigation",
  "held-out": "Independent evaluation",
};
export const metric = (n, unit = "") =>
  n == null ? "—" : Number(n).toFixed(2) + (unit ? " " + unit : "");
export function Outcome({ metrics: m }) {
  return (
    <span
      className={
        "pill " + (m.collision ? "bad" : m.finished ? "good" : "neutral")
      }
    >
      {m.collision ? "COLLISION" : m.finished ? "COMPLETED" : "TIME LIMIT"}
    </span>
  );
}
export function Comparison({ pair, inspect, loading }) {
  const rows = [
    ["Impact speed", "impact_kmh", "km/h"],
    ["First braking", "first_brake_s", "s"],
    ["Minimum clearance", "min_clearance_m", "m"],
    ["Elapsed / end of run", "duration_s", "s"],
  ];
  return (
    <div className="panel comparison">
      <div className="panel-title">
        <h2>Same scenario. Different decisions.</h2>
        <span className="tag">MEASURED</span>
      </div>
      <div id="comparisonBody">
        {pair && (
          <table className="metric-table">
            <thead>
              <tr>
                <th>MEASUREMENT</th>
                <th>REACTIVE</th>
                <th>OCCLUSION-AWARE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Outcome</td>
                {["reactive", "cautious"].map((p) => (
                  <td key={p}>
                    <Outcome metrics={pair[p].metrics} />
                  </td>
                ))}
              </tr>
              {rows.map(([label, key, unit]) => (
                <tr key={key}>
                  <td>{label}</td>
                  {["reactive", "cautious"].map((p) => (
                    <td key={p}>{metric(pair[p].metrics[key], unit)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="comparison-footer">
        <span>Rule-based controllers · identical conditions</span>
        <button
          id="counterBtn"
          className="text-btn"
          disabled={!pair || loading}
          onClick={inspect}
        >
          Investigate inputs ↗
        </button>
      </div>
    </div>
  );
}
export function Notebook({ runs, load, download }) {
  return (
    <div
      id="notebook"
      className={"panel" + (!runs.length ? " empty-notebook" : "")}
    >
      {!runs.length ? (
        <>
          <span className="empty-icon">⌁</span>
          <div>
            <h3>Your next finding starts here.</h3>
            <p>
              Run an investigation to compare search methods and open individual
              failures.
            </p>
          </div>
          <span className="empty-index">00</span>
        </>
      ) : (
        runs.map((r, i) => (
          <article key={i} className="run-card">
            <div className="run-card-head">
              <div>
                <h3>{names[r.mode] || r.mode}</h3>
                <div className="metadata">
                  {r.budget} tests · {r.unique_scenarios} unique · {r.elapsed_s}
                  s runtime · {r.model || "No AI model"}
                  {r.mode === "random" ? " · seed " + r.seed : ""}
                </div>
              </div>
              <button
                className="outline"
                onClick={() =>
                  download(r, `blindspot-${r.mode}-${r.seed}.json`)
                }
              >
                Export run ↓
              </button>
            </div>
            <div className="run-summary">
              {["reactive", "cautious"].map((p) => (
                <div key={p}>
                  <b>
                    {r.summary[p].collisions} / {r.budget}
                  </b>
                  <span>
                    {p === "reactive" ? "Reactive" : "Occlusion-aware"}{" "}
                    collisions
                  </span>
                </div>
              ))}
              <div>
                <b>
                  {r.summary.reactive.first_failure_test === null
                    ? "—"
                    : "#" + r.summary.reactive.first_failure_test}
                </b>
                <span>First reactive failure</span>
              </div>
            </div>
            <div className="cases">
              {r.rows.map((row) => (
                <button
                  key={row.index}
                  className={
                    "case-button" +
                    (row.reactive.collision || row.cautious.collision
                      ? " failure"
                      : "")
                  }
                  onClick={() => load(row.scenario)}
                >
                  #{String(row.index).padStart(2, "0")}{" "}
                  {row.reactive.collision || row.cautious.collision
                    ? "↗ failure"
                    : "· clear"}
                </button>
              ))}
            </div>
            {r.mode === "ai" && (
              <details>
                <summary>Agent hypotheses and token usage</summary>
                {r.rounds.map((round, n) => (
                  <p key={n}>
                    Tests {round.first_test}–{round.last_test}:{" "}
                    {round.hypothesis} · reported tokens:{" "}
                    {round.usage.total_tokens ?? "unavailable"}
                  </p>
                ))}
              </details>
            )}
            <p className="run-note">{r.note}</p>
          </article>
        ))
      )}
    </div>
  );
}
export function Modal({ id, title, eyebrow, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog ref={ref} id={id} onCancel={close}>
      <div className="dialog-head">
        <div className="eyebrow">{eyebrow}</div>
        <button
          className="close-dialog"
          aria-label="Close dialog"
          onClick={close}
        >
          ×
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
