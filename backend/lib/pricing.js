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

module.exports = { cacheKey, pickReasonableFlight };
