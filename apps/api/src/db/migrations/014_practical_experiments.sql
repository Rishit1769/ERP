-- Migration 014: Practical experiment marks system
-- Practical teachers configure how many experiments their subject has,
-- then enter per-experiment marks for each student.

CREATE TABLE IF NOT EXISTS practical_experiment_config (
  subject_assignment_id INT UNSIGNED PRIMARY KEY,
  experiment_count      TINYINT UNSIGNED NOT NULL DEFAULT 10,
  marks_per_experiment  DECIMAL(5,2)     NOT NULL DEFAULT 10,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pec_sa FOREIGN KEY (subject_assignment_id)
    REFERENCES subject_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marks_experiments (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_assignment_id INT UNSIGNED  NOT NULL,
  student_erp_id        VARCHAR(50)   NOT NULL,
  experiment_no         TINYINT UNSIGNED NOT NULL,
  marks_obtained        DECIMAL(5,2)  NOT NULL DEFAULT 0,
  entered_by            VARCHAR(50)   NOT NULL,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exp (subject_assignment_id, student_erp_id, experiment_no),
  CONSTRAINT fk_me_sa      FOREIGN KEY (subject_assignment_id) REFERENCES subject_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_me_student FOREIGN KEY (student_erp_id)        REFERENCES users(erp_id)            ON DELETE CASCADE,
  CONSTRAINT fk_me_teacher FOREIGN KEY (entered_by)            REFERENCES users(erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
