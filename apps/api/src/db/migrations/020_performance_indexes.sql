-- Migration 020: Add performance indexes for commonly filtered columns

-- Index for queries that filter active/alumni students (semester-status, advance-year, etc.)
ALTER TABLE users
  ADD INDEX idx_users_active_alumni (is_active, is_alumni),
  ADD INDEX idx_users_base_role (base_role);
