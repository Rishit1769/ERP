import { Router, Request, Response } from "express";
import multer from "multer";
import Papa from "papaparse";
import pool from "../db/pool";
import { authenticate, requireFullScope, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { TimetableSlotSchema, LocationOverrideSchema } from "@cloudcampus/shared";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/** Returns the ISO date strings for MON–SAT of the current week */
function getWeekDates(): Array<{ day: string; date: string }> {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun … 6=Sat
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { day, date: d.toISOString().split("T")[0] };
  });
}

const router = Router();

// ─── POST /timetable/slots ────────────────────────────────────────────────────
router.post(
  "/slots",
  authenticate,
  requireFullScope,
  requireRole("HOD", "ADMIN"),
  validate(TimetableSlotSchema),
  async (req: Request, res: Response) => {
    const { subject_assignment_id, day, start_time, end_time, room } = req.body as TimetableSlotSchema;

    // Check room conflicts
    const [conflicts] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM timetable_slots
       WHERE room = ? AND day = ?
         AND start_time < ? AND end_time > ?`,
      [room, day, end_time, start_time]
    );

    if (conflicts.length > 0) {
      res.status(409).json({
        error: "Room conflict",
        message: `Room ${room} is already booked on ${day} during that time slice`,
        conflicting_slot_ids: conflicts.map((c) => c.id),
      });
      return;
    }

    // Check teacher conflicts (same teacher, overlapping time)
    const [teacherConflicts] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.id
       FROM timetable_slots ts
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       INNER JOIN subject_assignments sa2 ON sa2.id = ?
       WHERE sa.teacher_erp_id = sa2.teacher_erp_id
         AND ts.day = ?
         AND ts.start_time < ? AND ts.end_time > ?`,
      [subject_assignment_id, day, end_time, start_time]
    );

    if (teacherConflicts.length > 0) {
      res.status(409).json({
        error: "Teacher conflict",
        message: "Teacher already has a slot at this time",
      });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO timetable_slots (subject_assignment_id, day, start_time, end_time, room)
       VALUES (?, ?, ?, ?, ?)`,
      [subject_assignment_id, day, start_time, end_time, room]
    );

    res.status(201).json({ id: result.insertId, message: "Slot created" });
  }
);

// ─── GET /timetable/division/:divisionId ──────────────────────────────────────
router.get(
  "/division/:divisionId",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.room,
              s.code AS subject_code, s.name AS subject_name,
              sa.type, sa.batch_label,
              u.name AS teacher_name, sa.teacher_erp_id
       FROM timetable_slots ts
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN users u ON sa.teacher_erp_id = u.erp_id
       WHERE sa.division_id = ?
       ORDER BY FIELD(ts.day,'MON','TUE','WED','THU','FRI','SAT'), ts.start_time`,
      [req.params.divisionId]
    );
    res.json(rows);
  }
);

// ─── GET /timetable/teacher/:erpId ────────────────────────────────────────────
router.get(
  "/teacher/:erpId",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.room,
              s.code AS subject_code, s.name AS subject_name,
              d.year, d.label AS division
       FROM timetable_slots ts
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       INNER JOIN subjects s ON sa.subject_id = s.id
       INNER JOIN divisions d ON sa.division_id = d.id
       WHERE sa.teacher_erp_id = ?
       ORDER BY FIELD(ts.day,'MON','TUE','WED','THU','FRI','SAT'), ts.start_time`,
      [req.params.erpId]
    );
    res.json(rows);
  }
);

// ─── POST /timetable/location-override ────────────────────────────────────────
// Teacher overrides their current location
router.post(
  "/location-override",
  authenticate,
  requireFullScope,
  validate(LocationOverrideSchema),
  async (req: Request, res: Response) => {
    const { room } = req.body as LocationOverrideSchema;

    // Get current slot's end_time for expiry, or default to 1 hour from now
    const now = new Date();
    const dayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];
    const currentTime = now.toTimeString().slice(0, 5);

    const [slots] = await pool.execute<RowDataPacket[]>(
      `SELECT ts.end_time
       FROM timetable_slots ts
       INNER JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
       WHERE sa.teacher_erp_id = ? AND ts.day = ?
         AND ts.start_time <= ? AND ts.end_time > ?
       LIMIT 1`,
      [req.user.erp_id, dayName, currentTime, currentTime]
    );

    const expiresAt = slots.length > 0
      ? new Date(`${now.toISOString().split("T")[0]}T${slots[0].end_time}`)
      : new Date(now.getTime() + 60 * 60 * 1000);

    await pool.execute(
      `INSERT INTO teacher_location_overrides (erp_id, room, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE room = VALUES(room), expires_at = VALUES(expires_at)`,
      [req.user.erp_id, room, expiresAt]
    );

    res.json({ message: "Location updated", room, expires_at: expiresAt });
  }
);

// ─── GET /timetable/faculty-locator (SSE) ──────────────────────────────────────
// Real-time teacher location stream for students
router.get(
  "/faculty-locator",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendLocations = async () => {
      const now = new Date();
      const dayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];
      const currentTime = now.toTimeString().slice(0, 5);

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.erp_id, u.name,
                ANY_VALUE(COALESCE(
                  IF(ANY_VALUE(tlo.expires_at) > NOW(), ANY_VALUE(tlo.room), NULL),
                  ANY_VALUE(ts.room)
                )) AS current_room,
                ANY_VALUE(ts.start_time) AS start_time,
                ANY_VALUE(ts.end_time) AS end_time,
                ANY_VALUE(s.name) AS subject_name,
                ANY_VALUE(IF(tlo.expires_at > NOW(), 1, 0)) AS is_override,
                ANY_VALUE(ns.room) AS next_room,
                ANY_VALUE(ns.start_time) AS next_start,
                ANY_VALUE(ns.end_time) AS next_end,
                ANY_VALUE(ns_sub.name) AS next_subject
         FROM users u
         LEFT JOIN subject_assignments sa ON sa.teacher_erp_id = u.erp_id
         LEFT JOIN timetable_slots ts ON ts.subject_assignment_id = sa.id
           AND ts.day = ? AND ts.start_time <= ? AND ts.end_time > ?
         LEFT JOIN subjects s ON sa.subject_id = s.id
         LEFT JOIN teacher_location_overrides tlo ON u.erp_id = tlo.erp_id
         LEFT JOIN timetable_slots ns ON ns.subject_assignment_id = sa.id
           AND ns.day = ? AND ns.start_time > ?
         LEFT JOIN subject_assignments ns_sa ON ns.subject_assignment_id = ns_sa.id
         LEFT JOIN subjects ns_sub ON ns_sa.subject_id = ns_sub.id
         WHERE u.base_role = 'EMPLOYEE' AND u.dept_id = ? AND u.is_active = 1
         GROUP BY u.erp_id, u.name
         ORDER BY u.name`,
        [dayName, currentTime, currentTime, dayName, currentTime, req.user.dept_id]
      );

      res.write(`data: ${JSON.stringify(rows)}\n\n`);
    };

    // Send immediately, then every 30s
    try {
      await sendLocations();
    } catch (err) {
      res.write(`data: ${JSON.stringify([])}\n\n`);
    }
    const interval = setInterval(async () => {
      try { await sendLocations(); } catch { /* ignore */ }
    }, 30000);

    req.on("close", () => {
      clearInterval(interval);
    });
  }
);

// ─── DELETE /timetable/slots/:id ──────────────────────────────────────────────
router.delete(
  "/slots/:id",
  authenticate,
  requireFullScope,
  requireRole("HOD", "ADMIN"),
  async (req: Request, res: Response) => {
    await pool.execute("DELETE FROM timetable_slots WHERE id = ?", [req.params.id]);
    res.json({ message: "Slot deleted" });
  }
);

// ─── POST /timetable/import-csv ───────────────────────────────────────────────
// HOD bulk-imports timetable slots from a CSV.
// CSV columns: dept_code,year,division,subject_code,teacher_erp_id,type,batch,day,start_time,end_time,room
// type = THEORY | PRACTICAL;  batch is optional
router.post(
  "/import-csv",
  authenticate,
  requireFullScope,
  requireRole("HOD", "ADMIN"),
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

    const required = ["dept_code", "year", "division", "subject_code", "teacher_erp_id", "type", "day", "start_time", "end_time", "room"];
    const headers = Object.keys(parsed.data[0] ?? {});
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      res.status(400).json({ error: "Missing CSV columns", missing });
      return;
    }

    const validDays = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
    const validTypes = new Set(["THEORY", "PRACTICAL"]);

    let inserted = 0;
    const skipped: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNum = i + 2; // 1-based + header

      const dept_code   = (row.dept_code ?? "").trim().toUpperCase();
      const year        = parseInt(row.year ?? "");
      const divLabel    = (row.division ?? "").trim().toUpperCase();
      const subjectCode = (row.subject_code ?? "").trim().toUpperCase();
      const teacherErp  = (row.teacher_erp_id ?? "").trim();
      const type        = (row.type ?? "").trim().toUpperCase();
      const batch       = (row.batch ?? "").trim() || null;
      const day         = (row.day ?? "").trim().toUpperCase();
      const startTime   = (row.start_time ?? "").trim();
      const endTime     = (row.end_time ?? "").trim();
      const room        = (row.room ?? "").trim();

      if (!dept_code || !year || !divLabel || !subjectCode || !teacherErp || !day || !startTime || !endTime || !room) {
        errors.push(`Row ${rowNum}: missing required fields`);
        continue;
      }
      if (!validDays.has(day)) {
        errors.push(`Row ${rowNum}: invalid day '${day}'`);
        continue;
      }
      if (!validTypes.has(type)) {
        errors.push(`Row ${rowNum}: invalid type '${type}'`);
        continue;
      }

      try {
        // Look up division
        const [divRows] = await pool.execute<RowDataPacket[]>(
          `SELECT dv.id FROM divisions dv
           JOIN departments dep ON dv.dept_id = dep.id
           WHERE dep.code = ? AND dv.year = ? AND dv.label = ?`,
          [dept_code, year, divLabel]
        );
        if ((divRows as RowDataPacket[]).length === 0) {
          errors.push(`Row ${rowNum}: division not found (${dept_code} Y${year} Div ${divLabel})`);
          continue;
        }
        const divisionId = (divRows as RowDataPacket[])[0].id;

        // Look up subject
        const [subRows] = await pool.execute<RowDataPacket[]>(
          `SELECT s.id FROM subjects s
           JOIN departments dep ON s.dept_id = dep.id
           WHERE s.code = ? AND dep.code = ?`,
          [subjectCode, dept_code]
        );
        if ((subRows as RowDataPacket[]).length === 0) {
          errors.push(`Row ${rowNum}: subject '${subjectCode}' not found in dept '${dept_code}'`);
          continue;
        }
        const subjectId = (subRows as RowDataPacket[])[0].id;

        // Find or create subject_assignment
        const [saRows] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM subject_assignments
           WHERE teacher_erp_id = ? AND subject_id = ? AND division_id = ? AND type = ?
             AND (batch_label = ? OR (batch_label IS NULL AND ? IS NULL))
           LIMIT 1`,
          [teacherErp, subjectId, divisionId, type, batch, batch]
        );

        let saId: number;
        if ((saRows as RowDataPacket[]).length > 0) {
          saId = (saRows as RowDataPacket[])[0].id;
        } else {
          const [saResult] = await pool.execute<ResultSetHeader>(
            `INSERT INTO subject_assignments (teacher_erp_id, subject_id, division_id, type, batch_label)
             VALUES (?, ?, ?, ?, ?)`,
            [teacherErp, subjectId, divisionId, type, batch]
          );
          saId = saResult.insertId;
        }

        // Check room conflict
        const [roomConf] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM timetable_slots
           WHERE room = ? AND day = ? AND start_time < ? AND end_time > ?`,
          [room, day, endTime, startTime]
        );
        if ((roomConf as RowDataPacket[]).length > 0) {
          skipped.push(`Row ${rowNum}: room ${room} conflict on ${day} ${startTime}-${endTime}`);
          continue;
        }

        // Check teacher conflict
        const [teachConf] = await pool.execute<RowDataPacket[]>(
          `SELECT ts.id
           FROM timetable_slots ts
           JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
           WHERE sa.teacher_erp_id = ? AND ts.day = ?
             AND ts.start_time < ? AND ts.end_time > ?`,
          [teacherErp, day, endTime, startTime]
        );
        if ((teachConf as RowDataPacket[]).length > 0) {
          skipped.push(`Row ${rowNum}: teacher ${teacherErp} conflict on ${day} ${startTime}-${endTime}`);
          continue;
        }

        await pool.execute(
          `INSERT INTO timetable_slots (subject_assignment_id, day, start_time, end_time, room)
           VALUES (?, ?, ?, ?, ?)`,
          [saId, day, startTime, endTime, room]
        );
        inserted++;
      } catch (err: any) {
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    res.status(errors.length > 0 && inserted === 0 ? 400 : 201).json({
      message: `Imported ${inserted} slot(s)`,
      inserted,
      skipped: skipped.length,
      errors: errors.length,
      skipped_details: skipped,
      error_details: errors,
    });
  }
);

// ─── GET /timetable/my-week ───────────────────────────────────────────────────
// Returns the current week's slots + semester events for the authenticated user.
// Works for both teachers (EMPLOYEE) and students (STUDENT).
router.get(
  "/my-week",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const { base_role, erp_id, dept_id } = req.user;
    const weekDates = getWeekDates();
    const dateStrings = weekDates.map((w) => w.date);

    // Fetch semester events for the whole week
    const placeholders = dateStrings.map(() => "?").join(",");
    const [events] = await pool.execute<RowDataPacket[]>(
      `SELECT id, event_date, event_type, title, description
       FROM semester_schedule
       WHERE event_date IN (${placeholders})
         AND (dept_id IS NULL OR dept_id = ?)
       ORDER BY event_date`,
      [...dateStrings, dept_id]
    );

    // Group events by date
    const eventsByDate: Record<string, RowDataPacket[]> = {};
    for (const ev of events as RowDataPacket[]) {
      const dateKey = (ev.event_date as Date).toISOString().split("T")[0];
      if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
      eventsByDate[dateKey].push(ev);
    }

    // Fetch timetable slots based on role
    let slots: RowDataPacket[] = [];

    if (base_role === "EMPLOYEE") {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.room,
                s.code AS subject_code, s.name AS subject_name,
                sa.type, sa.batch_label,
                d.year, d.label AS division
         FROM timetable_slots ts
         JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
         JOIN subjects s ON sa.subject_id = s.id
         JOIN divisions d ON sa.division_id = d.id
         WHERE sa.teacher_erp_id = ?
         ORDER BY FIELD(ts.day,'MON','TUE','WED','THU','FRI','SAT'), ts.start_time`,
        [erp_id]
      );
      slots = rows as RowDataPacket[];
    } else {
      // Student: look up their division first
      const [sdRows] = await pool.execute<RowDataPacket[]>(
        "SELECT division_id FROM student_details WHERE erp_id = ? LIMIT 1",
        [erp_id]
      );
      if ((sdRows as RowDataPacket[]).length > 0) {
        const divisionId = (sdRows as RowDataPacket[])[0].division_id;
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.room,
                  s.code AS subject_code, s.name AS subject_name,
                  sa.type, sa.batch_label,
                  u.name AS teacher_name
           FROM timetable_slots ts
           JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
           JOIN subjects s ON sa.subject_id = s.id
           JOIN users u ON sa.teacher_erp_id = u.erp_id
           WHERE sa.division_id = ?
           ORDER BY FIELD(ts.day,'MON','TUE','WED','THU','FRI','SAT'), ts.start_time`,
          [divisionId]
        );
        slots = rows as RowDataPacket[];
      }
    }

    // Group slots by day
    const slotsByDay: Record<string, RowDataPacket[]> = {};
    for (const s of slots) {
      if (!slotsByDay[s.day]) slotsByDay[s.day] = [];
      slotsByDay[s.day].push(s);
    }

    const result = weekDates.map(({ day, date }) => ({
      day,
      date,
      schedule_events: eventsByDate[date] ?? [],
      slots: slotsByDay[day] ?? [],
    }));

    res.json(result);
  }
);

// ─── GET /timetable/my-today ──────────────────────────────────────────────────
// Returns today's slots + any semester events for the authenticated user.
router.get(
  "/my-today",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const { base_role, erp_id, dept_id } = req.user;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayName = dayNames[today.getDay()];

    // Fetch semester events for today
    const [events] = await pool.execute<RowDataPacket[]>(
      `SELECT id, event_date, event_type, title, description
       FROM semester_schedule
       WHERE event_date = ? AND (dept_id IS NULL OR dept_id = ?)`,
      [todayStr, dept_id]
    );

    // Fetch today's timetable slots
    let slots: RowDataPacket[] = [];

    if (base_role === "EMPLOYEE") {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.room,
                s.code AS subject_code, s.name AS subject_name,
                sa.type, sa.batch_label,
                d.year, d.label AS division
         FROM timetable_slots ts
         JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
         JOIN subjects s ON sa.subject_id = s.id
         JOIN divisions d ON sa.division_id = d.id
         WHERE sa.teacher_erp_id = ? AND ts.day = ?
         ORDER BY ts.start_time`,
        [erp_id, dayName]
      );
      slots = rows as RowDataPacket[];
    } else {
      const [sdRows] = await pool.execute<RowDataPacket[]>(
        "SELECT division_id FROM student_details WHERE erp_id = ? LIMIT 1",
        [erp_id]
      );
      if ((sdRows as RowDataPacket[]).length > 0) {
        const divisionId = (sdRows as RowDataPacket[])[0].division_id;
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.room,
                  s.code AS subject_code, s.name AS subject_name,
                  sa.type, sa.batch_label,
                  u.name AS teacher_name
           FROM timetable_slots ts
           JOIN subject_assignments sa ON ts.subject_assignment_id = sa.id
           JOIN subjects s ON sa.subject_id = s.id
           JOIN users u ON sa.teacher_erp_id = u.erp_id
           WHERE sa.division_id = ? AND ts.day = ?
           ORDER BY ts.start_time`,
          [divisionId, dayName]
        );
        slots = rows as RowDataPacket[];
      }
    }

    res.json({
      date: todayStr,
      day: dayName,
      schedule_events: events,
      slots,
    });
  }
);

// ─── GET /timetable/teachers-now ─────────────────────────────────────────────
// Returns all active teachers across the whole college with their current
// location/class (updated on demand; client should poll every ~30 s).
// Available to any authenticated user (students, teachers, HOD, admin).
router.get(
  "/teachers-now",
  authenticate,
  requireFullScope,
  async (req: Request, res: Response) => {
    const now = new Date();
    const dayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];
    const currentTime = now.toTimeString().slice(0, 5);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.erp_id, u.name,
              dep.name AS dept_name, dep.code AS dept_code,
              COALESCE(
                ANY_VALUE(IF(tlo.expires_at > NOW(), tlo.room, NULL)),
                ANY_VALUE(ts.room)
              ) AS current_room,
              ANY_VALUE(s.name)        AS subject_name,
              ANY_VALUE(ts.start_time) AS start_time,
              ANY_VALUE(ts.end_time)   AS end_time,
              IF(MAX(tlo.expires_at) > NOW(), 1, 0) AS is_override
       FROM users u
       INNER JOIN departments dep ON u.dept_id = dep.id
       INNER JOIN employee_roles er ON er.erp_id = u.erp_id
         AND er.role_type IN ('HOD','SUBJECT_TEACHER','PRACTICAL_TEACHER','CLASS_INCHARGE','TEACHER_GUARDIAN')
       LEFT JOIN subject_assignments sa ON sa.teacher_erp_id = u.erp_id
       LEFT JOIN timetable_slots ts
         ON ts.subject_assignment_id = sa.id
         AND ts.day = ? AND ts.start_time <= ? AND ts.end_time > ?
       LEFT JOIN subjects s ON sa.subject_id = s.id
       LEFT JOIN teacher_location_overrides tlo ON u.erp_id = tlo.erp_id
       WHERE u.base_role = 'EMPLOYEE' AND u.is_active = 1
       GROUP BY u.erp_id, u.name, dep.name, dep.code
       ORDER BY dep.code, u.name`,
      [dayName, currentTime, currentTime]
    );

    res.json(rows);
  }
);

export default router;
