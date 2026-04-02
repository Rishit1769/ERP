import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { authenticate, requireFullScope } from "../middleware/auth";
import type { RowDataPacket } from "mysql2";

const router = Router();

router.use(authenticate, requireFullScope);

// ─── GET /notifications ───────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, type, title, body, link, is_read, created_at
     FROM notifications
     WHERE erp_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.erp_id]
  );

  const unread_count = rows.filter((r) => !r.is_read).length;
  res.json({ unread_count, notifications: rows });
});

// ─── PATCH /notifications/read ────────────────────────────────────────────────
// Mark all notifications as read (or specific IDs via body.ids)
router.patch("/read", async (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: number[] };

  if (ids && ids.length > 0) {
    // Validate ids are numbers
    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
    if (validIds.length === 0) {
      res.status(400).json({ error: "No valid IDs provided" });
      return;
    }
    const placeholders = validIds.map(() => "?").join(",");
    await pool.execute(
      `UPDATE notifications SET is_read = 1 WHERE erp_id = ? AND id IN (${placeholders})`,
      [req.user.erp_id, ...validIds]
    );
  } else {
    await pool.execute(
      `UPDATE notifications SET is_read = 1 WHERE erp_id = ?`,
      [req.user.erp_id]
    );
  }

  res.json({ ok: true });
});

export default router;
