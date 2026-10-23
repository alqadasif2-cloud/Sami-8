import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import { firestoreClient, projectId } from './db';

/**
 * Google Cloud Storage Service for Sami App
 * Free Tier limits in Google Cloud: 5GB-months Standard Storage, 5,000 Class A, 50,000 Class B operations.
 */

const bucketName = process.env.GCS_BUCKET_NAME || `${projectId}-media`;

let storageClient: Storage | null = null;
let useCloudStorage = false;

try {
  const options: Record<string, unknown> = { projectId };
  if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
    try {
      const raw = process.env.GCP_SERVICE_ACCOUNT_KEY.trim();
      const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      options.credentials = JSON.parse(jsonStr);
    } catch {}
  }
  storageClient = new Storage(options as any);
  useCloudStorage = true;
} catch (err: any) {
  console.warn('[Sami Storage] Google Cloud Storage client init notice:', err?.message);
  useCloudStorage = false;
}

// Local filesystem directory for persistent file storage
const UPLOADS_DIR = path.resolve('data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface StoredFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  storagePath: string;
  uploaderId: number;
  isCloudStorage: boolean;
  cloudBucket?: string;
  createdAt: number;
}

export async function saveFile(
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  uploaderId: number,
  folder: 'chat_images' | 'chat_files' | 'chat_audio' | 'avatars' = 'chat_files'
): Promise<StoredFile> {
  const now = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileId = `${folder}_${uploaderId}_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const storagePath = `${folder}/${fileId}_${safeName}`;
  const fileSize = buffer.length;

  let fileUrl = `/api/files/${fileId}`;
  let uploadedToGcs = false;

  // 1. Attempt upload to real Google Cloud Storage
  if (useCloudStorage && storageClient) {
    try {
      const bucket = storageClient.bucket(bucketName);
      const file = bucket.file(storagePath);
      await file.save(buffer, {
        contentType: mimeType,
        metadata: {
          uploaderId: String(uploaderId),
          originalName: fileName,
        },
      });
      uploadedToGcs = true;
      console.log(`[Sami Storage] File saved to Google Cloud Storage: gs://${bucketName}/${storagePath}`);
    } catch (err: any) {
      console.warn(`[Sami Storage] Google Cloud Storage write failed (${err?.message}), storing to persistent disk.`);
    }
  }

  // 2. Save to local persistent storage disk (guarantees availability and zero loss)
  const localFilePath = path.join(UPLOADS_DIR, `${fileId}_${safeName}`);
  fs.writeFileSync(localFilePath, buffer);

  const record: StoredFile = {
    id: fileId,
    fileName,
    fileSize,
    fileType: mimeType,
    fileUrl,
    storagePath,
    uploaderId,
    isCloudStorage: uploadedToGcs,
    cloudBucket: uploadedToGcs ? bucketName : undefined,
    createdAt: now,
  };

  // 3. Persist file metadata in Firestore
  if (firestoreClient) {
    try {
      await firestoreClient.collection('files').doc(fileId).set(record);
    } catch (err: any) {
      console.warn('[Sami Storage] Firestore file metadata write notice:', err.message);
    }
  }

  return record;
}

export async function getFile(fileId: string): Promise<{ file: StoredFile; buffer: Buffer } | null> {
  let fileRecord: StoredFile | null = null;

  // 1. Try reading metadata from Firestore
  if (firestoreClient) {
    try {
      const doc = await firestoreClient.collection('files').doc(fileId).get();
      if (doc.exists) {
        fileRecord = doc.data() as StoredFile;
      }
    } catch {}
  }

  // 2. If stored in Google Cloud Storage, attempt streaming from GCS
  if (fileRecord?.isCloudStorage && fileRecord.cloudBucket && storageClient) {
    try {
      const bucket = storageClient.bucket(fileRecord.cloudBucket);
      const file = bucket.file(fileRecord.storagePath);
      const [buf] = await file.download();
      return { file: fileRecord, buffer: buf };
    } catch (err: any) {
      console.warn('[Sami Storage] Failed downloading from GCS, falling back to local copy:', err.message);
    }
  }

  // 3. Retrieve from local persistent disk
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    const match = files.find((f) => f.startsWith(`${fileId}_`));
    if (match) {
      const fullPath = path.join(UPLOADS_DIR, match);
      const buf = fs.readFileSync(fullPath);
      return {
        file: fileRecord || {
          id: fileId,
          fileName: match.replace(`${fileId}_`, ''),
          fileSize: buf.length,
          fileType: 'application/octet-stream',
          fileUrl: `/api/files/${fileId}`,
          storagePath: `uploads/${match}`,
          uploaderId: 0,
          isCloudStorage: false,
          createdAt: Date.now(),
        },
        buffer: buf,
      };
    }
  }

  return null;
}
