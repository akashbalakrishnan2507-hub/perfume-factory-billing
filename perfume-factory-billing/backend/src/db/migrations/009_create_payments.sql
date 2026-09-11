-- Migration 009: Payments table
-- Multiple payments per collection are allowed.
-- The service layer enforces: SUM(payments.amount) <= collections.total_amount
-- Payment insert is transactional with row-lock on the collection row.

CREATE TABLE IF NOT EXISTS payments (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_id    INT UNSIGNED NOT NULL,
  payment_number   VARCHAR(30) NOT NULL COMMENT 'PMT-YYYY-NNNN auto-generated',
  amount           INT UNSIGNED NOT NULL COMMENT 'In paise',
  payment_mode     ENUM('CASH','BANK_TRANSFER','CHEQUE','UPI','OTHER') NOT NULL DEFAULT 'CASH',
  reference_number VARCHAR(100) NULL COMMENT 'Cheque no, UTR, UPI ref, etc.',
  notes            TEXT NULL,
  paid_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_collection FOREIGN KEY (collection_id) REFERENCES collections(id),
  CONSTRAINT fk_payments_user       FOREIGN KEY (created_by)    REFERENCES users(id),
  INDEX idx_payments_collection  (collection_id),
  INDEX idx_payments_paid_at     (paid_at),
  INDEX idx_payments_mode        (payment_mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
