/**
 * storageService.ts
 * Utilities for monitoring and managing browser storage (OPFS/IndexedDB).
 */

export interface StorageStats {
  usage: number; // bytes
  quota: number; // bytes
  usageGB: number;
  quotaGB: number;
  percent: number;
}

export async function getStorageStats(): Promise<StorageStats | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    
    return {
      usage,
      quota,
      usageGB: usage / (1024 ** 3),
      quotaGB: quota / (1024 ** 3),
      percent: quota > 0 ? (usage / quota) * 100 : 0
    };
  } catch (e) {
    console.error("Failed to estimate storage:", e);
    return null;
  }
}

export async function clearAllOPFS(): Promise<void> {
  if (!navigator.storage || !navigator.storage.getDirectory) return;
  
  try {
    const root = await navigator.storage.getDirectory();
    // @ts-ignore
    for await (const name of root.keys()) {
      try {
        await root.removeEntry(name, { recursive: true });
      } catch (e) {
        console.warn(`Failed to remove OPFS entry ${name}:`, e);
      }
    }
    console.log("OPFS cleared successfully.");
  } catch (e) {
    console.error("Failed to clear OPFS:", e);
    throw e;
  }
}

export async function clearAllIndexedDB(): Promise<void> {
  try {
    const databases = await window.indexedDB.databases();
    for (const dbInfo of databases) {
      if (dbInfo.name) {
        console.log(`Deleting IndexedDB: ${dbInfo.name}`);
        await new Promise((resolve, reject) => {
          const req = window.indexedDB.deleteDatabase(dbInfo.name!);
          req.onsuccess = resolve;
          req.onerror = reject;
          req.onblocked = () => {
            console.warn(`Deletion of ${dbInfo.name} is blocked`);
            resolve(null);
          };
        });
      }
    }
    console.log("All IndexedDB databases cleared.");
  } catch (e) {
    console.error("Failed to clear IndexedDB:", e);
    throw e;
  }
}

export async function getModelStorageUsage(): Promise<Array<{ id: string, size: number }>> {
  if (!navigator.storage || !navigator.storage.getDirectory) return [];
  
  const models: Array<{ id: string, size: number }> = [];
  try {
    const root = await navigator.storage.getDirectory();
    let webllmDir: FileSystemDirectoryHandle;
    try {
      webllmDir = await root.getDirectoryHandle("webllm", { create: false });
    } catch { return []; }
    
    let modelsDir: FileSystemDirectoryHandle;
    try {
      modelsDir = await webllmDir.getDirectoryHandle("models", { create: false });
    } catch { return []; }

    // @ts-ignore
    for await (const [name, handle] of modelsDir.entries()) {
      if (handle.kind === 'directory') {
        const size = await calculateDirSize(handle as FileSystemDirectoryHandle);
        models.push({ id: name, size });
      }
    }
  } catch (e) {
    console.error("Failed to calculate model storage usage:", e);
  }
  return models;
}

async function calculateDirSize(dirHandle: FileSystemDirectoryHandle): Promise<number> {
  let size = 0;
  // @ts-ignore
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile();
      size += file.size;
    } else if (entry.kind === 'directory') {
      size += await calculateDirSize(entry as FileSystemDirectoryHandle);
    }
  }
  return size;
}

export async function isModelInCache(modelId: string): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    // WebLLM uses Cache API with names like "webllm/model_id"
    // We check if the cache exists and has entries
    const cacheNames = await window.caches.keys();
    const modelCacheName = cacheNames.find(name => name.includes(modelId));
    if (modelCacheName) {
      const cache = await window.caches.open(modelCacheName);
      const keys = await cache.keys();
      return keys.length > 0;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function clearAllCaches(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cacheNames = await window.caches.keys();
    for (const name of cacheNames) {
      await window.caches.delete(name);
    }
    console.log("All Caches cleared.");
  } catch (e) {
    console.error("Failed to clear Caches:", e);
  }
}
