/**
 * opfsDownloader.ts
 * Robust streaming downloader for huge WebLLM artifacts on Android Chrome using OPFS.
 */

export interface ProgressInfo {
  phase: 'download' | 'verify' | 'retry' | 'done';
  received: number;
  total: number | null;
  pct: number | null;
  text: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error("OPFS not supported in this browser.");
  }
  return await navigator.storage.getDirectory();
}

async function ensureDir(root: FileSystemDirectoryHandle, pathParts: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const p of pathParts) {
    dir = await dir.getDirectoryHandle(p, { create: true });
  }
  return dir;
}

async function fileSizeOrZero(dir: FileSystemDirectoryHandle, name: string): Promise<number> {
  try {
    const h = await dir.getFileHandle(name, { create: false });
    const f = await h.getFile();
    return f.size;
  } catch {
    return 0;
  }
}

async function removeFileIfExists(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {}
}

async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface DownloadArgs {
  url: string;
  opfsDir: string[];
  filename: string;
  expectedSha256?: string | null;
  onProgress?: (info: ProgressInfo) => void;
}

function getStatusTextFallback(status: number): string {
  const fallbacks: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    416: 'Range Not Satisfiable',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  return fallbacks[status] || 'Unknown Error';
}

/**
 * Download a single large artifact to OPFS.
 */
export async function downloadToOPFS({
  url,
  opfsDir,
  filename,
  expectedSha256 = null,
  onProgress = () => {},
}: DownloadArgs): Promise<{ path: string[]; bytes: number }> {
  // Check for createWritable support - required for this downloader
  // @ts-ignore
  if (typeof FileSystemFileHandle !== 'undefined' && !FileSystemFileHandle.prototype.createWritable) {
    console.warn("[Downloader] createWritable not supported. This may fail on some browsers.");
  }

  const root = await getOPFSRoot();
  const dir = await ensureDir(root, opfsDir);

  const finalName = filename;
  const partName = `${filename}.part`;

  // If final exists and hash matches (when provided), we're done.
  try {
    const finalHandle = await dir.getFileHandle(finalName, { create: false });
    const finalFile = await finalHandle.getFile();
    if (expectedSha256) {
      onProgress({ phase: "verify", received: finalFile.size, total: finalFile.size, pct: 1, text: "Verifying…" });
      const h = await sha256File(finalFile);
      if (h.toLowerCase() === expectedSha256.toLowerCase()) return { path: [...opfsDir, finalName], bytes: finalFile.size };
      // bad file -> delete and redownload
      await removeFileIfExists(dir, finalName);
    } else {
      return { path: [...opfsDir, finalName], bytes: finalFile.size };
    }
  } catch {}

  // Ensure we have a .part file to resume into.
  await dir.getFileHandle(partName, { create: true });
  let resumeFrom = await fileSizeOrZero(dir, partName);

  // Exponential backoff retries
  const maxAttempts = 6;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    const headers = new Headers();
    if (resumeFrom > 0) headers.set("Range", `bytes=${resumeFrom}-`);

    onProgress({
      phase: "download",
      received: resumeFrom,
      total: null,
      pct: null,
      text: resumeFrom > 0 ? `Resuming… (${(resumeFrom / (1024 ** 2)).toFixed(0)} MB)` : "Starting download…",
    });

    let resp: Response;
    try {
      const fetchWithRetry = async (currentOffset: number, maxAttempts = 6): Promise<Response> => {
        let attempt = 0;
        while (attempt < maxAttempts) {
          attempt++;
          const headers = new Headers();
          if (currentOffset > 0) headers.set("Range", `bytes=${currentOffset}-`);

          try {
            const response = await fetch(url, { headers, cache: "no-store" });
            
            if (response.ok || response.status === 206) {
              return response;
            }

            // Transient errors that we should retry
            const retryableStatuses = [429, 500, 502, 503, 504];
            if (retryableStatuses.includes(response.status) && attempt < maxAttempts) {
              const retryAfter = response.headers.get('Retry-After');
              let delay = Math.pow(2, attempt) * 500 + Math.random() * 500; // Exponential backoff + jitter
              
              if (retryAfter) {
                const seconds = parseInt(retryAfter, 10);
                if (!isNaN(seconds)) {
                  delay = seconds * 1000;
                } else {
                  const date = Date.parse(retryAfter);
                  if (!isNaN(date)) {
                    delay = Math.max(0, date - Date.now());
                  }
                }
              }

              onProgress({ phase: "retry", received: currentOffset, total: null, pct: null, text: `HTTP ${response.status}. Retrying in ${Math.round(delay / 1000)}s…` });
              await sleep(delay);
              continue;
            }

            // Non-retryable error or max attempts reached
            const bodySnippet = await response.text().catch(() => '').then(t => t.slice(0, 4096));
            const requestId = response.headers.get('x-request-id') || response.headers.get('cf-ray') || 'N/A';
            const statusText = response.statusText || getStatusTextFallback(response.status);
            const redactedUrl = url.replace(/([?&])(key|token|auth)=[^&]+/g, '$1$2=***');

            const errorMsg = `Failed to fetch artifact: ${response.status} ${statusText}
URL: ${redactedUrl}
Request ID: ${requestId}
Body: ${bodySnippet || '(empty)'}`;
            
            throw new Error(errorMsg);

          } catch (err: any) {
            if (err.message.includes('Failed to fetch artifact:')) throw err;

            if (attempt < maxAttempts) {
              const delay = Math.pow(2, attempt) * 500 + Math.random() * 500;
              onProgress({ phase: "retry", received: currentOffset, total: null, pct: null, text: `Network error. Retrying in ${Math.round(delay / 1000)}s…` });
              await sleep(delay);
              continue;
            }
            throw new Error(`Network error after ${maxAttempts} attempts: ${err.message}`);
          }
        }
        throw new Error(`Failed to download after ${maxAttempts} attempts`);
      };

      resp = await fetchWithRetry(resumeFrom);
    } catch (e: any) {
      throw e;
    }

    // If Range requested but not supported, restart from 0.
    if (resumeFrom > 0 && resp.status === 200) {
      console.warn(`[Downloader] Server ignored Range for ${filename}. Restarting from 0.`);
      await removeFileIfExists(dir, partName);
      await dir.getFileHandle(partName, { create: true });
      resumeFrom = 0;
    }

    const totalFromHeader = (() => {
      const cr = resp.headers.get("Content-Range");
      if (cr && cr.includes("/")) {
        const total = Number(cr.split("/").pop());
        return Number.isFinite(total) ? total : null;
      }
      const cl = resp.headers.get("Content-Length");
      if (cl) {
        const len = Number(cl);
        return Number.isFinite(len) ? len + resumeFrom : null;
      }
      return null;
    })();

    const partHandle = await dir.getFileHandle(partName, { create: true });
    // @ts-ignore - createWritable might not be in all types yet
    const writable = await partHandle.createWritable({
      keepExistingData: true,
    });

    // Seek to resume point
    if (resumeFrom > 0) await writable.seek(resumeFrom);

    const reader = resp.body?.getReader();
    if (!reader) {
      await writable.close();
      throw new Error("Streaming body not available (resp.body is null). Try Chrome, disable data saver/VPN.");
    }

    let received = resumeFrom;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        try {
          await writable.write(value);
        } catch (writeErr: any) {
          if (writeErr.name === 'QuotaExceededError' || writeErr.message.includes('quota')) {
            throw new Error("Storage quota exceeded. Please free up space by deleting other models or clearing your browser cache.");
          }
          throw writeErr;
        }
        received += value.byteLength;

        const pct = totalFromHeader ? Math.min(1, received / totalFromHeader) : null;
        onProgress({
          phase: "download",
          received,
          total: totalFromHeader,
          pct,
          text: totalFromHeader
            ? `Downloading… ${Math.round(pct * 100)}%`
            : `Downloading… ${(received / (1024 ** 2)).toFixed(0)} MB`,
        });
      }
    } catch (e: any) {
      await writable.close();
      if (e.message.includes("quota")) throw e;
      const backoff = Math.min(15000, 500 * 2 ** (attempt - 1));
      onProgress({ phase: "retry", received, total: totalFromHeader, pct: null, text: `Stream error. Retrying in ${Math.round(backoff / 1000)}s…` });
      await sleep(backoff);
      resumeFrom = await fileSizeOrZero(dir, partName);
      continue;
    }

    await writable.close();

    // Verify if hash is provided
    const partFileHandle = await dir.getFileHandle(partName, { create: false });
    const partFile = await partFileHandle.getFile();
    if (expectedSha256) {
      onProgress({ phase: "verify", received: partFile.size, total: partFile.size, pct: 1, text: "Verifying…" });
      const h = await sha256File(partFile);
      if (h.toLowerCase() !== expectedSha256.toLowerCase()) {
        await removeFileIfExists(dir, partName);
        resumeFrom = 0;
        onProgress({ phase: "retry", received: 0, total: null, pct: null, text: "Hash mismatch. Redownloading…" });
        continue;
      }
    }

    // Promote .part -> final atomically-ish
    await removeFileIfExists(dir, finalName);

    const finalHandle = await dir.getFileHandle(finalName, { create: true });
    // @ts-ignore
    const finalWritable = await finalHandle.createWritable();
    const partFileForReadHandle = await dir.getFileHandle(partName, { create: false });
    const readBack = await partFileForReadHandle.getFile();

    // Stream copy to avoid RAM blowups
    const rb = readBack.stream().getReader();
    while (true) {
      const { value, done } = await rb.read();
      if (done) break;
      await finalWritable.write(value);
    }
    await finalWritable.close();
    await removeFileIfExists(dir, partName);

    onProgress({ phase: "done", received: readBack.size, total: readBack.size, pct: 1, text: "Ready." });
    return { path: [...opfsDir, finalName], bytes: readBack.size };
  }

  throw new Error("Download failed after retries. Likely blocked CDN/Range/CORS or storage quota.");
}

/**
 * Check if a model directory exists and has files.
 */
export async function isModelInOPFS(modelId: string): Promise<boolean> {
  try {
    const root = await getOPFSRoot();
    const webllmDir = await root.getDirectoryHandle("webllm", { create: false });
    const modelsDir = await webllmDir.getDirectoryHandle("models", { create: false });
    const modelDir = await modelsDir.getDirectoryHandle(modelId, { create: false });
    
    // Check if there are any files in the directory
    // @ts-ignore
    for await (const _ of modelDir.values()) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Delete a model from OPFS and Cache API.
 */
export async function deleteModelFromOPFS(modelId: string): Promise<void> {
  try {
    // 1) Clear OPFS
    const root = await getOPFSRoot();
    const webllmDir = await root.getDirectoryHandle("webllm", { create: false });
    const modelsDir = await webllmDir.getDirectoryHandle("models", { create: false });
    await modelsDir.removeEntry(modelId, { recursive: true });
  } catch (e) {}

  try {
    // 2) Clear Cache API
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      const modelCacheName = cacheNames.find(name => name.includes(modelId));
      if (modelCacheName) {
        await window.caches.delete(modelCacheName);
        console.log(`[Delete] Cache ${modelCacheName} deleted.`);
      }
    }
  } catch (e) {
    console.error(`[Delete] Failed to clear cache for ${modelId}:`, e);
  }
}
