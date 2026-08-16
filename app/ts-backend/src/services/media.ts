import { Storage } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import { env } from "../db";

type ServiceAccountCredentials = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let storageSingleton: Storage | null = null;

function parseCredentials(): ServiceAccountCredentials | null {
  const rawJson = env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  const rawB64 = env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64?.trim();
  const decoded = rawJson
    ? rawJson
    : rawB64
      ? Buffer.from(rawB64, "base64").toString("utf8")
      : null;

  if (!decoded) return null;

  const parsed = JSON.parse(decoded) as Partial<ServiceAccountCredentials>;

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Google Cloud credentials are incomplete.");
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key
  };
}

function getStorage() {
  if (!storageSingleton) {
    const credentials = parseCredentials();
    storageSingleton = credentials
      ? new Storage({
          projectId: credentials.project_id,
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key
          }
        })
      : new Storage({ projectId: env.GCP_PROJECT_ID });
  }

  return storageSingleton;
}

function getBucketName() {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error("Missing GCS_BUCKET_NAME.");
  }

  return env.GCS_BUCKET_NAME;
}

export function buildLessonAssetPath(parts: {
  profileId: string;
  nodeId: string;
  languageCode: string;
  kind: "image" | "audio";
  content: string;
  extension: string;
}) {
  const digest = createHash("sha1").update(parts.content).digest("hex").slice(0, 12);
  return `lessons/${parts.profileId}/${parts.nodeId}/${parts.languageCode}/${parts.kind}-${digest}.${parts.extension}`;
}

export async function uploadLessonAsset(input: {
  objectPath: string;
  contentType: string;
  data: string | Uint8Array;
}) {
  const bucket = getStorage().bucket(getBucketName());
  const file = bucket.file(input.objectPath);

  await file.save(input.data, {
    contentType: input.contentType,
    resumable: false,
    validation: false,
    metadata: {
      cacheControl: "private, max-age=31536000, immutable"
    }
  });

  return {
    bucket: getBucketName(),
    objectPath: input.objectPath
  };
}

export async function uploadFromUrl(input: {
  objectPath: string;
  contentType: string;
  sourceUrl: string;
}) {
  const response = await fetch(input.sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to download generated media from ${input.sourceUrl}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return uploadLessonAsset({
    objectPath: input.objectPath,
    contentType: input.contentType,
    data: bytes
  });
}

export async function getSignedLessonAssetUrl(objectPath: string, expiresInMinutes = 60) {
  const bucket = getStorage().bucket(getBucketName());
  const file = bucket.file(objectPath);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000
  });

  return url;
}

export async function getSignedPrivateUploadUrl(input: {
  objectPath: string;
  contentType: string;
  expiresInMinutes?: number;
}) {
  const [url] = await getStorage().bucket(getBucketName()).file(input.objectPath).getSignedUrl({
    version: "v4",
    action: "write",
    contentType: input.contentType,
    expires: Date.now() + (input.expiresInMinutes ?? 30) * 60 * 1000
  });
  return url;
}

export async function getPrivateFileMetadata(objectPath: string) {
  const file = getStorage().bucket(getBucketName()).file(objectPath);
  const [exists] = await file.exists();
  if (!exists) throw new Error("An uploaded file could not be found in storage.");
  const [metadata] = await file.getMetadata();
  return {
    size: Number(metadata.size ?? 0),
    contentType: metadata.contentType ?? "application/octet-stream"
  };
}

export async function uploadPrivateFile(input: {
  objectPath: string;
  contentType: string;
  data: Uint8Array;
}) {
  return uploadLessonAsset(input);
}

export async function downloadPrivateFile(objectPath: string) {
  const bucket = getStorage().bucket(getBucketName());
  const [bytes] = await bucket.file(objectPath).download();
  return new Uint8Array(bytes);
}

export async function downloadPrivateFileRange(
  objectPath: string,
  start: number,
  end: number,
) {
  const bucket = getStorage().bucket(getBucketName());
  const [bytes] = await bucket.file(objectPath).download({ start, end });
  return new Uint8Array(bytes);
}

export async function deletePrivateFile(objectPath: string) {
  const bucket = getStorage().bucket(getBucketName());
  await bucket.file(objectPath).delete({ ignoreNotFound: true });
}

export async function deletePrivateFilesByPrefix(prefix: string) {
  const normalized = prefix.trim().replace(/^\/+/, "");
  if (!normalized || !normalized.endsWith("/")) {
    throw new Error("A storage folder prefix is required.");
  }
  await getStorage().bucket(getBucketName()).deleteFiles({ prefix: normalized });
}
