# Trip Planner Project

Everything for the friend-group trip planner app, organized in one place.

```
trip-planner-project/
├── app/
│   └── trip-planner.html      The original claude.ai-artifact-only version.
│                               Still works inside claude.ai (AI-estimated
│                               flight prices only — no real prices, no
│                               persistence outside the artifact sandbox).
│                               Superseded by backend/public/ below.
├── backend/
│   ├── server.js               The real app: Express server serving the
│   │                            front end, trip storage (Postgres), real
│   │                            flight prices (SerpApi), and AI destination
│   │                            suggestions (Anthropic API, proxied
│   │                            server-side so the key stays off the client)
│   ├── public/index.html        Standalone front end, served by server.js
│   ├── db.js                    Postgres trip storage (Neon-friendly)
│   ├── package.json
│   ├── .env.example             Copy to .env — needs SERPAPI_KEY,
│   │                             ANTHROPIC_API_KEY, and DATABASE_URL
│   └── README.md                 Setup + deployment instructions
└── docs/
    └── planning-doc.md          Project overview, current state, open
                                   decisions still needed
```

## Quick start

1. **Run the real app**: follow `backend/README.md` — set up a free Neon
   Postgres DB, get a SerpApi key and an Anthropic API key, then run or
   deploy `backend/`. Once it's up, the whole app is served from that one URL.
2. **Legacy claude.ai version**: `app/trip-planner.html` still works as a
   Claude artifact (AI-estimated prices only), if you want that instead.
3. **Catch up on project status / open questions**: read `docs/planning-doc.md`.
