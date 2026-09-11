-- Migration 003: Customers table (flower farmers / suppliers)

CREATE TABLE IF NOT EXISTS customers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  mobile          VARCHAR(20)  NOT NULL,
  alternate_mobile VARCHAR(20) NULL,
  village_id      INT UNSIGNED NOT NULL,
  address         TEXT         NULL,
  bank_name       VARCHAR(255) NULL,
  account_number  VARCHAR(50)  NULL,
  ifsc_code       VARCHAR(20)  NULL,
  notes           TEXT         NULL,
  status          ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_customers_village FOREIGN KEY (village_id) REFERENCES villages(id),
  INDEX idx_customers_name      (name),
  INDEX idx_customers_mobile    (mobile),
  INDEX idx_customers_village   (village_id),
  INDEX idx_customers_status    (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
