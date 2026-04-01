import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole, requireStudent } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { MarkAttendanceSchema } from "@cloudcampus/shared";
import { evaluateAttendanceRisk } from "../lib/riskEngine";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// ─── POST /attendance/mark ────────────────────────────────────────────────────
// Subject teacher marks attendance for a class (idempotent via idempotency_key)
router.post(
  "/mark",
  authenticate,
  requireFullScope,
  requireRole("SUBJECT_TEACHER", "PRACTICAL_TEACHER"),
  validate(MarkAttendanceSchema),
  async (req: Request, res: Response) => {
    const { slot_id, date, records, idempotency_key } = req.body as MarkAttendanceSchema;

    // Verify teacher owns the assignment behind this slot
    const [slotRows] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.id, sa.id AS sa_id, sa.teacher_erp_id, sa.subject_id
       FROM timetable_slots ts
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       WHERE ts.id = ?`,
      [slot_id]
    );

    if (slotRows.length === 0) {
      res.status(404).json({ error: "Slot not found" });
      return;
    }

    const slot = slotRows[0];

    // Check if proxy was assigned for this slot+date
    const [proxyRows] = await pool.execute<RowDataPacket[]>(
      "SELECT proxy_teacher_erp FROM proxy_assignments WHERE slot_id = ? AND date = ?",
      [slot_id, date]
    );

    const allowedTeacher = proxyRows.length > 0
      ? proxyRows[0].proxy_teacher_erp
      : slot.teacher_erp_id;

    if (req.user.erp_id !== allowedTeacher) {
      res.status(403).json({ error: "You are not assigned to this slot" });
      return;
    }

    // Idempotency check: if this key was already used, return success
    const [existingKey] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM attendance WHERE idempotency_key = ? LIMIT 1",
      [idempotency_key]
    );

    if (existingKey.length > 0) {
      res.json({ message: "Attendance already recorded (idempotent)", duplicate: true });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const record of records) {
        await conn.execute(
          `INSERT INTO attendance (student_erp_id, subject_assignment_id, date, status, marked_by, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
          [record.student_erp_id, slot.sa_id, date, record.status, req.user.erp_id, idempotency_key]
        );
      }

      await conn.commit();

      // Evaluate risk for each student asynchronously (non-blocking)
      setImmediate(async () => {
        for (const record of records) {
          await evaluateAttendanceRisk(record.student_erp_id, slot.subject_id as number);
        }
      });

      res.json({ message: "Attendance recorded", count: records.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ─── GET /attendance/class/:assignmentId/:date ────────────────────────────────
// Subject teacher views attendance for a specific class on a date
router.get(
  "/class/:assignmentId/:date",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.student_erp_id, u.name, sd.roll_no, a.status, a.created_at
       FROM attendance a
       INNER JOIN users u ON a.student_erp_id = u.erp_id
       INNER JOIN student_details sd ON a.student_erp_id = sd.erp_id
       WHERE a.subject_assignment_id = ? AND a.date = ?
       ORDER BY sd.roll_no`,
      [req.params.assignmentId, req.params.date]
    );
    res.json(rows);
  }
);

// ─── GET /attendance/student/calendar ─────────────────────────────────────────
// Student views their own attendance calendar
router.get(
  "/student/calendar",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const { month, year } = req.query as { month?: string; year?: string };
    const m = month || String(new Date().getMonth() + 1).padStart(2, "0");
    const y = year || String(new Date().getFullYear());

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.date, a.status, s.code AS subject_code, s.name AS subject_name
       FROM attendance a
       INNER JOIN subject_assignments sa ON a.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       WHERE a.student_erp_id = ?
         AND YEAR(a.date) = ? AND MONTH(a.date) = ?
       ORDER BY a.date, s.code`,
      [req.user.erp_id, y, m]
    );
    res.json(rows);
  }
);

// ─── GET /attendance/student/summary ──────────────────────────────────────────
// Student views subject-wise attendance summary
router.get(
  "/student/summary",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.code AS subject_code, s.name AS subject_name,
              COUNT(*) AS total,
              SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) AS present,
              ROUND(SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS percentage
       FROM attendance a
       INNER JOIN subject_assignments sa ON a.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       WHERE a.student_erp_id = ?
       GROUP BY s.id
       ORDER BY s.name`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── GET /attendance/division-matrix/:divisionId ──────────────────────────────
// Class incharge: cross-subject attendance matrix for a division
router.get(
  "/division-matrix/:divisionId",
  authenticate,
  requireFullScope,
  requireRole("CLASS_INCHARGE", "HOD"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT sd.erp_id, u.name, sd.roll_no,
              s.code AS subject_code, s.name AS subject_name,
              COUNT(a.id) AS total,
              SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) AS present,
              ROUND(SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) * 100.0 / COUNT(a.id), 2) AS percentage
       FROM student_details sd
       INNER JOIN users u ON sd.erp_id = u.erp_id
       INNER JOIN attendance a ON sd.erp_id = a.student_erp_id
       INNER JOIN subject_assignments sa ON a.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       WHERE sd.division_id = ?
       GROUP BY sd.erp_id, s.id
       ORDER BY sd.roll_no, s.name`,
      [req.params.divisionId]
    );
    res.json(rows);
  }
);

// ─── GET /attendance/low-attendance/:divisionId ───────────────────────────────
// Class incharge: students below threshold
router.get(
  "/low-attendance/:divisionId",
  authenticate,
  requireFullScope,
  requireRole("CLASS_INCHARGE", "HOD", "TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    // Get threshold
    const [thRows] = await pool.execute<RowDataPacket[]>(
      `SELECT value FROM admin_thresholds
       WHERE type = 'ATTENDANCE' AND (dept_id = ? OR dept_id IS NULL)
       ORDER BY dept_id DESC LIMIT 1`,
      [req.user.dept_id]
    );
    const threshold = thRows.length > 0 ? Number(thRows[0].value) : 75;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT sd.erp_id, u.name, sd.roll_no, u.phone, sd.parent_phone,
              COUNT(a.id) AS total,
              SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) AS present,
              ROUND(SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) * 100.0 / COUNT(a.id), 2) AS percentage,
              tg_u.name AS tg_name
       FROM student_details sd
       INNER JOIN users u ON sd.erp_id = u.erp_id
       INNER JOIN attendance a ON sd.erp_id = a.student_erp_id
       LEFT JOIN tg_students ts ON sd.erp_id = ts.student_erp_id
       LEFT JOIN tg_groups tg ON ts.tg_group_id = tg.id
       LEFT JOIN users tg_u ON tg.tg_erp_id = tg_u.erp_id
       WHERE sd.division_id = ?
       GROUP BY sd.erp_id
       HAVING percentage < ?
       ORDER BY percentage ASC`,
      [req.params.divisionId, threshold]
    );

    res.json({ threshold, students: rows });
  }
);

// ─── GET /attendance/tg-students ──────────────────────────────────────────────
// TG sees their assigned students with contact details
router.get(
  "/tg-students",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.erp_id, u.name, u.phone, sd.roll_no, sd.parent_phone,
              d.year, d.label AS division,
              COUNT(a.id) AS total_classes,
              SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) AS present,
              ROUND(SUM(CASE WHEN a.status IN ('PRESENT','OD') THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.id),0), 2) AS percentage
       FROM tg_groups tg
       INNER JOIN tg_students ts ON tg.id = ts.tg_group_id
       INNER JOIN users u ON ts.student_erp_id = u.erp_id
       INNER JOIN student_details sd ON u.erp_id = sd.erp_id
       INNER JOIN divisions d ON sd.division_id = d.id
       LEFT JOIN attendance a ON u.erp_id = a.student_erp_id
       WHERE tg.tg_erp_id = ?
       GROUP BY u.erp_id
       ORDER BY sd.roll_no`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── GET /attendance/my-assignments ──────────────────────────────────────────
// Teacher gets list of their subject assignments (used by attendance + materials pages)
router.get(
  "/my-assignments",
  authenticate,
  requireFullScope,
  requireRole("SUBJECT_TEACHER", "PRACTICAL_TEACHER", "HOD", "CLASS_INCHARGE"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT sa.id, s.name AS subject_name,
              CONCAT('Y', d.year, '-', d.label) AS division_name,
              d.year, d.label AS division_label,
              sa.type, sa.batch_label
       FROM subject_assignments sa
       JOIN subjects s ON sa.subject_id = s.id
       JOIN divisions d ON sa.division_id = d.id
       WHERE sa.teacher_erp_id = ?
       ORDER BY s.name, d.year, d.label`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

export default router;
