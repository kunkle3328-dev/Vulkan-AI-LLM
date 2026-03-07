let cachedFeatures: { supported: boolean, hasF16: boolean, error: string | null } | null = null;

export async function checkWebGPUFeatures() {
  if (cachedFeatures) return cachedFeatures;

  if (!(navigator as any).gpu) {
    cachedFeatures = {
      supported: false,
      hasF16: false,
      error: "WebGPU is not supported in this browser."
    };
    return cachedFeatures;
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      cachedFeatures = {
        supported: false,
        hasF16: false,
        error: "No WebGPU adapter found."
      };
      return cachedFeatures;
    }

    cachedFeatures = {
      supported: true,
      hasF16: adapter.features.has("shader-f16"),
      error: null
    };
    return cachedFeatures;
  } catch (e: any) {
    cachedFeatures = {
      supported: false,
      hasF16: false,
      error: e.message || "Failed to request WebGPU adapter."
    };
    return cachedFeatures;
  }
}
