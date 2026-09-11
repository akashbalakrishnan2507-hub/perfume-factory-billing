-- Migration 006: Bill sequences table
-- Stores the current sequence number per year.
-- Row-locked via SELECT ... FOR UPDATE during bill number generation.
-- This ensures PF-YYYY-NNNN is sequential and never duplicated,
-- even under concurrent requests.

CREATE TABLE IF NOT EXISTS bill_sequences (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  year        SMALLINT UNSIGNED NOT NULL UNIQUE,
  current_seq INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bill_sequences_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
