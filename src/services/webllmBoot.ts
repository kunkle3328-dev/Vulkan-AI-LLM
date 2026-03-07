import * as webllm from "@mlc-ai/web-llm";
import { setEngine } from "./webllmService";
import { getStorageStats } from "./storageService";

export interface BootOptions {
  modelId: string;
  onProgress: (text: string, progress?: number) => void;
}

const activeBoots = new Map<string, Promise<webllm.MLCEngineInterface>>();

export async function boot({ modelId, onProgress }: BootOptions): Promise<webllm.MLCEngineInterface> {
  // Check if already booting this model
  if (activeBoots.has(modelId)) {
    console.log(`[Boot] Already booting ${modelId}, attaching to existing promise.`);
    return activeBoots.get(modelId)!;
  }

  const bootPromise = (async () => {
    try {
      // 0) Check WebGPU support
      if (!(navigator as any).gpu) {
        throw new Error("WebGPU is not supported in this browser. Please use Chrome or Edge and ensure WebGPU is enabled in chrome://flags.");
      }

      // 1) Ensure storage is persistent (prevents OS eviction)
      try { 
        if (navigator.storage && navigator.storage.persist) {
          const isPersisted = await navigator.storage.persist(); 
          console.log(`[Boot] Storage persisted: ${isPersisted}`);
        }
      } catch (e) {
        console.warn("Could not request persistent storage:", e);
      }

      // 2) Check space
      try {
        const stats = await getStorageStats();
        if (stats) {
          console.log("Storage estimate:", stats);
          if (stats.quotaGB - stats.usageGB < 2) {
            console.warn(`Low storage space: ${(stats.quotaGB - stats.usageGB).toFixed(1)} GB available.`);
            onProgress(`Warning: Low storage space (${(stats.quotaGB - stats.usageGB).toFixed(1)} GB). Download may fail.`);
          }
        }
      } catch (e) {}

      onProgress("Initializing WebGPU / WebLLM…");

      // 3) Check for shader-f16 support if the model requires it
      if (modelId.includes("q4f16")) {
        try {
          const adapter = await (navigator as any).gpu.requestAdapter();
          if (adapter && !adapter.features.has("shader-f16")) {
            throw new Error("This model requires the 'shader-f16' WebGPU extension which is not supported by your browser or hardware. Please try a different model or use a browser that supports this feature (like Chrome or Edge on compatible hardware).");
          }
        } catch (e: any) {
          if (e.message.includes("shader-f16")) throw e;
          console.warn("[Boot] Could not verify shader-f16 support:", e);
        }
      }

      // 4) Start WebLLM engine with progress callback
      // WebLLM handles its own caching in the Cache API.
      console.log(`[Boot] Starting CreateMLCEngine for ${modelId}`);
      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          console.log(`[WebLLM Progress] ${report.text} (${Math.round(report.progress * 100)}%)`);
          // WebLLM progress report.progress is 0-1
          onProgress(report.text, report.progress);
        },
      });

      onProgress("Model loaded. Ready to chat.", 1);
      await setEngine(engine, modelId);
      return engine;
    } catch (engineErr: any) {
      console.error("[Boot] WebLLM Engine initialization failed:", engineErr);
      
      const errStr = String(engineErr.message || engineErr);
      const isQuota = /quota/i.test(errStr) || engineErr.name === 'QuotaExceededError';
      
      if (isQuota) {
        throw new Error("Storage quota exceeded. WebLLM cannot initialize its internal cache. Please go to Settings and 'Clear Data' to free up space.");
      }
      
      throw new Error(`Failed to initialize WebLLM engine: ${errStr}. Ensure your browser supports WebGPU.`);
    } finally {
      activeBoots.delete(modelId);
    }
  })();

  activeBoots.set(modelId, bootPromise);
  return bootPromise;
}
