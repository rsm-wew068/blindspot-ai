# Hosted BlindSpot demo

The multi-stage Docker build compiles React/Vite with Node 22, then copies only the built frontend into the Python/Waitress runtime. Render keeps using the same Docker Blueprint and environment variables. No local key files, exports, editor settings, or Git history enter the image. Keep one process and one replica: active jobs are in memory and are lost on restart.

## Required setup

- Deploy this Dockerfile on a container host such as Render, Railway or a Nebius VM.
- Set `BLINDSPOT_PASSWORD` to a randomly generated password of at least 16 characters. All app pages and APIs require username `blindspot` and this password; only `/healthz` is public.
- Use the host's HTTPS endpoint. Set `BLINDSPOT_PUBLIC_ORIGIN` to that exact HTTPS origin. Render's `RENDER_EXTERNAL_URL` and Railway's `RAILWAY_PUBLIC_DOMAIN` are recognized automatically.
- Expose the injected `PORT` (default 8080).
- Start with `BLINDSPOT_ENABLE_AI=0`. The simulator and non-AI searches need no secrets or AI charges.

## Enable AI deliberately

In the hosting provider's secret environment settings, add `NEBIUS_TOKEN_FACTORY_KEY`, `NEBIUS_MODEL=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, and `BLINDSPOT_ENABLE_AI=1`. The key stays server-side. Uploading this key to a provider is separate from checking source into GitHub.

Hosted AI has no daily run cap. The legacy `BLINDSPOT_AI_DAILY_RUNS` setting is ignored. Each investigation is still limited to 12 scenarios, with at most one repair request per batch; each adjustment has at most three model requests. One job runs at a time. Nebius requests consume credits; provider-side limits still apply. A persistent volume is no longer needed for a daily run counter.

Exports download to the visitor's browser rather than being left on the server. The existing local development server still saves local exports as before.

The demo password is shared access, not individual accounts. Everyone with the password can access active job results. Do not submit personal data or secrets in scenario text. Keep the shared demo limited to trusted reviewers.

## Local production-server test

Run `npm ci --prefix frontend` and `npm run build --prefix frontend`, install requirements in a virtual environment, set `BLINDSPOT_PASSWORD` and run `python hosted.py`. Do not use the HTTP localhost endpoint for a remote deployment; terminate HTTPS at the hosting provider.

## Render preview

Open https://render.com/deploy?repo=https://github.com/rsm-wew068/blindspot-ai and create the Blueprint in your own Render workspace. The checked-in `render.yaml` explicitly selects the free plan and leaves AI disabled. Render generates `BLINDSPOT_PASSWORD`; find its value in the service's Environment settings and sign in with username `blindspot`.

Wait for the service to become Live, then open its onrender.com URL. `/healthz` is public; the app requires the generated password. The standard Render URL is recognized automatically for API requests.

Free instances sleep after inactivity and do not persist local storage. Before enabling AI, arrange persistent storage for the run counter (a paid disk or an external database requires separate setup). Do not treat the free instance's SQLite counter as a durable allowance. Add the Nebius key only through the service's secret environment settings, never to this repository.

## Deployment status

The Render service is https://blindspot-ai-p9jx.onrender.com. Its health endpoint and authentication challenge were verified before this frontend migration. The React release still needs authenticated verification after Render builds the new commit.
