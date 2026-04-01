import { Router, Request, Response } from "express";
import PDFDocument from "pdfkit";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole, requireStudent } from "../middleware/auth";
import { getPresignedPutUrl, getPresignedGetUrl, ensureBucket } from "../lib/minio";
import type { RowDataPacket } from "mysql2";

const router = Router();

interface SubjectResult {
  subject_name: string;
  subject_code: string;
  exam_type: string;
  marks_obtained: number;
  max_marks: number;
  batch_label?: string;
}

// ─── GET /results/my ──────────────────────────────────────────────────────────
// Student views their consolidated results
router.get(
  "/my",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const erp_id = req.user.erp_id;
    const { exam_type } = req.query;

    let theoryQuery = `
      SELECT s.name AS subject_name, s.code AS subject_code, mt.exam_type,
             mt.marks_obtained, mt.max_marks
      FROM marks_theory mt
      JOIN subjects s ON mt.subject_id = s.id
      WHERE mt.student_erp_id = ?`;
    const theoryParams: any[] = [erp_id];

    if (exam_type) {
      theoryQuery += " AND mt.exam_type = ?";
      theoryParams.push(exam_type);
    }
    theoryQuery += " ORDER BY s.name, mt.exam_type";

    let practicalQuery = `
      SELECT s.name AS subject_name, s.code AS subject_code,
             mp.marks_obtained, mp.max_marks, mp.batch_label
      FROM marks_practical mp
      JOIN subjects s ON mp.subject_id = s.id
      WHERE mp.student_erp_id = ?
      ORDER BY s.name`;
    const practicalParams: any[] = [erp_id];

    const [[theoryRows], [practicalRows]] = await Promise.all([
      pool.execute<RowDataPacket[]>(theoryQuery, theoryParams),
      pool.execute<RowDataPacket[]>(practicalQuery, practicalParams),
    ]);

    // Group by subject
    const subjects = new Map<string, { theory: SubjectResult[]; practical: SubjectResult[] }>();

    for (const row of theoryRows) {
      const key = row.subject_code as string;
      if (!subjects.has(key)) subjects.set(key, { theory: [], practical: [] });
      subjects.get(key)!.theory.push(row as unknown as SubjectResult);
    }

    for (const row of practicalRows) {
      const key = row.subject_code as string;
      if (!subjects.has(key)) subjects.set(key, { theory: [], practical: [] });
      subjects.get(key)!.practical.push(row as unknown as SubjectResult);
    }

    const result = Array.from(subjects.entries()).map(([code, data]) => ({
      subject_code: code,
      subject_name: data.theory[0]?.subject_name ?? data.practical[0]?.subject_name,
      theory: data.theory,
      practical: data.practical,
    }));

    res.json(result);
  }
);

// ─── GET /results/class ───────────────────────────────────────────────────────
// Subject teacher / HOD views class-level results
router.get(
  "/class",
  authenticate,
  requireFullScope,
  requireRole("HOD", "SUBJECT_TEACHER"),
  async (req: Request, res: Response) => {
    const { subject_id, exam_type, division_id } = req.query;
    if (!subject_id) {
      res.status(400).json({ error: "subject_id required" });
      return;
    }

    let query = `
      SELECT u.erp_id, u.name AS student_name,
             mt.exam_type, mt.marks_obtained, mt.max_marks
      FROM marks_theory mt
      JOIN users u ON mt.student_erp_id = u.erp_id
      JOIN student_details sd ON u.erp_id = sd.erp_id
      WHERE mt.subject_id = ?`;
    const params: any[] = [subject_id];

    if (exam_type) {
      query += " AND mt.exam_type = ?";
      params.push(exam_type);
    }
    if (division_id) {
      query += " AND sd.division_id = ?";
      params.push(division_id);
    }
    query += " ORDER BY u.name, mt.exam_type";

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);

    // Also fetch practical marks
    let pQuery = `
      SELECT u.erp_id, u.name AS student_name,
             mp.marks_obtained, mp.max_marks, mp.batch_label
      FROM marks_practical mp
      JOIN users u ON mp.student_erp_id = u.erp_id
      JOIN student_details sd ON u.erp_id = sd.erp_id
      WHERE mp.subject_id = ?`;
    const pParams: any[] = [subject_id];
    if (division_id) {
      pQuery += " AND sd.division_id = ?";
      pParams.push(division_id);
    }
    pQuery += " ORDER BY u.name";

    const [pRows] = await pool.execute<RowDataPacket[]>(pQuery, pParams);

    res.json({ theory: rows, practical: pRows });
  }
);

// ─── POST /results/export-pdf ─────────────────────────────────────────────────
// Student generates their results PDF, stores in MinIO, returns presigned URL
router.post(
  "/export-pdf",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const erp_id = req.user.erp_id;
    const { exam_type } = req.body;

    // Fetch student info
    const [studentRows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.name, u.erp_id, d.name AS dept_name, sd.semester,
              dv.label AS division_name
       FROM users u
       JOIN student_details sd ON u.erp_id = sd.erp_id
       JOIN departments d ON u.dept_id = d.id
       JOIN divisions dv ON sd.division_id = dv.id
       WHERE u.erp_id = ?`,
      [erp_id]
    );

    if (!studentRows[0]) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    const student = studentRows[0];

    // Fetch theory marks
    let theoryQ = `
      SELECT s.name AS subject_name, s.code AS subject_code, mt.exam_type,
             mt.marks_obtained, mt.max_marks
      FROM marks_theory mt
      JOIN subjects s ON mt.subject_id = s.id
      WHERE mt.student_erp_id = ?`;
    const tParams: any[] = [erp_id];
    if (exam_type) {
      theoryQ += " AND mt.exam_type = ?";
      tParams.push(exam_type);
    }
    theoryQ += " ORDER BY s.name, mt.exam_type";

    const [theory] = await pool.execute<RowDataPacket[]>(theoryQ, tParams);

    // Fetch practical marks
    const [practical] = await pool.execute<RowDataPacket[]>(
      `SELECT s.name AS subject_name, s.code AS subject_code,
              mp.marks_obtained, mp.max_marks, mp.batch_label
       FROM marks_practical mp
       JOIN subjects s ON mp.subject_id = s.id
       WHERE mp.student_erp_id = ?
       ORDER BY s.name`,
      [erp_id]
    );

    // Generate PDF in memory
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Header
    doc.fontSize(18).text("CloudCampus — Student Results", { align: "center" });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Name: ${student.name}`);
    doc.text(`ERP ID: ${student.erp_id}`);
    doc.text(`Department: ${student.dept_name}`);
    doc.text(`Year: ${student.year} | Semester: ${student.semester} | Division: ${student.division_name}`);
    doc.text(`Generated: ${new Date().toISOString().split("T")[0]}`);
    doc.moveDown();

    // Theory marks table
    if ((theory as RowDataPacket[]).length > 0) {
      doc.fontSize(13).text("Theory Marks", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);

      const thCols = ["Subject", "Code", "Exam", "Obtained", "Max", "%"];
      const colWidths = [140, 60, 70, 60, 50, 50];
      let y = doc.y;
      let x = 50;

      // header
      thCols.forEach((col, i) => {
        doc.font("Helvetica-Bold").text(col, x, y, { width: colWidths[i] });
        x += colWidths[i];
      });
      y += 18;
      doc.font("Helvetica");

      for (const row of theory as RowDataPacket[]) {
        x = 50;
        const pct = ((row.marks_obtained / row.max_marks) * 100).toFixed(1);
        const vals = [row.subject_name, row.subject_code, row.exam_type, String(row.marks_obtained), String(row.max_marks), pct];
        vals.forEach((v, i) => {
          doc.text(v, x, y, { width: colWidths[i] });
          x += colWidths[i];
        });
        y += 16;
        if (y > 750) {
          doc.addPage();
          y = 50;
        }
      }
      doc.moveDown();
    }

    // Practical marks table
    if ((practical as RowDataPacket[]).length > 0) {
      doc.fontSize(13).text("Practical Marks", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);

      const pCols = ["Subject", "Code", "Batch", "Obtained", "Max", "%"];
      const colWidths = [140, 60, 70, 60, 50, 50];
      let y = doc.y;
      let x = 50;

      pCols.forEach((col, i) => {
        doc.font("Helvetica-Bold").text(col, x, y, { width: colWidths[i] });
        x += colWidths[i];
      });
      y += 18;
      doc.font("Helvetica");

      for (const row of practical as RowDataPacket[]) {
        x = 50;
        const pct = ((row.marks_obtained / row.max_marks) * 100).toFixed(1);
        const vals = [row.subject_name, row.subject_code, row.batch_label || "-", String(row.marks_obtained), String(row.max_marks), pct];
        vals.forEach((v, i) => {
          doc.text(v, x, y, { width: colWidths[i] });
          x += colWidths[i];
        });
        y += 16;
        if (y > 750) {
          doc.addPage();
          y = 50;
        }
      }
    }

    doc.end();
    const pdfBuffer = await pdfReady;

    // Upload to MinIO
    await ensureBucket();
    const examLabel = exam_type || "all";
    const objectKey = `results/${erp_id}/${examLabel}_${Date.now()}.pdf`;
    const putUrl = await getPresignedPutUrl(objectKey);

    // Upload via presigned URL
    const response = await fetch(putUrl, {
      method: "PUT",
      body: pdfBuffer,
      headers: { "Content-Type": "application/pdf" },
    });

    if (!response.ok) {
      res.status(500).json({ error: "Failed to upload PDF" });
      return;
    }

    const downloadUrl = await getPresignedGetUrl(objectKey);
    res.json({ url: downloadUrl, object_key: objectKey });
  }
);

// ─── GET /results/download ────────────────────────────────────────────────────
// Re-download a previously generated PDF
router.get(
  "/download",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const { object_key } = req.query;
    if (!object_key || typeof object_key !== "string") {
      res.status(400).json({ error: "object_key required" });
      return;
    }

    // Students can only download their own results
    if (req.user.base_role === "STUDENT") {
      if (!object_key.startsWith(`results/${req.user.erp_id}/`)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const url = await getPresignedGetUrl(object_key);
    res.json({ url });
  }
);

export default router;
