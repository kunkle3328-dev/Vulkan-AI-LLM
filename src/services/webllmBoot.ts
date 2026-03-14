import * as webllm from "@mlc-ai/web-llm";
import { setEngine } from "./webllmService";
import { getStorageStats } from "./storageService";
import { DeviceReadinessReport } from "../types";

export interface BootOptions {
  modelId: string;
  onProgress: (phase: string, progress?: number, message?: string) => void;
}

const activeBoots = new Map<string, Promise<webllm.MLCEngineInterface>>();

export async function getDeviceReadiness(): Promise<DeviceReadinessReport> {
  const gpu = (navigator as any).gpu;
  const webgpuAvailable = !!gpu;
  let adapterPresent = false;
  let shaderF16Supported = false;

  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      adapterPresent = !!adapter;
      if (adapter) {
        shaderF16Supported = adapter.features.has("shader-f16");
      }
    } catch (e) {
      console.error("Error requesting adapter:", e);
    }
  }

  let persistentStorageGranted = false;
  if (navigator.storage && navigator.storage.persist) {
    persistentStorageGranted = await navigator.storage.persist();
  }

  const stats = await getStorageStats();
  const quotaEstimate = stats ? stats.quotaGB - stats.usageGB : 0;

  return {
    webgpuAvailable,
    adapterPresent,
    shaderF16Supported,
    persistentStorageGranted,
    quotaEstimate,
    recommendedTier: quotaEstimate > 10 ? 'high' : quotaEstimate > 5 ? 'medium' : 'low'
  };
}

export async function boot({ modelId, onProgress }: BootOptions): Promise<webllm.MLCEngineInterface> {
  if (activeBoots.has(modelId)) {
    return activeBoots.get(modelId)!;
  }

  const startTime = performance.now();

  const bootPromise = (async () => {
    try {
      onProgress("checking_readiness", 0, "Checking device readiness...");
      const readiness = await getDeviceReadiness();
      
      if (!readiness.webgpuAvailable) {
        throw new Error("no_webgpu");
      }
      if (readiness.quotaEstimate < 2) {
        throw new Error("low_storage");
      }

      onProgress("initializing_engine", 0.2, "Initializing WebLLM engine...");
      console.log(`[Boot] Starting CreateMLCEngine for ${modelId}`);

      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          console.log(`[WebLLM Init] ${report.text} (${(report.progress * 100).toFixed(1)}%)`);
          onProgress("downloading_model", 0.2 + report.progress * 0.8, report.text);
        },
      });

      console.log(`[Boot] CreateMLCEngine finished for ${modelId}`);

      const endTime = performance.now();
      console.log(`[Boot] ${modelId} boot time: ${((endTime - startTime) / 1000).toFixed(2)}s`);

      onProgress("ready", 1, "Model ready.");
      await setEngine(engine, modelId);
      return engine;
    } catch (engineErr: any) {
      console.error("[Boot] Initialization failed:", engineErr);
      const errorMsg = engineErr?.message || String(engineErr);
      if (errorMsg.includes("Device was lost") || errorMsg.includes("Instance dropped")) {
        throw new Error("FATAL_GPU_ERROR: The GPU device was lost during initialization. This usually means the model is too large for your GPU memory. Please try a smaller model.");
      }
      throw engineErr;
    } finally {
      activeBoots.delete(modelId);
    }
  })();

  activeBoots.set(modelId, bootPromise);
  return bootPromise;
}
