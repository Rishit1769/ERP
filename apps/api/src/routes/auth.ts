import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import pool from "../db/pool";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import {
  LoginSchema,
  ChangePasswordSchema,
  type BaseRole,
} from "@cloudcampus/shared";
import type { RowDataPacket } from "mysql2";

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", validate(LoginSchema), async (req: Request, res: Response) => {
  const { identifier, password } = req.body as LoginSchema;

  // Determine whether the user entered an email or a UID
  const isEmail = identifier.includes("@");

  const [rows] = await pool.execute<RowDataPacket[]>(
    isEmail
      ? "SELECT erp_id, email, password_hash, base_role, dept_id, must_change_password, is_active FROM users WHERE email = ?"
      : "SELECT erp_id, email, password_hash, base_role, dept_id, must_change_password, is_active FROM users WHERE erp_id = ?",
    [isEmail ? identifier.toLowerCase() : identifier]
  );

  const user = rows[0];
  if (!user) {
    // Constant-time response to prevent user enumeration
    await bcrypt.compare(password, "$2b$12$invalidhashinvalidhashinvalidhash");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Enforce institutional email domain
  const email = (user.email as string || "").toLowerCase();
  if (!email.endsWith("@tcetmumbai.in")) {
    res.status(403).json({ error: "Only @tcetmumbai.in accounts are allowed to login" });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: "Account deactivated" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const scope = user.must_change_password ? "restricted" : "full";

  const accessToken = signAccessToken({
    erp_id: user.erp_id as string,
    base_role: user.base_role as BaseRole,
    dept_id: user.dept_id as number | null,
    scope,
  });

  const refreshToken = signRefreshToken(user.erp_id as string);
  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.execute(
    "INSERT INTO refresh_tokens (erp_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [user.erp_id, tokenHash, expiresAt]
  );

  res
    .cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 })
    .cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({
      erp_id: user.erp_id,
      base_role: user.base_role,
      dept_id: user.dept_id,
      scope,
      must_change_password: Boolean(user.must_change_password),
    });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  let payload: { erp_id: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW()",
    [tokenHash]
  );

  if (rows.length === 0) {
    res.status(401).json({ error: "Refresh token revoked or expired" });
    return;
  }

  // Rotate refresh token
  await pool.execute("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?", [tokenHash]);

  const [userRows] = await pool.execute<RowDataPacket[]>(
    "SELECT erp_id, base_role, dept_id, must_change_password FROM users WHERE erp_id = ? AND is_active = 1",
    [payload.erp_id]
  );

  const user = userRows[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const scope = user.must_change_password ? "restricted" : "full";
  const newAccessToken = signAccessToken({
    erp_id: user.erp_id as string,
    base_role: user.base_role as BaseRole,
    dept_id: user.dept_id as number | null,
    scope,
  });

  const newRefreshToken = signRefreshToken(user.erp_id as string);
  const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.execute(
    "INSERT INTO refresh_tokens (erp_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [user.erp_id, newTokenHash, expiresAt]
  );

  res
    .cookie("access_token", newAccessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 })
    .cookie("refresh_token", newRefreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({ scope });
});

// ─── POST /auth/change-password ───────────────────────────────────────────────
router.post(
  "/change-password",
  authenticate,
  validate(ChangePasswordSchema),
  async (req: Request, res: Response) => {
    const { new_password } = req.body as ChangePasswordSchema;
    const erp_id = req.user.erp_id;

    // Block reuse of ERP ID as password
    if (new_password.toLowerCase() === erp_id.toLowerCase()) {
      res.status(400).json({ error: "Password cannot be the same as your ERP ID" });
      return;
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE erp_id = ?",
      [hash, erp_id]
    );

    // Revoke all existing refresh tokens for this user (force re-login with new full scope)
    await pool.execute(
      "UPDATE refresh_tokens SET revoked = 1 WHERE erp_id = ?",
      [erp_id]
    );

    res.clearCookie("access_token").clearCookie("refresh_token").json({
      message: "Password changed successfully. Please log in again.",
    });
  }
);

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token as string | undefined;
  if (token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await pool.execute(
      "UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?",
      [tokenHash]
    );
  }

  res
    .clearCookie("access_token")
    .clearCookie("refresh_token")
    .json({ message: "Logged out" });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.erp_id, u.name, u.email, u.base_role, u.dept_id, d.code AS dept_code, d.name AS dept_name,
            u.must_change_password
     FROM users u
     LEFT JOIN departments d ON u.dept_id = d.id
     WHERE u.erp_id = ?`,
    [req.user.erp_id]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = rows[0];

  // Get employee roles if applicable
  let roles: string[] = [];
  if (user.base_role === "EMPLOYEE") {
    const [roleRows] = await pool.execute<RowDataPacket[]>(
      "SELECT role_type FROM employee_roles WHERE erp_id = ?",
      [req.user.erp_id]
    );
    roles = roleRows.map((r) => r.role_type as string);
  }

  res.json({ ...user, roles, scope: req.user.scope });
});

export default router;
