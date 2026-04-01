-- Migration 010: Create tg_students table (missed in 002 if migration ran early)

CREATE TABLE IF NOT EXISTS tg_students (
  tg_group_id     INT UNSIGNED NOT NULL,
  student_erp_id  VARCHAR(50) NOT NULL,
  PRIMARY KEY (tg_group_id, student_erp_id),
  CONSTRAINT fk_tgs_group   FOREIGN KEY (tg_group_id) REFERENCES tg_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_tgs_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
