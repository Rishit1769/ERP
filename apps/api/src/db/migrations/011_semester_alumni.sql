-- Migration 011: Add semester to student_details and is_alumni flag to users

-- Semester: 1-8. Odd = first half of academic year, even = second half.
-- FY -> 1/2, SY -> 3/4, TY -> 5/6, LY -> 7/8
ALTER TABLE student_details
  ADD COLUMN semester TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER roll_no;

-- Backfill: set all existing students to the odd semester for their year
UPDATE student_details sd
JOIN divisions d ON sd.division_id = d.id
SET sd.semester = d.year * 2 - 1;

-- Alumni flag: 1 = graduated, is_active also set to 0 at graduation
ALTER TABLE users
  ADD COLUMN is_alumni TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
