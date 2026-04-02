import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// All lesson-plan routes require authentication
router.use(authenticate, requireFullScope);

// ─── Helper: fetch full lesson plan detail ────────────────────────────────────
async function getLessonPlanDetail(lessonPlanId: number) {
  const [topics] = await pool.execute<RowDataPacket[]>(
    `SELECT id, syllabus_topic_id, unit_name, topic_name, topic_description,
            num_lectures, weightage, order_no, status, lectures_taken,
            is_additional, notes, completed_at
     FROM lesson_plan_topics
     WHERE lesson_plan_id = ?
     ORDER BY order_no`,
    [lessonPlanId]
  );

  // Group by unit
  const unitMap = new Map<string, unknown[]>();
  for (const t of topics as RowDataPacket[]) {
    if (!unitMap.has(t.unit_name)) unitMap.set(t.unit_name, []);
    unitMap.get(t.unit_name)!.push(t);
  }

  const units = Array.from(unitMap.entries()).map(([unit_name, unitTopics]) => ({
    unit_name,
    topics: unitTopics,
  }));

  return units;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEACHER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /lesson-plan/my ──────────────────────────────────────────────────────
// Teacher: get all their lesson plans (summary per assignment)
router.get("/my", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sa.id AS assignment_id,
       sub.name AS subject_name,
       sub.code AS subject_code,
       sa.type AS assignment_type,
       sa.batch_label,
       d.year, d.label AS division_label,
       sm.semester,
       sm.total_lecture_hours,
       tlp.id AS lesson_plan_id,
       tlp.syllabus_id,
       tlp.created_at AS plan_created_at,
       (SELECT COUNT(*) FROM lesson_plan_topics lpt WHERE lpt.lesson_plan_id = tlp.id) AS total_topics,
       (SELECT COUNT(*) FROM lesson_plan_topics lpt WHERE lpt.lesson_plan_id = tlp.id AND lpt.status = 'COMPLETED') AS completed_topics,
       (SELECT COALESCE(SUM(lpt.lectures_taken),0) FROM lesson_plan_topics lpt WHERE lpt.lesson_plan_id = tlp.id) AS total_lectures_taken
     FROM subject_assignments sa
     JOIN subjects sub ON sa.subject_id = sub.id
     JOIN divisions d ON sa.division_id = d.id
     LEFT JOIN teacher_lesson_plans tlp ON tlp.assignment_id = sa.id
     LEFT JOIN syllabus_master sm ON tlp.syllabus_id = sm.id
     WHERE sa.teacher_erp_id = ?
     ORDER BY sub.name, sa.type`,
    [req.user.erp_id]
  );
  res.json(rows);
});

// ─── GET /lesson-plan/:assignmentId ──────────────────────────────────────────
// Teacher: get full lesson plan for a specific assignment
router.get("/:assignmentId", async (req: Request, res: Response) => {
  const assignmentId = parseInt(String(req.params.assignmentId));

  const [saRows] = await pool.execute<RowDataPacket[]>(
    `SELECT sa.id, sa.teacher_erp_id, sub.name AS subject_name, sub.code AS subject_code,
            sa.type, sa.batch_label, d.year, d.label AS division_label,
            sm.semester, sm.total_lecture_hours
     FROM subject_assignments sa
     JOIN subjects sub ON sa.subject_id = sub.id
     JOIN divisions d ON sa.division_id = d.id
     LEFT JOIN teacher_lesson_plans tlp ON tlp.assignment_id = sa.id
     LEFT JOIN syllabus_master sm ON tlp.syllabus_id = sm.id
     WHERE sa.id = ?`,
    [assignmentId]
  );

  if ((saRows as RowDataPacket[]).length === 0) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const sa = (saRows as RowDataPacket[])[0];

  // Only allow the assigned teacher to view (HOD uses the dedicated HOD route)
  if (sa.teacher_erp_id !== req.user.erp_id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Get lesson plan
  const [lpRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM teacher_lesson_plans WHERE assignment_id = ?",
    [assignmentId]
  );

  if ((lpRows as RowDataPacket[]).length === 0) {
    res.json({ assignment: sa, lesson_plan: null, units: [] });
    return;
  }

  const lessonPlanId = (lpRows as RowDataPacket[])[0].id;
  const units = await getLessonPlanDetail(lessonPlanId);

  res.json({ assignment: sa, lesson_plan_id: lessonPlanId, units });
});

// ─── PATCH /lesson-plan/topic/:topicId ───────────────────────────────────────
// Teacher: update status, lectures_taken, or notes on a topic
router.patch("/topic/:topicId", async (req: Request, res: Response) => {
  const topicId = parseInt(String(req.params.topicId));
  const { status, lectures_taken, notes } = req.body as {
    status?: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    lectures_taken?: number;
    notes?: string;
  };

  // Verify the topic belongs to this teacher's lesson plan
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT lpt.id, sa.teacher_erp_id, lpt.status AS current_status
     FROM lesson_plan_topics lpt
     JOIN teacher_lesson_plans tlp ON lpt.lesson_plan_id = tlp.id
     JOIN subject_assignments sa ON tlp.assignment_id = sa.id
     WHERE lpt.id = ?`,
    [topicId]
  );

  if ((rows as RowDataPacket[]).length === 0) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  const row = (rows as RowDataPacket[])[0];
  if (row.teacher_erp_id !== req.user.erp_id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (status !== undefined) {
    updates.push("status = ?");
    params.push(status);
    if (status === "COMPLETED" && row.current_status !== "COMPLETED") {
      updates.push("completed_at = NOW()");
    } else if (status !== "COMPLETED") {
      updates.push("completed_at = NULL");
    }
  }
  if (lectures_taken !== undefined) {
    if (typeof lectures_taken !== "number" || lectures_taken < 0) {
      res.status(400).json({ error: "lectures_taken must be a non-negative number" });
      return;
    }
    updates.push("lectures_taken = ?");
    params.push(lectures_taken);
  }
  if (notes !== undefined) {
    updates.push("notes = ?");
    params.push(notes || null);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  params.push(topicId);
  await pool.execute(`UPDATE lesson_plan_topics SET ${updates.join(", ")} WHERE id = ?`, params as (string | number | null)[]);

  res.json({ message: "Topic updated" });
});

// ─── POST /lesson-plan/:assignmentId/additional-topic ────────────────────────
// Teacher: manually add an extra topic not in the master syllabus
router.post("/:assignmentId/additional-topic", async (req: Request, res: Response) => {
  const assignmentId = parseInt(String(req.params.assignmentId));
  const { unit_name, topic_name, topic_description, num_lectures, weightage, notes } = req.body as {
    unit_name: string;
    topic_name: string;
    topic_description?: string;
    num_lectures?: number;
    weightage?: number;
    notes?: string;
  };

  if (!unit_name?.trim() || !topic_name?.trim()) {
    res.status(400).json({ error: "unit_name and topic_name are required" });
    return;
  }

  // Verify ownership
  const [saRows] = await pool.execute<RowDataPacket[]>(
    "SELECT teacher_erp_id FROM subject_assignments WHERE id = ?",
    [assignmentId]
  );
  if ((saRows as RowDataPacket[]).length === 0 || (saRows as RowDataPacket[])[0].teacher_erp_id !== req.user.erp_id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Get or create lesson plan
  let lessonPlanId: number;
  const [lpRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM teacher_lesson_plans WHERE assignment_id = ?",
    [assignmentId]
  );

  if ((lpRows as RowDataPacket[]).length === 0) {
    // No master syllabus — create a bare lesson plan without syllabus_id?
    // We need a syllabus_id FK. Try to find one.
    const [saDetailRows] = await pool.execute<RowDataPacket[]>(
      "SELECT subject_id, type FROM subject_assignments WHERE id = ?",
      [assignmentId]
    );
    const saDetail = (saDetailRows as RowDataPacket[])[0];
    const [smRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM syllabus_master WHERE subject_id = ? AND type = ? ORDER BY updated_at DESC LIMIT 1",
      [saDetail.subject_id, saDetail.type]
    );

    if ((smRows as RowDataPacket[]).length === 0) {
      res.status(422).json({
        error: "No master syllabus uploaded for this subject yet. Ask admin to upload a syllabus first.",
      });
      return;
    }

    const [lpIns] = await pool.execute<ResultSetHeader>(
      "INSERT INTO teacher_lesson_plans (assignment_id, syllabus_id) VALUES (?, ?)",
      [assignmentId, (smRows as RowDataPacket[])[0].id]
    );
    lessonPlanId = lpIns.insertId;
  } else {
    lessonPlanId = (lpRows as RowDataPacket[])[0].id;
  }

  // Determine next order_no
  const [maxOrder] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(MAX(order_no), 0) AS max_order FROM lesson_plan_topics WHERE lesson_plan_id = ?",
    [lessonPlanId]
  );
  const nextOrder = ((maxOrder as RowDataPacket[])[0].max_order as number) + 1;

  const [ins] = await pool.execute<ResultSetHeader>(
    `INSERT INTO lesson_plan_topics
       (lesson_plan_id, syllabus_topic_id, unit_name, topic_name, topic_description,
        num_lectures, weightage, order_no, status, is_additional, notes)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'PENDING', 1, ?)`,
    [
      lessonPlanId, unit_name.trim(), topic_name.trim(),
      (topic_description ?? "").trim() || null,
      num_lectures ?? 1, weightage ?? 0, nextOrder,
      notes?.trim() || null,
    ]
  );

  res.status(201).json({ message: "Additional topic added", id: ins.insertId });
});

// ─── DELETE /lesson-plan/additional-topic/:topicId ───────────────────────────
// Teacher: remove a manually-added additional topic (cannot delete master topics)
router.delete("/additional-topic/:topicId", async (req: Request, res: Response) => {
  const topicId = parseInt(String(req.params.topicId));

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT lpt.id, lpt.is_additional, sa.teacher_erp_id
     FROM lesson_plan_topics lpt
     JOIN teacher_lesson_plans tlp ON lpt.lesson_plan_id = tlp.id
     JOIN subject_assignments sa ON tlp.assignment_id = sa.id
     WHERE lpt.id = ?`,
    [topicId]
  );

  if ((rows as RowDataPacket[]).length === 0) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  const row = (rows as RowDataPacket[])[0];
  if (row.teacher_erp_id !== req.user.erp_id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  if (!row.is_additional) {
    res.status(400).json({ error: "Cannot delete master syllabus topics. Mark them as completed instead." });
    return;
  }

  await pool.execute("DELETE FROM lesson_plan_topics WHERE id = ?", [topicId]);
  res.json({ message: "Additional topic removed" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HOD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /lesson-plan/hod/assignment/:assignmentId ───────────────────────────
// HOD: view any assignment's lesson plan in their dept
router.get(
  "/hod/assignment/:assignmentId",
  requireRole("HOD"),
  async (req: Request, res: Response) => {
    const assignmentId = parseInt(String(req.params.assignmentId));

    const [saRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sa.id, sa.teacher_erp_id, u.name AS teacher_name,
              sub.name AS subject_name, sub.code AS subject_code,
              sa.type, sa.batch_label, d.year, d.label AS division_label,
              sm.semester, sm.total_lecture_hours
       FROM subject_assignments sa
       JOIN subjects sub ON sa.subject_id = sub.id
       JOIN divisions d ON sa.division_id = d.id
       JOIN users u ON sa.teacher_erp_id = u.erp_id
       LEFT JOIN teacher_lesson_plans tlp ON tlp.assignment_id = sa.id
       LEFT JOIN syllabus_master sm ON tlp.syllabus_id = sm.id
       WHERE sa.id = ? AND d.dept_id = ?`,
      [assignmentId, req.user.dept_id]
    );

    if ((saRows as RowDataPacket[]).length === 0) {
      res.status(404).json({ error: "Assignment not found in your department" });
      return;
    }

    const sa = (saRows as RowDataPacket[])[0];
    const [lpRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM teacher_lesson_plans WHERE assignment_id = ?",
      [assignmentId]
    );

    if ((lpRows as RowDataPacket[]).length === 0) {
      res.json({ assignment: sa, lesson_plan: null, units: [] });
      return;
    }

    const lessonPlanId = (lpRows as RowDataPacket[])[0].id;
    const units = await getLessonPlanDetail(lessonPlanId);
    res.json({ assignment: sa, lesson_plan_id: lessonPlanId, units });
  }
);

export default router;
