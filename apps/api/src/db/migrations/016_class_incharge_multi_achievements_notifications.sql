-- Migration 016: Allow 2 class incharges per division; teacher achievements; missed-attendance notifications

-- 1. Fix class_incharge to allow up to 2 per division
-- Drop PK and add new auto-increment PK + index on division_id (for FK) in one statement
ALTER TABLE class_incharge
  ADD COLUMN id INT UNSIGNED AUTO_INCREMENT FIRST,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (id),
  ADD INDEX idx_ci_div (division_id),
  ADD UNIQUE KEY uq_ci_teacher_div (teacher_erp_id, division_id);

-- Enforce max 2 per division at application level (no DB constraint needed)

-- 2. Teacher achievements table
CREATE TABLE IF NOT EXISTS teacher_achievements (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  erp_id        VARCHAR(50) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  achievement_type ENUM('PHD','MASTERS','CERTIFICATION','PUBLICATION','AWARD','PATENT','OTHER') NOT NULL DEFAULT 'OTHER',
  achieved_date DATE,
  minio_path    VARCHAR(500),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ta_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  INDEX idx_ta_erp (erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Missed-attendance notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  erp_id      VARCHAR(50) NOT NULL,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  link        VARCHAR(500),
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  INDEX idx_notif_erp_read (erp_id, is_read),
  INDEX idx_notif_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
