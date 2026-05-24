# Deployment Guide — Wilhite Property Management

## What's already done

- **GitHub repo:** https://github.com/pmutah/wilhite-portfolio
- **Firebase project:** `wilhite-portfolio` (created)
- **Local API:** works at http://localhost:8080 (in-memory seed data without credentials)
- **Build:** `npm run build` succeeds for web + api

## 1. Firebase Firestore

1. Open https://console.firebase.google.com/project/wilhite-portfolio/firestore
2. Click **Create database** → Production mode → `us-central1`
3. If prompted, enable the Cloud Firestore API:  
   https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=wilhite-portfolio
4. **Project settings → Service accounts → Generate new private key**
5. Copy `.env.example` → `.env` and set:
   ```env
   FIREBASE_PROJECT_ID=wilhite-portfolio
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```
6. Deploy rules: `firebase deploy --only firestore:rules --project wilhite-portfolio`
7. Seed data: `npm run seed` (or `POST http://localhost:8080/api/seed`)

## 2. Cloudflare Pages (frontend)

### Option A — GitHub Actions (recommended)

1. Create a Cloudflare API token with **Cloudflare Pages Edit** permission:  
   https://dash.cloudflare.com/profile/api-tokens
2. Get your Account ID from the Cloudflare dashboard URL or **Workers & Pages** overview
3. In GitHub repo **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. In **Settings → Variables → Actions**, add:
   - `VITE_API_URL` = your API URL (e.g. Render URL below)
5. Push to `main` — workflow `.github/workflows/deploy.yml` deploys `web/dist`

### Option B — Manual wrangler

```bash
npx wrangler login
cd web && npm run build
npx wrangler pages deploy dist --project-name=wilhite-portfolio
```

Set **Pages → Settings → Environment variables:**
- `VITE_API_URL` = `https://your-api-url`

**Expected URL:** `https://wilhite-portfolio.pages.dev`

## 3. API hosting (Render — free tier)

1. Go to https://render.com → **New → Blueprint** → connect `pmutah/wilhite-portfolio`
2. Render reads `render.yaml` and creates **wilhite-portfolio-api**
3. Add secret env var `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON)
4. After deploy, copy the service URL (e.g. `https://wilhite-portfolio-api.onrender.com`)
5. Set that as `VITE_API_URL` in Cloudflare Pages

Health check: `GET https://wilhite-portfolio-api.onrender.com/health`

## 4. Local development

```bash
git clone https://github.com/pmutah/wilhite-portfolio.git
cd wilhite-portfolio
npm install
cp .env.example .env
cp web/.env.example web/.env
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:8080  

Without Firebase credentials, the API serves all reservation/expense seed data from memory.

## 5. Verify production

```bash
curl https://wilhite-portfolio-api.onrender.com/health
curl "https://wilhite-portfolio-api.onrender.com/api/portfolio/metrics?month=2026-07"
```

Open the Cloudflare Pages URL and confirm July 2026 shows Ranch revenue ~$12,201.97.
