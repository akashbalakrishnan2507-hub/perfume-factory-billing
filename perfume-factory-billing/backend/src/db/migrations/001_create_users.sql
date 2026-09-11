-- Migration 001: Users table
-- Role: admin | staff
-- Permissions stored as JSON array e.g. ["can_edit_rates"]
-- Passwords are bcrypt hashed, never stored plaintext

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
  permissions   JSON NOT NULL DEFAULT ('[]'),
  status        ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL DEFAULT NULL,
  INDEX idx_users_email (email),
  INDEX idx_users_role  (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
