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
