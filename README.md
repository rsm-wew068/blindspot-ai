# BlindSpot

A closed-loop AI + physics workspace for reproducing autonomous-driving takeover edge cases (*"why didn't the controller anticipate what a human driver would?"*), inspecting deterministic telemetry in 3D, and validating AI-proposed controller adjustments across **Street** and **Highway** environments.

| Environment | Scenario inputs varied | Baseline controllers | Tunable adjustment settings |
| --- | --- | --- | --- |
| **Street** (40 Hz) | Vehicle speed, van gap, pedestrian presence, start timing, walk speed, reaction delay, braking strength | Reactive vs. occlusion-aware | Slowing distance, caution speed factor, conflict braking margin |
| **Highway** (10 Hz) | Target speed (mph), traffic speed & wave swing, spacing, exit distance (`0–1.0 mi`), aggressiveness, phase | Aggressive vs. exit-aware | Exit preparation distance, lane-change cooldown, required speed benefit |

## Architecture

BlindSpot enforces a strict boundary between **probabilistic AI hypotheses** and **deterministic physics evaluation**. NVIDIA Nemotron proposes JSON-schema-bounded scenarios and controller parameters—never executable code and never safety verdicts.

```mermaid
flowchart TB
    subgraph UI["Frontend (React + Three.js WebGL)"]
        Prompt["Scenario Lab & Manual Sliders (App.jsx)"]
        Viewport["3D WebGL Replay: Chase / Driver / Bird's-eye (Replay.jsx)"]
        Report["Decision Trace & Adjustment Review (Improvement.jsx)"]
    end

    subgraph Server["Python Backend & Validation Gate"]
        API["HTTP / Waitress WSGI API (server.py, hosted.py)"]
        Search["Adversarial Search Loop (investigation.py, highway_investigation.py)"]
        Tune["Bounded Auto-Tuner & 6-Check Gate (improvement.py)"]
        Guard["Strict JSON Schema & Bounds Validator (model_output.py, controller_settings.py)"]
    end

    subgraph Physics["Deterministic Physics & Offline Replay"]
        StreetSim["40 Hz Street Occlusion Simulator (simulation.py)"]
        HwySim["10 Hz Three-Lane Highway Simulator (highway.py)"]
        ReplayCLI["Zero-Inference Offline Verifier (replay.py)"]
    end

    subgraph LLM["LLM Inference (Nebius Token Factory)"]
        Nemotron["NVIDIA Nemotron-3-Nano-30B-A3B"]
    end

    Prompt -->|"POST /api/investigate or /api/simulate"| API
    Report -->|"POST /api/improve"| API
    API --> Search
    API --> Tune
    Search <-->|"JSON schema + measured history"| Guard
    Tune <-->|"JSON schema + trace + reference probes"| Guard
    Guard <-->|"HTTPS /chat/completions"| Nemotron
    Search --> StreetSim
    Search --> HwySim
    Tune --> StreetSim
    Tune --> HwySim
    StreetSim -->|"Frames, events, decision trace"| Viewport
    HwySim -->|"Frames, events, metrics"| Viewport
    Tune -->|"Before/after + 6 regression verdicts"| Report
    Report -.->|"Export JSON artifact"| ReplayCLI
```

## Closed-Loop Workflow

```mermaid
flowchart TD
    A["1. Plain-English Driving Concern"] --> B{"Environment Router"}
    B -->|"Street / Crosswalk"| C["Loop 1: Street Search (2 batches, 12 cases)"]
    B -->|"Highway / Freeway / Motorway"| D["Loop 1: Highway Search (2 batches, 12 cases)"]

    C --> E["Nemotron Proposes Batch → Schema Gate → 40 Hz Physics"]
    D --> F["Nemotron Proposes Batch → Schema Gate → 10 Hz Physics"]
    E -->|"Batch 1 metrics feed Batch 2"| G["Auto-Select Failure Case into 3D WebGL Replay"]
    F -->|"Batch 1 metrics feed Batch 2"| G

    G --> H["2. Inspect 3D Cameras, Telemetry & Decision Trace"]
    H --> I["3. Analyze & Test Adjustment with AI (Up to 3 Attempts)"]
    I --> J["Run 3 Fixed Reference Probes + Baseline Trace"]
    J --> K["Nemotron Proposes Bounded Controller Settings"]
    K --> L["Evaluate on Active Case + 6 Regression Checks"]

    L --> M{"Acceptable Candidate?"}
    M -->|"Active case improved + 0 safety/task failures"| N["Select Proposed Adjustment in 3D Replay & Export JSON"]
    M -->|"Collision, missed exit, or regression (attempts remaining)"| O["Feed Measured Regressions Back to Nemotron"]
    O --> K
    M -->|"Budget exhausted or repeated config"| P["Report Limitation & Retain Best Attempt for Inspection"]
```

## How it works

1. **Generate & replay with AI**: Enter a driving concern and submit. Mentioning `highway`, `freeway`, `interstate`, or `motorway` selects Highway; other prompts use Street. NVIDIA Nemotron (via Nebius Token Factory) proposes bounded scenarios in batches (~5s for 12 scenarios), receives measured simulator outcomes from both controllers, and refines the next batch. A discovered failure case automatically loads into the 3D Three.js replay.
2. **Inspect & compare**: Switch between **Chase**, **Driver**, **Bird’s-eye**, and **2D map** views, toggle controllers on identical traffic/pedestrian trajectories, or run non-AI **Random**, **Systematic**, **One-variable counterfactual**, and **Independent evaluation** suites without an API key.
3. **Analyze & test adjustment with AI**: On any loaded case, the server sends measured baseline metrics, events, Street decision traces, and three fixed simulator reference probes to Nemotron (up to 3 requests). Each valid JSON setting proposal is evaluated against the original controller on the active case plus 6 synthetic regression checks; an accepted candidate automatically plays as **Proposed adjustment** in the 3D viewport.
4. **Export & reproduce**: Export cases, runs, or adjustment reports to JSON and recompute them offline without inference.

## Quickstart

Requires Python 3.9+, Node.js 22.12+, and npm.

```sh
npm ci --prefix frontend
npm run build --prefix frontend
python3 server.py
```

Open `http://127.0.0.1:8765` (use `--port 8766` if occupied). For frontend hot-reload, run `python3 server.py --port 8766` alongside `npm run dev --prefix frontend`.

### Connect live NVIDIA Nemotron (optional)

Copy `.env.example` to `.env.local`, set `NEBIUS_TOKEN_FACTORY_KEY` (and optionally `NEBIUS_MODEL`), and restart `server.py`. Live AI calls `https://api.tokenfactory.nebius.com/v1` and consumes Nebius credits; missing credentials or network errors fail explicitly rather than fabricating AI output. All model outputs are validated strictly as bounded data—never executed as code.

## Verify & replay

```sh
python3 -m unittest -v
npm test --prefix frontend
npm run build --prefix frontend

# Recompute exported cases or adjustment reports offline
python3 replay.py examples/default-case.json
python3 replay.py examples/live-highway-production-20261030.json
python3 benchmark.py
```

## Scope & docs

BlindSpot uses simplified 2D geometry rendered in stylized 3D, idealized line-of-sight sensing, exogenous background actors, and internal rule-based controllers. It is an engineering exploration workspace—not external vehicle software (such as Tesla FSD) and not real-world safety validation.

- [Verification history & live test logs](VALIDATION.md)
- [Offline search benchmark audit](BENCHMARK.md)
- [Hosted deployment guide (Render / Docker)](DEPLOYMENT.md)

MIT licensed. Not affiliated with or endorsed by NVIDIA, Nebius, or any autonomous-vehicle company.
