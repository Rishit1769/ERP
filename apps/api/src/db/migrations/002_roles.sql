-- Migration 002: Employee roles, subjects, assignments

CREATE TABLE IF NOT EXISTS employee_roles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  erp_id      VARCHAR(50) NOT NULL,
  role_type   ENUM(
    'HOD','SUBJECT_TEACHER','PRACTICAL_TEACHER',
    'CLASS_INCHARGE','TEACHER_GUARDIAN',
    'PLACEMENT_OFFICER','ADMIN','SUPER_ADMIN','WARDEN','LIBRARIAN'
  ) NOT NULL,
  dept_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_emp_role (erp_id, role_type, dept_id),
  CONSTRAINT fk_er_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_er_dept FOREIGN KEY (dept_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subjects (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  name          VARCHAR(150) NOT NULL,
  dept_id       INT UNSIGNED NOT NULL,
  has_practical TINYINT(1) NOT NULL DEFAULT 0,
  credits       TINYINT UNSIGNED NOT NULL DEFAULT 3,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subject_assignments (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_erp_id VARCHAR(50) NOT NULL,
  subject_id     INT UNSIGNED NOT NULL,
  division_id    INT UNSIGNED NOT NULL,
  type           ENUM('THEORY','PRACTICAL') NOT NULL DEFAULT 'THEORY',
  batch_label    VARCHAR(20) NULL COMMENT 'for PRACTICAL type e.g. Batch-A',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assignment (teacher_erp_id, subject_id, division_id, type, batch_label),
  CONSTRAINT fk_sa_teacher FOREIGN KEY (teacher_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_sa_div     FOREIGN KEY (division_id) REFERENCES divisions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_incharge (
  teacher_erp_id VARCHAR(50) NOT NULL,
  division_id    INT UNSIGNED NOT NULL,
  assigned_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (division_id),
  CONSTRAINT fk_ci_teacher FOREIGN KEY (teacher_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_div     FOREIGN KEY (division_id) REFERENCES divisions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tg_groups (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tg_erp_id   VARCHAR(50) NOT NULL,
  division_id INT UNSIGNED NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tg_div (tg_erp_id, division_id),
  CONSTRAINT fk_tg_teacher FOREIGN KEY (tg_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_tg_div     FOREIGN KEY (division_id) REFERENCES divisions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tg_students (
  tg_group_id     INT UNSIGNED NOT NULL,
  student_erp_id  VARCHAR(50) NOT NULL,
  PRIMARY KEY (tg_group_id, student_erp_id),
  CONSTRAINT fk_tgs_group   FOREIGN KEY (tg_group_id) REFERENCES tg_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_tgs_student FOREIGN KEY (student_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
