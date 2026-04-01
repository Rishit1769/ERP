-- Migration 003: Timetable and teacher location

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
  -- Prevent same room being double-booked at overlapping times
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
