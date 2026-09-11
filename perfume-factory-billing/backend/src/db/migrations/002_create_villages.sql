-- Migration 002: Villages table

CREATE TABLE IF NOT EXISTS villages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  district    VARCHAR(255) NOT NULL,
  state       VARCHAR(255) NOT NULL DEFAULT 'Tamil Nadu',
  pincode     VARCHAR(10)  NULL,
  status      ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL DEFAULT NULL,
  INDEX idx_villages_name     (name),
  INDEX idx_villages_district (district),
  INDEX idx_villages_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
