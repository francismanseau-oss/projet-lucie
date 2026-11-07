import fs from "fs";
import os from "os";
import path from "path";
import { createClientsRegistry } from "../orders/clients-registry.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lucie-clients-"));
const file = path.join(dir, "clients-registry.json");
const reg = createClientsRegistry(file);

let failed = 0;
function ok(label, cond) {
  console.log(`${cond ? "OK" : "FAIL"} — ${label}`);
  if (!cond) failed += 1;
}

const a = reg.ensureClient({
  email: "jacques.bidon@exemple.test",
  name: "Jacques Bidon",
  phone: "418",
});
ok("premier client = 1000", a?.client_number === 1000 && a.created === true);

const a2 = reg.ensureClient({ email: "Jacques.Bidon@Exemple.TEST", name: "Jacques" });
ok("même courriel = même n°", a2?.client_number === 1000 && a2.created === false);

const b = reg.ensureClient({ email: "autre@exemple.test", name: "Autre" });
ok("deuxième client = 1001", b?.client_number === 1001 && b.created === true);

const enriched = reg.enrichOrders([
  {
    customer_email: "jacques.bidon@exemple.test",
    customer_name: "J",
    session_id: "x",
  },
]);
ok("enrich attache 1000", enriched[0].client_number === 1000);

ok("sans courriel = null ensure", reg.ensureClient({ email: "" }) == null);

fs.rmSync(dir, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("\nRegistre clients OK");
