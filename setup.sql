-- ============================================================================
-- CloudCampus — Complete Database Setup
-- Run this file against your MySQL server to create everything from scratch.
-- Usage: mysql -u root -p < setup.sql
-- ============================================================================

-- ── Create database ─────────────────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS cloudcampus
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cloudcampus;

-- ── Migration tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  filename VARCHAR(255) PRIMARY KEY,
  ran_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 001 — Core tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS departments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  erp_id               VARCHAR(50) PRIMARY KEY,
  name                 VARCHAR(150) NOT NULL,
  email                VARCHAR(200) NOT NULL UNIQUE,
  phone                VARCHAR(15) NOT NULL,
  dept_id              INT UNSIGNED NULL,
  base_role            ENUM('STUDENT','EMPLOYEE') NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  erp_id     VARCHAR(50) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  INDEX idx_rt_erp (erp_id),
  INDEX idx_rt_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS divisions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dept_id    INT UNSIGNED NOT NULL,
  year       TINYINT UNSIGNED NOT NULL COMMENT '1=FY,2=SY,3=TY,4=LY',
  label      VARCHAR(10) NOT NULL COMMENT 'e.g. A, B, C',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_division (dept_id, year, label),
  CONSTRAINT fk_div_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_details (
  erp_id       VARCHAR(50) PRIMARY KEY,
  division_id  INT UNSIGNED NOT NULL,
  roll_no      VARCHAR(20) NOT NULL,
  parent_phone VARCHAR(15) NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sd_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_sd_div  FOREIGN KEY (division_id) REFERENCES divisions(id),
  UNIQUE KEY uq_roll (division_id, roll_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO _migrations (filename) VALUES ('001_core.sql');

-- ============================================================================
-- 002 — Employee roles, subjects, assignments
-- ============================================================================

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

INSERT IGNORE INTO _migrations (filename) VALUES ('002_roles.sql');

-- ============================================================================
-- 003 — Timetable and teacher location
-- ============================================================================

CREATE TABLE IF NOT EXISTS timetable_slots (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_assignment_id INT UNSIGNED NOT NULL,
  day                   ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  room                  VARCHAR(30) NOT NULL,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ts_sa FOREIGN KEY (subject_assignment_id)
    REFERENCES subject_assignments(id) ON DELETE CASCADE,
  INDEX idx_ts_room_day (room, day),
  INDEX idx_ts_sa (subject_assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS teacher_location_overrides (
  erp_id     VARCHAR(50) PRIMARY KEY,
  room       VARCHAR(30) NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_tlo_user FOREIGN KEY (erp_id) REFERENCES users(erp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proxy_assignments (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  original_teacher_erp   VARCHAR(50) NOT NULL,
  proxy_teacher_erp      VARCHAR(50) NOT NULL,
  slot_id                INT UNSIGNED NOT NULL,
  date                   DATE NOT NULL,
  created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proxy (slot_id, date),
  CONSTRAINT fk_pa_orig  FOREIGN KEY (original_teacher_erp) REFERENCES users(erp_id),
  CONSTRAINT fk_pa_proxy FOREIGN KEY (proxy_teacher_erp) REFERENCES users(erp_id),
  CONSTRAINT fk_pa_slot  FOREIGN KEY (slot_id) REFERENCES timetable_slots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO _migrations (filename) VALUES ('003_timetable.sql');

-- ============================================================================
-- 004 — Attendance
-- ============================================================================

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

INSERT IGNORE INTO _migrations (filename) VALUES ('004_attendance.sql');

-- ============================================================================
-- 005 — Marks
-- ============================================================================

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

INSERT IGNORE INTO _migrations (filename) VALUES ('005_marks.sql');

-- ============================================================================
-- 006 — Grievances and OD requests
-- ============================================================================

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

INSERT IGNORE INTO _migrations (filename) VALUES ('006_grievances_od.sql');

-- ============================================================================
-- 007 — AICTE points and mentorship records
-- ============================================================================

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

INSERT IGNORE INTO _migrations (filename) VALUES ('007_aicte_mentorship.sql');

-- ============================================================================
-- 008 — Thresholds, risk events, materials, email logs, notifications
-- ============================================================================

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

INSERT IGNORE INTO _migrations (filename) VALUES ('008_thresholds_risk_materials.sql');

-- ============================================================================
-- 009 — Seed dummy accounts (password: Password@123)
-- ============================================================================

INSERT IGNORE INTO departments (id, code, name) VALUES (1, 'COMPS', 'Computer Science');

INSERT IGNORE INTO divisions (id, dept_id, year, label) VALUES (1, 1, 2, 'A');

SET @pw = '$2b$12$o1dqWRdXzpcTf476vU8GDeGTPzYAC7UP9PQiAQQl0V64sStZYQvzK';

-- Default global thresholds (set_by 'E1001' = Admin — inserted below)
-- We'll insert thresholds after the admin user exists

-- Employees
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1001', 'Admin User', 'admin@tcetmumbai.in', '9000000001', 1, 'EMPLOYEE', @pw, 0);

INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1002', 'HOD User', 'hod@tcetmumbai.in', '9000000002', 1, 'EMPLOYEE', @pw, 0);

INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1003', 'Subject Teacher', 'subject@tcetmumbai.in', '9000000003', 1, 'EMPLOYEE', @pw, 0);

INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1004', 'Class Incharge', 'class@tcetmumbai.in', '9000000004', 1, 'EMPLOYEE', @pw, 0);

INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1005', 'TG Mentor', 'tg@tcetmumbai.in', '9000000005', 1, 'EMPLOYEE', @pw, 0);

INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1006', 'Practical Teacher', 'practical@tcetmumbai.in', '9000000006', 1, 'EMPLOYEE', @pw, 0);

-- Student (UID: 2025-COMPSA01-2029 = COMPS dept, Division A, Roll 01, SY in 2026)
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('2025-COMPSA01-2029', 'Student User', 'student@tcetmumbai.in', '9000000007', 1, 'STUDENT', @pw, 0);

-- Employee roles
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1001', 'ADMIN', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1002', 'HOD', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1003', 'SUBJECT_TEACHER', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1004', 'CLASS_INCHARGE', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1005', 'TEACHER_GUARDIAN', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1006', 'PRACTICAL_TEACHER', 1);

-- Student details
INSERT IGNORE INTO student_details (erp_id, division_id, roll_no, parent_phone)
VALUES ('2025-COMPSA01-2029', 1, '01', '9000000008');

-- Default global thresholds
INSERT IGNORE INTO admin_thresholds (type, value, dept_id, set_by)
VALUES
  ('ATTENDANCE', 75.00, NULL, 'E1001'),
  ('PASSING_MARKS', 40.00, NULL, 'E1001');

INSERT IGNORE INTO _migrations (filename) VALUES ('009_seed_accounts.sql');

-- Mark migrations 010-018 as already applied (schema already reflects their changes above)
INSERT IGNORE INTO _migrations (filename) VALUES ('010_fix_tg_students.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('011_semester_alumni.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('012_thresholds_multi_incharge.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('013_semester_schedule.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('014_practical_experiments.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('015_syllabus_lesson_plan.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('016_class_incharge_multi_achievements_notifications.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('017_subject_hours_semester_dates_uid.sql');
INSERT IGNORE INTO _migrations (filename) VALUES ('018_fix_out_of_range_semesters.sql');

-- ============================================================================
-- Done! All 23 tables created + seed data loaded.
-- ============================================================================
SELECT 'CloudCampus database setup complete!' AS status;
