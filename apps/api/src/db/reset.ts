/**
 * reset.ts — wipe ALL data and rebuild the schema from setup.sql.
 *
 * Usage (from the api package root):
 *   npx tsx src/db/reset.ts
 *
 * ⚠️  This is DESTRUCTIVE. All tables are dropped and recreated from scratch.
 *     Seed accounts and default thresholds are restored by setup.sql.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import pool from "./pool";

const ALL_TABLES = [
  // leaf tables first (no outgoing FK to other data tables)
  "marks_experiments",
  "lesson_plan_topics",
  "teacher_lesson_plans",
  "syllabus_topics",
  "syllabus_units",
  "syllabus_master",
  "semester_schedule",
  "semester_dates",
  "teacher_achievements",
  "notifications",
  "email_logs",
  "materials",
  "risk_events",
  "mentorship_records",
  "aicte_activities",
  "od_requests",
  "grievances",
  "marks_practical",
  "marks_theory",
  "attendance_overrides",
  "attendance",
  "proxy_assignments",
  "teacher_location_overrides",
  "timetable_slots",
  "practical_experiment_config",
  "tg_students",
  "tg_groups",
  "class_incharge",
  "subject_assignments",
  "subjects",
  "employee_roles",
  "student_details",
  "admin_thresholds",
  "refresh_tokens",
  // parent tables
  "users",
  "divisions",
  "departments",
  // migration tracking
  "_migrations",
];

async function resetDatabase() {
  const conn = await pool.getConnection();
  try {
    console.log("[reset] Disabling FK checks…");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of ALL_TABLES) {
      await conn.execute(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`[reset] Dropped ${table}`);
    }

    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
    console.log("[reset] FK checks re-enabled.");

    // Execute setup.sql to recreate all tables and seed data in one pass.
    // setup.sql lives at the monorepo root (four levels up from this file).
    const setupPath = path.resolve(__dirname, "../../../../setup.sql");
    console.log(`[reset] Reading ${setupPath}…`);
    const sql = fs.readFileSync(setupPath, "utf-8");

    // Strip line comments, split on semicolons, run each statement.
    const stripped = sql
      .split("\n")
      .map((line) => (line.trimStart().startsWith("--") ? "" : line))
      .join("\n");

    const statements = stripped
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`[reset] Executing ${statements.length} statements from setup.sql…`);
    for (const stmt of statements) {
      await conn.query(stmt);
    }

    console.log("[reset] ✓ Database reset complete.");
  } finally {
    conn.release();
  }

  await pool.end();
}

resetDatabase().catch((err) => {
  console.error("[reset] FAILED:", err);
  process.exit(1);
});
