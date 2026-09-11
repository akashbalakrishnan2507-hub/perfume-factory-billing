-- Migration 008: Collection items table
-- rate_per_kg is LOCKED at insert time from the then-active flower_rates row.
-- It NEVER changes retroactively — even if the flower rate is updated later.
-- amount = weight_kg * rate_per_kg (both stored; amount is in paise)

CREATE TABLE IF NOT EXISTS collection_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_id   INT UNSIGNED NOT NULL,
  flower_id       INT UNSIGNED NOT NULL,
  flower_rate_id  INT UNSIGNED NOT NULL COMMENT 'The specific rate row locked at insert',
  weight_kg       DECIMAL(10,3) NOT NULL COMMENT 'Weight in kilograms',
  rate_per_kg     INT UNSIGNED NOT NULL COMMENT 'Locked rate in paise/kg at time of insert',
  amount          INT UNSIGNED NOT NULL COMMENT 'weight_kg * rate_per_kg in paise',
  notes           TEXT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_collection  FOREIGN KEY (collection_id)  REFERENCES collections(id),
  CONSTRAINT fk_items_flower      FOREIGN KEY (flower_id)      REFERENCES flowers(id),
  CONSTRAINT fk_items_flower_rate FOREIGN KEY (flower_rate_id) REFERENCES flower_rates(id),
  INDEX idx_items_collection (collection_id),
  INDEX idx_items_flower     (flower_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
