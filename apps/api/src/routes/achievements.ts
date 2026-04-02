import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import { getPresignedPutUrl, getPresignedGetUrl } from "../lib/minio";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// All routes require authentication
router.use(authenticate, requireFullScope);

// ─── GET /achievements/my ─────────────────────────────────────────────────────
router.get("/my", requireRole("SUBJECT_TEACHER", "PRACTICAL_TEACHER", "CLASS_INCHARGE", "TEACHER_GUARDIAN", "HOD"), async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, description, achievement_type, achieved_date, minio_path, created_at
     FROM teacher_achievements WHERE erp_id = ? ORDER BY achieved_date DESC, created_at DESC`,
    [req.user.erp_id]
  );
  res.json(rows);
});

// ─── POST /achievements ───────────────────────────────────────────────────────
// Create achievement and get presigned upload URL for optional PDF
router.post("/", requireRole("SUBJECT_TEACHER", "PRACTICAL_TEACHER", "CLASS_INCHARGE", "TEACHER_GUARDIAN", "HOD"), async (req: Request, res: Response) => {
  const { title, description, achievement_type, achieved_date, filename } = req.body as {
    title: string;
    description?: string;
    achievement_type: string;
    achieved_date?: string;
    filename?: string;
  };

  if (!title || !achievement_type) {
    res.status(400).json({ error: "title and achievement_type are required" });
    return;
  }

  const validTypes = ["PHD", "MASTERS", "CERTIFICATION", "PUBLICATION", "AWARD", "PATENT", "OTHER"];
  if (!validTypes.includes(achievement_type)) {
    res.status(400).json({ error: "Invalid achievement_type" });
    return;
  }

  let upload_url: string | null = null;
  let minio_path: string | null = null;

  if (filename) {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    minio_path = `achievements/${req.user.erp_id}/${Date.now()}_${safeFilename}`;
    upload_url = await getPresignedPutUrl(minio_path);
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO teacher_achievements (erp_id, title, description, achievement_type, achieved_date, minio_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.erp_id, title, description || null, achievement_type, achieved_date || null, minio_path]
  );

  res.status(201).json({ id: result.insertId, upload_url, minio_path });
});

// ─── DELETE /achievements/:id ─────────────────────────────────────────────────
router.delete("/:id", requireRole("SUBJECT_TEACHER", "PRACTICAL_TEACHER", "CLASS_INCHARGE", "TEACHER_GUARDIAN", "HOD"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM teacher_achievements WHERE id = ? AND erp_id = ?",
    [id, req.user.erp_id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Achievement not found" });
    return;
  }
  await pool.execute("DELETE FROM teacher_achievements WHERE id = ?", [id]);
  res.json({ message: "Deleted" });
});

// ─── GET /achievements/pdf/:id ────────────────────────────────────────────────
// Get presigned download URL for the achievement PDF
router.get("/pdf/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ta.minio_path, ta.erp_id
     FROM teacher_achievements ta WHERE ta.id = ?`,
    [id]
  );
  if (rows.length === 0 || !rows[0].minio_path) {
    res.status(404).json({ error: "No PDF attached" });
    return;
  }
  // Only the owner or a HOD/ADMIN can download
  if (rows[0].erp_id !== req.user.erp_id) {
    const [roleRows] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM employee_roles WHERE erp_id = ? AND role_type IN ('HOD','ADMIN') LIMIT 1`,
      [req.user.erp_id]
    );
    if (roleRows.length === 0) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  const url = await getPresignedGetUrl(rows[0].minio_path);
  res.json({ url });
});

export default router;
