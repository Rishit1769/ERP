import * as Minio from "minio";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "",
  secretKey: process.env.MINIO_SECRET_KEY || "",
});

const BUCKET = process.env.MINIO_BUCKET || "cloudcampus";
const NOTICES_BUCKET = process.env.MINIO_NOTICES_BUCKET || "notices";
const NOTES_BUCKET = process.env.MINIO_NOTES_BUCKET || "notes";

async function ensureOne(name: string) {
  const exists = await minioClient.bucketExists(name);
  if (!exists) {
    await minioClient.makeBucket(name, "");
    console.log(`[minio] Created bucket: ${name}`);
  }
}

export async function ensureBucket() {
  await ensureOne(BUCKET);
  await ensureOne(NOTICES_BUCKET);
  await ensureOne(NOTES_BUCKET);
}

// ── General (materials/results) ───────────────────────────────────────────────
export function getPresignedPutUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedPutObject(BUCKET, objectPath, expiry);
}

export function getPresignedGetUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, objectPath, expiry);
}

// ── Notices bucket ────────────────────────────────────────────────────────────
export function getNoticesPutUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedPutObject(NOTICES_BUCKET, objectPath, expiry);
}

export function getNoticesGetUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedGetObject(NOTICES_BUCKET, objectPath, expiry);
}

// ── Notes bucket ──────────────────────────────────────────────────────────────
export function getNotesPutUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedPutObject(NOTES_BUCKET, objectPath, expiry);
}

export function getNotesGetUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedGetObject(NOTES_BUCKET, objectPath, expiry);
}

export default minioClient;
