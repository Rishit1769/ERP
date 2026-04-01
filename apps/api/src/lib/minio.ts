import * as Minio from "minio";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "",
  secretKey: process.env.MINIO_SECRET_KEY || "",
});

const BUCKET = process.env.MINIO_BUCKET || "cloudcampus";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, "");
    console.log(`[minio] Created bucket: ${BUCKET}`);
  }
}

export function getPresignedPutUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedPutObject(BUCKET, objectPath, expiry);
}

export function getPresignedGetUrl(objectPath: string, expiry = 3600): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, objectPath, expiry);
}

export default minioClient;
