import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole, requireStudent } from "../middleware/auth";
import { getPresignedPutUrl, getPresignedGetUrl } from "../lib/minio";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// ─── POST /materials/upload-url ───────────────────────────────────────────────
// Teacher gets a presigned PUT URL for uploading material
router.post(
  "/upload-url",
  authenticate,
  requireFullScope,
  requireRole("SUBJECT_TEACHER", "PRACTICAL_TEACHER"),
  async (req: Request, res: Response) => {
    const { subject_assignment_id, title, filename } = req.body as {
      subject_assignment_id: number;
      title: string;
      filename: string;
    };

    if (!subject_assignment_id || !title || !filename) {
      res.status(400).json({ error: "subject_assignment_id, title, and filename required" });
      return;
    }

    // Verify ownership
    const [sa] = await pool.execute<RowDataPacket[]>(
      `SELECT sa.id, s.code AS subject_code, d.label AS division, dep.code AS dept_code
       FROM subject_assignments sa
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN divisions d ON sa.division_id = d.id
       INNER JOIN departments dep ON d.dept_id = dep.id
       WHERE sa.id = ? AND sa.teacher_erp_id = ?`,
      [subject_assignment_id, req.user.erp_id]
    );
    if (sa.length === 0) {
      res.status(403).json({ error: "You are not assigned to this subject" });
      return;
    }

    // Sanitize filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = `${Date.now()}_${safeFilename}`;
    const objectPath = `materials/${sa[0].dept_code}/${sa[0].subject_code}/${sa[0].division}/${uniqueName}`;

    const uploadUrl = await getPresignedPutUrl(objectPath);

    // Save metadata (file not yet uploaded — will be finalized by POST /materials/confirm)
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO materials (subject_assignment_id, uploader_erp_id, title, minio_path)
       VALUES (?, ?, ?, ?)`,
      [subject_assignment_id, req.user.erp_id, title, objectPath]
    );

    res.json({ upload_url: uploadUrl, material_id: result.insertId, minio_path: objectPath });
  }
);

// ─── GET /materials/download/:materialId ──────────────────────────────────────
// Student gets a presigned GET URL for a material (division-scoped)
router.get(
  "/download/:materialId",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const materialId = Number(req.params.materialId);

    const [matRows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.minio_path, sa.division_id
       FROM materials m
       INNER JOIN subject_assignments sa ON m.subject_assignment_id = sa.id
       WHERE m.id = ?`,
      [materialId]
    );
    if (matRows.length === 0) {
      res.status(404).json({ error: "Material not found" });
      return;
    }

    // If student, check division match
    if (req.user.base_role === "STUDENT") {
      const [sd] = await pool.execute<RowDataPacket[]>(
        "SELECT division_id FROM student_details WHERE erp_id = ?",
        [req.user.erp_id]
      );
      if (sd.length === 0 || sd[0].division_id !== matRows[0].division_id) {
        res.status(403).json({ error: "You are not authorized to access this material" });
        return;
      }
    }

    const downloadUrl = await getPresignedGetUrl(matRows[0].minio_path);
    res.json({ download_url: downloadUrl });
  }
);

// ─── GET /materials/subject/:assignmentId ─────────────────────────────────────
// List materials for a subject assignment
router.get(
  "/subject/:assignmentId",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.id, m.title, m.minio_path, m.uploaded_at, u.name AS uploader
       FROM materials m
       INNER JOIN users u ON m.uploader_erp_id = u.erp_id
       WHERE m.subject_assignment_id = ?
       ORDER BY m.uploaded_at DESC`,
      [req.params.assignmentId]
    );
    res.json(rows);
  }
);

// ─── GET /materials/my-subjects ───────────────────────────────────────────────
// Student: list all materials for their enrolled subjects
router.get(
  "/my-subjects",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.id, m.title, m.uploaded_at, s.code AS subject_code, s.name AS subject_name,
              u.name AS uploader
       FROM student_details sd
       INNER JOIN subject_assignments sa ON sd.division_id = sa.division_id
       INNER JOIN materials m ON sa.id = m.subject_assignment_id
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN users u ON m.uploader_erp_id = u.erp_id
       WHERE sd.erp_id = ?
       ORDER BY s.name, m.uploaded_at DESC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

export default router;
