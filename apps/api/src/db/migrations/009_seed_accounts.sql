-- Migration 009: Seed dummy accounts for testing
-- All passwords: Password@123 (bcrypt hash below)
-- Only @tcetmumbai.in emails are permitted

-- Insert COMPS department for seed users
INSERT IGNORE INTO departments (id, code, name) VALUES (1, 'COMPS', 'Computer Science');

-- Insert a division for the student
INSERT IGNORE INTO divisions (id, dept_id, year, label) VALUES (1, 1, 2, 'A');

-- password hash for "Password@123"
SET @pw = '$2b$12$o1dqWRdXzpcTf476vU8GDeGTPzYAC7UP9PQiAQQl0V64sStZYQvzK';

-- Admin employee
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1001', 'Admin User', 'admin@tcetmumbai.in', '9000000001', 1, 'EMPLOYEE', @pw, 0);

-- HOD employee
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1002', 'HOD User', 'hod@tcetmumbai.in', '9000000002', 1, 'EMPLOYEE', @pw, 0);

-- Subject Teacher employee
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1003', 'Subject Teacher', 'subject@tcetmumbai.in', '9000000003', 1, 'EMPLOYEE', @pw, 0);

-- Class In-Charge employee
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1004', 'Class Incharge', 'class@tcetmumbai.in', '9000000004', 1, 'EMPLOYEE', @pw, 0);

-- Teacher Guardian employee
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1005', 'TG Mentor', 'tg@tcetmumbai.in', '9000000005', 1, 'EMPLOYEE', @pw, 0);

-- Practical Teacher employee
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('E1006', 'Practical Teacher', 'practical@tcetmumbai.in', '9000000006', 1, 'EMPLOYEE', @pw, 0);

-- Student (UID format: startYear-DeptDivRoll-endYear)
-- 2025-COMPSA01-2029 = started 2025, COMPS dept, Division A, Roll 01, ends 2029
-- In 2026: academicYear = min(max(2026-2025+1, 1), 2029-2025) = min(2, 4) = 2 (SY) → division year=2
INSERT IGNORE INTO users (erp_id, name, email, phone, dept_id, base_role, password_hash, must_change_password)
VALUES ('2025-COMPSA01-2029', 'Student User', 'student@tcetmumbai.in', '9000000007', 1, 'STUDENT', @pw, 0);

-- Assign employee roles
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1001', 'ADMIN', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1002', 'HOD', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1003', 'SUBJECT_TEACHER', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1004', 'CLASS_INCHARGE', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1005', 'TEACHER_GUARDIAN', 1);
INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES ('E1006', 'PRACTICAL_TEACHER', 1);

-- Student details (mapped from UID: division A, roll 01)
INSERT IGNORE INTO student_details (erp_id, division_id, roll_no, parent_phone)
VALUES ('2025-COMPSA01-2029', 1, '01', '9000000008');
