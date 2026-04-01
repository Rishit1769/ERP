import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole, requireStudent } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  MarkEntrySchema,
  PracticalMarkEntrySchema,
  PracticalExperimentConfigSchema,
  ExperimentMarkEntrySchema,
} from "@cloudcampus/shared";
import { evaluateMarksRisk } from "../lib/riskEngine";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// ─── GET /marks/students/:assignmentId ───────────────────────────────────────
// Returns the student list for a subject_assignment (used by teacher marks page)
router.get(
  "/students/:assignmentId",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.erp_id, u.name, sd.roll_no
       FROM subject_assignments sa
       JOIN divisions d ON sa.division_id = d.id
       JOIN student_details sd ON sd.division_id = d.id
       JOIN users u ON sd.erp_id = u.erp_id
       WHERE sa.id = ?
       ORDER BY sd.roll_no`,
      [req.params.assignmentId]
    );
    res.json(rows);
  }
);

// ─── POST /marks/theory ───────────────────────────────────────────────────────
router.post(
  "/theory",
  authenticate,
  requireFullScope,
  requireRole("SUBJECT_TEACHER"),
  validate(MarkEntrySchema),
  async (req: Request, res: Response) => {
    const { subject_id, division_id, exam_type, max_marks, records } = req.body as MarkEntrySchema;

    // Verify teacher is assigned to this subject+division
    const [sa] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM subject_assignments
       WHERE teacher_erp_id = ? AND subject_id = ? AND division_id = ? AND type = 'THEORY'`,
      [req.user.erp_id, subject_id, division_id]
    );
    if (sa.length === 0) {
      res.status(403).json({ error: "You are not assigned to teach this subject in this division" });
      return;
    }

    // Validate no marks exceed max
    const invalid = records.filter((r) => r.marks > max_marks || r.marks < 0);
    if (invalid.length > 0) {
      res.status(400).json({
        error: "Invalid marks values",
        invalid: invalid.map((r) => ({
          student_erp_id: r.student_erp_id,
          marks: r.marks,
          max: max_marks,
        })),
      });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const record of records) {
        await conn.execute(
          `INSERT INTO marks_theory (student_erp_id, subject_id, division_id, exam_type, marks_obtained, max_marks, entered_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), max_marks = VALUES(max_marks), entered_by = VALUES(entered_by)`,
          [record.student_erp_id, subject_id, division_id, exam_type, record.marks, max_marks, req.user.erp_id]
        );
      }

      await conn.commit();

      setImmediate(async () => {
        for (const record of records) {
          await evaluateMarksRisk(record.student_erp_id, subject_id);
        }
      });

      res.json({ message: "Theory marks saved", count: records.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ─── GET /marks/practical/config/:assignmentId ───────────────────────────────
// Returns experiment config for a subject assignment (or defaults if not set yet)
router.get(
  "/practical/config/:assignmentId",
  authenticate,
  requireFullScope,
  requireRole("PRACTICAL_TEACHER"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT experiment_count, marks_per_experiment
       FROM practical_experiment_config
       WHERE subject_assignment_id = ?`,
      [req.params.assignmentId]
    );
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.json({ experiment_count: 10, marks_per_experiment: 10 });
    }
  }
);

// ─── POST /marks/practical/config ────────────────────────────────────────────
// Practical teacher sets (or updates) the experiment config for their assignment
router.post(
  "/practical/config",
  authenticate,
  requireFullScope,
  requireRole("PRACTICAL_TEACHER"),
  validate(PracticalExperimentConfigSchema),
  async (req: Request, res: Response) => {
    const { subject_assignment_id, experiment_count, marks_per_experiment } =
      req.body as PracticalExperimentConfigSchema;

    // Verify ownership
    const [sa] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM subject_assignments WHERE id = ? AND teacher_erp_id = ? AND type = 'PRACTICAL'`,
      [subject_assignment_id, req.user.erp_id]
    );
    if (sa.length === 0) {
      res.status(403).json({ error: "Assignment not found or you do not own it" });
      return;
    }

    await pool.execute(
      `INSERT INTO practical_experiment_config (subject_assignment_id, experiment_count, marks_per_experiment)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE experiment_count = VALUES(experiment_count),
                               marks_per_experiment = VALUES(marks_per_experiment)`,
      [subject_assignment_id, experiment_count, marks_per_experiment]
    );

    res.json({ message: "Config saved", experiment_count, marks_per_experiment });
  }
);

// ─── POST /marks/practical/experiments ───────────────────────────────────────
// Practical teacher saves experiment marks for one or more students/experiments
router.post(
  "/practical/experiments",
  authenticate,
  requireFullScope,
  requireRole("PRACTICAL_TEACHER"),
  validate(ExperimentMarkEntrySchema),
  async (req: Request, res: Response) => {
    const { subject_assignment_id, records } = req.body as ExperimentMarkEntrySchema;

    // Verify ownership + get max marks per experiment
    const [sa] = await pool.execute<RowDataPacket[]>(
      `SELECT sa.id, COALESCE(cfg.marks_per_experiment, 10) AS max_per_exp,
              COALESCE(cfg.experiment_count, 10) AS exp_count
       FROM subject_assignments sa
       LEFT JOIN practical_experiment_config cfg ON cfg.subject_assignment_id = sa.id
       WHERE sa.id = ? AND sa.teacher_erp_id = ? AND sa.type = 'PRACTICAL'`,
      [subject_assignment_id, req.user.erp_id]
    );
    if (sa.length === 0) {
      res.status(403).json({ error: "Assignment not found or you do not own it" });
      return;
    }

    const maxPerExp = Number(sa[0].max_per_exp);
    const expCount = Number(sa[0].exp_count);

    const invalid = records.filter(
      (r) => r.marks_obtained > maxPerExp || r.marks_obtained < 0 || r.experiment_no > expCount
    );
    if (invalid.length > 0) {
      res.status(400).json({ error: "Some marks exceed the configured maximum or experiment number is out of range", invalid });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of records) {
        await conn.execute(
          `INSERT INTO marks_experiments (subject_assignment_id, student_erp_id, experiment_no, marks_obtained, entered_by)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), entered_by = VALUES(entered_by)`,
          [subject_assignment_id, r.student_erp_id, r.experiment_no, r.marks_obtained, req.user.erp_id]
        );
      }
      await conn.commit();
      res.json({ message: "Experiment marks saved", count: records.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ─── GET /marks/practical/experiments/:assignmentId ──────────────────────────
// Returns all experiment marks for every student in the assignment
router.get(
  "/practical/experiments/:assignmentId",
  authenticate,
  requireFullScope,
  requireRole("PRACTICAL_TEACHER"),
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT me.student_erp_id, u.name, sd.roll_no,
              me.experiment_no, me.marks_obtained
       FROM marks_experiments me
       JOIN users u ON me.student_erp_id = u.erp_id
       JOIN student_details sd ON me.student_erp_id = sd.erp_id
       WHERE me.subject_assignment_id = ?
       ORDER BY sd.roll_no, me.experiment_no`,
      [req.params.assignmentId]
    );
    res.json(rows);
  }
);

// ─── POST /marks/practical ────────────────────────────────────────────────────
// Legacy: kept for backwards compatibility
router.post(
  "/practical",
  authenticate,
  requireFullScope,
  requireRole("PRACTICAL_TEACHER"),
  validate(PracticalMarkEntrySchema),
  async (req: Request, res: Response) => {
    const { subject_id, batch_label, max_marks, records } = req.body as PracticalMarkEntrySchema;

    const [sa] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM subject_assignments
       WHERE teacher_erp_id = ? AND subject_id = ? AND type = 'PRACTICAL' AND batch_label = ?`,
      [req.user.erp_id, subject_id, batch_label]
    );
    if (sa.length === 0) {
      res.status(403).json({ error: "You are not assigned as practical teacher for this subject+batch" });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const record of records) {
        await conn.execute(
          `INSERT INTO marks_practical (student_erp_id, subject_id, batch_label, marks_obtained, max_marks, entered_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), max_marks = VALUES(max_marks), entered_by = VALUES(entered_by)`,
          [record.student_erp_id, subject_id, batch_label, record.marks, max_marks, req.user.erp_id]
        );
      }
      await conn.commit();
      res.json({ message: "Practical marks saved", count: records.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ─── GET /marks/student ───────────────────────────────────────────────────────
// Student sees their own marks (theory + practical experiments)
router.get(
  "/student",
  authenticate,
  requireFullScope,
  requireStudent,
  async (req: Request, res: Response) => {
    const [theory] = await pool.execute<RowDataPacket[]>(
      `SELECT s.code AS subject_code, s.name AS subject_name,
              mt.exam_type, mt.marks_obtained AS marks, mt.max_marks
       FROM marks_theory mt
       INNER JOIN subjects s ON mt.subject_id = s.id
       WHERE mt.student_erp_id = ?
       ORDER BY s.name, mt.exam_type`,
      [req.user.erp_id]
    );

    // Experiment marks grouped per assignment
    const [experiments] = await pool.execute<RowDataPacket[]>(
      `SELECT s.code AS subject_code, s.name AS subject_name,
              sa.batch_label,
              me.experiment_no,
              me.marks_obtained,
              cfg.marks_per_experiment AS max_marks
       FROM marks_experiments me
       JOIN subject_assignments sa ON me.subject_assignment_id = sa.id
       JOIN subjects s ON sa.subject_id = s.id
       LEFT JOIN practical_experiment_config cfg ON cfg.subject_assignment_id = sa.id
       WHERE me.student_erp_id = ?
       ORDER BY s.name, me.experiment_no`,
      [req.user.erp_id]
    );

    res.json({ theory, experiments });
  }
);

// ─── GET /marks/class/:subjectId/:divisionId ─────────────────────────────────
router.get(
  "/class/:subjectId/:divisionId",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT sd.erp_id, u.name, sd.roll_no,
              mt.exam_type, mt.marks_obtained AS marks, mt.max_marks
       FROM student_details sd
       INNER JOIN users u ON sd.erp_id = u.erp_id
       LEFT JOIN marks_theory mt ON sd.erp_id = mt.student_erp_id AND mt.subject_id = ?
       WHERE sd.division_id = ?
       ORDER BY sd.roll_no, mt.exam_type`,
      [req.params.subjectId, req.params.divisionId]
    );
    res.json(rows);
  }
);


// ─── POST /marks/theory/assignment ───────────────────────────────────────────
// Save theory marks by subject_assignment_id (used by teacher marks page)
router.post(
  "/theory/assignment",
  authenticate,
  requireFullScope,
  requireRole("SUBJECT_TEACHER"),
  async (req: Request, res: Response) => {
    const { subject_assignment_id, exam_type, max_marks, records } = req.body as {
      subject_assignment_id: number;
      exam_type: string;
      max_marks: number;
      records: Array<{ student_erp_id: string; marks: number }>;
    };
    if (!subject_assignment_id || !exam_type || !max_marks || !records?.length) {
      res.status(400).json({ error: "subject_assignment_id, exam_type, max_marks, and records required" });
      return;
    }
    const [sa] = await pool.execute<RowDataPacket[]>(
      `SELECT sa.id, sa.subject_id, sa.division_id FROM subject_assignments sa
       WHERE sa.id = ? AND sa.teacher_erp_id = ? AND sa.type = 'THEORY'`,
      [subject_assignment_id, req.user.erp_id]
    );
    if ((sa as RowDataPacket[]).length === 0) {
      res.status(403).json({ error: "Assignment not found or you do not own it" });
      return;
    }
    const { subject_id, division_id } = (sa as RowDataPacket[])[0];
    const invalid = records.filter((r) => r.marks > max_marks || r.marks < 0);
    if (invalid.length > 0) {
      res.status(400).json({ error: "Invalid marks values", invalid });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const record of records) {
        await conn.execute(
          `INSERT INTO marks_theory (student_erp_id, subject_id, division_id, exam_type, marks_obtained, max_marks, entered_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), max_marks = VALUES(max_marks), entered_by = VALUES(entered_by)`,
          [record.student_erp_id, subject_id, division_id, exam_type, record.marks, max_marks, req.user.erp_id]
        );
      }
      await conn.commit();
      setImmediate(async () => {
        for (const record of records) {
          await evaluateMarksRisk(record.student_erp_id, subject_id as number);
        }
      });
      res.json({ message: "Theory marks saved", count: records.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

export default router;