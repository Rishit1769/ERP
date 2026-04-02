import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import runMigrations from "./db/migrate";
import { ensureBucket } from "./lib/minio";
import { scheduleWeeklyAttendanceEmail } from "./jobs/weeklyAttendanceEmail";
import { scheduleMissedAttendanceNotifications } from "./jobs/missedAttendanceNotifications";

import authRouter from "./routes/auth";
import importRouter from "./routes/import";
import rolesRouter from "./routes/roles";
import timetableRouter from "./routes/timetable";
import attendanceRouter from "./routes/attendance";
import marksRouter from "./routes/marks";
import grievancesRouter from "./routes/grievances";
import aicteRouter from "./routes/aicte";
import proxyRouter from "./routes/proxy";
import materialsRouter from "./routes/materials";
import adminRouter from "./routes/admin";
import resultsRouter from "./routes/results";
import lessonPlanRouter from "./routes/lessonPlan";
import achievementsRouter from "./routes/achievements";
import notificationsRouter from "./routes/notifications";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/import", importRouter);
app.use("/roles", rolesRouter);
app.use("/timetable", timetableRouter);
app.use("/attendance", attendanceRouter);
app.use("/marks", marksRouter);
app.use("/grievances", grievancesRouter);
app.use("/aicte", aicteRouter);
app.use("/proxy", proxyRouter);
app.use("/materials", materialsRouter);
app.use("/admin", adminRouter);
app.use("/results", resultsRouter);
app.use("/lesson-plan", lessonPlanRouter);
app.use("/achievements", achievementsRouter);
app.use("/notifications", notificationsRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Prevent unhandled async rejections from killing the process ─────────────
// Express 4 does not automatically catch async route errors; if a route
// throws an unhandled promise rejection Node v15+ exits the process.
// This handler logs the error and keeps the server alive.
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Run DB migrations
    await runMigrations();
    console.log("[STARTUP] Migrations complete");

    // Ensure MinIO buckets exist (non-fatal if MinIO is not running)
    try {
      await ensureBucket();
      console.log("[STARTUP] MinIO buckets ready");
    } catch (e) {
      console.warn("[STARTUP] MinIO not available — file uploads will fail until MinIO is running");
    }

    // Schedule cron jobs
    scheduleWeeklyAttendanceEmail();
    scheduleMissedAttendanceNotifications();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[STARTUP] CloudCampus API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("[STARTUP] Failed to start:", err);
    process.exit(1);
  }
}

start();
