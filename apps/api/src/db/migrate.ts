import fs from "fs";
import path from "path";
import type { RowDataPacket } from "mysql2";
import pool from "./pool";

async function runMigrations() {
  const migrationsDir = path.join(__dirname, "migrations");
  const conn = await pool.getConnection();

  try {
    // Ensure tracking table exists
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename VARCHAR(255) PRIMARY KEY,
        ran_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const [rows] = await conn.execute<RowDataPacket[]>(
        "SELECT filename FROM _migrations WHERE filename = ?",
        [file]
      );

      if (rows.length > 0) {
        console.log(`[migrate] Skipping ${file} (already ran)`);
        continue;
      }

      console.log(`[migrate] Running ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

      // Split on semicolons to run multiple statements
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await conn.beginTransaction();
      try {
        for (const stmt of statements) {
          await conn.execute(stmt);
        }
        await conn.execute("INSERT INTO _migrations (filename) VALUES (?)", [file]);
        await conn.commit();
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        await conn.rollback();
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    console.log("[migrate] All migrations complete.");
  } finally {
    conn.release();
  }
}

export default runMigrations;

// Allow running directly: npx tsx src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
