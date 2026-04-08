import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import { getNotesPutUrl, getNotesGetUrl } from "../lib/minio";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

router.use(authenticate, requireFullScope);

const TEACHER_ROLES = [
  "HOD",
  "CLASS_INCHARGE",
  "TEACHER_GUARDIAN",
  "PRACTICAL_TEACHER",
  "SUBJECT_TEACHER",
] as const;

// ─── POST /notes/upload-url ───────────────────────────────────────────────────
// HOD, CLASS_INCHARGE, TEACHER_GUARDIAN, PRACTICAL_TEACHER, SUBJECT_TEACHER
router.post(
  "/upload-url",
  requireRole(...TEACHER_ROLES),
  async (req: Request, res: Response) => {
    const { title, filename, division_id } = req.body as {
      title: string;
      filename: string;
      division_id?: number;
    };

    if (!title || !filename) {
      res.status(400).json({ error: "title and filename are required" });
      return;
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `notes/${Date.now()}_${safeFilename}`;

    const uploadUrl = await getNotesPutUrl(objectPath);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO notes (uploader_erp_id, title, division_id, dept_id, minio_path)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.erp_id,
        title,
        division_id ?? null,
        req.user.dept_id ?? null,
        objectPath,
      ]
    );

    res.json({ upload_url: uploadUrl, note_id: result.insertId, minio_path: objectPath });
  }
);

// ─── DELETE /notes/:id ────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireRole(...TEACHER_ROLES),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM notes WHERE id = ? AND uploader_erp_id = ?",
      [id, req.user.erp_id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Note not found or not yours" });
      return;
    }
    await pool.execute("DELETE FROM notes WHERE id = ?", [id]);
    res.json({ message: "Deleted" });
  }
);

// ─── GET /notes ───────────────────────────────────────────────────────────────
// All authenticated users can view notes
// Students see their division + dept-wide notes; employees see their dept notes
router.get("/", async (req: Request, res: Response) => {
  let rows: RowDataPacket[];

  if (req.user.base_role === "STUDENT") {
    const [sd] = await pool.execute<RowDataPacket[]>(
      `SELECT sd.division_id, d.dept_id FROM student_details sd
       INNER JOIN divisions d ON sd.division_id = d.id
       WHERE sd.erp_id = ?`,
      [req.user.erp_id]
    );
    const divisionId = sd[0]?.division_id ?? null;
    const deptId = sd[0]?.dept_id ?? null;
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT n.id, n.title, n.minio_path, n.uploaded_at,
              u.name AS uploader, div.label AS division_label, dep.name AS dept_name
       FROM notes n
       INNER JOIN users u ON n.uploader_erp_id = u.erp_id
       LEFT JOIN divisions div ON n.division_id = div.id
       LEFT JOIN departments dep ON n.dept_id = dep.id
       WHERE n.division_id = ? OR (n.division_id IS NULL AND n.dept_id = ?)
       ORDER BY n.uploaded_at DESC`,
      [divisionId, deptId]
    );
  } else {
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT n.id, n.title, n.minio_path, n.uploaded_at,
              u.name AS uploader, div.label AS division_label, dep.name AS dept_name
       FROM notes n
       INNER JOIN users u ON n.uploader_erp_id = u.erp_id
       LEFT JOIN divisions div ON n.division_id = div.id
       LEFT JOIN departments dep ON n.dept_id = dep.id
       WHERE n.dept_id = ? OR n.dept_id IS NULL
       ORDER BY n.uploaded_at DESC`,
      [req.user.dept_id ?? 0]
    );
  }

  res.json(rows);
});

// ─── GET /notes/download/:id ──────────────────────────────────────────────────
router.get("/download/:id", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT minio_path, division_id, dept_id FROM notes WHERE id = ?",
    [req.params.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  // Students: check they belong to the note's division or department
  if (req.user.base_role === "STUDENT") {
    const [sd] = await pool.execute<RowDataPacket[]>(
      `SELECT sd.division_id, d.dept_id FROM student_details sd
       INNER JOIN divisions d ON sd.division_id = d.id
       WHERE sd.erp_id = ?`,
      [req.user.erp_id]
    );
    const note = rows[0];
    const divOk = note.division_id === null || sd[0]?.division_id === note.division_id;
    const deptOk = note.dept_id === null || sd[0]?.dept_id === note.dept_id;
    if (!divOk || !deptOk) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const url = await getNotesGetUrl(rows[0].minio_path);
  res.json({ download_url: url });
});

export default router;
