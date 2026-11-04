import { supabase } from "@/integrations/supabase/client";

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB
// Files above this size use resumable, chunked uploads (required for large files).
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
// Supabase Storage's resumable endpoint requires 6 MB chunks.
const CHUNK_SIZE = 6 * 1024 * 1024;

export type UploadProgress = {
  loaded: number;
  total: number;
  /** bytes per second, smoothed */
  speed: number;
};

export type UploadHandle = {
  promise: Promise<void>;
  cancel: () => void;
};

function resumableEndpoint() {
  const base = import.meta.env['VITE_SUPABASE_URL'] as string;
  const url = new URL(base);
  // Upload straight to the storage host when available — noticeably faster for large files.
  const m = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (m) return `https://${m[1]}.storage.supabase.co/storage/v1/upload/resumable`;
  return `${url.origin}/storage/v1/upload/resumable`;
}

export function uploadFile(
  bucket: string,
  path: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
): UploadHandle {
  const contentType = file.type || "application/octet-stream";
  let speed = 0;
  let lastT = performance.now();
  let lastLoaded = 0;
  const report = (loaded: number) => {
    const t = performance.now();
    const dt = (t - lastT) / 1000;
    if (dt > 0.25) {
      const inst = (loaded - lastLoaded) / dt;
      speed = speed ? speed * 0.7 + inst * 0.3 : inst;
      lastT = t;
      lastLoaded = loaded;
    }
    onProgress({ loaded, total: file.size, speed });
  };

  if (file.size <= RESUMABLE_THRESHOLD) {
    const promise = (async () => {
      onProgress({ loaded: 0, total: file.size, speed: 0 });
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType });
      if (error) throw error;
      onProgress({ loaded: file.size, total: file.size, speed: 0 });
    })();
    return { promise, cancel: () => {} };
  }

  let abort: (() => void) | null = null;
  let cancelled = false;
  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again to upload.");
    const { Upload } = await import("tus-js-client");
    if (cancelled) throw new Error("Upload cancelled.");
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: resumableEndpoint(),
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: {
          authorization: `Bearer ${token}`,
          apikey: import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string,
          "x-upsert": "false",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType,
          cacheControl: "3600",
        },
        chunkSize: CHUNK_SIZE,
        onError: (err) => reject(cancelled ? new Error("Upload cancelled.") : err),
        onProgress: (loaded) => report(loaded),
        onSuccess: () => resolve(),
      });
      abort = () => {
        upload.abort(true).catch(() => {});
        reject(new Error("Upload cancelled."));
      };
      upload.start();
    });
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      abort?.();
    },
  };
}

export function formatEta(remainingBytes: number, speed: number): string {
  if (!speed || speed <= 0) return "calculating…";
  const s = Math.ceil(remainingBytes / speed);
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s left`;
}
