import { ModelManifest } from "../types";

export const MODEL_MANIFEST: ModelManifest[] = [
  {
    modelId: "Llama-3-8B-Instruct-q4f32_1",
    canonicalName: "Llama 3 8B Instruct",
    alias: "llama3-8b",
    provider: "meta",
    quantization: "q4f32_1",
    artifactUrls: ["https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f32_1/resolve/main/model.tar.gz"],
    expectedSha256: ["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    totalBytes: 5000000000,
    minRAM: 8,
    recommendedRAM: 16,
    visionSupport: false,
    tags: ["instruct", "llama3"]
  }
];
