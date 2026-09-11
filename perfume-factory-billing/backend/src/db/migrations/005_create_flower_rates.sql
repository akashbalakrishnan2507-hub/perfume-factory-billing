-- Migration 005: Flower rates table
-- Rate history: each row is an active or closed rate period.
-- rate_per_kg stored as INTEGER (paise) for exact arithmetic.
-- When a new rate is set: close current row (effective_to = NOW()), insert new row.
-- Rate is locked onto collection_items at insert time and NEVER changed retroactively.

CREATE TABLE IF NOT EXISTS flower_rates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flower_id       INT UNSIGNED NOT NULL,
  rate_per_kg     INT UNSIGNED NOT NULL COMMENT 'Rate in paise (1/100 rupee) per kg',
  effective_from  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to    DATETIME NULL DEFAULT NULL COMMENT 'NULL means currently active',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_flower_rates_flower FOREIGN KEY (flower_id) REFERENCES flowers(id),
  CONSTRAINT fk_flower_rates_user   FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_flower_rates_flower    (flower_id),
  INDEX idx_flower_rates_active    (flower_id, is_active),
  INDEX idx_flower_rates_effective (flower_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
