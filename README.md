# TDub — Streaming Web App

Dark, Netflix-style catalog for anime, dubs and movies.

```
tdub-anime/
├── backend/            Node.js + Express REST API (MongoDB Atlas)
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/           Static site for Cloudflare Pages
    ├── index.html      Catalog (rows, search, hero)
    ├── watch.html      Player, server switcher, season/episode menu
    ├── admin.html      Password-protected upload form
    ├── app.js          Catalog + player logic
    ├── admin.js        Admin login + upload
    ├── config.js       <-- put your backend URL here
    ├── styles.css
    ├── _headers        Cloudflare security headers
    └── assets/         Placeholder poster + favicon
```

## 1. Database (MongoDB Atlas)
1. Create a free cluster at mongodb.com/atlas.
2. Database Access → add a user. Network Access → allow `0.0.0.0/0` (needed for free hosts).
3. Connect → Drivers → copy the connection string.

## 2. Backend (Render / Railway / Koyeb)
```bash
cd backend
cp .env.example .env      # fill in MONGODB_URI, ADMIN_PASSWORD, ALLOWED_ORIGINS
npm install
npm start                 # http://localhost:5000/api/health
```
On Render: New Web Service → root directory `backend` → build `npm install` → start `npm start`
→ add the env vars `MONGODB_URI`, `ADMIN_PASSWORD`, `ALLOWED_ORIGINS` (PORT is set by the host).

**Keep it awake:** point UptimeRobot or cron-job.org at `https://YOUR-API/api/health` every 10 minutes.

## 3. Frontend (Cloudflare Pages)
1. Edit `frontend/config.js` → set `API_BASE` to your backend URL.
2. Cloudflare Pages → Create project → connect the repo → **Build command:** none → **Output directory:** `frontend`.
3. Add your Pages domain to `ALLOWED_ORIGINS` on the backend (e.g. `https://tdub.pages.dev,https://*.tdub.pages.dev`).

Local preview: `npx serve frontend -l 8080` and open http://localhost:8080.

## API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Keep-alive ping |
| GET | `/api/videos` | Catalog list (`?type=movie|series`, `?q=`, `?genre=`, `?full=1`) |
| GET | `/api/videos/:id` | One title with all mirrors / episodes |
| POST | `/api/videos` | Protected: header `Authorization: Bearer <ADMIN_PASSWORD>` |
| POST | `/api/admin/verify` | Protected: checks the admin password |

Example body for a series:
```json
{
  "title": "Demo Anime (Dub)", "type": "series", "genre": ["Anime", "Dub"], "qualityBadge": "HD",
  "posterUrl": "https://image.tmdb.org/t/p/w500/xyz.jpg",
  "episodes": [{ "season": 1, "episodeNumber": 1, "title": "Pilot",
    "sources": [{ "serverName": "Server 1 (Abyss)", "url": "https://abyss.to/..." }] }]
}
```

## Home rows
- **Trending Anime** — titles with genre containing "Anime"
- **Latest Dubs** — genre containing "Dub" (or "Dub" in the title)
- **Popular Movies** — type `movie`
- Plus TV Series, Recently Added, and auto rows for common genres.

## Ads
Paste your banner code into `#adSlot` in `index.html` and `watch.html`
(728x90 desktop / 320x50 mobile). Viewers can close the bar.

## Tailwind note
Pages use the Tailwind Play CDN so there is no build step. For the smallest, fastest pages
later, switch to the Tailwind CLI and serve a compiled CSS file.
