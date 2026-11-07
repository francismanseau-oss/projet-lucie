import {
  buildClientDirectory,
  filterClients,
  normalizeEmail,
  mailToHref,
} from "../orders/clients-from-orders.js";

let failed = 0;
function ok(label, cond) {
  console.log(`${cond ? "OK" : "FAIL"} — ${label}`);
  if (!cond) failed += 1;
}

const orders = [
  {
    session_id: "cs_test_1",
    order_number: "LFB-1001",
    created_at: "2026-11-01T10:00:00Z",
    payment_status: "paid",
    payment_verified: true,
    customer_email: " Marie.Tremblay@Example.com ",
    customer_name: "Marie Tremblay",
    customer_phone: "4185551111",
    shipping_address: { city: "Québec", line1: "1 rue A", postal_code: "G1A1A1", country: "CA" },
    shipping: { method: "canada_post" },
    items: [{ name: "Mitaines", qty: 1, size: "M" }],
    amount_total_cents: 12000,
    fulfillment_status: "a_preparer",
    source: "stripe_test",
  },
  {
    session_id: "cs_test_2",
    order_number: "LFB-1002",
    created_at: "2026-11-05T10:00:00Z",
    payment_status: "paid",
    payment_verified: true,
    customer_email: "marie.tremblay@example.com",
    customer_name: "Marie T.",
    customer_phone: "4185552222",
    shipping_address: { city: "Lévis", line1: "2 rue B", postal_code: "G6V1A1", country: "CA" },
    shipping: { method: "bus_quebec", bus: { dropoff_point: "Terminus Lévis" } },
    items: [
      { name: "Chapeau", qty: 1, size: "L" },
      { name: "Cache-oreilles", qty: 2, size: "8-14" },
    ],
    amount_total_cents: 20000,
    fulfillment_status: "expediee",
    source: "stripe_test",
  },
  {
    session_id: "cs_test_3",
    order_number: "LFB-1003",
    created_at: "2026-11-03T10:00:00Z",
    payment_status: "paid",
    payment_verified: true,
    customer_email: "jean@example.com",
    customer_name: "Jean",
    shipping_address: null,
    customer_phone: null,
    items: [{ name: "Pantoufles", qty: 1 }],
    amount_total_cents: 9000,
    fulfillment_status: "a_fabriquer",
    source: "test_fixture",
  },
  {
    session_id: "cs_test_same_name",
    created_at: "2026-11-04T10:00:00Z",
    payment_verified: true,
    payment_status: "paid",
    customer_email: "autre.marie@example.com",
    customer_name: "Marie Tremblay",
    items: [],
    amount_total_cents: 1000,
    fulfillment_status: "a_preparer",
    source: "test_fixture",
  },
];

ok("email normalisé", normalizeEmail(" Marie.Tremblay@Example.com ") === "marie.tremblay@example.com");

const clients = buildClientDirectory(orders);
ok("3 clients (même courriel fusionné, même nom non fusionné)", clients.length === 3);

const marie = clients.find((c) => c.key === "marie.tremblay@example.com");
ok("Marie a 2 commandes", marie?.orders_count === 2);
ok("adresse récente = Lévis (fiche), historique conservé", marie?.city === "Lévis");
ok("1re commande garde Québec", marie?.orders.find((o) => o.order_number === "LFB-1001")?.shipping_address?.city === "Québec");
ok("téléphone récent", marie?.phone === "4185552222");

const jean = clients.find((c) => c.key === "jean@example.com");
ok("champs manquants restent absents", jean?.phone == null && jean?.city == null);

ok(
  "recherche par n° commande",
  filterClients(clients, "LFB-1002").length === 1 &&
    filterClients(clients, "LFB-1002")[0].key === "marie.tremblay@example.com",
);

const href = mailToHref({
  email: "marie.tremblay@example.com",
  subject: "Test",
  body: "Bonjour",
});
ok("mailto prérempli", href?.startsWith("mailto:") && href.includes("subject=Test"));

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log("\nTous les tests répertoire clients OK (données fictives isolées, non enregistrées)");
