import { openDB, IDBPDatabase } from 'idb';
import { MODEL_MANIFEST } from '../models/manifest';
import { ModelInstallState } from '../types';
import { downloadToOPFS, deleteModelFromOPFS, isModelInOPFS } from './opfsDownloader';

export interface DownloadProgress {
  phase: ModelInstallState;
  progress: number;
  speed: string;
  eta: string;
  receivedBytes: number;
  totalBytes: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

interface ModelMeta {
  modelId: string;
  totalBytes: number;
  completed: boolean;
  state: ModelInstallState;
}

const DB_NAME = 'webllm_models_meta';
const STORE_META = 'metadata';

export class ModelDownloader {
  private db: Promise<IDBPDatabase>;

  constructor() {
    this.db = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_META, { keyPath: 'modelId' });
      },
    });
  }

  async repairInstall(modelId: string): Promise<void> {
    await this.deleteModel(modelId);
  }

  async downloadModel(modelId: string, onProgress: ProgressCallback): Promise<void> {
    const manifest = MODEL_MANIFEST.find(m => m.modelId === modelId);
    if (!manifest) throw new Error("Model not found in manifest");

    const db = await this.db;
    let meta: ModelMeta = await db.get(STORE_META, modelId) || {
      modelId,
      totalBytes: manifest.totalBytes,
      completed: false,
      state: 'NOT_INSTALLED'
    };

    if (meta.completed && await isModelInOPFS(modelId)) {
      onProgress({ phase: 'READY', progress: 100, speed: 'Ready', eta: 'Done', receivedBytes: meta.totalBytes, totalBytes: meta.totalBytes });
      return;
    }

    meta.state = 'DOWNLOADING';
    await db.put(STORE_META, meta);

    let receivedBytes = 0;
    for (let i = 0; i < manifest.artifactUrls.length; i++) {
        const url = manifest.artifactUrls[i];
        const sha256 = manifest.expectedSha256?.[i] || null;
        
        await downloadToOPFS({
            url,
            opfsDir: ['webllm', 'models', modelId],
            filename: `artifact_${i}`,
            expectedSha256: sha256,
            onProgress: (p) => {
                receivedBytes += p.received; // This is simplistic, needs better tracking
                const progress = (receivedBytes / manifest.totalBytes) * 100;
                onProgress({
                    phase: 'DOWNLOADING',
                    progress,
                    speed: 'N/A',
                    eta: 'N/A',
                    receivedBytes,
                    totalBytes: manifest.totalBytes
                });
            }
        });
    }

    meta.completed = true;
    meta.state = 'INSTALLED';
    await db.put(STORE_META, meta);
    
    onProgress({ phase: 'READY', progress: 100, speed: 'Ready', eta: 'Done', receivedBytes: meta.totalBytes, totalBytes: meta.totalBytes });
  }

  async deleteModel(modelId: string) {
    const db = await this.db;
    await db.delete(STORE_META, modelId);
    await deleteModelFromOPFS(modelId);
  }
}

export const modelDownloader = new ModelDownloader();
