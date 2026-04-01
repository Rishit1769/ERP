import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { JwtPayload } from "@cloudcampus/shared";

const ACCESS_SECRET = process.env.JWT_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export function signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(erp_id: string): string {
  return jwt.sign({ erp_id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY, jwtid: crypto.randomUUID() });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { erp_id: string } {
  return jwt.verify(token, REFRESH_SECRET) as { erp_id: string };
}
