# Pourquoi D1 (pas KV) pour les stocks

Cloudflare **KV** est éventuellement cohérent et **n’offre pas** de transactions multi-clés atomiques. Deux checkouts simultanés pourraient lire le même stock et sur-vendre.

**Choix** : **Cloudflare D1** (SQLite) avec :

```sql
UPDATE inventory
SET qty_reserved = qty_reserved + :qty
WHERE product_id = :id
  AND fulfillment_type = 'unique_stock'
  AND qty_on_hand IS NOT NULL
  AND (qty_on_hand - qty_reserved) >= :qty;
```

Si `changes = 0` → refus (409). Envelopper multi-lignes dans `db.batch` / transaction D1.

Alternative acceptable plus tard : **Durable Object** par produit (verrou exclusif). KV reste OK pour idempotence webhooks Stripe (`ORDERS`), **pas** pour l’inventaire.

Binding prévu (`wrangler.test.toml`, commenté jusqu’à autorisation) :

```toml
[[d1_databases]]
binding = "DB"
database_name = "boreales-inventory-test"
database_id = "REPLACE_AFTER_CREATE"
```

Création (Lucie / Francis infra, quand comptes OK) :

```bat
npx wrangler d1 create boreales-inventory-test
npx wrangler d1 executions boreales-inventory-test --file=migrations/0001_inventory.sql
```

Seed : importer `inventory/inventory.json` (qty NULL) — Lucie remplit ensuite via CSV.
