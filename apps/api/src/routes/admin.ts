import { Router, Request, Response } from "express";
import multer from "multer";
import Papa from "papaparse";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole, requireStudent } from "../middleware/auth";
import type { ResultSetHeader } from "mysql2";
import { validate } from "../middleware/validate";
import { SetThresholdSchema } from "@cloudcampus/shared";
import type { RowDataPacket } from "mysql2";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── GET /admin/thresholds ────────────────────────────────────────────────────
router.get(
  "/thresholds",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.id, t.key_name, t.description, t.value, t.dept_id, d.code AS dept_code, t.updated_at
       FROM admin_thresholds t
       LEFT JOIN departments d ON t.dept_id = d.id
       WHERE t.key_name IS NOT NULL
       ORDER BY t.id`,
    );
    res.json(rows);
  }
);

// ─── POST /admin/thresholds ───────────────────────────────────────────────────
router.post(
  "/thresholds",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  validate(SetThresholdSchema),
  async (req: Request, res: Response) => {
    const { key_name, value, dept_id } = req.body as SetThresholdSchema;

    await pool.execute(
      `UPDATE admin_thresholds SET value = ?, set_by = ?, updated_at = NOW()
       WHERE key_name = ? AND (dept_id = ? OR (dept_id IS NULL AND ? IS NULL))`,
      [value, req.user.erp_id, key_name, dept_id || null, dept_id || null]
    );

    res.json({ message: "Threshold updated", key_name, value, dept_id });
  }
);

// ─── GET /admin/stats ─────────────────────────────────────────────────────────
router.get(
  "/stats",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (_req: Request, res: Response) => {
    const [[studentsRow], [employeesRow], [riskRow]] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM users WHERE base_role = 'STUDENT' AND is_active = 1"
      ),
      pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM users WHERE base_role = 'EMPLOYEE' AND is_active = 1"
      ),
      pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM risk_events WHERE resolved_at IS NULL"
      ),
    ]);
    res.json({
      students: (studentsRow as RowDataPacket[])[0]?.total ?? 0,
      employees: (employeesRow as RowDataPacket[])[0]?.total ?? 0,
      active_risks: (riskRow as RowDataPacket[])[0]?.total ?? 0,
    });
  }
);

// ─── GET /admin/departments ───────────────────────────────────────────────────
router.get(
  "/departments",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, code, name FROM departments ORDER BY id"
    );
    res.json(rows);
  }
);

// ─── POST /admin/departments ──────────────────────────────────────────────────
router.post(
  "/departments",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { code, name } = req.body as { code: string; name: string };
    if (!code || !name) {
      res.status(400).json({ error: "code and name required" });
      return;
    }

    try {
      await pool.execute(
        "INSERT INTO departments (code, name) VALUES (?, ?)",
        [code.toUpperCase().trim(), name.trim()]
      );
      res.status(201).json({ message: "Department created" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "Department code already exists" });
        return;
      }
      throw err;
    }
  }
);

// ─── POST /admin/divisions ───────────────────────────────────────────────────
router.post(
  "/divisions",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN", "HOD"),
  async (req: Request, res: Response) => {
    const { dept_id, year, label } = req.body as { dept_id: number; year: number; label: string };
    if (!dept_id || !year || !label) {
      res.status(400).json({ error: "dept_id, year, and label required" });
      return;
    }

    try {
      await pool.execute(
        "INSERT INTO divisions (dept_id, year, label) VALUES (?, ?, ?)",
        [dept_id, year, label.toUpperCase().trim()]
      );
      res.status(201).json({ message: "Division created" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "Division already exists" });
        return;
      }
      throw err;
    }
  }
);

// ─── POST /admin/divisions/bulk ──────────────────────────────────────────────
// Create N divisions (A, B, C…) for a department + year in one shot
router.post(
  "/divisions/bulk",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { dept_id, year, count } = req.body as { dept_id: number; year: number; count: number };
    if (!dept_id || !year || !count || count < 1 || count > 26) {
      res.status(400).json({ error: "dept_id, year, and count (1–26) required" });
      return;
    }

    const labels = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)); // A, B, C…
    const created: string[] = [];
    const skipped: string[] = [];

    for (const label of labels) {
      try {
        await pool.execute(
          "INSERT INTO divisions (dept_id, year, label) VALUES (?, ?, ?)",
          [dept_id, year, label]
        );
        created.push(label);
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") {
          skipped.push(label);
        } else {
          throw err;
        }
      }
    }

    res.status(201).json({
      message: `Created ${created.length} division(s)`,
      created,
      skipped,
    });
  }
);

// ─── GET /admin/divisions ─────────────────────────────────────────────────────
router.get(
  "/divisions",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { dept_id } = req.query as { dept_id?: string };
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.id, d.dept_id, dep.code AS dept_code, dep.name AS dept_name, d.year, d.label
       FROM divisions d
       JOIN departments dep ON d.dept_id = dep.id
       ${dept_id ? "WHERE d.dept_id = ?" : ""}
       ORDER BY d.dept_id, d.year, d.label`,
      dept_id ? [dept_id] : []
    );
    res.json(rows);
  }
);

// ─── POST /admin/subjects ─────────────────────────────────────────────────────
router.post(
  "/subjects",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN", "HOD"),
  async (req: Request, res: Response) => {
    const { code, name, dept_id, has_practical, credits } = req.body as {
      code: string;
      name: string;
      dept_id: number;
      has_practical?: boolean;
      credits?: number;
    };
    if (!code || !name || !dept_id) {
      res.status(400).json({ error: "code, name, and dept_id required" });
      return;
    }

    try {
      await pool.execute(
        "INSERT INTO subjects (code, name, dept_id, has_practical, credits) VALUES (?, ?, ?, ?, ?)",
        [code.toUpperCase().trim(), name.trim(), dept_id, has_practical ? 1 : 0, credits || 3]
      );
      res.status(201).json({ message: "Subject created" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "Subject code already exists" });
        return;
      }
      throw err;
    }
  }
);

// ─── GET /admin/risk-dashboard ────────────────────────────────────────────────
// HOD at-risk dashboard
router.get(
  "/risk-dashboard",
  authenticate,
  requireFullScope,
  requireRole("HOD", "ADMIN"),
  async (req: Request, res: Response) => {
    const deptFilter = req.user.dept_id;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT re.id, re.student_erp_id, u.name AS student_name,
              sd.roll_no, d.year, d.label AS division,
              re.rule_type, re.triggered_value, re.threshold_value,
              s.name AS subject_name, re.created_at,
              sd.parent_phone,
              tg_u.name AS tg_name
       FROM risk_events re
       INNER JOIN users u ON re.student_erp_id = u.erp_id
       INNER JOIN student_details sd ON u.erp_id = sd.erp_id
       INNER JOIN divisions d ON sd.division_id = d.id
       LEFT JOIN subjects s ON re.subject_id = s.id
       LEFT JOIN tg_students ts ON u.erp_id = ts.student_erp_id
       LEFT JOIN tg_groups tg ON ts.tg_group_id = tg.id
       LEFT JOIN users tg_u ON tg.tg_erp_id = tg_u.erp_id
       WHERE d.dept_id = ? AND re.resolved_at IS NULL
       ORDER BY re.triggered_value ASC, re.created_at DESC`,
      [deptFilter]
    );

    res.json(rows);
  }
);

// ─── GET /admin/notifications ─────────────────────────────────────────────────
router.get(
  "/notifications",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, body, is_read, created_at
       FROM notifications WHERE erp_id = ?
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── POST /admin/notifications/:id/read ───────────────────────────────────────
router.post(
  "/notifications/:id/read",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    await pool.execute(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND erp_id = ?",
      [req.params.id, req.user.erp_id]
    );
    res.json({ message: "Marked as read" });
  }
);

// ─── GET /admin/student-risk-alerts ───────────────────────────────────────────
// Student's own at-risk alerts
router.get(
  "/student-risk-alerts",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT re.rule_type, re.triggered_value, re.threshold_value,
              s.name AS subject_name, re.created_at
       FROM risk_events re
       LEFT JOIN subjects s ON re.subject_id = s.id
       WHERE re.student_erp_id = ? AND re.resolved_at IS NULL
       ORDER BY re.created_at DESC`,
      [req.user.erp_id]
    );
    res.json(rows);
  }
);

// ─── GET /admin/semester-status ───────────────────────────────────────────────
// Returns the current semester distribution for each year (1-4)
router.get(
  "/semester-status",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (_req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT dv.year, sd.semester, COUNT(*) AS student_count
       FROM student_details sd
       JOIN divisions dv ON sd.division_id = dv.id
       JOIN users u ON u.erp_id = sd.erp_id
       WHERE u.is_active = 1 AND u.is_alumni = 0
       GROUP BY dv.year, sd.semester
       ORDER BY dv.year, sd.semester`
    );

    const [[alumniRow]] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM users WHERE is_alumni = 1`
    );

    // Shape into { year -> { semester, student_count } }
    const byYear: Record<number, { semester: number; student_count: number }> = {};
    for (const r of rows as Array<{ year: number; semester: number; student_count: number }>) {
      if (!byYear[r.year] || r.student_count > byYear[r.year].student_count) {
        byYear[r.year] = { semester: r.semester, student_count: r.student_count };
      }
    }

    res.json({ years: byYear, alumni_count: (alumniRow as RowDataPacket).total ?? 0 });
  }
);

// ─── POST /admin/promote-semester ────────────────────────────────────────────
// Advance active students in a given year from their ODD semester to EVEN:
//   year 1 (FY): 1→2  |  year 2 (SY): 3→4  |  year 3 (TY): 5→6  |  year 4 (LY): 7→8
// Only students currently at the expected odd semester are promoted.
// Use POST /admin/advance-year for the year-end cross-year transition.
router.post(
  "/promote-semester",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { year } = req.body as { year: number };
    if (!year || year < 1 || year > 4) {
      res.status(400).json({ error: "year must be 1, 2, 3, or 4" });
      return;
    }

    // Each year has a single expected odd semester (start of that year)
    const expectedOddSem = year * 2 - 1; // 1, 3, 5, or 7
    const nextSem = expectedOddSem + 1;  // 2, 4, 6, or 8

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [promoteResult] = await conn.execute<ResultSetHeader>(
        `UPDATE student_details sd
         JOIN divisions dv ON sd.division_id = dv.id
         JOIN users u ON u.erp_id = sd.erp_id
         SET sd.semester = ?
         WHERE dv.year = ?
           AND sd.semester = ?
           AND u.is_active = 1
           AND u.is_alumni = 0`,
        [nextSem, year, expectedOddSem]
      );

      await conn.commit();

      const YEAR_LABELS: Record<number, string> = { 1: "FY", 2: "SY", 3: "TY", 4: "LY" };
      res.json({
        message: `${YEAR_LABELS[year]} students promoted to Semester ${nextSem}`,
        year,
        promoted: promoteResult.affectedRows,
        from_semester: expectedOddSem,
        to_semester: nextSem,
      });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: "Promotion failed", message: (err as Error).message });
    } finally {
      conn.release();
    }
  }
);

// ─── POST /admin/advance-year ─────────────────────────────────────────────────
// Year-end operation: advances ALL year groups by one academic year.
//   LY (year 4, sem 8)  → graduated alumni
//   TY (year 3, sem 6)  → moved to matching year-4 division, semester 7
//   SY (year 2, sem 4)  → moved to matching year-3 division, semester 5
//   FY (year 1, sem 2)  → moved to matching year-2 division, semester 3
// Matching is done by dept_id + division label (A, B, C…).
router.post(
  "/advance-year",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Step 1: Graduate LY (year 4) students at semester 8
      const [gradResult] = await conn.execute<ResultSetHeader>(
        `UPDATE users u
         JOIN student_details sd ON u.erp_id = sd.erp_id
         JOIN divisions dv ON sd.division_id = dv.id
         SET u.is_active = 0, u.is_alumni = 1
         WHERE dv.year = 4 AND sd.semester = 8
           AND u.is_active = 1 AND u.is_alumni = 0`
      );

      // Steps 2-4: Move each year group to next year's matching division
      // Process from highest to lowest to avoid conflicts
      const transitions: Array<{ fromYear: number; fromSem: number; toYear: number; toSem: number; count: number }> = [];

      for (const [fromYear, fromSem, toYear, toSem] of [
        [3, 6, 4, 7],
        [2, 4, 3, 5],
        [1, 2, 2, 3],
      ] as [number, number, number, number][]) {
        const [moveResult] = await conn.execute<ResultSetHeader>(
          `UPDATE student_details sd
           JOIN divisions old_dv ON sd.division_id = old_dv.id
           JOIN divisions new_dv
             ON new_dv.dept_id = old_dv.dept_id
            AND new_dv.year = ?
            AND new_dv.label = old_dv.label
           JOIN users u ON u.erp_id = sd.erp_id
           SET sd.division_id = new_dv.id, sd.semester = ?
           WHERE old_dv.year = ? AND sd.semester = ?
             AND u.is_active = 1 AND u.is_alumni = 0`,
          [toYear, toSem, fromYear, fromSem]
        );
        transitions.push({ fromYear, fromSem, toYear, toSem, count: moveResult.affectedRows });
      }

      await conn.commit();

      res.json({
        message: "Academic year advanced",
        graduated: gradResult.affectedRows,
        transitions,
      });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: "Year advancement failed", message: (err as Error).message });
    } finally {
      conn.release();
    }
  }
);

// ─── GET /admin/dept-year-analytics ──────────────────────────────────────────
// Per-division analytics for a dept+year: students, at-risk, avg attendance.
router.get(
  "/dept-year-analytics",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { dept_id, year } = req.query as { dept_id?: string; year?: string };
    if (!dept_id || !year) {
      res.status(400).json({ error: "dept_id and year are required" });
      return;
    }

    const [divRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, label FROM divisions WHERE dept_id = ? AND year = ? ORDER BY label",
      [dept_id, year]
    );

    const results = [];
    for (const div of divRows as Array<{ id: number; label: string }>) {
      const [students] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total, MAX(sd.semester) AS semester
         FROM student_details sd
         JOIN users u ON u.erp_id = sd.erp_id
         WHERE sd.division_id = ? AND u.is_active = 1 AND u.is_alumni = 0`,
        [div.id]
      );
      const [risks] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT re.student_erp_id) AS at_risk
         FROM risk_events re
         JOIN student_details sd ON sd.erp_id = re.student_erp_id
         WHERE sd.division_id = ? AND re.resolved_at IS NULL`,
        [div.id]
      );
      const [att] = await pool.execute<RowDataPacket[]>(
        `SELECT ROUND(
           COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) * 100.0
           / NULLIF(COUNT(a.id), 0), 1
         ) AS avg_attendance_pct
         FROM attendance a
         JOIN student_details sd ON sd.erp_id = a.student_erp_id
         WHERE sd.division_id = ?`,
        [div.id]
      );
      results.push({
        division_id: div.id,
        label: div.label,
        total_students: (students as RowDataPacket[])[0]?.total ?? 0,
        semester: (students as RowDataPacket[])[0]?.semester ?? null,
        at_risk: (risks as RowDataPacket[])[0]?.at_risk ?? 0,
        avg_attendance_pct: (att as RowDataPacket[])[0]?.avg_attendance_pct ?? null,
      });
    }
    res.json(results);
  }
);

// ─── POST /admin/semester-schedule/import ────────────────────────────────────
// Admin uploads a CSV with academic calendar events (holidays, exams, events).
// CSV columns: date,type,title,description,dept_code
//   date: YYYY-MM-DD  |  type: HOLIDAY|EXAM|EVENT|EXTRA_CLASS|OTHER
//   description: optional  |  dept_code: empty = institute-wide
router.post(
  "/semester-schedule/import",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const csvText = req.file.buffer.toString("utf-8");
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (parsed.errors.length > 0) {
      res.status(400).json({ error: "CSV parse error", details: parsed.errors });
      return;
    }

    const required = ["date", "type", "title"];
    const headers = Object.keys(parsed.data[0] ?? {});
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      res.status(400).json({ error: "Missing CSV columns", missing });
      return;
    }

    const validTypes = new Set(["HOLIDAY", "EXAM", "EVENT", "EXTRA_CLASS", "OTHER"]);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNum = i + 2;

      const eventDate  = (row.date ?? "").trim();
      const eventType  = (row.type ?? "").trim().toUpperCase();
      const title      = (row.title ?? "").trim();
      const desc       = (row.description ?? "").trim() || null;
      const deptCode   = (row.dept_code ?? "").trim().toUpperCase() || null;

      if (!eventDate || !dateRe.test(eventDate)) {
        errors.push(`Row ${rowNum}: invalid date '${eventDate}' (must be YYYY-MM-DD)`);
        continue;
      }
      if (!validTypes.has(eventType)) {
        errors.push(`Row ${rowNum}: invalid type '${eventType}'`);
        continue;
      }
      if (!title) {
        errors.push(`Row ${rowNum}: title is required`);
        continue;
      }

      try {
        let deptId: number | null = null;
        if (deptCode) {
          const [deptRows] = await pool.execute<RowDataPacket[]>(
            "SELECT id FROM departments WHERE code = ?",
            [deptCode]
          );
          if ((deptRows as RowDataPacket[]).length === 0) {
            errors.push(`Row ${rowNum}: department '${deptCode}' not found`);
            continue;
          }
          deptId = (deptRows as RowDataPacket[])[0].id;
        }

        await pool.execute(
          `INSERT INTO semester_schedule (event_date, event_type, title, description, dept_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [eventDate, eventType, title, desc, deptId, req.user.erp_id]
        );
        inserted++;
      } catch (err: any) {
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    res.status(errors.length > 0 && inserted === 0 ? 400 : 201).json({
      message: `Imported ${inserted} event(s)`,
      inserted,
      errors: errors.length,
      error_details: errors,
    });
  }
);

// ─── GET /admin/semester-schedule ────────────────────────────────────────────
// List all semester schedule events, optionally filtered by year (YYYY).
router.get(
  "/semester-schedule",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    const params: (string | number)[] = [];

    let where = "1=1";
    if (year && /^\d{4}$/.test(year)) {
      where += " AND YEAR(ss.event_date) = ?";
      params.push(parseInt(year));
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ss.id, ss.event_date, ss.event_type, ss.title, ss.description,
              ss.dept_id, d.code AS dept_code, ss.created_by, ss.created_at
       FROM semester_schedule ss
       LEFT JOIN departments d ON ss.dept_id = d.id
       WHERE ${where}
       ORDER BY ss.event_date`,
      params
    );
    res.json(rows);
  }
);

// ─── DELETE /admin/semester-schedule/:id ─────────────────────────────────────
router.delete(
  "/semester-schedule/:id",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    await pool.execute("DELETE FROM semester_schedule WHERE id = ?", [req.params.id]);
    res.json({ message: "Event deleted" });
  }
);

export default router;
