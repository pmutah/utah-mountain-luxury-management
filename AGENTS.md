# Utah Mountain Luxury Management (this repo)

Live dashboard: `https://wilhite-portfolio.pages.dev`  
Code: `web/` (Vite + Cloudflare Pages Functions).

## Browser agents / Grokbots

Do **not** fight the top nav chips if clicks are intercepted. Use:

- Hash: `#/overview` `#/report` `#/report/documents` `#/guests` `#/ranch` `#/lindon` `#/river` `#/river/build` `#/ours`
- `window.UML.navigate("river")`, `UML.navigate("construction")` (opens River → Build costs), `UML.setMonth("YYYY-MM")`, `UML.state()`, `UML.help()`
- Selectors: `[data-bot="nav-river"]`, `[data-bot="nav-construction"]` (Build costs chip), `[data-bot="login-password"]`, `[data-bot="expense-save"]`
- Map: `GET /api/agent/map` and `/llms.txt`

`html` exposes `data-uml-tab`, `data-uml-month`, `data-uml-report`, `data-uml-river`.

## Product facts

- Properties: Ranch + River are 50/50 after a 20% management fee to Brandon. Lindon is Brandon’s.
- Construction **partner spend** (Todd vs Brandon & Stephanie, receipt photos/PDFs, phases) is **only** on the construction project — not on rental house expense forms.
- In-app Co-host (`POST /api/agent/chat`) and Construction Manager (`POST /api/agent/construction/chat`) already take actions via tools.

## Auth

Cookie session via `POST /api/auth/login`. Local `wrangler pages dev` often has no password. Do not commit secrets or Cloudflare token scripts.
