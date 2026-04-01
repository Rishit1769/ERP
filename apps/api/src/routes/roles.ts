import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  AssignSubjectTeacherSchema,
  AssignClassInchargeSchema,
  AssignTgSchema,
  UpdateSubjectAssignmentSchema,
  UpdateEmployeeRoleSchema,
  BulkReassignSchema,
} from "@cloudcampus/shared";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// All routes require HOD role
router.use(authenticate, requireFullScope, requireRole("HOD"));

// ─── GET /roles/teachers ──────────────────────────────────────────────────────
// List all teachers in HOD's department
router.get("/teachers", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.erp_id, u.name, u.email, u.phone,
            GROUP_CONCAT(er.role_type) AS roles
     FROM users u
     INNER JOIN employee_roles er ON u.erp_id = er.erp_id
     WHERE u.dept_id = ? AND u.base_role = 'EMPLOYEE' AND u.is_active = 1
       AND u.erp_id NOT IN (
         SELECT erp_id FROM employee_roles WHERE role_type IN ('ADMIN','SUPER_ADMIN','HOD')
       )
     GROUP BY u.erp_id`,
    [req.user.dept_id]
  );
  res.json(rows);
});

// ─── GET /roles/divisions ─────────────────────────────────────────────────────
// List all divisions in HOD's department
router.get("/divisions", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, year, label FROM divisions WHERE dept_id = ? ORDER BY year, label",
    [req.user.dept_id]
  );
  res.json(rows);
});

// ─── GET /roles/subjects ──────────────────────────────────────────────────────
router.get("/subjects", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, code, name, has_practical FROM subjects WHERE dept_id = ? ORDER BY name",
    [req.user.dept_id]
  );
  res.json(rows);
});

// ─── POST /roles/assign-subject ───────────────────────────────────────────────
router.post(
  "/assign-subject",
  validate(AssignSubjectTeacherSchema),
  async (req: Request, res: Response) => {
    const { teacher_erp_id, subject_id, division_id, type, batch_label } = req.body as AssignSubjectTeacherSchema;

    // Verify teacher belongs to HOD's dept
    const [teacherRows] = await pool.execute<RowDataPacket[]>(
      "SELECT erp_id FROM users WHERE erp_id = ? AND dept_id = ? AND base_role = 'EMPLOYEE'",
      [teacher_erp_id, req.user.dept_id]
    );
    if (teacherRows.length === 0) {
      res.status(404).json({ error: "Teacher not found in your department" });
      return;
    }

    // Verify subject belongs to dept
    const [subRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM subjects WHERE id = ? AND dept_id = ?",
      [subject_id, req.user.dept_id]
    );
    if (subRows.length === 0) {
      res.status(404).json({ error: "Subject not found in your department" });
      return;
    }

    try {
      await pool.execute(
        `INSERT INTO subject_assignments (teacher_erp_id, subject_id, division_id, type, batch_label)
         VALUES (?, ?, ?, ?, ?)`,
        [teacher_erp_id, subject_id, division_id, type, batch_label || null]
      );

      // Ensure the appropriate employee_role exists
      const roleType = type === "PRACTICAL" ? "PRACTICAL_TEACHER" : "SUBJECT_TEACHER";
      await pool.execute(
        `INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, ?, ?)`,
        [teacher_erp_id, roleType, req.user.dept_id]
      );

      res.status(201).json({ message: "Subject assignment created" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "This assignment already exists" });
        return;
      }
      throw err;
    }
  }
);

// ─── POST /roles/assign-class-incharge ────────────────────────────────────────
router.post(
  "/assign-class-incharge",
  validate(AssignClassInchargeSchema),
  async (req: Request, res: Response) => {
    const { teacher_erp_id, division_id } = req.body as AssignClassInchargeSchema;

    try {
      await pool.execute(
        "INSERT INTO class_incharge (teacher_erp_id, division_id) VALUES (?, ?)",
        [teacher_erp_id, division_id]
      );
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "This teacher is already class incharge for this division" });
        return;
      }
      throw err;
    }

    await pool.execute(
      "INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, 'CLASS_INCHARGE', ?)",
      [teacher_erp_id, req.user.dept_id]
    );

    res.status(201).json({ message: "Class incharge assigned" });
  }
);

// ─── POST /roles/assign-tg ───────────────────────────────────────────────────
// Assigns TG group. If student_erp_ids is empty, auto-assign 20 by roll number.
router.post(
  "/assign-tg",
  validate(AssignTgSchema),
  async (req: Request, res: Response) => {
    let { teacher_erp_id, division_id, student_erp_ids } = req.body as AssignTgSchema;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Create TG group
      const [result] = await conn.execute<ResultSetHeader>(
        "INSERT INTO tg_groups (tg_erp_id, division_id) VALUES (?, ?)",
        [teacher_erp_id, division_id]
      );
      const groupId = result.insertId;

      // Insert student mappings
      for (const sid of student_erp_ids) {
        await conn.execute(
          "INSERT INTO tg_students (tg_group_id, student_erp_id) VALUES (?, ?)",
          [groupId, sid]
        );
      }

      await conn.execute(
        "INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, 'TEACHER_GUARDIAN', ?)",
        [teacher_erp_id, req.user.dept_id]
      );

      await conn.commit();

      res.status(201).json({ message: "TG group created", group_id: groupId, students: student_erp_ids.length });
    } catch (err: any) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "TG already exists for this teacher-division combo or student already in a TG group" });
        return;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
);

// ─── POST /roles/auto-assign-tg ──────────────────────────────────────────────
// Auto assigns 20 students sequentially by roll number to each TG
router.post("/auto-assign-tg", async (req: Request, res: Response) => {
  const { division_id, teacher_erp_ids } = req.body as {
    division_id: number;
    teacher_erp_ids: string[];
  };

  if (!division_id || !Array.isArray(teacher_erp_ids) || teacher_erp_ids.length === 0) {
    res.status(400).json({ error: "division_id and teacher_erp_ids required" });
    return;
  }

  // Get all students in the division sorted by roll number, not already in any TG
  const [students] = await pool.execute<RowDataPacket[]>(
    `SELECT sd.erp_id
     FROM student_details sd
     LEFT JOIN tg_students ts ON sd.erp_id = ts.student_erp_id
     WHERE sd.division_id = ? AND ts.student_erp_id IS NULL
     ORDER BY sd.roll_no`,
    [division_id]
  );

  const studentIds = students.map((s) => s.erp_id as string);
  const groupSize = 20;
  const assignments: Array<{ tg: string; students: string[]; group_id: number }> = [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (let i = 0; i < teacher_erp_ids.length; i++) {
      const chunk = studentIds.slice(i * groupSize, (i + 1) * groupSize);
      if (chunk.length === 0) break;

      const [result] = await conn.execute<ResultSetHeader>(
        "INSERT INTO tg_groups (tg_erp_id, division_id) VALUES (?, ?)",
        [teacher_erp_ids[i], division_id]
      );
      const groupId = result.insertId;

      for (const sid of chunk) {
        await conn.execute(
          "INSERT INTO tg_students (tg_group_id, student_erp_id) VALUES (?, ?)",
          [groupId, sid]
        );
      }

      await conn.execute(
        "INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, 'TEACHER_GUARDIAN', ?)",
        [teacher_erp_ids[i], req.user.dept_id]
      );

      assignments.push({ tg: teacher_erp_ids[i], students: chunk, group_id: groupId });
    }

    await conn.commit();
    res.json({
      message: "TG auto-assignment complete",
      assigned: assignments,
      unassigned_students: studentIds.length - assignments.reduce((s, a) => s + a.students.length, 0),
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ─── GET /roles/assignments-overview ────────────────────────────────────────
// Summary counts for the HOD overview dashboard
router.get("/assignments-overview", async (req: Request, res: Response) => {
  const [[divRow], [teacherRow], [studentRow]] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM divisions WHERE dept_id = ?",
      [req.user.dept_id]
    ),
    pool.execute<RowDataPacket[]>(
      "SELECT COUNT(DISTINCT erp_id) AS total FROM employee_roles WHERE dept_id = ?",
      [req.user.dept_id]
    ),
    pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM users u JOIN student_details sd ON u.erp_id = sd.erp_id JOIN divisions dv ON sd.division_id = dv.id WHERE dv.dept_id = ? AND u.is_active = 1",
      [req.user.dept_id]
    ),
  ]);
  res.json({
    divisions: (divRow as RowDataPacket[])[0]?.total ?? 0,
    teachers: (teacherRow as RowDataPacket[])[0]?.total ?? 0,
    students: (studentRow as RowDataPacket[])[0]?.total ?? 0,
  });
});

// ─── GET /roles/assignments ───────────────────────────────────────────────────
// Current state of all assignments in HOD's dept
router.get("/assignments", async (req: Request, res: Response) => {
  const [subjects] = await pool.execute<RowDataPacket[]>(
    `SELECT sa.id, sa.teacher_erp_id, u.name AS teacher_name,
            s.code AS subject_code, s.name AS subject_name,
            d.year, d.label AS division, sa.type, sa.batch_label
     FROM subject_assignments sa
     INNER JOIN users u ON sa.teacher_erp_id = u.erp_id
     INNER JOIN subjects s ON sa.subject_id = s.id
     INNER JOIN divisions d ON sa.division_id = d.id
     WHERE d.dept_id = ?
     ORDER BY d.year, d.label, s.name`,
    [req.user.dept_id]
  );

  const [ci] = await pool.execute<RowDataPacket[]>(
    `SELECT ci.teacher_erp_id, u.name AS teacher_name, d.year, d.label AS division
     FROM class_incharge ci
     INNER JOIN users u ON ci.teacher_erp_id = u.erp_id
     INNER JOIN divisions d ON ci.division_id = d.id
     WHERE d.dept_id = ?`,
    [req.user.dept_id]
  );

  const [tg] = await pool.execute<RowDataPacket[]>(
    `SELECT tg.id AS group_id, tg.tg_erp_id, u.name AS tg_name,
            d.year, d.label AS division, COUNT(ts.student_erp_id) AS student_count
     FROM tg_groups tg
     INNER JOIN users u ON tg.tg_erp_id = u.erp_id
     INNER JOIN divisions d ON tg.division_id = d.id
     LEFT JOIN tg_students ts ON tg.id = ts.tg_group_id
     WHERE d.dept_id = ?
     GROUP BY tg.id`,
    [req.user.dept_id]
  );

  res.json({ subject_assignments: subjects, class_incharges: ci, tg_groups: tg });
});

// ─── PUT /roles/assignment/:id ────────────────────────────────────────────────
// Update a subject assignment (change teacher, subject, division, type)
router.put(
  "/assignment/:id",
  validate(UpdateSubjectAssignmentSchema),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const updates = req.body as UpdateSubjectAssignmentSchema;

    // Verify assignment belongs to HOD's department
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT sa.id FROM subject_assignments sa
       INNER JOIN divisions d ON sa.division_id = d.id
       WHERE sa.id = ? AND d.dept_id = ?`,
      [id, req.user.dept_id]
    );
    if (existing.length === 0) {
      res.status(404).json({ error: "Assignment not found in your department" });
      return;
    }

    // If changing teacher, verify new teacher is in HOD's dept
    if (updates.teacher_erp_id) {
      const [t] = await pool.execute<RowDataPacket[]>(
        "SELECT erp_id FROM users WHERE erp_id = ? AND dept_id = ? AND base_role = 'EMPLOYEE'",
        [updates.teacher_erp_id, req.user.dept_id]
      );
      if (t.length === 0) {
        res.status(404).json({ error: "Teacher not found in your department" });
        return;
      }
    }

    // If changing subject, verify it belongs to dept
    if (updates.subject_id) {
      const [s] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM subjects WHERE id = ? AND dept_id = ?",
        [updates.subject_id, req.user.dept_id]
      );
      if (s.length === 0) {
        res.status(404).json({ error: "Subject not found in your department" });
        return;
      }
    }

    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.teacher_erp_id) { setClauses.push("teacher_erp_id = ?"); params.push(updates.teacher_erp_id); }
    if (updates.subject_id) { setClauses.push("subject_id = ?"); params.push(updates.subject_id); }
    if (updates.division_id) { setClauses.push("division_id = ?"); params.push(updates.division_id); }
    if (updates.type) { setClauses.push("type = ?"); params.push(updates.type); }
    if (updates.batch_label !== undefined) { setClauses.push("batch_label = ?"); params.push(updates.batch_label); }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    params.push(id);
    try {
      await pool.execute(
        `UPDATE subject_assignments SET ${setClauses.join(", ")} WHERE id = ?`,
        params
      );
      res.json({ message: "Assignment updated" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "This assignment already exists" });
        return;
      }
      throw err;
    }
  }
);

// ─── DELETE /roles/assignment/:id ─────────────────────────────────────────────
// Remove a subject assignment
router.delete("/assignment/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT sa.id FROM subject_assignments sa
     INNER JOIN divisions d ON sa.division_id = d.id
     WHERE sa.id = ? AND d.dept_id = ?`,
    [id, req.user.dept_id]
  );
  if (existing.length === 0) {
    res.status(404).json({ error: "Assignment not found in your department" });
    return;
  }

  await pool.execute("DELETE FROM subject_assignments WHERE id = ?", [id]);
  res.json({ message: "Assignment removed" });
});

// ─── PUT /roles/class-incharge/:divisionId ────────────────────────────────────
// Reassign class incharge for a division
router.put("/class-incharge/:divisionId", async (req: Request, res: Response) => {
  const divisionId = Number(req.params.divisionId);
  const { teacher_erp_id } = req.body as { teacher_erp_id: string };

  if (!teacher_erp_id) {
    res.status(400).json({ error: "teacher_erp_id is required" });
    return;
  }

  // Verify division belongs to HOD's dept
  const [div] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM divisions WHERE id = ? AND dept_id = ?",
    [divisionId, req.user.dept_id]
  );
  if (div.length === 0) {
    res.status(404).json({ error: "Division not found in your department" });
    return;
  }

  // Verify teacher belongs to HOD's dept
  const [t] = await pool.execute<RowDataPacket[]>(
    "SELECT erp_id FROM users WHERE erp_id = ? AND dept_id = ? AND base_role = 'EMPLOYEE'",
    [teacher_erp_id, req.user.dept_id]
  );
  if (t.length === 0) {
    res.status(404).json({ error: "Teacher not found in your department" });
    return;
  }

  await pool.execute(
    `INSERT INTO class_incharge (teacher_erp_id, division_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE teacher_erp_id = VALUES(teacher_erp_id)`,
    [teacher_erp_id, divisionId]
  );

  await pool.execute(
    "INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, 'CLASS_INCHARGE', ?)",
    [teacher_erp_id, req.user.dept_id]
  );

  res.json({ message: "Class incharge updated" });
});

// ─── DELETE /roles/class-incharge/:divisionId ─────────────────────────────────
router.delete("/class-incharge/:divisionId", async (req: Request, res: Response) => {
  const divisionId = Number(req.params.divisionId);

  const [div] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM divisions WHERE id = ? AND dept_id = ?",
    [divisionId, req.user.dept_id]
  );
  if (div.length === 0) {
    res.status(404).json({ error: "Division not found in your department" });
    return;
  }

  await pool.execute("DELETE FROM class_incharge WHERE division_id = ?", [divisionId]);
  res.json({ message: "Class incharge removed" });
});

// ─── PUT /roles/employee-role/:erpId ──────────────────────────────────────────
// Change a teacher's employee role
router.put(
  "/employee-role/:erpId",
  validate(UpdateEmployeeRoleSchema),
  async (req: Request, res: Response) => {
    const erpId = req.params.erpId;
    const { role_type } = req.body as UpdateEmployeeRoleSchema;

    // Cannot assign HOD / ADMIN / SUPER_ADMIN via this route
    if (["HOD", "ADMIN", "SUPER_ADMIN"].includes(role_type)) {
      res.status(403).json({ error: "Cannot assign privileged roles via this route" });
      return;
    }

    // Verify teacher belongs to HOD's dept
    const [t] = await pool.execute<RowDataPacket[]>(
      "SELECT erp_id FROM users WHERE erp_id = ? AND dept_id = ? AND base_role = 'EMPLOYEE'",
      [erpId, req.user.dept_id]
    );
    if (t.length === 0) {
      res.status(404).json({ error: "Teacher not found in your department" });
      return;
    }

    try {
      await pool.execute(
        "INSERT INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_type = VALUES(role_type)",
        [erpId, role_type, req.user.dept_id]
      );
      res.json({ message: "Employee role updated" });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "This role assignment already exists" });
        return;
      }
      throw err;
    }
  }
);

// ─── DELETE /roles/employee-role/:erpId/:roleType ─────────────────────────────
router.delete("/employee-role/:erpId/:roleType", async (req: Request, res: Response) => {
  const erpId = req.params.erpId;
  const roleType = req.params.roleType as string;

  if (["HOD", "ADMIN", "SUPER_ADMIN"].includes(roleType)) {
    res.status(403).json({ error: "Cannot remove privileged roles via this route" });
    return;
  }

  const [t] = await pool.execute<RowDataPacket[]>(
    "SELECT erp_id FROM users WHERE erp_id = ? AND dept_id = ? AND base_role = 'EMPLOYEE'",
    [erpId, req.user.dept_id]
  );
  if (t.length === 0) {
    res.status(404).json({ error: "Teacher not found in your department" });
    return;
  }

  await pool.execute(
    "DELETE FROM employee_roles WHERE erp_id = ? AND role_type = ? AND dept_id = ?",
    [erpId, roleType, req.user.dept_id]
  );
  res.json({ message: "Role removed" });
});

// ─── POST /roles/bulk-reassign ────────────────────────────────────────────────
// Semester reset: clear all subject assignments for a division and reassign
router.post(
  "/bulk-reassign",
  validate(BulkReassignSchema),
  async (req: Request, res: Response) => {
    const { division_id, assignments } = req.body as BulkReassignSchema;

    // Verify division belongs to HOD's dept
    const [div] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM divisions WHERE id = ? AND dept_id = ?",
      [division_id, req.user.dept_id]
    );
    if (div.length === 0) {
      res.status(404).json({ error: "Division not found in your department" });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Remove all current subject assignments for the division
      await conn.execute(
        "DELETE FROM subject_assignments WHERE division_id = ?",
        [division_id]
      );

      // Insert new assignments
      for (const a of assignments) {
        // Verify teacher is in dept
        const [t] = await conn.execute<RowDataPacket[]>(
          "SELECT erp_id FROM users WHERE erp_id = ? AND dept_id = ? AND base_role = 'EMPLOYEE'",
          [a.teacher_erp_id, req.user.dept_id]
        );
        if (t.length === 0) {
          await conn.rollback();
          res.status(404).json({ error: `Teacher ${a.teacher_erp_id} not found in your department` });
          return;
        }

        await conn.execute(
          `INSERT INTO subject_assignments (teacher_erp_id, subject_id, division_id, type, batch_label)
           VALUES (?, ?, ?, ?, ?)`,
          [a.teacher_erp_id, a.subject_id, division_id, a.type, a.batch_label || null]
        );

        const roleType = a.type === "PRACTICAL" ? "PRACTICAL_TEACHER" : "SUBJECT_TEACHER";
        await conn.execute(
          "INSERT IGNORE INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, ?, ?)",
          [a.teacher_erp_id, roleType, req.user.dept_id]
        );
      }

      await conn.commit();
      res.json({ message: "Bulk reassignment complete", count: assignments.length });
    } catch (err: any) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "Duplicate assignment in the request" });
        return;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
);

export default router;
