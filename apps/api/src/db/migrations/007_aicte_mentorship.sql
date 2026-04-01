-- Migration 007: AICTE points and mentorship records

CREATE TABLE IF NOT EXISTS aicte_activities (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id      VARCHAR(50) NOT NULL,
  category            ENUM('SPORTS','CULTURAL','NSS','TECHNICAL','RESEARCH','ENTREPRENEURSHIP','OTHER') NOT NULL,
  description         TEXT NOT NULL,
  claimed_points      TINYINT UNSIGNED NOT NULL,
  awarded_points      TINYINT UNSIGNED NULL,
  evidence_minio_path VARCHAR(500) NULL,
  status              ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  allocated_by        VARCHAR(50) NULL,
  reviewer_note       TEXT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aicte_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_aicte_tg      FOREIGN KEY (allocated_by) REFERENCES users(erp_id) ON DELETE SET NULL,
  INDEX idx_aicte_student (student_erp_id),
  INDEX idx_aicte_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mentorship_records (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tg_erp_id      VARCHAR(50) NOT NULL,
  student_erp_id VARCHAR(50) NOT NULL,
  notes          TEXT NOT NULL,
  action_plan    TEXT NULL,
  follow_up_date DATE NULL,
  version        INT UNSIGNED NOT NULL DEFAULT 1,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Append-only — never updated',
  CONSTRAINT fk_mr_tg      FOREIGN KEY (tg_erp_id) REFERENCES users(erp_id),
  CONSTRAINT fk_mr_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  INDEX idx_mr_student (student_erp_id),
  INDEX idx_mr_tg (tg_erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
