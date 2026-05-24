# Wilhite Property Management

Vacation rental portfolio dashboard for **The Ranch House** and **The Lindon House**.

- **Frontend:** Vite + React + Tailwind CSS
- **Backend:** NestJS REST API
- **Database:** Firebase Firestore (`wilhite-portfolio` project)
- **Deploy:** Cloudflare Pages (frontend) + Render (API)

## Local development

```bash
npm install
cp .env.example .env
cp web/.env.example web/.env

# Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS in .env

npm run seed   # populate Firestore (optional — API falls back to embedded seed data)
npm run dev    # API :8080 + web :5173
```

Open http://localhost:5173

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/portfolio/metrics?month=2026-07` | Full portfolio + metrics |
| PUT | `/api/portfolio/extra-cleaning` | Update extra cleaning fees |
| GET | `/api/reservations` | All reservations |
| GET | `/api/expenses` | All expenses |
| POST | `/api/seed` | Seed Firestore |

## Firebase setup

1. Create project **wilhite-portfolio** in [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore (production mode)
3. Generate a service account key → set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env`
4. Deploy rules: `firebase deploy --only firestore:rules --project wilhite-portfolio`

## Deployment

### GitHub

Repo: https://github.com/pmutah/wilhite-portfolio

### Cloudflare Pages (frontend)

1. Run `npx wrangler login`
2. Set GitHub secret `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
3. Push to `main` — GitHub Action deploys `web/dist` to Pages
4. Set `VITE_API_URL` in Cloudflare Pages env to your API URL

### Render (API)

1. Connect GitHub repo at [render.com](https://render.com)
2. Use `render.yaml` blueprint or create Web Service from Dockerfile
3. Add `FIREBASE_SERVICE_ACCOUNT_JSON` as a secret env var

## License

Private — Wilhite Property Management
