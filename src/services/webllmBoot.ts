import * as webllm from "@mlc-ai/web-llm";
import { downloadToOPFS, ProgressInfo } from "./opfsDownloader";
import { setEngine } from "./webllmService";

export interface BootOptions {
  modelId: string;
  onProgress: (text: string, progress?: number) => void;
  artifacts?: Array<{ url: string; filename: string; sha256?: string | null }>;
}

export async function boot({ modelId, onProgress, artifacts = [] }: BootOptions): Promise<webllm.MLCEngineInterface> {
  // 1) Ensure storage is persistent (prevents OS eviction)
  try { 
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist(); 
    }
  } catch (e) {
    console.warn("Could not request persistent storage:", e);
  }

  // 2) Check space
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      console.log("Storage estimate:", est);
    }
  } catch (e) {}

  // 3) Auto-resolve artifacts if none provided
  let finalArtifacts = [...artifacts];
  if (finalArtifacts.length === 0) {
    onProgress("Fetching model manifest…");
    try {
      const baseUrl = `https://huggingface.co/mlc-ai/${modelId}/resolve/main/`;
      const manifestUrl = `${baseUrl}ndarray-cache.json`;
      const resp = await fetch(manifestUrl);
      if (resp.ok) {
        const manifest = await resp.json();
        finalArtifacts = [
          { url: `${baseUrl}mlc-chat-config.json`, filename: "mlc-chat-config.json" },
          { url: `${baseUrl}tokenizer.json`, filename: "tokenizer.json" },
          { url: `${baseUrl}tokenizer_config.json`, filename: "tokenizer_config.json" },
          { url: `${baseUrl}ndarray-cache.json`, filename: "ndarray-cache.json" },
        ];
        for (const record of manifest.records) {
          finalArtifacts.push({
            url: `${baseUrl}${record.dataPath}`,
            filename: record.dataPath
          });
        }
      }
    } catch (e) {
      console.warn("Could not auto-resolve artifacts, falling back to WebLLM default loader:", e);
    }
  }

  // 4) Download artifacts to OPFS
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

  onProgress("Initializing WebGPU / WebLLM…");

  // 5) Start WebLLM engine with progress callback
  const engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      onProgress(report.text, report.progress);
    },
  });

  onProgress("Model loaded. Ready to chat.", 1);
  await setEngine(engine, modelId);
  return engine;
}
