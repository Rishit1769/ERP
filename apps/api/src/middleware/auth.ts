import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import type { JwtPayload, EmployeeRoleType } from "@cloudcampus/shared";
import pool from "../db/pool";
import type { RowDataPacket } from "mysql2";

// Extend Express Request with the decoded JWT
declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}

// ─── Authenticate ─────────────────────────────────────────────────────────────
// Reads the access token from httpOnly cookie, verifies it, attaches to req.user
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Require Full Scope ───────────────────────────────────────────────────────
// Blocks requests where the user has not yet changed their first-login password
export function requireFullScope(req: Request, res: Response, next: NextFunction) {
  if (req.user.scope !== "full") {
    res.status(403).json({
      error: "PASSWORD_CHANGE_REQUIRED",
      message: "You must change your password before accessing this resource.",
    });
    return;
  }
  next();
}

// ─── Require Role ─────────────────────────────────────────────────────────────
// Checks employee_roles table for the requesting user
export function requireRole(...roles: EmployeeRoleType[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user.base_role === "STUDENT") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT role_type FROM employee_roles WHERE erp_id = ? AND role_type IN (${roles.map(() => "?").join(",")})`,
      [req.user.erp_id, ...roles]
    );

    if (rows.length === 0) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }

    next();
  };
}

// ─── Require Student ──────────────────────────────────────────────────────────
export function requireStudent(req: Request, res: Response, next: NextFunction) {
  if (req.user.base_role !== "STUDENT") {
    res.status(403).json({ error: "Forbidden: students only" });
    return;
  }
  next();
}

// ─── Require Same Dept ────────────────────────────────────────────────────────
// Ensures the authenticated user belongs to the dept_id in the route param
export function requireSameDept(paramKey = "dept_id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const deptId = Number(req.params[paramKey] ?? req.body[paramKey]);
    if (req.user.dept_id !== deptId) {
      res.status(403).json({ error: "Forbidden: cross-department access denied" });
      return;
    }
    next();
  };
}

// ─── Row-Level Security — Subject Assignment ──────────────────────────────────
// Confirms the authenticated teacher owns the given subject_assignment_id
export function requireAssignmentOwnership(paramKey = "assignment_id") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const assignmentId = Number(req.params[paramKey] ?? req.body.slot_id ?? req.body.subject_assignment_id);

    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM subject_assignments WHERE id = ? AND teacher_erp_id = ?",
      [assignmentId, req.user.erp_id]
    );

    if (rows.length === 0) {
      res.status(403).json({ error: "Forbidden: you are not assigned to this class" });
      return;
    }

    next();
  };
}
