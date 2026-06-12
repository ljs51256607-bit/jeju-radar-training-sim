# Public Demo

The public demo is the free-first hosted build of Jeju Radar Training Simulator.

Demo URL:

```text
https://ljs51256607-bit.github.io/jeju-radar-training-sim/
```

## Scope

The demo is a static GitHub Pages deployment of the browser radar training UI.

It is intended for:

- inspecting the radar training surface,
- trying text-based ATC command entry,
- observing deterministic simulator state changes,
- reviewing public-safe reference data rendering,
- confirming the training-only boundary.

## Safety Boundary

The demo is not:

- operational ATC software,
- a navigation source,
- dispatch tooling,
- a certified simulator,
- safety-critical decision support.

The visible demo banner must state that the simulator is training-only and not for operational ATC, navigation, dispatch, certification, or safety-critical use.

## Static Demo Limits

The public demo is intentionally static.

- No API key is shipped to the browser.
- No private SOP, PDF, training manual, tacit note, local-only evidence, secret, generated local folder, or oversized raw geometry is deployed.
- Public demo mode disables PTT/microphone controls and LLM pilot voice toggles.
- The demo uses text commands and deterministic pilot responses only.

AI pilot runtime work is deferred to `v0.3.0`.

## Deployment

The demo is deployed through GitHub Pages using `.github/workflows/deploy-demo.yml`.

The deployment build sets:

```text
VITE_BASE_PATH=/jeju-radar-training-sim/
VITE_PUBLIC_DEMO=true
```

The Vite base path ensures static assets and public data load under the GitHub Pages project path.

## Verification

Before releasing a demo build, verify:

```powershell
cd jeju-radar-ui
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

For the Pages build, also verify in a browser:

- the demo URL loads,
- the radar scope is nonblank,
- the training-only safety banner is visible,
- browser console errors are absent,
- `/assets`, `/reference`, `/geometry`, `/authority`, and `/scenarios` requests resolve under `/jeju-radar-training-sim/`,
- no `/api/*` request is made on initial static demo load.
