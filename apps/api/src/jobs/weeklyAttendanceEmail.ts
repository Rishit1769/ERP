import cron from "node-cron";
import pool from "../db/pool";
import { sendMail } from "../lib/mailer";
import type { RowDataPacket } from "mysql2";

/**
 * Weekly cron job — runs every Monday at 8:00 AM.
 * Finds students below the attendance threshold and sends alert emails.
 * Uses email_logs to prevent duplicate sends within the same week.
 */
export function scheduleWeeklyAttendanceEmail(): void {
  cron.schedule("0 8 * * 1", async () => {
    console.log("[CRON] Weekly attendance email job started");

    try {
      // Get the attendance threshold
      const [thresholdRows] = await pool.execute<RowDataPacket[]>(
        "SELECT value FROM admin_thresholds WHERE key_name = 'min_attendance_pct'"
      );
      const threshold = thresholdRows[0]?.value ?? 75;

      // ISO week identifier for dedup
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
      const weekKey = weekStart.toISOString().split("T")[0];

      // Find students below threshold
      const [lowStudents] = await pool.execute<RowDataPacket[]>(`
        SELECT
          u.erp_id, u.name, u.email,
          div.year, sd.semester,
          d.name AS dept_name,
          COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) AS present_count,
          COUNT(a.id) AS total_count,
          ROUND(COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) * 100.0 / NULLIF(COUNT(a.id), 0), 1) AS attendance_pct
        FROM users u
        JOIN student_details sd ON u.erp_id = sd.erp_id
        JOIN divisions div ON sd.division_id = div.id
        JOIN departments d ON u.dept_id = d.id
        JOIN attendance a ON u.erp_id = a.student_erp_id
        WHERE u.base_role = 'STUDENT' AND u.is_active = 1 AND u.is_alumni = 0
        GROUP BY u.erp_id, u.name, u.email, div.year, sd.semester, d.name
        HAVING attendance_pct < ?
      `, [threshold]);

      let sent = 0;
      let skipped = 0;

      for (const student of lowStudents) {
        // Check if already emailed this week
        const [existing] = await pool.execute<RowDataPacket[]>(
          "SELECT id FROM email_logs WHERE student_erp_id = ? AND type = 'LOW_ATTENDANCE' AND week_start = ?",
          [student.erp_id, weekKey]
        );

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        if (!student.email) {
          skipped++;
          continue;
        }

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#dc2626;">Attendance Alert — CloudCampus</h2>
            <p>Dear <strong>${student.name}</strong>,</p>
            <p>Your current attendance is <strong style="color:#dc2626;">${student.attendance_pct}%</strong>,
               which is below the required minimum of <strong>${threshold}%</strong>.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0;">
              <tr>
                <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;"><strong>ERP ID</strong></td>
                <td style="padding:8px;border:1px solid #ddd;">${student.erp_id}</td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;"><strong>Department</strong></td>
                <td style="padding:8px;border:1px solid #ddd;">${student.dept_name}</td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;"><strong>Year / Semester</strong></td>
                <td style="padding:8px;border:1px solid #ddd;">${student.year} / ${student.semester}</td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;"><strong>Classes Attended</strong></td>
                <td style="padding:8px;border:1px solid #ddd;">${student.present_count} / ${student.total_count}</td>
              </tr>
            </table>
            <p>Please ensure regular attendance to avoid academic consequences.</p>
            <p style="color:#6b7280;font-size:12px;">This is an automated email from CloudCampus ERP.</p>
          </div>
        `;

        try {
          await sendMail(
            student.email as string,
            `Attendance Alert: Your attendance is ${student.attendance_pct}%`,
            html
          );

          await pool.execute(
            "INSERT INTO email_logs (student_erp_id, type, week_start) VALUES (?, 'LOW_ATTENDANCE', ?)",
            [student.erp_id, weekKey]
          );

          sent++;
        } catch (err) {
          console.error(`[CRON] Failed to email ${student.erp_id}:`, err);
        }
      }

      console.log(`[CRON] Attendance emails done — sent: ${sent}, skipped: ${skipped}, total below threshold: ${lowStudents.length}`);
    } catch (err) {
      console.error("[CRON] Weekly attendance email job failed:", err);
    }
  });

  console.log("[CRON] Weekly attendance email scheduled (Mon 08:00)");
}
