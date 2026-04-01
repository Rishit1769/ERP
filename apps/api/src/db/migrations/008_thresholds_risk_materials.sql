-- Migration 008: Thresholds, risk events, materials, email logs

CREATE TABLE IF NOT EXISTS admin_thresholds (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type       ENUM('ATTENDANCE','PASSING_MARKS') NOT NULL,
  value      DECIMAL(5,2) NOT NULL COMMENT 'e.g. 75.00 for 75%',
  dept_id    INT UNSIGNED NULL COMMENT 'NULL = global threshold',
  set_by     VARCHAR(50) NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_threshold (type, dept_id),
  CONSTRAINT fk_thr_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default global thresholds (set_by SYSTEM — no FK needed yet)
INSERT IGNORE INTO admin_thresholds (type, value, dept_id, set_by)
VALUES
  ('ATTENDANCE', 75.00, NULL, 'SYSTEM'),
  ('PASSING_MARKS', 40.00, NULL, 'SYSTEM');

CREATE TABLE IF NOT EXISTS risk_events (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id   VARCHAR(50) NOT NULL,
  rule_type        ENUM('ATTENDANCE','MARKS') NOT NULL,
  triggered_value  DECIMAL(5,2) NOT NULL,
  threshold_value  DECIMAL(5,2) NOT NULL,
  subject_id       INT UNSIGNED NULL,
  resolved_at      DATETIME NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_re_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_re_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  INDEX idx_re_student (student_erp_id),
  INDEX idx_re_resolved (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS materials (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_assignment_id INT UNSIGNED NOT NULL,
  uploader_erp_id       VARCHAR(50) NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  minio_path            VARCHAR(500) NOT NULL,
  file_size_bytes       BIGINT UNSIGNED NULL,
  mime_type             VARCHAR(100) NULL,
  uploaded_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mat_sa       FOREIGN KEY (subject_assignment_id) REFERENCES subject_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_mat_uploader FOREIGN KEY (uploader_erp_id) REFERENCES users(erp_id),
  INDEX idx_mat_sa (subject_assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id VARCHAR(50) NOT NULL,
  type           ENUM('LOW_ATTENDANCE','RESULT','GENERAL') NOT NULL DEFAULT 'LOW_ATTENDANCE',
  week_start     DATE NOT NULL COMMENT 'ISO week start date — prevents duplicate weekly mails',
  sent_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_week (student_erp_id, type, week_start),
  CONSTRAINT fk_el_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  erp_id     VARCHAR(50) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  INDEX idx_notif_user (erp_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
