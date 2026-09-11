-- Migration 004: Flowers table

CREATE TABLE IF NOT EXISTS flowers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  botanical_name  VARCHAR(255) NULL,
  local_name      VARCHAR(255) NULL,
  unit            ENUM('kg', 'ton') NOT NULL DEFAULT 'kg',
  notes           TEXT NULL,
  status          ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL DEFAULT NULL,
  INDEX idx_flowers_name   (name),
  INDEX idx_flowers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
