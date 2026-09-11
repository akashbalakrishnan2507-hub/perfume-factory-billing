-- Migration 007: Collections table (one collection = one bill)
-- total_amount is SERVER-recomputed: SUM(items.amount) - discount + other_charges
-- payment_status is DERIVED from payments, never stored separately - computed on read
-- paid_amount is maintained by payment triggers/service
-- Soft deletes: deleted_at. Collections with payments CANNOT be deleted.

CREATE TABLE IF NOT EXISTS collections (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_number         VARCHAR(20)  NOT NULL UNIQUE COMMENT 'PF-YYYY-NNNN',
  customer_id         INT UNSIGNED NOT NULL,
  village_id          INT UNSIGNED NOT NULL,
  collection_date     DATE NOT NULL DEFAULT (CURDATE()),
  total_amount        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'In paise',
  discount            INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'In paise',
  other_charges       INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'In paise',
  paid_amount         INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'In paise, sum of all payments',
  payment_status      ENUM('UNPAID','PARTIALLY_PAID','PAID') NOT NULL DEFAULT 'UNPAID',
  remarks             TEXT NULL,
  created_by          INT UNSIGNED NULL,
  status              ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_collections_customer  FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_collections_village   FOREIGN KEY (village_id)  REFERENCES villages(id),
  CONSTRAINT fk_collections_user      FOREIGN KEY (created_by)  REFERENCES users(id),
  INDEX idx_collections_bill_number     (bill_number),
  INDEX idx_collections_customer        (customer_id),
  INDEX idx_collections_village         (village_id),
  INDEX idx_collections_date            (collection_date),
  INDEX idx_collections_payment_status  (payment_status),
  INDEX idx_collections_deleted         (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
