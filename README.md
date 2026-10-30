# BlindSpot

A developer workspace for reproducing driving-controller failures, inspecting measured evidence, and evaluating AI-proposed controller adjustments in simplified Street and Highway simulations.

The prompt selects the environment when you submit **Generate & replay with AI**: highway/freeway/interstate/motorway selects Highway; other text defaults to Street. Typing leaves the replay unchanged. A successful run updates the same replay viewport.

| Environment | What the AI can vary | Controller comparison |
| --- | --- | --- |
| Street | Vehicle speed, van gap, pedestrian presence, crossing timing/speed, reaction delay, braking strength | Reactive vs occlusion-aware |
| Highway | Target speed, traffic speed/variation, spacing, exit distance, aggressiveness, traffic phase | Aggressive vs exit-aware |

**Generate & replay with AI** sends the selected environment's concern to Nemotron and automatically plays a measured case after the investigation. Typing alone does not start inference. Manual parameters and random search work without AI. Street and Highway keep separate browser-local investigation histories.

Street uses original San Francisco-inspired pastel facades, bay windows, and parking meters around a flat crosswalk segment. It is not a mapped San Francisco street. Traffic lights, parking search, and arbitrary city navigation are not simulated.

Highway has three lanes, moving vehicles, a right-side exit, continuous two-second lane changes, and swept vehicle collision checks at 10 Hz. Background traffic follows prescribed lane-specific speed waves and does not react to the ego car. Both controllers get identical traffic. The aggressive policy seeks faster lanes; the exit-aware policy uses more hysteresis, larger merge gaps, and earlier exit preparation. Neither is guaranteed safer. Metrics include lane changes initiated, direction reversals, collisions, minimum clearance, exit success, and elapsed time. The renderer follows simulation frames, including lateral movement; it does not animate a fixed zigzag.

Example highway concern: “Investigate repeated left–right lane changes near a right-side exit when the controller aggressively prioritizes speed.” The selected replay is the generated case with the most aggressive-controller reversals, not a representative or statistically validated sample. It may not collide or miss the exit.

Highway live inference is wired to the existing Nebius connection but has only been tested with mocked provider responses; no new paid model calls were made for this addition. The earlier live AI benchmark applies to Street only.

## Analyze and test a controller adjustment

After loading a manual or generated case, click **Analyze & test adjustment with AI** below the replay comparison. This makes up to three Nebius model requests and uses one hosted daily allowance slot. The server enforces the three-call limit. Each attempt receives prior measured outcomes, traces and regression evidence; the scenario and original baseline remain fixed. Invalid model JSON or settings consume a request slot and trigger a correction within the same three-request budget; failed requests remain in the report. It stops on an improvement without regressions, a repeated proposal, a provider/network error, or budget exhaustion. Earlier successful evaluations survive a later provider failure.

1. The server recomputes the reactive/aggressive baseline and sends its measured events, metrics, scenario and allowed settings to the model. Street cases also include a decision trace: visible observations, projected pedestrian position, conflict detection, requested acceleration, applied acceleration and command delay. Hidden pedestrian positions are omitted from controller observations. The report shows original/proposed traces and flags disabled slowing or an unchanged trajectory separately from the AI hypothesis.
2. AI returns a hypothesis and rationale plus a strict JSON controller configuration. Unsupported settings, non-finite values and out-of-range values are rejected. No model-generated code executes.
3. The simulator runs the original and proposed controller on identical inputs, then tests six fixed additional cases. Highway changes exit preparation, lane-change cooldown and required speed benefit. Street changes precautionary slowing distance, speed factor and visible-conflict braking margin. Physics, reaction delay, traffic and pedestrian behavior stay fixed within each pair.
4. Attempt buttons let you inspect and replay every evaluated proposal. The report explains its selection rule and explicitly reports when no acceptable adjustment was found. The six regression cases guide revision and are therefore development checks, not independent validation. The same replay displays **Original controller** and **Proposed adjustment**, with metric comparisons. Results are **improved**, **mixed**, **worse** or **unchanged**; safety and completion take precedence, and time/comfort tradeoffs are reported.
5. **Export developer report** downloads all attempts with exact settings, inputs, metrics, AI hypotheses and regression evidence. Recompute without inference using `python3 replay.py path/to/blindspot-controller-adjustment.json`.

The six checks are a small, fixed synthetic suite, not independent validation. AI hypotheses are not proven causes. A 10 m exit scenario can remain impossible to resolve by tuning controller settings; the app does not move the exit to manufacture success. Changes apply only to the built-in controller, not external vehicle software. The adjustment workflow has been verified with mocked model responses and real simulations; live provider output is not yet verified.

## Project status

The local simulator, controller comparisons, built-in searches, replay, and evidence export work without an API key. NVIDIA Nemotron integration passed a live two-round, 12-scenario smoke test on 26 September 2026. This small trial does not establish a general AI search advantage or real-world safety performance.

See [verification results](VALIDATION.md) and the reproducible JSON cases in [examples](examples/).

## Run

Requires Python 3.9+, Node.js 22.12+ (Node 22 LTS recommended), npm, and a modern browser. The frontend uses React 19, Vite, and Three.js; the backend uses Python, with Waitress in production. API keys remain server-side.

```sh
git clone https://github.com/rsm-wew068/blindspot-ai.git
cd blindspot-ai
npm ci --prefix frontend
npm run build --prefix frontend
python3 server.py
```

Open http://127.0.0.1:8765. Use `--port 8766` if the default port is occupied. The server binds only to the local machine. Stop it with Ctrl+C.

### Frontend development

Run `python3 server.py --port 8766` in one terminal and `npm run dev --prefix frontend` in another. Open the Vite URL (normally http://127.0.0.1:5173). The loopback-only dev server proxies `/api` to port 8766. Rebuild with `npm run build --prefix frontend` before using Python's production assets again.

React owns scenario controls, API state, playback, the HUD, dialogs, and the investigation notebook. Canvas and Three.js renderers are attached through refs/effects and disposed on unmount. Source lives in `frontend/src`; generated `frontend/dist` and `node_modules` are ignored by Git.

## Try the workflow

1. Run the default scenario and play the reactive controller's replay.
2. Switch to the occlusion-aware controller; compare braking, collisions, and completion time.
3. Choose **Investigate inputs** to measure one-variable changes.
4. Run random and systematic investigations with the same scenario budget. Each tests both controllers on identical cases.
5. Open a failure in the notebook and export the case or investigation as JSON.
6. Run **Independent evaluation** to compare the controllers on a fixed suite excluded from model prompts. The cautious controller is not guaranteed to perform better.

The browser remembers the most recent eight investigations in local storage. Export important evidence. The Export buttons save JSON into the project’s `exports/` folder on this computer, with unique filenames to avoid overwrites. Requests in progress are held in server memory and do not survive a server restart.

## Connect real NVIDIA AI

Copy `.env.example` to `.env.local`, fill in `NEBIUS_TOKEN_FACTORY_KEY`, and restart the server. Never commit that file. A shell environment variable with the same name is also accepted, as is `NEBIUS_API_KEY`.

The adapter uses the official Nebius Token Factory endpoint `https://api.tokenfactory.nebius.com/v1`. It queries available models and selects an NVIDIA Nemotron text model, preferring Nano. Optionally set `NEBIUS_MODEL` to an exact available NVIDIA Nemotron model ID. Model availability depends on your account.

Choose **NVIDIA Nemotron · live AI** and start an investigation. The model proposes batches of up to six bounded scenarios, receives measured outcomes from both controllers, and proposes the next batch. Numeric validation rejects unknown fields, out-of-range values, and non-finite numbers. Model output is data, never executable code. Token usage reported by the provider is saved per round.

Live runs send your concern and synthetic simulation measurements to Nebius and consume account credits. Up to eight proposal calls are allowed per run, with 45-second timeouts per request. This is real inference only when connected: absent credentials or failed requests produce an explicit error, never simulated AI output. The integration has been tested with mocked provider responses and a live NVIDIA Nemotron Nano smoke test. Your own account and key are required for live inference. Requests use a strict JSON schema, and local validation remains mandatory.

## Street physics and sensing assumptions

- A single vehicle starts at x=0, with fixed initial/maximum speed, and finishes at x=57 m. A pedestrian crosses at x=45 m.
- Vehicle footprint: 4.2 × 1.8 m. The pedestrian uses a conservative 0.6 × 0.6 m axis-aligned collision envelope. No steering, tire dynamics, road friction changes, other vehicles, or image-based perception.
- A parked van occupies `[45-gap-5, 45-gap] × [2.2, 4.8]` m. The pedestrian starts at y=5.6, walks at fixed speed after the configured start time, and stops at y=-6.
- Physics runs at 40 Hz. Continuous relative segment/box checks prevent collisions being skipped between timesteps. Collision speed is sampled at the end of the intersecting 25 ms step. Replays are sampled at 10 Hz, with an exact terminal frame.
- A point sensor at the vehicle's front detects the pedestrian only with unobstructed line of sight. Occluded pedestrian position, velocity, and start time never enter controller observations. Visible detections and velocity are idealized; there is no sensor noise or finite field-of-view model.
- Reactive control brakes when a visible pedestrian's extrapolated movement conflicts with the vehicle path. Occlusion-aware control adds a conservative crosswalk speed rule. Both apply the same configured actuation delay and maximum deceleration. These are deliberately simple baselines and can fail.
- Minimum clearance is distance between the axis-aligned collision envelopes, sampled at 40 Hz; collision checks are continuous. Completion times should be compared on matched completed cases. A collision-ended run's duration is not its travel time.
- The replay uses different horizontal and vertical display scales for readability. The highlighted angular sector indicates the occluder's bearing from the sensor, not a calibrated sensor confidence map. Simulation uses metric coordinates.
- Scenario hashes include all parameters and the simulator version. Model proposals are not guaranteed deterministic, but recorded scenarios are exactly replayable with the same version.

## Street evaluation and shared limitations

Random and systematic search are functioning non-AI baselines. The systematic baseline uses a fixed low-discrepancy sequence; its seed is not used. AI uses its concern and previous results; the seed field does not make live generation reproducible. Each scenario consumes two controller rollouts in every method. Compare equal budgets, multiple random seeds, unique cases, failure discovery order, runtime, and provider token use. One run cannot establish an advantage for AI.

The independent evaluation suite uses seed 90210 and 24 scenarios, excluded from the search agent's context. Once used to tune a controller, replace it with a fresh suite before reporting held-out performance. It is not a public benchmark or evidence of road safety.

The current prototype implements local one-variable counterfactuals. It does not yet implement global failure minimization, arbitrary user controller uploads, learned vehicle control, photorealistic simulation, cloud batch execution, or a validated AI-versus-search benchmark. Live Nebius inference has been smoke-tested; the Render health endpoint has been verified, but authenticated public-demo interaction remains unverified. This is not yet a complete hackathon submission.

## 3D replay

Three.js 0.169.0 is pinned through npm and bundled locally by Vite under its MIT license. It loads as a separate chunk when the replay mounts. Chase, driver, and bird’s-eye cameras display the same recorded positions as the 2D map; switching controllers preserves replay time (clamped to the selected run’s end). The optional hidden-area overlay projects the van’s ground-plane occlusion from the simulated vehicle-front sensor. The HUD reports the simulator’s visibility flag, speed, braking and outcome.

Street collision replays show a non-graphic impact marker, a brief edge pulse (disabled with reduced-motion preferences), and measured impact speed. Impact sound is on by default and activates after your first click or keypress. Use **Test sound** to preview the synthesized impact, or turn **Impact sound** off to mute it. Scrubbing and switching controllers stay silent.

The street is original procedural geometry with a single forward travel lane and marked curbside parking bays. Stationary background cars are intentionally parked scenery; only the test vehicle and pedestrian are simulated actors. Buildings, trees, lights and background parked vehicles are decorative and do not enter the physics or sensing model. This is a stylized 3D visualization of a 2D simulation, not camera-based perception or a full 3D driving simulator. WebGL failure falls back to the existing 2D replay. No new API calls or keys are needed for graphics.

## Deploy

See [hosting setup](DEPLOYMENT.md) for the Render free preview and live-AI setup.

## Verify

```sh
python3 -m unittest -v
npm test --prefix frontend
npm run build --prefix frontend
```

Tests cover observation isolation, visibility geometry, continuous collision detection, analytic cruising time, actuation latency, repeatable replay, bounded physics, paired search outcomes, one-variable interventions, and provider validation/failure paths. Mock provider tests are not live-model evidence.

## Reproduce an exported case

```sh
python3 replay.py path/to/blindspot-case.json
```

This recomputes both controllers for a Street case or a Highway investigation export, compares recorded measurements when available, and reports version mismatches rather than silently treating them as equivalent.

## Sources

- [Hackathon requirements](https://nebiusglobalaihackathon.devpost.com/rules)
- [Nebius Token Factory](https://nebius.com/services/token-factory)
- [Official NVIDIA Nemotron model catalog](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron)

MIT licensed. The local demo is not affiliated with or endorsed by NVIDIA, Nebius, or an autonomous-vehicle company.

## Evidence audit

See [the offline benchmark report](BENCHMARK.md) for the historical AI batch versus 100 seeds of random search and a pedestrian-only random baseline. Reproduce with `python3 benchmark.py`; it makes no network or model calls. Replay the remaining shared failure with `python3 replay.py examples/regressions/both-controllers-fail.json`. This is preliminary evidence from one AI run and internal controllers, not a validated general advantage.

### Live-response reliability

Scenario generation allows one repair request per batch (at most four model calls for a hosted 12-case investigation). Complete JSON and every field/type/bound are validated before simulation; incomplete or truncated output is never executed. The adjustment loop retains a strict three-request cap including invalid responses. Unchanged trajectories are explicitly flagged and fed into revision. Verified timing tables separate requested braking from applied braking; free-text AI notes are collapsed and labeled unverified, not presented as established diagnoses.

### Live verification — 29 October 2026

A real Nebius run of the revised code completed a 12-scenario pedestrian investigation and three adjustment proposals. Two proposals changed the trajectory; one lowered impact speed from 28.8 to 8.59 km/h, but all still collided and none passed the additional checks without regressions. This is a completed workflow, not a successful controller fix. See `examples/live-adjustment-20261029.json`; replay it with `python3 replay.py examples/live-adjustment-20261029.json`. The invalid-response repair paths are covered by automated tests; the successful live generation run did not need a repair.

The adjustment agent also receives three fixed simulator reference probes (early-slowing settings on Street; earlier exit preparation on Highway). Their measured original-case and regression outcomes are labeled separately from AI proposals in the report. They require no model calls and are guidance, not guaranteed fixes.

A second real Nebius run with reference-probe evidence produced three proposals: attempts 1 and 2 avoided the default Street collision; attempt 2 moved first applied braking from 2.65 s to 0.525 s. Additional checks still regressed, so no proposal was accepted overall. All three produced different vehicle trajectories. Reproduce `examples/live-reference-adjustment-20261029.json` with the replay CLI.

Production verification on Render completed three real Nebius proposals. Attempts 2 and 3 avoided the original collision but worsened four additional checks; no adjustment was accepted overall. Original/proposed replay controls were verified. Replay the evidence with `python3 replay.py examples/live-production-adjustment-20261029.json`.
