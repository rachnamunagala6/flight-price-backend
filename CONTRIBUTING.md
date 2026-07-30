# Contributing

## Workflow

`main` auto-deploys to the live Render URL on every merge — treat it as
production, not a scratch branch.

1. Branch off `main`: `git checkout -b your-name/short-description`
2. Make your change. If you touched `backend/`, run the tests:
   ```bash
   cd backend
   npm test
   ```
3. Open a PR into `main`. Fill in the template — especially "how to verify,"
   since most of this app is UI behavior that tests won't catch.
4. Get at least one review before merging. CI (`.github/workflows/ci.yml`)
   has to pass too.
5. Merge → Render redeploys automatically within a minute or two.

## Local setup

See `backend/README.md` for getting the server running locally (API keys,
database, etc.) — that's also what Render runs in production.

## Project layout

- `backend/` — the actual app: Express server, trip storage, real flight
  pricing, AI proxy, and the front end it serves. This is what's deployed.
- `app/trip-planner.html` — an earlier standalone version built as a
  claude.ai artifact. Kept for reference; not part of the deployed app.
- `docs/planning-doc.md` — product context: goals, open questions, what's
  built vs. not.

## Reporting bugs / proposing features

Use GitHub Issues on this repo.

<!-- test commit: verifying branch protection setup, safe to delete -->
