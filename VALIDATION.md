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

Live Nemotron inference, account-specific model availability, an AI advantage over the non-AI searches, mobile browser interaction, cloud deployment, or physical-world behavior. The current input comparisons are local interventions, not global failure minimization. External controller ingestion and a complete hackathon submission are future work.
