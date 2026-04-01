import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole, requireStudent } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AicteActivitySchema, ReviewDecisionSchema } from "@cloudcampus/shared";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// ═══ AICTE Activity Points ═══════════════════════════════════════════════════

// ─── POST /aicte/submit ───────────────────────────────────────────────────────
router.post(
  "/submit",
  authenticate,
  requireFullScope,
  requireStudent,
  validate(AicteActivitySchema),
  async (req: Request, res: Response) => {
    const { category, description, claimed_points } = req.body as AicteActivitySchema;
    const evidence = req.body.evidence_minio_path as string | undefined;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO aicte_activities
       (student_erp_id, category, description, claimed_points, evidence_minio_path, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [req.user.erp_id, category, description, claimed_points, evidence || null]
    );

    res.status(201).json({ id: result.insertId, message: "Activity submitted for review" });
  }
);

// ─── GET /aicte/my ────────────────────────────────────────────────────────────
router.get(
  "/my",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [activities] = await pool.execute<RowDataPacket[]>(
      `SELECT id, category, description, claimed_points, awarded_points,
              evidence_minio_path, status, reviewer_note, created_at
       FROM aicte_activities WHERE student_erp_id = ? ORDER BY created_at DESC`,
      [req.user.erp_id]
    );

    const [summary] = await pool.execute<RowDataPacket[]>(
      `SELECT category, SUM(awarded_points) AS total_points
       FROM aicte_activities
       WHERE student_erp_id = ? AND status = 'APPROVED'
       GROUP BY category`,
      [req.user.erp_id]
    );

    const totalAwarded = summary.reduce((sum, r) => sum + Number(r.total_points), 0);

    res.json({ activities, summary, total_awarded: totalAwarded });
  }
);

// ─── GET /aicte/pending ───────────────────────────────────────────────────────
router.get(
  "/pending",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT aa.id, aa.student_erp_id, u.name AS student_name,
              aa.category, aa.description, aa.claimed_points,
              aa.evidence_minio_path, aa.status, aa.created_at
       FROM aicte_activities aa
       INNER JOIN tg_students ts ON aa.student_erp_id = ts.student_erp_id
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       INNER JOIN users u ON aa.student_erp_id = u.erp_id
       WHERE tg.tg_erp_id = ? AND aa.status = 'PENDING'
       ORDER BY aa.created_at ASC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── POST /aicte/:id/review ──────────────────────────────────────────────────
router.post(
  "/:id/review",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const activityId = Number(req.params.id);
    const { decision, note, awarded_points } = req.body as {
      decision: "APPROVED" | "REJECTED";
      note?: string;
      awarded_points?: number;
    };

    if (!decision || !["APPROVED", "REJECTED"].includes(decision)) {
      res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
      return;
    }

    // Verify ownership via TG
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT aa.id, aa.claimed_points
       FROM aicte_activities aa
       INNER JOIN tg_students ts ON aa.student_erp_id = ts.student_erp_id
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       WHERE aa.id = ? AND tg.tg_erp_id = ?`,
      [activityId, req.user.erp_id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Activity not found or not your student" });
      return;
    }

    const points = decision === "APPROVED"
      ? (awarded_points ?? rows[0].claimed_points)
      : null;

    await pool.execute(
      `UPDATE aicte_activities
       SET status = ?, allocated_by = ?, reviewer_note = ?, awarded_points = ?
       WHERE id = ?`,
      [decision, req.user.erp_id, note || null, points, activityId]
    );

    res.json({ message: `Activity ${decision.toLowerCase()}`, awarded_points: points });
  }
);

// ═══ Mentorship Records ══════════════════════════════════════════════════════

// ─── POST /aicte/mentorship ───────────────────────────────────────────────────
router.post(
  "/mentorship",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const { student_erp_id, notes, action_plan, follow_up_date } = req.body as {
      student_erp_id: string;
      notes: string;
      action_plan?: string;
      follow_up_date?: string;
    };

    if (!student_erp_id || !notes || notes.length < 5) {
      res.status(400).json({ error: "student_erp_id and notes required" });
      return;
    }

    // Verify student is under this TG
    const [check] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.student_erp_id
       FROM tg_students ts
       INNER JOIN tg_groups tg ON ts.tg_group_id = tg.id
       WHERE tg.tg_erp_id = ? AND ts.student_erp_id = ?`,
      [req.user.erp_id, student_erp_id]
    );
    if (check.length === 0) {
      res.status(403).json({ error: "Student not in your TG group" });
      return;
    }

    // Get next version number
    const [versionRows] = await pool.execute<RowDataPacket[]>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM mentorship_records WHERE tg_erp_id = ? AND student_erp_id = ?",
      [req.user.erp_id, student_erp_id]
    );

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO mentorship_records (tg_erp_id, student_erp_id, notes, action_plan, follow_up_date, version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.erp_id,
        student_erp_id,
        notes,
        action_plan || null,
        follow_up_date || null,
        versionRows[0].next_ver,
      ]
    );

    res.status(201).json({ id: result.insertId, version: versionRows[0].next_ver });
  }
);

// ─── GET /aicte/mentorship/:studentErpId ──────────────────────────────────────
router.get(
  "/mentorship/:studentErpId",
  authenticate,
  requireFullScope,
  requireRole("TEACHER_GUARDIAN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, notes, action_plan, follow_up_date, version, created_at
       FROM mentorship_records
       WHERE tg_erp_id = ? AND student_erp_id = ?
       ORDER BY version DESC`,
      [req.user.erp_id, req.params.studentErpId]
    );
    res.json(rows);
  }
);

export default router;
