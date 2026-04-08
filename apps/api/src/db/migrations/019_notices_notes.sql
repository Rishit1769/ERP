-- Migration 019: Notices and Notes tables

CREATE TABLE IF NOT EXISTS notices (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uploader_erp_id  VARCHAR(50) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  body             TEXT NULL,
  minio_path       VARCHAR(500) NOT NULL,
  dept_id          INT UNSIGNED NULL COMMENT 'NULL = institution-wide notice',
  uploaded_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notices_uploader FOREIGN KEY (uploader_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_notices_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_notices_dept (dept_id),
  INDEX idx_notices_uploaded (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uploader_erp_id  VARCHAR(50) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  division_id      INT UNSIGNED NULL COMMENT 'NULL = dept-wide',
  dept_id          INT UNSIGNED NULL,
  minio_path       VARCHAR(500) NOT NULL,
  uploaded_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_uploader FOREIGN KEY (uploader_erp_id) REFERENCES users(erp_id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_division FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL,
  CONSTRAINT fk_notes_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_notes_division (division_id),
  INDEX idx_notes_dept (dept_id),
  INDEX idx_notes_uploaded (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
