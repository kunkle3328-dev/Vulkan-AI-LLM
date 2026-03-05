import * as webllm from "@mlc-ai/web-llm";
import { downloadToOPFS, ProgressInfo } from "./opfsDownloader";
import { setEngine } from "./webllmService";

export interface BootOptions {
  modelId: string;
  onProgress: (text: string, progress?: number) => void;
  artifacts?: Array<{ url: string; filename: string; sha256?: string | null }>;
}

export async function boot({ modelId, onProgress, artifacts = [] }: BootOptions): Promise<webllm.MLCEngineInterface> {
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
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      console.log("Storage estimate:", est);
      const freeGB = est.quota && est.usage ? (est.quota - est.usage) / (1024 ** 3) : 0;
      if (freeGB < 5) {
        console.warn(`Low storage space: ${freeGB.toFixed(1)} GB available.`);
      }
    }
  } catch (e) {}

  // 3) Auto-resolve artifacts if none provided
  let finalArtifacts = [...artifacts];
  if (finalArtifacts.length === 0) {
    onProgress("Fetching model manifest…");
    try {
      // Try multiple Hugging Face mirrors/paths if needed
      const baseUrl = `https://huggingface.co/mlc-ai/${modelId}/resolve/main/`;
      const manifestUrl = `${baseUrl}ndarray-cache.json`;
      const resp = await fetch(manifestUrl);
      
      if (!resp.ok) {
        throw new Error(`Failed to fetch manifest: ${resp.status} ${resp.statusText}`);
      }

      const manifest = await resp.json();
      finalArtifacts = [
        { url: `${baseUrl}mlc-chat-config.json`, filename: "mlc-chat-config.json" },
        { url: `${baseUrl}tokenizer.json`, filename: "tokenizer.json" },
        { url: `${baseUrl}tokenizer_config.json`, filename: "tokenizer_config.json" },
        { url: `${baseUrl}ndarray-cache.json`, filename: "ndarray-cache.json" },
      ];
      
      if (manifest.records) {
        for (const record of manifest.records) {
          finalArtifacts.push({
            url: `${baseUrl}${record.dataPath}`,
            filename: record.dataPath
          });
        }
      }
    } catch (e: any) {
      console.warn("Could not auto-resolve artifacts, falling back to WebLLM default loader:", e);
      onProgress(`Warning: Manual pre-download failed. Falling back to default loader...`);
    }
  }

  // 4) Download artifacts to OPFS
  if (finalArtifacts.length > 0) {
    try {
      for (const a of finalArtifacts) {
        await downloadToOPFS({
          url: a.url,
          opfsDir: ["webllm", "models", modelId],
          filename: a.filename,
          expectedSha256: a.sha256 ?? null,
          onProgress: (p: ProgressInfo) => {
            const pct = p.pct == null ? "" : ` ${Math.round(p.pct * 100)}%`;
            onProgress(`${p.text}${pct}`, p.pct ?? undefined);
          },
        });
      }
    } catch (downloadErr: any) {
      console.error("[Boot] OPFS Download failed:", downloadErr);
      onProgress(`Pre-download error: ${downloadErr.message}. Attempting WebLLM direct load...`);
    }
  }

  onProgress("Initializing WebGPU / WebLLM…");

  // 5) Start WebLLM engine with progress callback
  try {
    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        onProgress(report.text, report.progress);
      },
    });

    onProgress("Model loaded. Ready to chat.", 1);
    await setEngine(engine, modelId);
    return engine;
  } catch (engineErr: any) {
    console.error("[Boot] WebLLM Engine initialization failed:", engineErr);
    throw new Error(`Failed to initialize WebLLM engine: ${engineErr.message}. Ensure your browser supports WebGPU.`);
  }
}
