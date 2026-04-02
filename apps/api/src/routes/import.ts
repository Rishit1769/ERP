import { Router, Request, Response } from "express";
import multer from "multer";
import Papa from "papaparse";
import bcrypt from "bcrypt";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import {
  CsvRowSchema,
  csvRoleToBase,
  csvRoleToEmployeeRole,
  parseStudentUid,
  type CsvRow,
} from "@cloudcampus/shared";
import type { RowDataPacket } from "mysql2";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── POST /import/csv ─────────────────────────────────────────────────────────
// Admin uploads a CSV; backend validates all rows and returns errors or bulk-inserts
router.post(
  "/csv",
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
      res.status(400).json({
        error: "CSV parsing failed",
        parse_errors: parsed.errors.map((e) => ({
          row: e.row,
          message: e.message,
        })),
      });
      return;
    }

    // Load valid department codes for cross-reference
    const [deptRows] = await pool.execute<RowDataPacket[]>("SELECT id, code FROM departments");
    const deptMap = new Map<string, number>(
      deptRows.map((d) => [
        (d.code as string).toUpperCase(),
        d.id as number,
      ])
    );

    // Validate each row
    const errors: Array<{ row: number; errors: Record<string, string>; data: Record<string, string> }> = [];
    const validRows: Array<CsvRow & { _deptId: number }> = [];
    const seenErpIds = new Set<string>();

    for (let i = 0; i < parsed.data.length; i++) {
      const raw = parsed.data[i];
      const rowErrors: Record<string, string> = {};
      const rowNum = i + 2; // 1-indexed + header row

      // Zod validate
      const result = CsvRowSchema.safeParse(raw);
      if (!result.success) {
        const issues = result.error.flatten().fieldErrors;
        for (const [field, msgs] of Object.entries(issues)) {
          rowErrors[field] = (msgs as string[]).join("; ");
        }
      }

      const erpId = (result.success ? result.data.erp_id : raw.erp_id || "").toUpperCase();
      const deptCode = (result.success ? result.data.department : (raw.department || "")).toUpperCase().trim();

      // Cross-reference: erp_id prefix vs role
      if (result.success) {
        const isStudent = result.data.role === "student";
        if (isStudent) {
          if (!/^S[A-Z0-9]+$/i.test(erpId)) {
            rowErrors["erp_id"] = "Student ERP ID must start with 'S' (e.g. S2001)";
          }
          // Validate uid field if provided
          const uid = result.data.uid ?? "";
          if (uid && uid !== "0" && !parseStudentUid(uid)) {
            rowErrors["uid"] = "Student UID format: startYear-DeptDivRoll-endYear (e.g. 2025-COMPSA01-2029)";
          }
          if (uid && uid !== "0") {
            const parsedUid = parseStudentUid(uid);
            if (parsedUid && parsedUid.deptCode !== deptCode) {
              rowErrors["uid"] = `UID dept '${parsedUid.deptCode}' doesn't match CSV dept '${deptCode}'`;
            }
          }
        } else {
          if (!/^E[A-Z0-9]+$/.test(erpId)) {
            rowErrors["erp_id"] = "Employee ID must start with 'E' (e.g. E1001)";
          }
        }
      }

      // Duplicate ERP ID within file
      if (seenErpIds.has(erpId)) {
        rowErrors["erp_id"] = (rowErrors["erp_id"] || "") + " Duplicate ERP ID in file.";
      }
      seenErpIds.add(erpId);

      // Department must exist
      if (deptCode && !deptMap.has(deptCode)) {
        rowErrors["department"] = `Department '${deptCode}' does not exist. Valid: ${[...deptMap.keys()].join(", ")}`;
      }

      if (Object.keys(rowErrors).length > 0) {
        errors.push({ row: rowNum, errors: rowErrors, data: raw });
      } else if (result.success) {
        validRows.push({ ...result.data, _deptId: deptMap.get(deptCode)! });
      }
    }

    // Check for duplicate ERP IDs already in DB — skip them with a warning, don't fail the whole import
    const skippedDuplicates: string[] = [];
    if (validRows.length > 0) {
      const allErpIds = validRows.map((r) => r.erp_id);
      const placeholders = allErpIds.map(() => "?").join(",");
      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT erp_id FROM users WHERE erp_id IN (${placeholders})`,
        allErpIds
      );
      const existingSet = new Set(existing.map((r) => r.erp_id as string));

      for (let i = validRows.length - 1; i >= 0; i--) {
        if (existingSet.has(validRows[i].erp_id)) {
          skippedDuplicates.push(validRows[i].erp_id);
          validRows.splice(i, 1);
        }
      }
    }

    // If there are validation errors (not just duplicates), reject the whole upload
    if (errors.length > 0) {
      const allRows = parsed.data.map((raw, i) => {
        const rowNum = i + 2;
        const err = errors.find((e) => e.row === rowNum);
        return {
          _rowIndex: i,
          ...raw,
          _errors: err ? err.errors : undefined,
          _valid: !err,
        };
      });

      res.status(422).json({
        error: "Validation failed for one or more rows",
        total: parsed.data.length,
        error_count: errors.length,
        rows: allRows,
      });
      return;
    }

    if (validRows.length === 0) {
      res.status(422).json({
        error: "No new rows to import — all ERP IDs already exist in the system",
        skipped: skippedDuplicates,
      });
      return;
    }

    // All remaining rows valid — bulk insert in a single transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Indian academic year starts in June; before June we are still in
      // the previous academic year (e.g. March 2026 → AY 2025-26 → year 2).
      const now = new Date();
      const academicYearStart =
        now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;

      // All imported users get the default password: Password@123
      const defaultHash = await bcrypt.hash("Password@123", 12);

      let noDivisionCount = 0;

      for (const row of validRows) {
        const baseRole = csvRoleToBase[row.role];

        await conn.execute(
          `INSERT INTO users (erp_id, uid, name, email, phone, dept_id, base_role, password_hash, must_change_password)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [row.erp_id, row.uid ?? (baseRole === "EMPLOYEE" ? "0" : null), row.name, row.email, row.phone, row._deptId, baseRole, defaultHash]
        );

        // Insert employee role if applicable
        const empRole = csvRoleToEmployeeRole[row.role];
        if (empRole) {
          await conn.execute(
            "INSERT INTO employee_roles (erp_id, role_type, dept_id) VALUES (?, ?, ?)",
            [row.erp_id, empRole, row._deptId]
          );
        }

        // Link student to an existing division using the uid field (or erp_id if old format)
        if (baseRole === "STUDENT") {
          // Use uid field if provided, else try erp_id (backward compat with old UID-as-erp_id)
          const uidStr = row.uid && row.uid !== "0" ? row.uid : row.erp_id;
          const uid = parseStudentUid(uidStr);
          if (uid) {
            const year = Math.min(
              Math.max(academicYearStart - uid.startYear + 1, 1),
              uid.endYear - uid.startYear
            );
            const semester = row.semester && row.semester > 0 ? row.semester : year * 2 - 1;
            const [divRows] = await conn.execute<RowDataPacket[]>(
              "SELECT id FROM divisions WHERE dept_id = ? AND year = ? AND label = ?",
              [row._deptId, row.year > 0 ? row.year : year, uid.divisionLabel] as any
            );
            if (divRows.length > 0) {
              await conn.execute(
                "INSERT INTO student_details (erp_id, division_id, roll_no, semester, parent_phone) VALUES (?, ?, ?, ?, ?)",
                [row.erp_id, divRows[0].id, uid.rollNo, semester, row.phone]
              );
            } else {
              noDivisionCount++;
            }
          }
        }
      }

      await conn.commit();

      res.json({
        message: "Import successful",
        imported: validRows.length,
        students: validRows.filter((r) => r.role === "student").length,
        employees: validRows.filter((r) => r.role !== "student").length,
        skipped_duplicates: skippedDuplicates.length,
        skipped_erp_ids: skippedDuplicates,
        students_without_division: noDivisionCount,
        student_mappings: validRows
          .filter((r) => r.role === "student")
          .map((r) => {
            const uidStr = r.uid && r.uid !== "0" ? r.uid : r.erp_id;
            const uid = parseStudentUid(uidStr);
            const derivedYear = uid
              ? Math.min(
                  Math.max(academicYearStart - uid.startYear + 1, 1),
                  uid.endYear - uid.startYear
                )
              : null;
            return {
              erp_id: r.erp_id,
              dept: r.department,
              division: uid?.divisionLabel ?? "?",
              roll_no: uid?.rollNo ?? "?",
              year: derivedYear,
            };
          }),
      });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({
        error: "Import transaction failed",
        message: (err as Error).message,
      });
    } finally {
      conn.release();
    }
  }
);

// ─── POST /import/validate ────────────────────────────────────────────────────
// Revalidate corrected rows sent from the inline table (JSON body, not CSV)
router.post(
  "/validate",
  authenticate,
  requireFullScope,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "Rows array is required" });
      return;
    }

    const [deptRows] = await pool.execute<RowDataPacket[]>("SELECT id, code FROM departments");
    const deptMap = new Map<string, number>(
      deptRows.map((d) => [(d.code as string).toUpperCase(), d.id as number])
    );

    const seenErpIds = new Set<string>();
    const results = rows.map((raw, i) => {
      const rowErrors: Record<string, string> = {};
      const result = CsvRowSchema.safeParse(raw);

      if (!result.success) {
        const issues = result.error.flatten().fieldErrors;
        for (const [field, msgs] of Object.entries(issues)) {
          rowErrors[field] = (msgs as string[]).join("; ");
        }
      }

      const erpId = (result.success ? result.data.erp_id : raw.erp_id || "").toUpperCase();
      if (seenErpIds.has(erpId) && erpId) {
        rowErrors["erp_id"] = "Duplicate ERP ID";
      }
      seenErpIds.add(erpId);

      const deptCode = (result.success ? result.data.department : (raw.department || "")).toUpperCase().trim();
      if (deptCode && !deptMap.has(deptCode)) {
        rowErrors["department"] = `Unknown department '${deptCode}'`;
      }

      return {
        _rowIndex: i,
        ...raw,
        _errors: Object.keys(rowErrors).length > 0 ? rowErrors : undefined,
        _valid: Object.keys(rowErrors).length === 0,
      };
    });

    res.json({ rows: results, error_count: results.filter((r) => !r._valid).length });
  }
);

export default router;
