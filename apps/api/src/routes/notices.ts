import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope } from "../middleware/auth";
import { getNoticesPutUrl, getNoticesGetUrl } from "../lib/minio";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

router.use(authenticate, requireFullScope);

// ─── POST /notices/upload-url ─────────────────────────────────────────────────
// Any non-student employee can upload a notice
router.post("/upload-url", async (req: Request, res: Response) => {
  if (req.user.base_role === "STUDENT") {
    res.status(403).json({ error: "Students cannot upload notices" });
    return;
  }

  const { title, body, filename, dept_id } = req.body as {
    title: string;
    body?: string;
    filename: string;
    dept_id?: number;
  };

  if (!title || !filename) {
    res.status(400).json({ error: "title and filename are required" });
    return;
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `notices/${Date.now()}_${safeFilename}`;

  const uploadUrl = await getNoticesPutUrl(objectPath);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notices (uploader_erp_id, title, body, minio_path, dept_id)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.erp_id, title, body ?? null, objectPath, dept_id ?? null]
  );

  res.json({ upload_url: uploadUrl, notice_id: result.insertId, minio_path: objectPath });
});

// ─── DELETE /notices/:id ──────────────────────────────────────────────────────
// Uploader can delete their own notice
router.delete("/:id", async (req: Request, res: Response) => {
  if (req.user.base_role === "STUDENT") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM notices WHERE id = ? AND uploader_erp_id = ?",
    [id, req.user.erp_id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Notice not found or not yours" });
    return;
  }
  await pool.execute("DELETE FROM notices WHERE id = ?", [id]);
  res.json({ message: "Deleted" });
});

// ─── GET /notices ─────────────────────────────────────────────────────────────
// All authenticated users can view notices
// Students see institution-wide + their department; employees see all
router.get("/", async (req: Request, res: Response) => {
  let rows: RowDataPacket[];

  if (req.user.base_role === "STUDENT") {
    const [sd] = await pool.execute<RowDataPacket[]>(
      `SELECT d.dept_id FROM student_details sd
       INNER JOIN divisions d ON sd.division_id = d.id
       WHERE sd.erp_id = ?`,
      [req.user.erp_id]
    );
    const deptId = sd[0]?.dept_id ?? null;
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT n.id, n.title, n.body, n.minio_path, n.uploaded_at,
              u.name AS uploader, dep.name AS dept_name
       FROM notices n
       INNER JOIN users u ON n.uploader_erp_id = u.erp_id
       LEFT JOIN departments dep ON n.dept_id = dep.id
       WHERE n.dept_id IS NULL OR n.dept_id = ?
       ORDER BY n.uploaded_at DESC`,
      [deptId]
    );
  } else {
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT n.id, n.title, n.body, n.minio_path, n.uploaded_at,
              u.name AS uploader, dep.name AS dept_name
       FROM notices n
       INNER JOIN users u ON n.uploader_erp_id = u.erp_id
       LEFT JOIN departments dep ON n.dept_id = dep.id
       ORDER BY n.uploaded_at DESC`
    );
  }

  res.json(rows);
});

// ─── GET /notices/download/:id ────────────────────────────────────────────────
router.get("/download/:id", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT minio_path, dept_id FROM notices WHERE id = ?",
    [req.params.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  // Students: restrict to institution-wide or their dept
  if (req.user.base_role === "STUDENT" && rows[0].dept_id !== null) {
    const [sd] = await pool.execute<RowDataPacket[]>(
      `SELECT d.dept_id FROM student_details sd
       INNER JOIN divisions d ON sd.division_id = d.id
       WHERE sd.erp_id = ?`,
      [req.user.erp_id]
    );
    if (sd.length === 0 || sd[0].dept_id !== rows[0].dept_id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const url = await getNoticesGetUrl(rows[0].minio_path);
  res.json({ download_url: url });
});

export default router;
