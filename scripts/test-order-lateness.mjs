/**
 * Seuils retard commandes Lucie — America/Toronto.
 */
import assert from "node:assert/strict";
import {
  computeOrderLateness,
  isCustomPeakSeason,
  customLatenessThresholdMs,
  sortOrders,
  withOrderLateness,
} from "../orders/orders-core.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ord(partial) {
  return {
    session_id: "t1",
    fulfillment_status: "a_preparer",
    items: [],
    ...partial,
  };
}

// Saison sur mesure
assert.equal(isCustomPeakSeason("2026-10-31T15:00:00-04:00"), false);
assert.equal(isCustomPeakSeason("2026-11-01T00:30:00-04:00"), true);
assert.equal(isCustomPeakSeason("2027-01-01T12:00:00-05:00"), true);
assert.equal(isCustomPeakSeason("2027-01-02T00:30:00-05:00"), false);
assert.equal(customLatenessThresholdMs("2026-11-15T12:00:00-05:00") / DAY, 21);
assert.equal(customLatenessThresholdMs("2026-06-15T12:00:00-04:00") / DAY, 7);

const confirmed = "2026-06-01T12:00:00.000Z";

// Ordinaire : pas encore 48 h
{
  const now = new Date(Date.parse(confirmed) + 47 * HOUR);
  const L = computeOrderLateness(ord({ created_at: confirmed, confirmed_at: confirmed }), now);
  assert.equal(L.late, false);
  assert.equal(L.kind, "ordinary");
  assert.equal(L.threshold_hours, 48);
}

// Ordinaire : pile 48 h → retard
{
  const now = new Date(Date.parse(confirmed) + 48 * HOUR);
  const L = computeOrderLateness(ord({ created_at: confirmed, confirmed_at: confirmed }), now);
  assert.equal(L.late, true);
  assert.match(L.label, /En retard/);
  assert.equal(L.wait_days, 2);
}

// Sur mesure juin : 7 j, pas 48 h
{
  const base = Date.parse(confirmed);
  const at3d = new Date(base + 3 * DAY);
  const L3 = computeOrderLateness(
    ord({
      created_at: confirmed,
      has_csm: true,
      items: [{ custom: true, name: "CSM" }],
      fulfillment_status: "a_fabriquer",
    }),
    at3d,
  );
  assert.equal(L3.late, false, "sur mesure ne doit pas alerter à 48 h");
  assert.equal(L3.kind, "custom");
  assert.equal(L3.threshold_hours, 7 * 24);

  const at7d = new Date(base + 7 * DAY);
  const L7 = computeOrderLateness(
    ord({
      created_at: confirmed,
      items: [{ custom: true }],
      fulfillment_status: "a_fabriquer",
    }),
    at7d,
  );
  assert.equal(L7.late, true);
}

// Sur mesure confirmée en nov : 21 j figés même si on regarde en février
{
  const conf = "2026-11-10T15:00:00-05:00";
  const base = Date.parse(conf);
  const at10 = new Date(base + 10 * DAY);
  const L10 = computeOrderLateness(
    ord({ created_at: conf, items: [{ custom: true }], fulfillment_status: "en_fabrication" }),
    at10,
  );
  assert.equal(L10.late, false);
  assert.equal(L10.threshold_hours, 21 * 24);

  const at21 = new Date(base + 21 * DAY);
  const L21 = computeOrderLateness(
    ord({ created_at: conf, items: [{ custom: true }], fulfillment_status: "en_fabrication" }),
    at21,
  );
  assert.equal(L21.late, true);
}

// Expédiée / annulée : jamais de voyant
{
  const now = new Date(Date.parse(confirmed) + 30 * DAY);
  assert.equal(
    computeOrderLateness(ord({ created_at: confirmed, fulfillment_status: "expediee" }), now).late,
    false,
  );
  assert.equal(
    computeOrderLateness(ord({ created_at: confirmed, fulfillment_status: "annulee" }), now).late,
    false,
  );
  assert.equal(
    computeOrderLateness(ord({ created_at: confirmed, fulfillment_status: "expediee" }), now).label,
    null,
  );
}

// Tri anciennes d’abord
{
  const a = withOrderLateness(ord({ session_id: "a", created_at: "2026-01-01T00:00:00Z" }));
  const b = withOrderLateness(ord({ session_id: "b", created_at: "2026-06-01T00:00:00Z" }));
  assert.deepEqual(
    sortOrders([b, a], "oldest").map((o) => o.session_id),
    ["a", "b"],
  );
  assert.deepEqual(
    sortOrders([a, b], "newest").map((o) => o.session_id),
    ["b", "a"],
  );
}

console.log("ok — test-order-lateness");
