# BlindSpot

A working local prototype for investigating autonomous-driving controller failures around an obstructed crosswalk. Outcomes are computed by a deterministic 2D simulator. The two driving controllers are hand-written baselines, not trained prediction models.

## Project status

The local simulator, controller comparisons, built-in searches, replay, and evidence export work without an API key. NVIDIA Nemotron integration is implemented but live verification is pending Nebius access approval. No AI search advantage or real-world safety performance is claimed.

See [verification results](VALIDATION.md) and the reproducible JSON cases in [examples](examples/).

## Run

Requires Python 3.9+ and a modern browser. No third-party Python packages or frontend build step.

```sh
git clone https://github.com/rsm-wew068/blindspot-ai.git
cd blindspot-ai
python3 server.py
```

Open http://127.0.0.1:8765. Use `--port 8766` if the default port is occupied. The server binds only to the local machine. Stop it with Ctrl+C.

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

Live runs send your concern and synthetic simulation measurements to Nebius and consume account credits. Up to eight proposal calls are allowed per run, with 45-second timeouts per request. This is real inference only when connected: absent credentials or failed requests produce an explicit error, never simulated AI output. The integration has been tested with mocked provider responses, but live inference still requires a real account and key.

## Physics and sensing assumptions

- A single vehicle starts at x=0, with fixed initial/maximum speed, and finishes at x=57 m. A pedestrian crosses at x=45 m.
- Vehicle footprint: 4.2 × 1.8 m. The pedestrian uses a conservative 0.6 × 0.6 m axis-aligned collision envelope. No steering, tire dynamics, road friction changes, other vehicles, or image-based perception.
- A parked van occupies `[45-gap-5, 45-gap] × [2.2, 4.8]` m. The pedestrian starts at y=5.6, walks at fixed speed after the configured start time, and stops at y=-6.
- Physics runs at 40 Hz. Continuous relative segment/box checks prevent collisions being skipped between timesteps. Collision speed is sampled at the end of the intersecting 25 ms step. Replays are sampled at 10 Hz, with an exact terminal frame.
- A point sensor at the vehicle's front detects the pedestrian only with unobstructed line of sight. Occluded pedestrian position, velocity, and start time never enter controller observations. Visible detections and velocity are idealized; there is no sensor noise or finite field-of-view model.
- Reactive control brakes when a visible pedestrian's extrapolated movement conflicts with the vehicle path. Occlusion-aware control adds a conservative crosswalk speed rule. Both apply the same configured actuation delay and maximum deceleration. These are deliberately simple baselines and can fail.
- Minimum clearance is distance between the axis-aligned collision envelopes, sampled at 40 Hz; collision checks are continuous. Completion times should be compared on matched completed cases. A collision-ended run's duration is not its travel time.
- The replay uses different horizontal and vertical display scales for readability. The highlighted angular sector indicates the occluder's bearing from the sensor, not a calibrated sensor confidence map. Simulation uses metric coordinates.
- Scenario hashes include all parameters and the simulator version. Model proposals are not guaranteed deterministic, but recorded scenarios are exactly replayable with the same version.

## Evaluation and limitations

Random and systematic search are functioning non-AI baselines. The systematic baseline uses a fixed low-discrepancy sequence; its seed is not used. AI uses its concern and previous results; the seed field does not make live generation reproducible. Each scenario consumes two controller rollouts in every method. Compare equal budgets, multiple random seeds, unique cases, failure discovery order, runtime, and provider token use. One run cannot establish an advantage for AI.

The independent evaluation suite uses seed 90210 and 24 scenarios, excluded from the search agent's context. Once used to tune a controller, replace it with a fresh suite before reporting held-out performance. It is not a public benchmark or evidence of road safety.

The current prototype implements local one-variable counterfactuals. It does not yet implement global failure minimization, arbitrary user controller uploads, learned vehicle control, photorealistic simulation, cloud batch execution, or a validated AI-versus-search benchmark. Live Nebius inference and cloud deployment remain to be verified. This is not yet a complete hackathon submission.

## Verify

```sh
python3 -m unittest -v
```

Tests cover observation isolation, visibility geometry, continuous collision detection, analytic cruising time, actuation latency, repeatable replay, bounded physics, paired search outcomes, one-variable interventions, and provider validation/failure paths. Mock provider tests are not live-model evidence.

## Reproduce an exported case

```sh
python3 replay.py path/to/blindspot-case.json
```

This recomputes both controllers, compares recorded measurements when available, and reports version mismatches rather than silently treating them as equivalent.

## Sources

- [Hackathon requirements](https://nebiusglobalaihackathon.devpost.com/rules)
- [Nebius Token Factory](https://nebius.com/services/token-factory)
- [Official NVIDIA Nemotron model catalog](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron)

MIT licensed. The local demo is not affiliated with or endorsed by NVIDIA, Nebius, or an autonomous-vehicle company.
