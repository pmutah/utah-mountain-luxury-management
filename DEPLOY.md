# Deployment Guide — Utah Mountain Luxury Portfolio

## What's live

- **Website:** https://wilhite-portfolio.pages.dev
- **GitHub:** https://github.com/pmutah/wilhite-portfolio
- **Firebase project:** `wilhite-portfolio` (Firestore rules deployed)
- **API:** Same-origin Pages Functions at `/api/portfolio/metrics`
- **CI/CD:** GitHub Actions deploys on every push to `main` (secrets configured)

### Cloudflare (configured)

| Item | Value |
|------|-------|
| Pages project | `wilhite-portfolio` |
| Account ID | `513c82ca37c8d7e83926801120de3eee` |
| GitHub secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Auto-deploy | Push to `main` → GitHub Actions → Cloudflare Pages |

**Recommended:** Replace the GitHub `CLOUDFLARE_API_TOKEN` with a long-lived token from [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) (template: **Edit Cloudflare Workers** — includes Pages). The current token is from `wrangler login` and will expire.

### KV (extra cleaning fees)

1. `npx wrangler kv namespace create SETTINGS` (note the id)
2. Update `web/wrangler.toml` `[[kv_namespaces]]` id with the real namespace id
3. Redeploy — extra cleaning edits persist across requests

### Dashboard password (optional)

Set `DASHBOARD_PASSWORD` in Cloudflare Pages → Environment variables. When set, `/api/*` requires login (`POST /api/auth/login`). Leave unset for open access.

### Receipt photo storage

Scanned expenses can **save the original image/PDF** and view it later (thumbnail → full view).

1. Enable **Cloud Storage** in [Firebase Console](https://console.firebase.google.com/project/wilhite-portfolio/storage)
2. Deploy rules: `firebase deploy --only storage --project wilhite-portfolio`
3. In **Cloudflare Pages → Settings → Environment variables**, add:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — same JSON as Render/local (needs Storage Object Admin on the bucket)
   - Optional `FIREBASE_STORAGE_BUCKET` if not `{project}.appspot.com`
4. Redeploy Pages after setting secrets

Without `FIREBASE_SERVICE_ACCOUNT_JSON`, bill PDFs are stored in **Cloudflare KV** (same `SETTINGS` namespace, up to ~4 MB per file). Construction documents can use KV up to ~15 MB per file; Firebase is optional but recommended for large plan PDFs.

### AI co-host agent

The dashboard includes a floating **Co-host** chat panel powered by Gemini function calling.

**Required:** `GEMINI_API_KEY` (same key as expense scanning).

**Optional env vars** (Cloudflare Pages → Environment variables):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Whisper transcription fallback when browser lacks Web Speech API |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Gmail search + draft replies |
| `PRICELABS_API_KEY` | Tier-A competitive pricing (optional; default uses Gemini page scrape) |

**Gmail OAuth setup:**

1. Enable **Gmail API** in [Google Cloud Console](https://console.cloud.google.com/) for project `wilhite-portfolio`
2. Create OAuth 2.0 Web client with redirect URI: `https://wilhite-portfolio.pages.dev/api/integrations/gmail/callback`
3. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to Pages env vars
4. Connect via `/api/integrations/gmail/connect` (or ask the co-host to help)

Agent data (reservations overlay, calendar blocks, tasks, comp set, chat sessions) persists in the same **SETTINGS** KV namespace.

### Construction Manager (third property tab)

The **Construction** tab and amber **Build** chat provide a genius-tier construction superintendent agent (architecture, engineering, contracting, all trades).

- **Chat:** `POST /api/agent/construction/chat` (uses `gemini-2.5-pro` when available)
- **Documents:** `POST /api/construction/documents` — uploads plans, bids, invoices; Gemini extracts scope and amounts
- **Project:** `GET/PUT /api/construction/project` — stage, budget, jurisdiction

#### Construction documents (upload & recall)

1. Open the **Construction Project** tab in the nav.
2. In **Documents**, drag-and-drop or tap **Upload** / **Photo** (camera on mobile). PDFs and images (JPEG, PNG, WebP, HEIC) are saved under the construction project in KV or Firebase Storage.
3. Use filter chips (Plans, Bids, Invoices, Photos) and **Open PDF** / **Open** to view files later (`GET /api/construction/documents/:id/file`).
4. Optionally attach a file from the amber **Build** chat (paperclip) — it uses the same API and auto-asks the Construction Manager to review it.
5. The agent receives a **full document catalog** in context plus tools `list_documents`, `search_documents`, and `get_document` for detail.

Files are stored even if Gemini ingest fails (summary may say analysis pending). **Required:** `GEMINI_API_KEY` for automatic extraction on files under ~10 MB. Construction documents support up to **15 MB** per file. Without Firebase, large files are stored in **chunked Cloudflare KV** (works on the free tier). **Recommended:** `FIREBASE_SERVICE_ACCOUNT_JSON` for the most reliable storage of large plan PDFs.

The Construction Manager provides decision support only — not a licensed architect, engineer, or contractor. Verify permits and structural decisions with licensees and your AHJ.

## Local development

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
