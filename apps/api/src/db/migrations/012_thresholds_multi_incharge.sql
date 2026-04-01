-- Migration 012: Redesign admin_thresholds with key_name+description,
--                allow multiple class incharges per division

-- 1. Extend admin_thresholds to use a free-form key_name + description
--    instead of the narrow ENUM type column.
ALTER TABLE admin_thresholds
  ADD COLUMN key_name    VARCHAR(80)  NULL AFTER id,
  ADD COLUMN description VARCHAR(255) NULL AFTER key_name;

-- 2. Copy existing ENUM values into key_name
UPDATE admin_thresholds SET key_name = LOWER(type);

-- 3. Seed the full set of thresholds (INSERT IGNORE skips if key_name already exists)
--    We need a unique constraint on key_name first
ALTER TABLE admin_thresholds ADD UNIQUE KEY uq_threshold_key (key_name);

INSERT IGNORE INTO admin_thresholds (key_name, description, value, dept_id, set_by)
VALUES
  ('min_attendance_pct',  'Minimum Attendance (%)',                  75.00, NULL, 'SYSTEM'),
  ('min_midterm1_marks',  'Minimum Marks in Mid Term 1',             40.00, NULL, 'SYSTEM'),
  ('min_midterm2_marks',  'Minimum Marks in Mid Term 2',             40.00, NULL, 'SYSTEM'),
  ('min_midterm3_marks',  'Minimum Marks in Mid Term 3',             40.00, NULL, 'SYSTEM'),
  ('min_midterm_avg',     'Minimum Average of Mid Terms 1, 2 and 3', 40.00, NULL, 'SYSTEM'),
  ('min_endsem_marks',    'Minimum Marks in End Semester Exam',      40.00, NULL, 'SYSTEM');

-- 4. Allow multiple class incharges per division
--    (current PK is `division_id` alone; change to composite)
ALTER TABLE class_incharge
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (teacher_erp_id, division_id);
