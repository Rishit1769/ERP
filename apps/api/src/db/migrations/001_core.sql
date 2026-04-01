-- Migration 001: Core tables (departments, users, student_details)

CREATE TABLE IF NOT EXISTS departments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  erp_id               VARCHAR(50) PRIMARY KEY,
  name                 VARCHAR(150) NOT NULL,
  email                VARCHAR(200) NOT NULL UNIQUE,
  phone                VARCHAR(15) NOT NULL,
  dept_id              INT UNSIGNED NULL,
  base_role            ENUM('STUDENT','EMPLOYEE') NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  erp_id     VARCHAR(50) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  INDEX idx_rt_erp (erp_id),
  INDEX idx_rt_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS divisions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dept_id    INT UNSIGNED NOT NULL,
  year       TINYINT UNSIGNED NOT NULL COMMENT '1=FY,2=SY,3=TY,4=LY',
  label      VARCHAR(10) NOT NULL COMMENT 'e.g. A, B, C',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_division (dept_id, year, label),
  CONSTRAINT fk_div_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_details (
  erp_id       VARCHAR(50) PRIMARY KEY,
  division_id  INT UNSIGNED NOT NULL,
  roll_no      VARCHAR(20) NOT NULL,
  parent_phone VARCHAR(15) NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sd_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_sd_div  FOREIGN KEY (division_id) REFERENCES divisions(id),
  UNIQUE KEY uq_roll (division_id, roll_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
