-- Migration 005: Marks

CREATE TABLE IF NOT EXISTS marks_theory (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id VARCHAR(50) NOT NULL,
  subject_id     INT UNSIGNED NOT NULL,
  division_id    INT UNSIGNED NOT NULL,
  exam_type      ENUM('UT1','UT2','PRELIM','END_SEM','INTERNAL') NOT NULL,
  marks_obtained DECIMAL(5,2) NOT NULL,
  max_marks      DECIMAL(5,2) NOT NULL,
  entered_by     VARCHAR(50) NOT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_theory (student_erp_id, subject_id, exam_type),
  CONSTRAINT fk_mt_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_mt_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_mt_div     FOREIGN KEY (division_id) REFERENCES divisions(id),
  CONSTRAINT fk_mt_teacher FOREIGN KEY (entered_by) REFERENCES users(erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marks_practical (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_erp_id VARCHAR(50) NOT NULL,
  subject_id     INT UNSIGNED NOT NULL,
  batch_label    VARCHAR(20) NOT NULL,
  marks_obtained DECIMAL(5,2) NOT NULL,
  max_marks      DECIMAL(5,2) NOT NULL,
  entered_by     VARCHAR(50) NOT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_practical (student_erp_id, subject_id, batch_label),
  CONSTRAINT fk_mp_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_mp_teacher FOREIGN KEY (entered_by) REFERENCES users(erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
