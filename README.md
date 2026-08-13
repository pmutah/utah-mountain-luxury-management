# Utah Mountain Luxury Management

Short-term rental management board for **The Ranch House**, **The Lindon House**, and **The River House**.

- **Frontend:** Vite + React + Tailwind CSS
- **Backend:** Cloudflare Pages Functions (`web/functions`)
- **Data:** Cloudflare KV (reservations, expenses, iCal feeds)
- **Live site:** https://wilhite-portfolio.pages.dev

## Local development (matches the live site)

`localhost:5173` serves the current React app and proxies `/api` to the hosted Pages app, so you see the same calendar, bills, and construction data as production.

```bash
git checkout main
git pull origin main
npm install
npm run dev
```

Open **http://localhost:5173**

If `web/.env` exists, remove or comment out `VITE_API_URL` — pointing it at `http://localhost:8080` uses the old NestJS API and will not match the live site.

## Optional: NestJS API (legacy)

```bash
npm run dev:api    # API :8080 + web :5173 (does not match hosted Pages)
```

## Deployment

Push to `main` — GitHub Action deploys `web/` (including Functions) to Cloudflare Pages.

Repo: https://github.com/pmutah/utah-mountain-luxury-management

## License

Private — Utah Mountain Luxury Management
