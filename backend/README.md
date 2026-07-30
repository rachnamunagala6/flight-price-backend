# Flight Price Backend

The whole trip planner as a standalone web app — front end, trip storage,
real flight prices (via SerpApi), and AI destination suggestions (via the
Anthropic API), all served from this one Express app. It used to be paired
with a claude.ai artifact front end, but that setup couldn't call third-party
APIs (including this one) or persist data outside the artifact sandbox, so
everything now lives here instead.

## What it does

- Serves the app itself at `/` (static files in `public/`).
- `GET /api/price?from=DEN&to=AUS&depart=2027-03-14&ret=2027-03-21`
  Returns the cheapest round-trip economy price SerpApi finds for that route/dates.
- `POST /api/prices-batch`
  Body: `{ "to": "AUS", "depart": "2027-03-14", "ret": "2027-03-21", "origins": [{"id":"m1","from":"DEN"}, {"id":"m2","from":"JFK"}] }`
  Prices one destination against every home airport in a single call.
- `POST /api/trips` / `GET /api/trips/:code` / `PUT /api/trips/:code`
  Create, load, and save a trip's members/destinations/prices, keyed by its
  5-letter join code.
- `POST /api/ai/estimate-prices` / `POST /api/ai/suggest-destinations`
  Proxies to the Anthropic API server-side, so the API key never reaches the
  browser.

Airports must be given as 3-letter IATA codes (e.g. `DEN`, `JFK`, `AUS`), not
city names — that's what SerpApi (and real flight search) requires.

Flight prices are cached in memory for 1 hour per route+date combo, so your
whole friend group checking the same destination doesn't burn through your
SerpApi quota multiple times.

## 1. Get the keys you need

- **SerpApi** (real flight prices): sign up at [serpapi.com](https://serpapi.com),
  grab your key from the dashboard. Free tier has a limited number of
  searches/month (check [serpapi.com/pricing](https://serpapi.com/pricing) —
  it's changed over time); paid plans start around $25/month for 1,000
  searches. Each price lookup costs one search per member per destination, so
  a group of 10 checking 5 destinations is 50 searches.
- **Anthropic** (AI destination suggestions + price-estimate fallback): create
  a key at [console.anthropic.com](https://console.anthropic.com). This is a
  normal paid API key — unlike using the app as a claude.ai artifact, there's
  no free usage bundled in.
- **Postgres** (trip storage): sign up at [neon.tech](https://neon.tech) (free
  tier, doesn't expire), create a project, and copy the connection string
  from the dashboard — it looks like
  `postgres://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
  The `trips` table is created automatically on first boot.

## 2. Run it locally

```bash
cd backend
npm install
cp .env.example .env
# edit .env and paste in SERPAPI_KEY, ANTHROPIC_API_KEY, and DATABASE_URL
npm start
```

Open `http://localhost:3000` in a browser — that's the full app. Or test the
API directly:

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/price?from=DEN&to=AUS&depart=2027-03-14&ret=2027-03-21"
```

## 3. Deploy it somewhere reachable

Any of these work well for a small service like this, and all have free tiers:

- **[Render](https://render.com)** — connect the repo, set the service's
  **Root Directory to `backend`** (this repo is a monorepo — `backend/` is
  the deployable service; skipping this makes Render look for `package.json`
  in the wrong place), set `SERPAPI_KEY`, `ANTHROPIC_API_KEY`, and
  `DATABASE_URL` as environment variables in the dashboard, it auto-detects
  `npm start`. There's also a `render.yaml` at the repo root if you'd rather
  deploy via a Render Blueprint.
- **[Railway](https://railway.app)** — similar, one-click deploy from GitHub.
- **[Fly.io](https://fly.io)** — `fly launch` then `fly secrets set SERPAPI_KEY=... ANTHROPIC_API_KEY=... DATABASE_URL=...`.

Never commit your real `.env` file — set these as environment variables in
the hosting platform's dashboard instead. Once deployed you'll have a URL
like `https://your-app.onrender.com` — that's the whole app, front end
included, no separate frontend deploy needed.
