-- Migration 015: Syllabus master and teacher lesson plans

-- ─── Master syllabus (admin-uploaded per subject + type + semester) ──────────
CREATE TABLE IF NOT EXISTS syllabus_master (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id          INT UNSIGNED NOT NULL,
  type                ENUM('THEORY','PRACTICAL') NOT NULL DEFAULT 'THEORY',
  semester            TINYINT UNSIGNED NOT NULL COMMENT '1-8',
  total_lecture_hours INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by_erp     VARCHAR(50) NOT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_syllabus (subject_id, type, semester),
  CONSTRAINT fk_sm_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_uploader FOREIGN KEY (uploaded_by_erp) REFERENCES users(erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Syllabus units ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS syllabus_units (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  syllabus_id  INT UNSIGNED NOT NULL,
  unit_name    VARCHAR(200) NOT NULL,
  order_no     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_su_syllabus (syllabus_id),
  CONSTRAINT fk_su_syllabus FOREIGN KEY (syllabus_id) REFERENCES syllabus_master(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Syllabus topics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS syllabus_topics (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id          INT UNSIGNED NOT NULL,
  topic_name       VARCHAR(300) NOT NULL,
  topic_description TEXT NULL,
  num_lectures     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  weightage        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  order_no         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_st_unit (unit_id),
  CONSTRAINT fk_st_unit FOREIGN KEY (unit_id) REFERENCES syllabus_units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Teacher lesson plans (auto-created when HOD assigns a subject) ──────────
CREATE TABLE IF NOT EXISTS teacher_lesson_plans (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id  INT UNSIGNED NOT NULL,
  syllabus_id    INT UNSIGNED NOT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tlp_assignment (assignment_id),
  CONSTRAINT fk_tlp_assignment FOREIGN KEY (assignment_id) REFERENCES subject_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_tlp_syllabus   FOREIGN KEY (syllabus_id) REFERENCES syllabus_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Lesson plan topics (teacher's per-topic tracking + additional topics) ───
CREATE TABLE IF NOT EXISTS lesson_plan_topics (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lesson_plan_id   INT UNSIGNED NOT NULL,
  syllabus_topic_id INT UNSIGNED NULL COMMENT 'NULL for teacher-added additional topics',
  unit_name        VARCHAR(200) NOT NULL,
  topic_name       VARCHAR(300) NOT NULL,
  topic_description TEXT NULL,
  num_lectures     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  weightage        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  order_no         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status           ENUM('PENDING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
  lectures_taken   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_additional    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = manually added by teacher',
  notes            TEXT NULL,
  completed_at     DATETIME NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lpt_plan (lesson_plan_id),
  CONSTRAINT fk_lpt_plan  FOREIGN KEY (lesson_plan_id) REFERENCES teacher_lesson_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_lpt_topic FOREIGN KEY (syllabus_topic_id) REFERENCES syllabus_topics(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
