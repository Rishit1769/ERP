import cron from "node-cron";
import pool from "../db/pool";
import type { RowDataPacket } from "mysql2";

/**
 * Runs daily at 11:59 PM.
 * For every timetable slot that occurred today, checks if the assigned teacher
 * marked attendance. If not, inserts a notification record for them.
 */
export function scheduleMissedAttendanceNotifications(): void {
  cron.schedule("59 23 * * *", async () => {
    console.log("[CRON] Missed attendance notification job started");
    try {
      await checkMissedAttendanceForDate(new Date());
    } catch (err) {
      console.error("[CRON] Missed attendance job error:", err);
    }
  });
}

export async function checkMissedAttendanceForDate(date: Date): Promise<void> {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = dayNames[date.getDay()];
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

  // Find all timetable slots for today that do NOT have any attendance record
  const [slots] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT ts.teacher_erp_id, ts.subject_code, ts.division_id,
            ts.start_time, ts.end_time, ts.type,
            u.name AS teacher_name,
            sub.name AS subject_name,
            div.year, div.division
     FROM timetable_slots ts
     JOIN users u ON u.erp_id = ts.teacher_erp_id
     JOIN subjects sub ON sub.code = ts.subject_code
     JOIN divisions div ON div.id = ts.division_id
     WHERE ts.day_of_week = ?
       AND (ts.valid_from IS NULL OR ts.valid_from <= ?)
       AND (ts.valid_to IS NULL OR ts.valid_to >= ?)
       AND NOT EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.teacher_erp_id = ts.teacher_erp_id
           AND a.division_id = ts.division_id
           AND a.subject_code = ts.subject_code
           AND DATE(a.marked_at) = ?
       )`,
    [dayOfWeek, dateStr, dateStr, dateStr]
  );

  for (const slot of slots) {
    // Avoid duplicate notifications for the same slot+date
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM notifications
       WHERE erp_id = ? AND type = 'MISSED_ATTENDANCE'
         AND JSON_EXTRACT(body, '$.date') = ?
         AND JSON_EXTRACT(body, '$.subject_code') = ?
         AND JSON_EXTRACT(body, '$.division_id') = ?
       LIMIT 1`,
      [slot.teacher_erp_id, dateStr, slot.subject_code, slot.division_id]
    );
    if (existing.length > 0) continue;

    const bodyObj = JSON.stringify({
      date: dateStr,
      subject_code: slot.subject_code,
      division_id: slot.division_id,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });

    const divLabel = `Year ${slot.year} Div ${slot.division}`;
    const timeLabel = `${slot.start_time}–${slot.end_time}`;

    await pool.execute(
      `INSERT INTO notifications (erp_id, type, title, body, link)
       VALUES (?, 'MISSED_ATTENDANCE', ?, ?, ?)`,
      [
        slot.teacher_erp_id,
        `Attendance not marked: ${slot.subject_name || slot.subject_code} (${divLabel})`,
        bodyObj,
        `/dashboard/teacher/attendance`,
      ]
    );
  }

  console.log(`[CRON] Missed attendance: checked ${slots.length} slots for ${dateStr}`);
}
