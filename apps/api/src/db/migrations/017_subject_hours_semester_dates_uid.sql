-- Migration 017: Subject paper_code + weekly_hours, semester dates, user UID field

-- 1. Add paper_code and weekly_hours to subjects
ALTER TABLE subjects
  ADD COLUMN paper_code  VARCHAR(30)      NULL AFTER code,
  ADD COLUMN weekly_hours TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER credits,
  ADD INDEX idx_sub_paper_code (paper_code);

-- 2. Add uid (academic enrollment number) to users
--    Students: startyear-DeptDivRoll-endYear (e.g. 2025-COMPSA01-2029)
--    Employees: 0
ALTER TABLE users
  ADD COLUMN uid VARCHAR(100) NULL AFTER erp_id;

-- 3. Backfill uid for existing students whose erp_id IS the UID format
UPDATE users
SET uid = erp_id
WHERE base_role = 'STUDENT'
  AND erp_id REGEXP '^[0-9]{4}-[A-Z]+'
  AND uid IS NULL;

-- 4. Backfill uid=0 for employees
UPDATE users
SET uid = '0'
WHERE base_role = 'EMPLOYEE' AND uid IS NULL;

-- 5. Semester dates: admin sets start/end per semester
CREATE TABLE IF NOT EXISTS semester_dates (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sem_type   ENUM('ODD','EVEN') NOT NULL,
  semester   TINYINT UNSIGNED  NOT NULL COMMENT '1-8',
  start_date DATE              NOT NULL,
  end_date   DATE              NOT NULL,
  created_by VARCHAR(50)       NOT NULL,
  updated_at DATETIME          DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sem_dates (sem_type, semester),
  CONSTRAINT fk_semdt_user FOREIGN KEY (created_by) REFERENCES users(erp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
