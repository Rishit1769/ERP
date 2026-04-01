CREATE TABLE IF NOT EXISTS semester_schedule (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_date DATE NOT NULL,
  event_type ENUM('HOLIDAY','EXAM','EVENT','EXTRA_CLASS','OTHER') NOT NULL DEFAULT 'OTHER',
  title VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  dept_id INT UNSIGNED NULL COMMENT 'NULL means institute-wide',
  created_by VARCHAR(50) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ss_date (event_date),
  CONSTRAINT fk_ss_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE
)
