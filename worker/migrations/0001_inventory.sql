-- D1 (SQLite) — stocks + réservations atomiques
-- Cloudflare KV ne suffit PAS pour empêcher les surventes concurrentes.
-- Binding prévu : [[d1_databases]] binding = "DB" database_name = "boreales-inventory-test"

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inventory (
  product_id TEXT PRIMARY KEY NOT NULL,
  name_fr TEXT NOT NULL,
  category TEXT,
  -- pending_lucie | unique_stock | made_to_order
  fulfillment_type TEXT NOT NULL DEFAULT 'pending_lucie',
  -- NULL = Lucie n'a pas saisi (interdit d'inventer une quantité)
  qty_on_hand INTEGER,
  qty_reserved INTEGER NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  lucie_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (lucie_confirmed IN (0, 1)),
  notes_lucie TEXT NOT NULL DEFAULT '',
  updated_at TEXT,
  CHECK (qty_on_hand IS NULL OR qty_on_hand >= 0),
  CHECK (
    fulfillment_type IN ('pending_lucie', 'unique_stock', 'made_to_order')
  )
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'committed', 'released', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservation_lines (
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES inventory(product_id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  reserved INTEGER NOT NULL DEFAULT 1 CHECK (reserved IN (0, 1)),
  PRIMARY KEY (reservation_id, product_id)
);

-- Alertes réconciliation (paiement OK sans stock)
CREATE TABLE IF NOT EXISTS stock_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT,
  reservation_id TEXT,
  outcome TEXT NOT NULL,
  action TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_status_expires
  ON reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_reservations_session
  ON reservations(session_id);
