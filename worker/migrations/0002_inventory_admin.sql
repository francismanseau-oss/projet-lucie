-- Extension inventaire admin (seuil minimum + historique).
-- À appliquer seulement quand D1 réel sera branché — pas d'activation vente.
-- min_stock_target ≠ qty_on_hand (objectif provisoire, défaut 3).

PRAGMA foreign_keys = ON;

ALTER TABLE inventory ADD COLUMN min_stock_target INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS inventory_audit (
  id TEXT PRIMARY KEY NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  product_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT NOT NULL DEFAULT '',
  data_mode TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_at ON inventory_audit(at);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_product ON inventory_audit(product_id);
