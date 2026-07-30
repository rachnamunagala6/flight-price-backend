require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors()); // allow calls from the trip-planner front end (any origin)
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

if (!SERPAPI_KEY) {
  console.warn('WARNING: SERPAPI_KEY is not set. Requests will fail until you set it in .env');
}
if (!ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set. AI suggestions/estimates will fail until you set it in .env');
}
if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. Trip storage will fail until you set it in .env');
}

// Simple in-memory cache so repeated lookups (multiple friends checking the
// same route/dates) don't burn through your SerpApi search quota.
const cache = new Map(); // key -> { price, currency, ts }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(from, to, depart, ret) {
  return `${from}-${to}-${depart}-${ret}`;
}

// Among flights with a known price, avoids just grabbing the global cheapest
// fare -- SerpApi sometimes includes itineraries with 2+ stops or layovers
// that balloon total travel time (e.g. a nominally-cheaper but 16-hour,
// 3-stop domestic routing). Instead: find the fastest itinerary actually on
// offer for this route/date, then pick the cheapest option among those that
// are "reasonable" relative to it -- at most 1 stop, and not more than 60%
// longer than the fastest (plus a 2-hour buffer so short-hop routes where
// every option has some slack aren't over-filtered). Falls back to the
// cheapest overall if nothing has duration/stop data, or if the reasonable
// filter would exclude every option (e.g. every itinerary genuinely requires
// 2 stops for this route).
function pickReasonableFlight(flights) {
  const withDuration = flights.filter((f) => typeof f.duration === 'number');
  if (withDuration.length === 0) {
    return flights.reduce((a, b) => (b.price < a.price ? b : a));
  }
  const minDuration = Math.min(...withDuration.map((f) => f.duration));
  const reasonable = withDuration.filter(
    (f) => (f.stops == null || f.stops <= 1) && f.duration <= minDuration * 1.6 + 120
  );
  const pool = reasonable.length ? reasonable : withDuration;
  return pool.reduce((a, b) => (b.price < a.price ? b : a));
}

// Calls SerpApi's Google Flights engine for one route and returns a
// reasonable round-trip economy price from across best_flights + other_flights.
// Pass { debug: true } to also get every candidate flight considered
// (price/duration/stops, and which one was picked) so the reasonable-flight
// filtering can be inspected instead of trusted blindly.
async function fetchOnePrice(from, to, depart, ret, opts) {
  const debug = !!(opts && opts.debug);
  const key = cacheKey(from, to, depart, ret);
  if (!debug) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { price: cached.price, currency: cached.currency, duration: cached.duration, stops: cached.stops, cached: true };
    }
  }

  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: from,
    arrival_id: to,
    outbound_date: depart,
    return_date: ret,
    type: '1', // round trip
    travel_class: '1', // economy
    currency: 'USD',
    hl: 'en',
    gl: 'us',
    api_key: SERPAPI_KEY,
  });

  const url = `https://serpapi.com/search?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SerpApi request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`SerpApi error: ${data.error}`);
  }

  const flights = [...(data.best_flights || []), ...(data.other_flights || [])]
    .filter((f) => typeof f.price === 'number')
    .map((f) => ({
      price: f.price,
      duration: typeof f.total_duration === 'number' ? f.total_duration : null,
      stops: Array.isArray(f.layovers) ? f.layovers.length : null,
    }));

  if (flights.length === 0) {
    return { price: null, currency: 'USD', cached: false, note: 'No flights returned for this route/date' };
  }

  const picked = pickReasonableFlight(flights);
  cache.set(key, { price: picked.price, currency: 'USD', duration: picked.duration, stops: picked.stops, ts: Date.now() });
  const result = { price: picked.price, currency: 'USD', duration: picked.duration, stops: picked.stops, cached: false };
  if (debug) {
    result.candidates = flights
      .slice()
      .sort((a, b) => a.price - b.price)
      .map((f) => ({ ...f, picked: f === picked }));
  }
  return result;
}

// GET /api/price?from=DEN&to=AUS&depart=2027-03-14&ret=2027-03-21
// Add &debug=1 to also see every candidate flight considered (price/
// duration/stops) and which one was picked, to inspect the
// reasonable-flight filtering instead of trusting the final price blindly.
app.get('/api/price', async (req, res) => {
  const { from, to, depart, ret, debug } = req.query;
  if (!from || !to || !depart || !ret) {
    return res.status(400).json({ error: 'from, to, depart, and ret query params are all required' });
  }
  try {
    const result = await fetchOnePrice(from.toUpperCase(), to.toUpperCase(), depart, ret, { debug: debug === '1' || debug === 'true' });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/prices-batch
// body: { to: "AUS", depart: "2027-03-14", ret: "2027-03-21", origins: [{ id, from }] }
// Prices one destination against many home airports in a single call from the
// front end (this is what the trip planner app uses).
app.post('/api/prices-batch', async (req, res) => {
  const { to, depart, ret, origins } = req.body || {};
  if (!to || !depart || !ret || !Array.isArray(origins)) {
    return res.status(400).json({ error: 'to, depart, ret, and origins[] are required in the request body' });
  }

  const results = await Promise.all(
    origins.map(async (o) => {
      try {
        const r = await fetchOnePrice(String(o.from).toUpperCase(), String(to).toUpperCase(), depart, ret);
        return { id: o.id, price: r.price, currency: r.currency, duration: r.duration, stops: r.stops };
      } catch (e) {
        return { id: o.id, price: null, error: e.message };
      }
    })
  );

  res.json({ results });
});

app.get('/health', (req, res) => res.json({ ok: true, hasKey: !!SERPAPI_KEY }));

// ---------- Trip storage (Postgres) ----------
// A trip is one JSON blob (members, destinations, price estimates) keyed by
// its 5-letter join code — mirrors the shape the front end already builds.

function genCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += letters[Math.floor(Math.random() * letters.length)];
  return c;
}

app.post('/api/trips', async (req, res) => {
  const { group } = req.body || {};
  if (!group) return res.status(400).json({ error: 'group is required' });
  try {
    let code = null;
    for (let i = 0; i < 10 && !code; i++) {
      const candidate = genCode();
      if (!(await db.tripExists(candidate))) code = candidate;
    }
    if (!code) return res.status(500).json({ error: 'Could not generate a unique trip code, try again' });
    await db.insertTrip(code, group);
    res.json({ code, group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trips/:code', async (req, res) => {
  try {
    const group = await db.getTrip(req.params.code.toUpperCase());
    if (!group) return res.status(404).json({ error: 'Trip not found' });
    res.json({ group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/trips/:code', async (req, res) => {
  const { group } = req.body || {};
  if (!group) return res.status(400).json({ error: 'group is required' });
  try {
    const ok = await db.updateTrip(req.params.code.toUpperCase(), group);
    if (!ok) return res.status(404).json({ error: 'Trip not found' });
    res.json({ group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- AI proxy (Anthropic) ----------
// Keeps the API key server-side. Front end used to call api.anthropic.com
// directly, which only worked inside the claude.ai artifact sandbox (which
// injects a key for free); outside of that, this is a normal paid API call.

async function callClaude(prompt, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Anthropic API error');
  const text = (data.content || []).map((b) => b.text || '').join('').trim();
  return text.replace(/```json|```/g, '').trim();
}

// POST /api/ai/estimate-prices
// body: { destName, rangeLabel, members: [{id, city}] }
app.post('/api/ai/estimate-prices', async (req, res) => {
  const { destName, rangeLabel, members } = req.body || {};
  if (!destName || !rangeLabel || !Array.isArray(members)) {
    return res.status(400).json({ error: 'destName, rangeLabel, and members[] are required' });
  }
  const prompt = `You are estimating round-trip economy flight prices in USD for a friend-group trip.
Destination: ${destName}. Travel dates: ${rangeLabel}.
Home cities: ${members.map((m) => m.city).join(' | ')}.
For each home city, give your best realistic estimate of a typical round-trip economy flight price (USD) to ${destName} for those dates, based on typical fare levels for that route and time of year. If a city is very close (short drive) to the destination, you can give a low number reflecting likely driving instead, or a low flight cost.
Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
[{"city":"<city as given>","price":<integer USD>}]
The array must have exactly ${members.length} entries in the same order as the home cities listed.`;
  try {
    const clean = await callClaude(prompt, 1000);
    const parsed = JSON.parse(clean);
    const results = members.map((m, i) => {
      const p = parsed[i];
      const price = p && typeof p.price === 'number' ? p.price : null;
      return { memberId: m.id, price };
    });
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/ai/suggest-destinations
// body: { cities: [string], rangeLabel, existing: [string] }
app.post('/api/ai/suggest-destinations', async (req, res) => {
  const { cities, rangeLabel, existing } = req.body || {};
  if (!Array.isArray(cities) || !rangeLabel) {
    return res.status(400).json({ error: 'cities[] and rangeLabel are required' });
  }
  const prompt = `A group of ${cities.length} friends live in these home cities: ${cities.join(' | ')}.
They want to take a group trip during ${rangeLabel}. Suggest 6 candidate destinations that are:
1. Plausible candidates for being roughly EQUIDISTANT / similarly-priced to fly to from all of these home cities — favor cities that are geographically central to this specific set of home cities, or major air hubs reachable from all of them, over places that only favor one cluster of cities. This is the most important criterion.
2. Genuinely good to visit specifically during ${rangeLabel} (weather, season, events) — avoid places with bad weather or off-season closures at that time.
3. Fun for a group of friends on a vacation.
${existing && existing.length ? 'Do not repeat these already-suggested destinations: ' + existing.join(', ') + '.' : ''}

Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
[{"name":"<City, State/Country>","airport":"<nearest major airport, 3-letter IATA code>","reason":"<one short clause, under 12 words, on why it fits that time of year>"}]`;
  try {
    const clean = await callClaude(prompt, 1200);
    const candidates = JSON.parse(clean);
    res.json({ candidates });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

db.initSchema()
  .catch((e) => console.error('Failed to initialize trips table:', e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Flight price backend listening on port ${PORT}`);
    });
  });
