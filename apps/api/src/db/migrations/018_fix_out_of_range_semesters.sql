-- Migration 018: Fix any student_details rows where semester is outside the valid
-- 1–8 range by resetting them to the expected odd semester for their division year.
-- Each academic year has a valid range: FY=1/2, SY=3/4, TY=5/6, LY=7/8.

UPDATE student_details sd
JOIN divisions dv ON sd.division_id = dv.id
SET sd.semester = (dv.year * 2 - 1)
WHERE sd.semester < 1 OR sd.semester > 8;
