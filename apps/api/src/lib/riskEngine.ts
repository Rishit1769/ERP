import pool from "../db/pool";
import type { RowDataPacket } from "mysql2";

/**
 * Risk engine: evaluates a student against admin-defined thresholds
 * and inserts risk_events if breach detected.
 */
export async function evaluateAttendanceRisk(studentErpId: string, subjectId?: number) {
  // Get applicable threshold
  const [studentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT dept_id FROM users WHERE erp_id = ?",
    [studentErpId]
  );
  if (studentRows.length === 0) return;
  const deptId = studentRows[0].dept_id;

  const [thresholdRows] = await pool.execute<RowDataPacket[]>(
    `SELECT value FROM admin_thresholds
     WHERE type = 'ATTENDANCE' AND (dept_id = ? OR dept_id IS NULL)
     ORDER BY dept_id DESC LIMIT 1`,
    [deptId]
  );
  const threshold = thresholdRows.length > 0 ? Number(thresholdRows[0].value) : 75;

  // Calculate current attendance %
  let query: string;
  let params: any[];

  if (subjectId) {
    query = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('PRESENT','OD') THEN 1 ELSE 0 END) AS present
      FROM attendance a
      INNER JOIN subject_assignments sa ON a.subject_assignment_id = sa.id
      WHERE a.student_erp_id = ? AND sa.subject_id = ?`;
    params = [studentErpId, subjectId];
  } else {
    query = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('PRESENT','OD') THEN 1 ELSE 0 END) AS present
      FROM attendance
      WHERE student_erp_id = ?`;
    params = [studentErpId];
  }

  const [attRows] = await pool.execute<RowDataPacket[]>(query, params);
  const { total, present } = attRows[0];
  if (!total || total === 0) return;

  const percentage = (present / total) * 100;

  if (percentage < threshold) {
    // Check if unresolved event already exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM risk_events
       WHERE student_erp_id = ? AND rule_type = 'ATTENDANCE'
         AND subject_id <=> ? AND resolved_at IS NULL`,
      [studentErpId, subjectId || null]
    );

    if (existing.length === 0) {
      await pool.execute(
        `INSERT INTO risk_events (student_erp_id, rule_type, triggered_value, threshold_value, subject_id)
         VALUES (?, 'ATTENDANCE', ?, ?, ?)`,
        [studentErpId, percentage.toFixed(2), threshold, subjectId || null]
      );
    }
  } else {
    // Resolve if previously breached
    await pool.execute(
      `UPDATE risk_events SET resolved_at = NOW()
       WHERE student_erp_id = ? AND rule_type = 'ATTENDANCE'
         AND subject_id <=> ? AND resolved_at IS NULL`,
      [studentErpId, subjectId || null]
    );
  }
}

export async function evaluateMarksRisk(studentErpId: string, subjectId: number) {
  const [studentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT dept_id FROM users WHERE erp_id = ?",
    [studentErpId]
  );
  if (studentRows.length === 0) return;
  const deptId = studentRows[0].dept_id;

  const [thresholdRows] = await pool.execute<RowDataPacket[]>(
    `SELECT value FROM admin_thresholds
     WHERE type = 'PASSING_MARKS' AND (dept_id = ? OR dept_id IS NULL)
     ORDER BY dept_id DESC LIMIT 1`,
    [deptId]
  );
  const threshold = thresholdRows.length > 0 ? Number(thresholdRows[0].value) : 40;

  // Get latest theory marks percentage
  const [marksRows] = await pool.execute<RowDataPacket[]>(
    `SELECT marks, max_marks FROM marks_theory
     WHERE student_erp_id = ? AND subject_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [studentErpId, subjectId]
  );

  if (marksRows.length === 0) return;

  const pct = (Number(marksRows[0].marks) / Number(marksRows[0].max_marks)) * 100;

  if (pct < threshold) {
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM risk_events
       WHERE student_erp_id = ? AND rule_type = 'MARKS' AND subject_id = ? AND resolved_at IS NULL`,
      [studentErpId, subjectId]
    );

    if (existing.length === 0) {
      await pool.execute(
        `INSERT INTO risk_events (student_erp_id, rule_type, triggered_value, threshold_value, subject_id)
         VALUES (?, 'MARKS', ?, ?, ?)`,
        [studentErpId, pct.toFixed(2), threshold, subjectId]
      );
    }
  } else {
    await pool.execute(
      `UPDATE risk_events SET resolved_at = NOW()
       WHERE student_erp_id = ? AND rule_type = 'MARKS' AND subject_id = ? AND resolved_at IS NULL`,
      [studentErpId, subjectId]
    );
  }
}
