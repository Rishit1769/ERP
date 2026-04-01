import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireStudent, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { OdRequestSchema, ReviewDecisionSchema } from "@cloudcampus/shared";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// ─── POST /grievances/attendance ──────────────────────────────────────────────
// Student disputes an attendance record
router.post(
  "/attendance",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const { attendance_id, reason, evidence_minio_path } = req.body as {
      attendance_id: number;
      reason: string;
      evidence_minio_path?: string;
    };

    if (!attendance_id || !reason || reason.length < 10) {
      res.status(400).json({ error: "attendance_id and reason (min 10 chars) required" });
      return;
    }

    // Verify attendance belongs to the student
    const [att] = await pool.execute<RowDataPacket[]>(
      "SELECT id, status FROM attendance WHERE id = ? AND student_erp_id = ?",
      [attendance_id, req.user.erp_id]
    );
    if (att.length === 0) {
      res.status(404).json({ error: "Attendance record not found" });
      return;
    }

    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO grievances (student_erp_id, attendance_id, reason, evidence_minio_path, status)
         VALUES (?, ?, ?, ?, 'PENDING')`,
        [req.user.erp_id, attendance_id, reason, evidence_minio_path || null]
      );

      // Mark attendance as DISPUTED
      await pool.execute(
        "UPDATE attendance SET status = 'DISPUTED' WHERE id = ?",
        [attendance_id]
      );

      res.status(201).json({ id: result.insertId, message: "Grievance submitted" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "Grievance already filed for this attendance record" });
        return;
      }
      throw err;
    }
  }
);

// ─── GET /grievances/my ───────────────────────────────────────────────────────
router.get(
  "/my",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT g.id, g.attendance_id, a.date, s.name AS subject_name,
              g.reason, g.status, g.reviewer_note, g.created_at
       FROM grievances g
       INNER JOIN attendance a ON g.attendance_id = a.id
       INNER JOIN subject_assignments sa ON a.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       WHERE g.student_erp_id = ?
       ORDER BY g.created_at DESC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── GET /grievances/pending ──────────────────────────────────────────────────
// TG reviews grievances for their students
router.get(
  "/pending",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT g.id, g.student_erp_id, u.name AS student_name,
              g.attendance_id, a.date, s.name AS subject_name,
              g.reason, g.evidence_minio_path, g.status, g.created_at
       FROM grievances g
       INNER JOIN tg_students ts ON g.student_erp_id = ts.student_erp_id
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       INNER JOIN attendance a ON g.attendance_id = a.id
       INNER JOIN subject_assignments sa ON a.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN users u ON g.student_erp_id = u.erp_id
       WHERE tg.tg_erp_id = ? AND g.status IN ('PENDING','CLARIFICATION')
       ORDER BY g.created_at ASC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── POST /grievances/:id/review ──────────────────────────────────────────────
router.post(
  "/:id/review",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  validate(ReviewDecisionSchema),
  async (req: Request, res: Response) => {
    const { decision, note } = req.body as ReviewDecisionSchema;
    const grievanceId = Number(req.params.id);

    // Verify ownership via TG
    const [gRows] = await pool.execute<RowDataPacket[]>(
      `SELECT g.id, g.attendance_id, g.student_erp_id
       FROM grievances g
       INNER JOIN tg_students ts ON g.student_erp_id = ts.student_erp_id
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       WHERE g.id = ? AND tg.tg_erp_id = ?`,
      [grievanceId, req.user.erp_id]
    );
    if (gRows.length === 0) {
      res.status(404).json({ error: "Grievance not found or not your student" });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE grievances SET status = ?, reviewer_erp_id = ?, reviewer_note = ? WHERE id = ?",
        [decision, req.user.erp_id, note || null, grievanceId]
      );

      if (decision === "APPROVED") {
        // Override attendance from current status → PRESENT
        const attId = gRows[0].attendance_id;
        const [attRow] = await conn.execute<RowDataPacket[]>(
          "SELECT status FROM attendance WHERE id = ?",
          [attId]
        );
        const oldStatus = attRow[0]?.status || "DISPUTED";

        await conn.execute(
          "UPDATE attendance SET status = 'PRESENT' WHERE id = ?",
          [attId]
        );

        await conn.execute(
          `INSERT INTO attendance_overrides (attendance_id, changed_by, old_status, new_status, reason)
           VALUES (?, ?, ?, 'PRESENT', ?)`,
          [attId, req.user.erp_id, oldStatus, `Grievance #${grievanceId} approved`]
        );
      }

      await conn.commit();
      res.json({ message: `Grievance ${decision.toLowerCase()}` });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// OD Requests
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /grievances/od ──────────────────────────────────────────────────────
router.post(
  "/od",
  authenticate,
  requireFullScope,
  requireStudent,
  validate(OdRequestSchema),
  async (req: Request, res: Response) => {
    const { dates, reason } = req.body as OdRequestSchema;
    const evidence = req.body.evidence_minio_path as string | undefined;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO od_requests (student_erp_id, dates, reason, evidence_minio_path, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [req.user.erp_id, JSON.stringify(dates), reason, evidence || null]
    );

    res.status(201).json({ id: result.insertId, message: "OD request submitted" });
  }
);

// ─── GET /grievances/od/my ────────────────────────────────────────────────────
router.get(
  "/od/my",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, dates, reason, status, review_note, created_at
       FROM od_requests WHERE student_erp_id = ? ORDER BY created_at DESC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── GET /grievances/od/pending ───────────────────────────────────────────────
router.get(
  "/od/pending",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT od.id, od.student_erp_id, u.name AS student_name,
              od.dates, od.reason, od.evidence_minio_path, od.status, od.created_at
       FROM od_requests od
       INNER JOIN tg_students ts ON od.student_erp_id = ts.student_erp_id
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       INNER JOIN users u ON od.student_erp_id = u.erp_id
       WHERE tg.tg_erp_id = ? AND od.status IN ('PENDING','CLARIFICATION')
       ORDER BY od.created_at ASC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── POST /grievances/od/:id/review ───────────────────────────────────────────
router.post(
  "/od/:id/review",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  validate(ReviewDecisionSchema),
  async (req: Request, res: Response) => {
    const { decision, note } = req.body as ReviewDecisionSchema;
    const odId = Number(req.params.id);

    const [odRows] = await pool.execute<RowDataPacket[]>(
      `SELECT od.id, od.student_erp_id, od.dates
       FROM od_requests od
       INNER JOIN tg_students ts ON od.student_erp_id = ts.student_erp_id
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       WHERE od.id = ? AND tg.tg_erp_id = ?`,
      [odId, req.user.erp_id]
    );
    if (odRows.length === 0) {
      res.status(404).json({ error: "OD request not found or not your student" });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE od_requests SET status = ?, reviewed_by = ?, review_note = ? WHERE id = ?",
        [decision, req.user.erp_id, note || null, odId]
      );

      if (decision === "APPROVED") {
        const dates: string[] = JSON.parse(odRows[0].dates);
        const studentErp = odRows[0].student_erp_id;

        // Update all matching attendance rows ABSENT → OD
        for (const date of dates) {
          const [attRows] = await conn.execute<RowDataPacket[]>(
            "SELECT id, status FROM attendance WHERE student_erp_id = ? AND date = ? AND status = 'ABSENT'",
            [studentErp, date]
          );
          for (const att of attRows) {
            await conn.execute(
              "UPDATE attendance SET status = 'OD' WHERE id = ?",
              [att.id]
            );
            await conn.execute(
              `INSERT INTO attendance_overrides (attendance_id, changed_by, old_status, new_status, reason)
               VALUES (?, ?, 'ABSENT', 'OD', ?)`,
              [att.id, req.user.erp_id, `OD Request #${odId} approved`]
            );
          }
        }

        // Recalculate risk for this student
        const { evaluateAttendanceRisk } = await import("../lib/riskEngine");
        setImmediate(async () => {
          await evaluateAttendanceRisk(studentErp);
        });
      }

      await conn.commit();
      res.json({ message: `OD request ${decision.toLowerCase()}` });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

export default router;
