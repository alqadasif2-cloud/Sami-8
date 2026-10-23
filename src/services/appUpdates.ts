import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface AppUpdateConfig {
  id: string;
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  description: string;
  isMandatory: boolean;
  minSupportedVersionCode?: number;
  updatedAt?: number;
}

export const CURRENT_CLIENT_VERSION_NAME = '1.3.0';
export const CURRENT_CLIENT_VERSION_CODE = 11;

export const DEFAULT_APP_UPDATE_CONFIG: AppUpdateConfig = {
  id: 'latest',
  versionName: '1.3.0',
  versionCode: 11,
  downloadUrl: 'https://github.com/alqadasif2-cloud/SSAMIII77777/actions',
  description: 'الإصدار 1.3.0 متوفر الآن مع تحسينات في حماية الضيوف وسرعة الباقات وإدارة المشرفين.',
  isMandatory: false,
  minSupportedVersionCode: 11,
  updatedAt: Date.now(),
};

function compareSemVer(v1: string, v2: string): boolean {
  if (!v1 || !v2) return false;
  const parse = (s: string) =>
    s
      .replace(/^v/i, '')
      .trim()
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

  const parts1 = parse(v1);
  const parts2 = parse(v2);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return true;
    if (p1 < p2) return false;
  }
  return false;
}

export function shouldPromptUpdate(
  config: AppUpdateConfig | null,
  currentCode: number = CURRENT_CLIENT_VERSION_CODE,
  currentName: string = CURRENT_CLIENT_VERSION_NAME
): boolean {
  if (!config) return false;
  if (config.versionCode > currentCode) return true;
  return compareSemVer(config.versionName, currentName);
}

export function subscribeToAppUpdateConfig(
  onUpdate: (config: AppUpdateConfig) => void
): () => void {
  let isCancelled = false;

  // 1. Immediate fetch from Server API
  const fetchFromServer = async () => {
    try {
      const res = await fetch('/api/updates/latest');
      if (res.ok) {
        const data = await res.json();
        if (data && data.update && !isCancelled) {
          onUpdate(data.update);
        }
      }
    } catch {}
  };
  void fetchFromServer();

  // 2. Poll server every 60s for seamless background updates
  const interval = setInterval(fetchFromServer, 60000);

  // 3. Real-time listener to Firestore
  let unsubFirestore: (() => void) | null = null;
  try {
    const docRef = doc(db, 'app_updates', 'latest');
    unsubFirestore = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          onUpdate({
            id: snapshot.id,
            versionName: data.versionName || DEFAULT_APP_UPDATE_CONFIG.versionName,
            versionCode: Number(data.versionCode) || DEFAULT_APP_UPDATE_CONFIG.versionCode,
            downloadUrl: data.downloadUrl || DEFAULT_APP_UPDATE_CONFIG.downloadUrl,
            description: data.description || DEFAULT_APP_UPDATE_CONFIG.description,
            isMandatory: Boolean(data.isMandatory),
            minSupportedVersionCode: data.minSupportedVersionCode
              ? Number(data.minSupportedVersionCode)
              : undefined,
            updatedAt: data.updatedAt ? Number(data.updatedAt) : Date.now(),
          });
        }
      },
      () => {
        // Fallback already covered by server API
      }
    );
  } catch {}

  return () => {
    isCancelled = true;
    clearInterval(interval);
    if (unsubFirestore) unsubFirestore();
  };
}

export async function publishAppUpdateConfig(config: {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  description: string;
  isMandatory?: boolean;
  minSupportedVersionCode?: number;
}): Promise<void> {
  const payload = {
    id: 'latest',
    versionName: config.versionName.trim(),
    versionCode: Math.floor(Number(config.versionCode) || 11),
    downloadUrl: config.downloadUrl.trim(),
    description: config.description.trim(),
    isMandatory: Boolean(config.isMandatory),
    minSupportedVersionCode: config.minSupportedVersionCode
      ? Math.floor(Number(config.minSupportedVersionCode))
      : undefined,
    updatedAt: Date.now(),
  };

  let serverSuccess = false;
  let firestoreSuccess = false;
  let lastError = '';

  // 1. Try server API with authorization token
  try {
    const token =
      localStorage.getItem('sami_auth_token') ||
      localStorage.getItem('token') ||
      (localStorage.getItem('sami_auth_user_session')
        ? JSON.parse(localStorage.getItem('sami_auth_user_session')!).token
        : null);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/updates', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      serverSuccess = true;
    } else {
      const errJson = await res.json().catch(() => ({}));
      lastError = errJson.error || `Server responded with status ${res.status}`;
    }
  } catch (err: any) {
    lastError = err?.message || String(err);
  }

  // 2. Save directly to Firestore
  try {
    const docRef = doc(db, 'app_updates', 'latest');
    await setDoc(docRef, payload, { merge: true });
    firestoreSuccess = true;
  } catch (err: any) {
    if (!lastError) lastError = err?.message || String(err);
  }

  if (!serverSuccess && !firestoreSuccess) {
    throw new Error(`فشل نشر التحديث: ${lastError || 'تعذر الاتصال بالخادم وقاعدة البيانات'}`);
  }
}
