-- Migration 006: Grievances and OD requests

CREATE TABLE IF NOT EXISTS grievances (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id      VARCHAR(50) NOT NULL,
  attendance_id       BIGINT UNSIGNED NOT NULL,
  evidence_minio_path VARCHAR(500) NULL,
  reason              TEXT NOT NULL,
  status              ENUM('PENDING','APPROVED','REJECTED','CLARIFICATION') NOT NULL DEFAULT 'PENDING',
  reviewer_erp_id     VARCHAR(50) NULL,
  reviewer_note       TEXT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grievance (student_erp_id, attendance_id),
  CONSTRAINT fk_gr_student  FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_gr_att      FOREIGN KEY (attendance_id) REFERENCES attendance(id),
  CONSTRAINT fk_gr_reviewer FOREIGN KEY (reviewer_erp_id) REFERENCES users(erp_id) ON DELETE SET NULL,
  INDEX idx_gr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS od_requests (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id      VARCHAR(50) NOT NULL,
  dates               JSON NOT NULL COMMENT 'Array of YYYY-MM-DD strings',
  reason              TEXT NOT NULL,
  evidence_minio_path VARCHAR(500) NULL,
  status              ENUM('PENDING','APPROVED','REJECTED','CLARIFICATION') NOT NULL DEFAULT 'PENDING',
  reviewed_by         VARCHAR(50) NULL,
  review_note         TEXT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_od_student  FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_od_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(erp_id) ON DELETE SET NULL,
  INDEX idx_od_student (student_erp_id),
  INDEX idx_od_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
