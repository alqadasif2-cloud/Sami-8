/**
 * Central Firebase Service for Sami App
 * Configured with the user's authentic Firebase project and Firestore database.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  projectId: "majestic-interface-ksmzh",
  appId: "1:462035009117:web:ef127abfd25d8ff2ec17b4",
  apiKey: "AIzaSyCWSCiM0EVatqiBL5wUO8ZAfKcJHqud9dU",
  authDomain: "majestic-interface-ksmzh.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-c1d1b606-9578-42a6-b7b2-17faaec47f72",
  storageBucket: "majestic-interface-ksmzh.firebasestorage.app",
  messagingSenderId: "462035009117",
  measurementId: "",
  oAuthClientId: "462035009117-i3ftofh5slm6rjifgtsib7954uv5k8ld.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  try {
    firestoreInstance = initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}


export const db: Firestore = firestoreInstance;
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);

// In-memory cache for media URLs
const mediaDataCache = new Map<string, string>();

export function getCachedMediaData(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  const mediaId = extractMediaId(urlOrId);
  if (mediaId && mediaDataCache.has(mediaId)) {
    return mediaDataCache.get(mediaId) || null;
  }
  return urlOrId;
}

export function extractMediaId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    if (url.startsWith('cloud-media://')) {
      return url.replace('cloud-media://', '').trim();
    }
    if (url.includes('mediaId=')) {
      return new URL(url).searchParams.get('mediaId');
    }
  } catch {
    const match = url.match(/[?&]mediaId=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const match = url.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Ignore
  }
  return null;
}

async function resizeImage(file: File, maxDim = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          reject(new Error('تعذر معالجة الصورة'));
        }
      };
      img.onerror = () => reject(new Error('فشل تحميل الصورة'));
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('ملف الصورة فارغ'));
      }
    };
    reader.onerror = () => reject(new Error('خطأ في قراءة ملف الصورة'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export interface UploadedFileResult {
  fileUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export async function uploadImageToCloud(
  fileOrDataUrl: File | string,
  folder = 'chat_images',
  userId: number = 1
): Promise<{ imageUrl: string; storagePath: string }> {
  const dataUrl =
    typeof fileOrDataUrl === 'string'
      ? fileOrDataUrl
      : await resizeImage(fileOrDataUrl, 1280, 0.85);

  const now = Date.now();
  const mediaId = `${folder}_${userId}_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const storagePath = `${folder}/${mediaId}.jpg`;

  mediaDataCache.set(mediaId, dataUrl);

  try {
    const blob = dataUrlToBlob(dataUrl);
    const storageRef = ref(storage, storagePath);
    const uploadPromise = (async () => {
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      return await getDownloadURL(storageRef);
    })();

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Storage timeout')), 4000)
    );

    const imageUrl = await Promise.race([uploadPromise, timeoutPromise]);
    return { imageUrl, storagePath };
  } catch {
    // Fallback to storing in Firestore media_files
    try {
      await setDoc(doc(db, 'media_files', mediaId), {
        id: mediaId,
        dataUrl,
        folder,
        uploaderId: userId,
        createdAt: now,
      });
    } catch {
      // Ignore if quota exceeded, keep in memory cache
    }
    return {
      imageUrl: `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(
        storagePath
      )}?alt=media&mediaId=${encodeURIComponent(mediaId)}`,
      storagePath,
    };
  }
}

export async function deleteCloudImage(imageUrl?: string | null, storagePath?: string | null): Promise<void> {
  const path = storagePath || extractStoragePath(imageUrl);
  if (path) {
    try {
      await deleteObject(ref(storage, path));
    } catch {
      // Ignore
    }
  }
  const mediaId = extractMediaId(imageUrl);
  if (mediaId) {
    mediaDataCache.delete(mediaId);
    try {
      await deleteDoc(doc(db, 'media_files', mediaId));
    } catch {
      // Ignore
    }
  }
}

export async function uploadFileToCloud(
  file: File,
  folder = 'chat_files',
  userId: number = 1
): Promise<UploadedFileResult> {
  const now = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileId = `${folder}_${userId}_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const storagePath = `${folder}/${fileId}_${safeName}`;

  try {
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
    const fileUrl = await getDownloadURL(storageRef);
    return {
      fileUrl,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`تعذر رفع الملف: ${errorMsg}`);
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function playNotificationChime(): void {
  try {
    if (typeof window === 'undefined') return;
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio context may be blocked by autoplay policies
  }
}
