import { useEffect, useRef, useState } from "react";
import { drawMap } from "./map.js";
import { createImpactAudio, enteredCollision } from "./impact.js";
import { highwayFrame, drawHighwayMap } from "./highwayReplay.js";
import { frameAt } from "./replay.js";
const cameras = {
  chase: "Chase",
  driver: "Driver",
  overview: "Bird’s-eye",
  "2d": "2D map",
};
export default function Replay({
  scene,
  pair,
  policy,
  setPolicy,
  time,
  setTime,
  playing,
  setPlaying,
  dirty,
  notify,
}) {
  const highway = scene === "highway";
  const [camera, setCamera] = useState("chase"),
    [occlusion, setOcclusion] = useState(false),
    [available, setAvailable] = useState(false),
    [failed, setFailed] = useState(false),
    [speed, setSpeed] = useState(1);
  const map = useRef(null),
    canvas = useRef(null),
    view = useRef(null),
    latest = useRef(null),
    paint = useRef(() => {});
  const [sound, setSound] = useState(true);
  const audio = useRef(null), previous = useRef(null), playbackImpact = useRef(false);
  useEffect(() => () => { audio.current?.close(); audio.current = null; }, []);
  async function enableSound(enabled, preview = false) {
    setSound(enabled);
    if (!enabled) return;
    try {
      if (!audio.current) audio.current = createImpactAudio();
      if (!audio.current) throw Error('Audio unavailable');
      await audio.current.resume();
      if (preview) audio.current.play();
    } catch {
      setSound(false);
      notify('Sound is unavailable in this browser. Visual impact cues remain enabled.');
    }
  }
  useEffect(() => {
    if (!sound) return;
    const unlock = () => {
      if (!audio.current) audio.current = createImpactAudio();
      audio.current?.resume().catch(() => {});
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  }, [sound]);
  const candidate = pair?.[policy];
  const run = candidate && (candidate.scenario.kind === "highway") === highway ? candidate : null,
    duration = run?.metrics.duration_s || 0;
  const frame = run ? (highway ? highwayFrame : frameAt)(run.frames, time) : null,
    end = !!run && time >= duration,
    collision = end && run.metrics.collision;
  useEffect(() => {
    const current = {run, time, playing, duration, collision, fromPlayback: playbackImpact.current};
    playbackImpact.current = false;
    if (sound && enteredCollision(previous.current, current)) audio.current?.play() === false && notify('Audio is paused by the browser. Click Test sound to enable it.');
    previous.current = current;
  }, [run, time, playing, duration, collision, sound]);
  useEffect(() => {
    audio.current?.engine(sound && playing && !!frame && !end && !collision ? frame.v : null);
  }, [sound, playing, frame?.v, end, collision]);
  latest.current = {
    frame,
    highway,
    scenario: run?.scenario,
    time,
    collision,
    camera,
    occlusion,
    available,
  };
  paint.current = () => {
    const s = latest.current;
    if (!s.frame) return;
    (s.highway ? drawHighwayMap : drawMap)(map.current, s.frame, s.scenario, s.collision);
    if (view.current && s.camera !== "2d") {
      view.current.setCamera(s.camera);
      view.current.setOcclusion(s.occlusion);
      view.current.update(s.frame, s.scenario, s.time, s.collision);
    }
  };
  useEffect(() => {
    let cancelled = false,
      owned = null;
    const target = canvas.current;
    const fallback = (event) => {
      event?.preventDefault();
      setAvailable(false);
      setFailed(true);
      setCamera("2d");
      notify("3D is unavailable. The 2D replay remains available.");
    };
    target.addEventListener("webglcontextlost", fallback);
    setAvailable(false);setFailed(false);
    (highway ? import("./highwayScene.js") : import("./street.js"))
      .then((module) => {
        if (cancelled) return;
        if (highway) {
          const renderer = module.createHighway(target);
          let selectedCamera = camera;
          owned = {setCamera(value){selectedCamera=value;},setOcclusion(){},update(frame,scenario,time,collision){renderer.update(frame,scenario,selectedCamera === "overview" ? "top" : selectedCamera,collision);},dispose:renderer.dispose};
        } else owned = module.createStreet(target);
        view.current = owned;
        setAvailable(true);
      })
      .catch(() => {
        if (!cancelled) fallback();
      });
    const observer = new ResizeObserver(() => paint.current());
    observer.observe(map.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      target.removeEventListener("webglcontextlost", fallback);
      if (view.current === owned) view.current = null;
      owned?.dispose();
    };
  }, [notify, highway]);
  useEffect(() => {
    paint.current();
  }, [pair, policy, time, camera, occlusion, available]);
  useEffect(() => {
    if (!playing || !run) return;
    let id,
      previous = null,
      elapsed = time;
    function tick(now) {
      if (previous !== null)
        elapsed = Math.min(
          duration,
          elapsed + Math.min(0.1, (now - previous) / 1000) * speed,
        );
      previous = now;
      if (elapsed >= duration) playbackImpact.current = true;
      setTime(elapsed);
      if (elapsed >= duration) {
        setPlaying(false);
        return;
      }
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, run, duration, speed, setTime, setPlaying]);
  const use3d = available && camera !== "2d";
  const status = end
    ? collision
      ? "COLLISION DETECTED"
      : run.metrics.finished
        ? "SEGMENT COMPLETED"
        : "TIME LIMIT"
    : frame?.a < -0.1
      ? "BRAKING"
      : frame?.visible
        ? "PEDESTRIAN VISIBLE"
        : "REPLAY READY";
  return (
    <div className="panel simulation">
      <div className="panel-title">
        <h2>
          Live replay{" "}
          <span className="subtle">
            /{" "}
            <span id="viewLabel">
              {use3d
                ? {
                    chase: "Chase camera",
                    driver: "Driver view",
                    overview: "Bird’s-eye",
                  }[camera]
                : "2D map"}
            </span>
          </span>
        </h2>
        <span className="run-id" id="scenarioId">
          {run ? "CASE / " + run.id.toUpperCase() : "PREPARING"}
        </span>
      </div>
      <div className="policy-tabs" role="group" aria-label="Replay controller">
        {["reactive", "cautious"].map((p) => (
          <button
            key={p}
            id={p + "Tab"}
            className={p === policy ? "selected" : ""}
            onClick={() => {
              setPolicy(p);
              setPlaying(false);
              setTime(Math.min(time, pair?.[p].metrics.duration_s || 0));
            }}
          >
            {pair?.labels?.[p] || (p === "reactive"
              ? (highway ? "Aggressive controller" : "Reactive controller")
              : (highway ? "Exit-aware controller" : "Occlusion-aware controller"))}
          </button>
        ))}
      </div>
      <div className="view-toolbar">
        <div role="group" aria-label="Replay camera">
          {Object.entries(cameras).map(([key, label]) => (
            <button
              key={key}
              data-camera={key}
              className={camera === key ? "active" : ""}
              aria-pressed={camera === key}
              disabled={failed && key !== "2d"}
              onClick={() => setCamera(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          <input
            id="showOcclusion"
            type="checkbox"
            checked={occlusion}
            disabled={!use3d || highway}
            onChange={(e) => setOcclusion(e.target.checked)}
          />{" "}
          Hidden area
        </label>
        <label><input id="impactSound" type="checkbox" checked={sound}
          onChange={e => enableSound(e.target.checked)} /> Engine & impact sound {sound ? "on" : "off"}</label>
        <button id="testImpactSound" className="text-btn" onClick={() => enableSound(true, true)}>Test sound ♪</button>
      </div>
      <div
        className={"canvas-wrap" + (use3d ? " street-active" : "")}
        id="sceneWrap"
      >
        <canvas
          ref={map}
          id="scene"
          className={use3d ? "map-hidden" : ""}
          aria-label="Top-down simulation replay"
        />
        <canvas
          ref={canvas}
          id="streetScene"
          hidden={!use3d}
          aria-label="3D replay of the computed simulation"
        />
        {collision && <div className="impact-cue" role="status" aria-live="polite">
          <div className="impact-vignette" />
          <div className="impact-label"><strong>Collision detected</strong>
          <span>{run.metrics.impact_kmh?.toFixed(1)} km/h impact · simulation paused</span></div>
        </div>}
        {frame && (
          <div className="driving-hud" id="drivingHud" hidden={!use3d}>
            <div className="hud-context">
              <span>{highway ? "RIGHT-SIDE HIGHWAY EXIT" : "OBSTRUCTED CROSSWALK"}</span>
              <strong id="hudDistance">
                {highway ? `${Math.max(0, run.scenario.exit_distance_m-frame.x).toFixed(0)} m to exit` : `${Math.max(0, 45-frame.x-2.1).toFixed(1)} m to crossing`}
              </strong>
              <small id="hudVisibility">
                {highway ? frame.reason : frame.ped_y === null
                  ? "NO PEDESTRIAN"
                  : frame.visible
                    ? "PEDESTRIAN VISIBLE"
                    : "PEDESTRIAN HIDDEN"}
              </small>
            </div>
            <div className="hud-speed">
              <strong id="hudSpeed">{(frame.v * 3.6 / (highway ? 1.609344 : 1)).toFixed(0)}</strong>
              <span>{highway ? "MPH" : "KM/H"}</span>
              <small
                id="hudBrake"
                className={collision || frame.a < -0.1 ? "hazard" : ""}
              >
                {collision
                  ? "COLLISION"
                  : frame.a < -0.1
                    ? "BRAKING"
                    : end
                      ? "COMPLETED"
                      : "CRUISING"}
              </small>
            </div>
          </div>
        )}
        <div className="scene-top">
          <span className="scene-tag">{highway ? "HIGHWAY 01" : "CROSSWALK 01"}</span>
          <span id="sceneStatus" className="scene-status">
            {status}
          </span>
        </div>
        <div className="scene-bottom">
          <span>
            <i className="legend-car" /> Test vehicle
          </span>
          <span>
            <i className="legend-ped" /> {highway ? "Moving traffic" : "Pedestrian"}
          </span>
          <span>
            <i className="legend-blind" /> {highway ? "Right-side exit" : "Obstructed view"}
          </span>
        </div>
      </div>
      <div className="playbar">
        <button
          id="playBtn"
          className="play"
          disabled={!run}
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            if (end) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <input
          type="range"
          id="timeline"
          min="0"
          max="1000"
          value={duration ? Math.round((time / duration) * 1000) : 0}
          onChange={(e) => {
            setPlaying(false);
            setTime((Number(e.target.value) / 1000) * duration);
          }}
          aria-label="Replay timeline"
        />
        <span className="timestamp" id="timeLabel">
          {time.toFixed(2)} / {duration.toFixed(2)} s
        </span>
        <select
          id="playSpeed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {[0.5, 1, 2].map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
        </select>
      </div>
      <div id="eventText" className="event-line">
        {dirty
          ? "Parameters changed. Run this scenario to update the replay."
          : frame
            ? `${time.toFixed(2)} s · ${end ? run.events.at(-1)?.text : frame.reason}`
            : "Ready to run the scenario."}
      </div>
    </div>
  );
}
