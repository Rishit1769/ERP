import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import type { RowDataPacket } from "mysql2";

const router = Router();

// ─── POST /proxy/mark-absent ──────────────────────────────────────────────────
// Teacher marks self absent for today → system auto-assigns proxies
router.post(
  "/mark-absent",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const today = new Date().toISOString().split("T")[0];
    const dayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date().getDay()];

    // Find all slots for this teacher today
    const [slots] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.id AS slot_id, ts.start_time, ts.end_time, ts.room,
              sa.id AS sa_id, sa.subject_id, sa.division_id,
              s.name AS subject_name, d.label AS division
       FROM timetable_slots ts
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN divisions d ON sa.division_id = d.id
       WHERE sa.teacher_erp_id = ? AND ts.day = ?`,
      [req.user.erp_id, dayName]
    );

    if (slots.length === 0) {
      res.json({ message: "No slots today to reassign", proxies: [] });
      return;
    }

    const proxies: Array<{
      slot_id: number;
      subject: string;
      division: string;
      proxy_teacher: string | null;
      proxy_name: string | null;
    }> = [];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const slot of slots) {
        // Check if proxy already assigned
        const [existingProxy] = await conn.execute<RowDataPacket[]>(
          "SELECT id FROM proxy_assignments WHERE slot_id = ? AND date = ?",
          [slot.slot_id, today]
        );
        if (existingProxy.length > 0) continue;

        // Find a free teacher in the same dept with no time conflict
        const [candidates] = await conn.execute<RowDataPacket[]>(
          `SELECT u.erp_id, u.name
           FROM users u
           INNER JOIN employee_roles er ON u.erp_id = er.erp_id
           WHERE u.dept_id = ? AND u.base_role = 'EMPLOYEE'
             AND u.erp_id != ? AND u.is_active = 1
             AND er.role_type IN ('SUBJECT_TEACHER','PRACTICAL_TEACHER')
             -- No conflicting slot at this time
             AND u.erp_id NOT IN (
               SELECT sa2.teacher_erp_id
               FROM timetable_slots ts2
               INNER JOIN subject_assignments sa2 ON ts2.subject_assignment_id = sa2.id
               WHERE ts2.day = ?
                 AND ts2.start_time < ? AND ts2.end_time > ?
             )
             -- Not already assigned as proxy at this time
             AND u.erp_id NOT IN (
               SELECT pa.proxy_teacher_erp
               FROM proxy_assignments pa
               INNER JOIN timetable_slots ts3 ON pa.slot_id = ts3.id
               WHERE pa.date = ?
                 AND ts3.start_time < ? AND ts3.end_time > ?
             )
           LIMIT 1`,
          [
            req.user.dept_id,
            req.user.erp_id,
            dayName,
            slot.end_time,
            slot.start_time,
            today,
            slot.end_time,
            slot.start_time,
          ]
        );

        if (candidates.length > 0) {
          const proxy = candidates[0];
          await conn.execute(
            `INSERT INTO proxy_assignments (original_teacher_erp, proxy_teacher_erp, slot_id, date)
             VALUES (?, ?, ?, ?)`,
            [req.user.erp_id, proxy.erp_id, slot.slot_id, today]
          );

          // Notify proxy teacher
          await conn.execute(
            `INSERT INTO notifications (erp_id, title, body)
             VALUES (?, ?, ?)`,
            [
              proxy.erp_id,
              "Proxy Assignment",
              `You have been assigned as proxy for ${slot.subject_name} (${slot.division}) at ${slot.start_time}-${slot.end_time} in room ${slot.room}.`,
            ]
          );

          proxies.push({
            slot_id: slot.slot_id,
            subject: slot.subject_name,
            division: slot.division,
            proxy_teacher: proxy.erp_id,
            proxy_name: proxy.name,
          });
        } else {
          proxies.push({
            slot_id: slot.slot_id,
            subject: slot.subject_name,
            division: slot.division,
            proxy_teacher: null,
            proxy_name: null,
          });
        }
      }

      // Notify HOD
      const [hodRows] = await pool.execute<RowDataPacket[]>(
        "SELECT erp_id FROM employee_roles WHERE dept_id = ? AND role_type = 'HOD'",
        [req.user.dept_id]
      );
      for (const hod of hodRows) {
        await conn.execute(
          `INSERT INTO notifications (erp_id, title, body) VALUES (?, ?, ?)`,
          [
            hod.erp_id,
            "Teacher Absent",
            `${req.user.erp_id} marked absent for today. ${proxies.filter((p) => p.proxy_teacher).length}/${slots.length} slots covered by proxy.`,
          ]
        );
      }

      await conn.commit();
      res.json({
        message: "Absence recorded, proxies assigned",
        proxies,
        unassigned: proxies.filter((p) => !p.proxy_teacher).length,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ─── GET /proxy/my-proxy-slots ────────────────────────────────────────────────
// Teacher views slots they have been assigned as proxy for today
router.get(
  "/my-proxy-slots",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const today = new Date().toISOString().split("T")[0];

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT pa.id, ts.start_time, ts.end_time, ts.room,
              s.name AS subject_name, d.label AS division,
              u.name AS original_teacher
       FROM proxy_assignments pa
       INNER JOIN timetable_slots ts ON pa.slot_id = ts.id
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN divisions d ON sa.division_id = d.id
       INNER JOIN users u ON pa.original_teacher_erp = u.erp_id
       WHERE pa.proxy_teacher_erp = ? AND pa.date = ?
       ORDER BY ts.start_time`,
      [req.user.erp_id, today]
    );

    res.json(rows);
  }
);

export default router;
