# First prototype verification — 17 September 2026

This is a local simulator and evaluation prototype. No live NVIDIA model was used in these results; no Nebius credentials were available.

## Verified

- 14 automated tests passed, including occluded-observation isolation, collision detection between timesteps, cruise timing, response delay, exact JSON replay, input validation, paired controller evaluation, and mocked model feedback/validation.
- Browser checks confirmed random and systematic investigations, opening discovered failures, one-variable comparisons, independent evaluation, both replay endpoints, and an explicit connection dialog when live AI is unavailable.
- The Export action saved a JSON case to the project's exports folder. Command-line replay of that actual UI-exported file matched both controllers' recorded measurements.
- JavaScript and server syntax checks passed. No browser console warnings or errors were observed in the tested workflow.

## Measured examples

| Test set | Scenarios | Reactive collisions | Occlusion-aware collisions |
|---|---:|---:|---:|
| Random, seed 17 | 24 | 1 | 0 |
| Fixed systematic coverage | 24 | 1 | 0 |
| Independent suite, seed 90210 | 24 | 1 | 4 |

The independent suite demonstrates that the hand-written cautious baseline can perform worse. Do not present it as an improved or validated driving policy. Its separate evaluation results were not used to modify the controller in this prototype.

Default scenario: reactive collision at 3.65 seconds, with sampled impact speed 23.4 km/h; occlusion-aware controller completed the road segment at 10.95 seconds. The collision run's elapsed time is not a completed travel time.

The JSON artifacts in examples/ contain the scenario inputs, controller measurements, and simulator version. These small test sets are development evidence, not statistical validation or road-safety evidence.

## Not yet verified

A general AI advantage over the non-AI searches, mobile browser interaction, cloud deployment, or physical-world behavior remain unverified. Live inference and account-specific model availability were verified in the update below. The current input comparisons are local interventions, not global failure minimization. External controller ingestion and a complete hackathon submission are future work.


## Live integration update — 26 September 2026

NVIDIA Nemotron Nano (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`) completed a live two-round investigation through Nebius Token Factory. The second round received the first round's measured outcomes. The initial prompt-only trial failed second-round input validation; strict schema output was then added. A schema-envelope attempt was rejected with HTTP 422 before the corrected envelope succeeded. There are now 16 passing automated tests, including complete-schema and null-output rejection checks.

| Method | Scenarios | Reactive collisions | Occlusion-aware collisions |
|---|---:|---:|---:|
| Live AI | 12 | 7 | 2 |
| Random, seed 17 | 12 | 1 | 0 |
| Systematic | 12 | 0 | 0 |

These are collision-containing test counts, not a claim that the AI is safer or that its search is generally superior. All methods executed both controllers per scenario. The study needs multiple model runs and random seeds before making comparative claims. The smoke-test artifact is `examples/live-smoke-20260926.json`.

Across the four completed inference requests (including the discarded initial trial), provider-reported usage totaled 5,241 input tokens and 7,179 output tokens, or 12,420 total tokens. One additional request was rejected with HTTP 422 and had no reported token usage. The one-off experiment reserved $0.461 against its $1 allowance using a deliberately conservative assumed rate of $10 per million tokens and pre-request token bounds. This is not an invoice or a verified account billing rate, and it does not configure an account-wide or app-wide spending cap. No additional paid experiments were run after the successful trial.

## Hosting preparation — 5 October 2026

All 25 automated tests pass, including hosted authentication, origin checks, AI allowance persistence, disabled-AI behavior, and export handling. Render origin configuration is covered. JavaScript syntax and Git whitespace checks pass. The container image and public Render endpoint still require deployment verification.

## 3D replay verification — 5 October 2026

26 Python tests pass, including authenticated delivery of the local Three.js module and rejection of private-file paths. Browser checks passed for camera switches, scrubbing, timestamp preservation across controllers, pedestrian-free replay, mobile layout without horizontal overflow, and the WebGL-context-loss fallback. Desktop and mobile screenshots were inspected; no browser JavaScript errors were observed. Graphics use simulation replay frames; physics is unchanged. No paid inference was performed.

## React migration — 14 October 2026

The UI now uses React 19 and Vite, with Python/Waitress serving the production build. All 30 Python tests and two JavaScript replay tests pass. Browser checks cover desktop/mobile layouts, all cameras, timeline/controller synchronization, scenario changes, input comparisons, random investigations, notebook persistence, dialogs, and WebGL fallback. A separate Waitress browser check verifies authenticated React/Three.js delivery, JSON downloads, and the disabled-AI flow. No paid model calls were made.

The multi-stage Docker image built successfully and passed a local container smoke test for health, authentication, compiled React assets, and disabled AI. The React deployment on Render has not yet been verified behind its login.

## Collision feedback

Collision playback displays a non-graphic impact marker, edge pulse, and measured impact speed. Optional synthesized audio triggers only on forward playback into a collision. All 30 Python tests and three JavaScript tests pass. Browser checks verified one sound per collision, mute, silence when scrubbing during playback or switching cameras, no impact cue for a completed non-collision run, and reduced-motion support. No model calls were made.

Audio feedback was revised with a higher-frequency impact and contact noise for small speakers, a Test sound preview, and gesture-based audio resumption. The 3D street now uses solid lane edges, forward arrows and explicit parking bays; the 2D view uses matching lane edges. Browser checks cover sound preview and one-shot/mute/scrubbing behavior. Actual audibility still depends on device volume and browser/site sound settings.

## Automatic AI replay

Completed live AI investigations now load and play the first collision-containing case (or the first generated case if none collide), selecting a colliding controller and labeling the replay source. A browser check used the recorded AI result with mocked job/status responses and the real simulation endpoint: case 2 of 12 automatically loaded with its exact scenario inputs and no browser errors. No paid inference was performed. All 30 Python and 3 JavaScript tests and the frontend build pass. Render deployment remains unverified.

## Street and Highway environments — 19 October 2026

The two-option selector routes to separate Street and Highway test-design prompts, scenario schemas, simulation logic, and replay UIs. Street scenery now uses original San Francisco-inspired facades and parking meters; the street physics remains a flat crosswalk test. Highway adds moving traffic, continuous lane changes, a right exit, aggressive/exit-aware handwritten controllers, and measured lane-change/reversal/exit/collision metrics. Background vehicles follow prescribed speed waves and do not react to the ego vehicle.

39 Python tests and 4 JavaScript tests pass. New checks cover highway determinism, recorded-input replay, shared traffic, continuous lateral motion, initial separation, strict AI proposals, measured history passed to the second AI round, hosted routing, shared Three.js chunk delivery, and interpolation by vehicle identity. A counterexample verifies that the exit-aware baseline can collide.

Desktop/mobile browser checks passed for real random highway investigations, cameras, controller switching, case selection, separate saved highway history, returning to Street, and WebGL fallback. A mocked AI job with real simulated highway results verified prompt routing and automatic replay selection. Screenshots of Street and Highway were inspected. No browser JavaScript errors were observed in the passing checks. No new paid inference was performed; highway live Nebius inference is not yet verified.

The default illustrative highway case has 7 lane changes and 4 direction reversals for the aggressive policy, versus 5 and 2 for exit-aware; both reach the exit. This is a selected demonstration case, not a performance benchmark. Existing AI-versus-random benchmark claims apply only to the historical Street run.

The Docker build and local-container checks passed for health, authenticated compiled assets, highway simulation, and moving traffic. The new highway modules are included in both Dockerfile and its build-context allowlist. Public Render deployment remains unverified.

## Unified environment interface

Replaced the separate Highway page with the shared scenario-lab shell used by Street. Both modes use the same header, workspace, prompt action, investigator panel, comparison component, and notebook; Highway retains only its environment-specific replay renderer and parameter schema. Camera buttons, controller tabs, HUD, replay dimensions, and playback controls now match Street. Browser checks confirmed identical desktop replay dimensions/headline, highway AI routing and automatic replay using mocked results, correct controller labels and metrics, separate saved histories, mobile layout without horizontal overflow, and switching back to Street. Four frontend tests and the production build pass. No paid model calls were made; Render deployment remains unverified.

## Single persistent replay viewport

Moved Street/Highway selection into Live replay and removed the separate Highway replay component. Both environments use the same mounted Replay component, canvas DOM element, HUD, and playback controls. Browser checks verified canvas/header/prompt identity across switches, preserved prompt/camera/mute/playback-speed settings, separate histories, highway AI result handoff with mocked job results, and mobile layout. Screenshots inspected; no browser errors. Four frontend tests and the build pass. No new model calls; public deployment unverified.
