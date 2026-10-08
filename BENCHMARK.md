# BlindSpot evidence audit

Replayed the recorded Nemotron run exactly; made no new model calls. Each search run has 12 scenarios, each evaluated against both controllers.

| Search | Runs | Reactive unique failure inputs | Cautious unique failure inputs |
|---|---:|---:|---:|
| Recorded Nemotron | 1 | 7 | 2 |
| random | 100 | 0.76 mean (0–3) | 0.65 mean (0–4) |
| random_pedestrian_only | 100 | 0.85 mean (0–4) | 0.78 mean (0–4) |
| Fixed systematic | 1 | 0 | 0 |

All recorded AI inputs include a pedestrian. The pedestrian-only random baseline controls for that difference.

- random, reactive: 0 of 100 runs matched or exceeded the recorded AI failure count.
- random, cautious: 12 of 100 runs matched or exceeded the recorded AI failure count.
- random_pedestrian_only, reactive: 0 of 100 runs matched or exceeded the recorded AI failure count.
- random_pedestrian_only, cautious: 15 of 100 runs matched or exceeded the recorded AI failure count.

## Controller comparison

Switching to the existing cautious controller avoided 5 reactive collisions and introduced 0 collisions on previously non-colliding inputs in the recorded AI batch.
This is not a new controller fix. Full metrics, including hard braking and completion, are in the JSON report.

## Limits

- One historical AI run, not repeated independent AI trials. No general superiority claim or significance test.
- Equal scenario budget, not equal compute time, inference cost, or wall-clock budget.
- Unique input hashes are not distinct behavioral failure categories.
- Both controllers are internal handwritten baselines; no external driving policy is evaluated.
- The cautious controller already existed; this is a comparison, not a newly discovered repair.
- These inspected inputs are regression evidence, not a held-out validation set.
- This simple simulation does not establish real-world driving safety.

## Next evidence required

1. Integrate a separately developed policy with documented source, license, and sensor assumptions. Do not label our baselines independent.
2. Freeze the prompt, scenario distribution, policies, budgets, and success metrics before collecting multiple independent AI runs; retain failed API attempts and token usage.
3. Diagnose one failure, implement a controller change, and evaluate both regressions and a fresh, previously unused validation suite.

Reproduce: `python3 benchmark.py` (offline). Detailed results: `examples/benchmark-audit.json`.
