# Friend Group Trip Planner — Planning Document

*Last updated: July 28, 2026*

## 1. Problem Statement

A group of 10 friends, spread across different cities nationwide, takes two
group vacations a year. Choosing where to go is currently inefficient: it's
hard to find a destination that is (a) genuinely fun, (b) good for the time
of year they're traveling, and (c) **fair** — where no single friend is
quietly paying two or three times what everyone else pays to get there.

## 2. Goals

- Make it fast to go from "we should plan a trip" to a short list of real
  destination candidates.
- Optimize for **fairness of flight cost across the whole group** as the
  primary ranking signal, not just lowest average cost.
- Account for the specific travel date range (not just a rough season).
- Keep it usable on a phone, since friends will fill in their info remotely.
- Get to real flight pricing, not just AI-generated ballparks.

## 3. Users

- One trip organizer creates a trip and shares a join code.
- Up to 10 (or more) friends join with their name, home city, and (optionally)
  nearest major airport.
- Everyone can suggest destinations, price them, and see the ranked results —
  there's currently no owner/admin distinction beyond who created the trip.

## 4. What's Built So Far

The app was rebuilt as a standalone web app (`backend/`, served from one
Express URL) after confirming the claude.ai artifact sandbox blocks calls to
third-party APIs — so the original artifact version (`app/trip-planner.html`)
couldn't reach the real-price backend or persist data outside the sandbox.

**Front end** (`backend/public/index.html`, served by the Express app):
- Create/join a trip via a 5-letter shareable code
- Each member enters name, home city, and optional airport code
- Add destination ideas manually, each with a date range (start/end date)
  and optional notes
- **"Find the fairest destinations"**: AI proposes candidate cities based on
  everyone's home cities and the trip dates, then prices each one out per
  member and ranks candidates by **fairness spread** (gap between cheapest
  and most expensive flight in the group), not just total cost
- Each destination shows a radial "convergence diagram" — lines from each
  home city colored green/amber/red by how expensive that person's leg is
- Manual price override: anyone can type in a real number they found, which
  is labeled "you set" instead of "est"
- Data is shared live across everyone using the same trip code

**Back end** (`backend/server.js`, deployed on Render):
- Serves the front end and all API routes from one URL — no CORS, no
  separate frontend deploy, no artifact sandbox restrictions
- `POST/GET/PUT /api/trips/:code` — trip storage backed by Postgres (Neon),
  keyed by join code; one JSON blob per trip (members, destinations, price
  estimates)
- `POST /api/prices-batch` — calls SerpApi's Google Flights API for real
  round-trip prices, one destination against every member's home airport in
  one call, with a 1-hour in-memory cache to conserve API quota
- `POST /api/ai/suggest-destinations` and `POST /api/ai/estimate-prices` —
  proxy to the Anthropic API server-side, so the API key never reaches the
  browser (this used to be a direct browser call that only worked inside the
  claude.ai artifact sandbox, which injected a key for free)
- Real prices are now used automatically whenever airport codes are present
  — no more manually pasting a backend URL into app settings, since the app
  and the price backend are the same server

The original claude.ai artifact (`app/trip-planner.html`) is kept as-is and
still works standalone inside claude.ai, with AI-estimated prices only and
no cross-device persistence.

## 5. Current Pricing Logic

1. If both the member and destination have airport codes → try a real price
   via the same backend that serves the app (no more separate backend URL
   to configure — it's all one server now).
2. Otherwise (or if that call fails) → fall back to an AI-generated estimate,
   labeled "est" in the UI.
3. Anyone can overwrite either with a manually-checked real number.

Destinations are ranked by **fairness spread first, total cost second.**

## 6. Known Limitations

- AI-estimated prices are ballparks, not quotes — useful for narrowing down
  candidates, not for booking decisions.
- No lodging, activities, or ground transport cost factored in yet — flights
  only.
- No persistent trip history — each trip is a standalone code; there's no
  "our group's past trips" view.
- No voting/consensus mechanism yet — the ranked list informs discussion,
  but there's no in-app way to lock in a decision.
- Trip codes have no password/login — anyone with the code can join or edit,
  by design (see the "Data & privacy" open question below).

## 7. Possible Next Features (raised but not yet built)

- Lodging/Airbnb cost added to the fairness calculation, not just flights
- Group voting so everyone can rank favorites
- A date-range picker per trip (done) — extend to multiple candidate date
  windows per destination, so the group can compare "March vs. June" in one
  view

---

## 8. Open Questions — Need Your Input

These decisions will shape what gets built next. Answer inline or however's
easiest, and I'll fold the answers back into this doc.

### Trip logistics
- [ ] Typical trip length? (long weekend / full week / varies)
- [ ] Do the two annual trips usually target different seasons on purpose
      (e.g. one winter, one summer), or is that flexible?
- [ ] Is the group of 10 fixed, or does attendance vary trip to trip?
- [ ] Should driving be considered an option for friends who live close to a
      candidate destination, or is this flights-only?

### Budget & fairness
- [ ] Is there a hard budget cap per person, or is the goal purely "as fair
      as possible" regardless of absolute price?
- [ ] Should lodging cost be split evenly per person regardless of who
      splits a room with whom, or does room-sharing complicate that?
- [ ] Do you want a combined "fairness score" across flights + lodging, or
      keep flight fairness as the primary lens and treat lodging separately?

### Decision-making
- [ ] Once the group sees the ranked list, how is the final call actually
      made today — one person decides, a vote, informal group chat consensus?
- [ ] Do you want the app to support that decision step (e.g. voting,
      locking in a winner), or should it stay a comparison tool only?
- [ ] Is there a booking deadline / lead time that matters (e.g. need to
      decide 3 months out for good fares)?

### Data & privacy
- [ ] Is everyone comfortable with trip data (home city, cost info) being
      visible to anyone who has the join code, with no password/login?
- [ ] Any concern about home city / flight cost data persisting indefinitely
      vs. being deleted after each trip?

### Real pricing rollout
- [x] Hosting decided: backend deployed on Render, front end served from the
      same app (no separate frontend hosting needed).
- [ ] Are you willing to pay for a SerpApi plan if the free tier's search
      allowance is too small for a 10-person group checking several
      destinations? (Free tier is limited; paid starts around $25/mo.)

### Scope check
- [ ] Is this just for your specific group of 10, or could other friend
      groups end up using it too (which would change how much "product"
      polish — onboarding, error handling, etc. — is worth investing in)?

