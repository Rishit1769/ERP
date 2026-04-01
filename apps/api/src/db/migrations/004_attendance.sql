-- Migration 004: Attendance

CREATE TABLE IF NOT EXISTS attendance (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id        VARCHAR(50) NOT NULL,
  subject_assignment_id INT UNSIGNED NOT NULL,
  date                  DATE NOT NULL,
  status                ENUM('PRESENT','ABSENT','OD','DISPUTED') NOT NULL DEFAULT 'ABSENT',
  marked_by             VARCHAR(50) NOT NULL,
  idempotency_key       CHAR(36) NOT NULL UNIQUE COMMENT 'UUID per submit session',
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_att (student_erp_id, subject_assignment_id, date),
  CONSTRAINT fk_att_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_att_sa      FOREIGN KEY (subject_assignment_id) REFERENCES subject_assignments(id),
  CONSTRAINT fk_att_marker  FOREIGN KEY (marked_by) REFERENCES users(erp_id),
  INDEX idx_att_student_date (student_erp_id, date),
  INDEX idx_att_sa_date (subject_assignment_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_overrides (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attendance_id BIGINT UNSIGNED NOT NULL,
  changed_by    VARCHAR(50) NOT NULL,
  old_status    ENUM('PRESENT','ABSENT','OD','DISPUTED') NOT NULL,
  new_status    ENUM('PRESENT','ABSENT','OD','DISPUTED') NOT NULL,
  reason        TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ao_att  FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
  CONSTRAINT fk_ao_user FOREIGN KEY (changed_by) REFERENCES users(erp_id),
  INDEX idx_ao_att (attendance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
