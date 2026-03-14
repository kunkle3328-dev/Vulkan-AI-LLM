import * as webllm from "@mlc-ai/web-llm";

export type RuntimeState = 
  | 'idle' 
  | 'loading' 
  | 'ready' 
  | 'generating' 
  | 'suspending' 
  | 'suspended' 
  | 'error';

let engine: webllm.MLCEngineInterface | null = null;
let currentState: RuntimeState = 'idle';
let currentModelId: string | null = null;
let abortController: AbortController | null = null;

const mutex = {
  locked: false,
  async lock() {
    while (this.locked) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.locked = true;
  },
  unlock() {
    this.locked = false;
  }
};

export function getEngine(): webllm.MLCEngineInterface | null {
  return engine;
}

export function setEngine(newEngine: webllm.MLCEngineInterface, modelId: string) {
  engine = newEngine;
  currentModelId = modelId;
  currentState = 'ready';

  // Attempt to listen for device loss if the engine exposes it
  // Some versions of WebLLM might not expose this directly, but we can try
  try {
    // @ts-ignore - accessing internal device if possible
    const device = (engine as any).device;
    if (device && device.lost) {
      device.lost.then((info: any) => {
        console.error(`[WebLLM Service] GPU Device lost: ${info.message}`);
        currentState = 'error';
        // Notify UI or handle recovery
        if (onDeviceLostCallback) onDeviceLostCallback(info.message);
      });
    }
  } catch (e) {
    console.warn("[WebLLM Service] Could not attach device lost listener", e);
  }
}

let onDeviceLostCallback: ((message: string) => void) | null = null;

export function onDeviceLost(callback: (message: string) => void) {
  onDeviceLostCallback = callback;
}

export function getCurrentModelId(): string | null {
  return currentModelId;
}

export function getLastModelId(): string | null {
  return currentModelId; // For now, same as current
}

export async function unloadEngine(): Promise<void> {
  if (engine) {
    try {
      await engine.unload();
    } catch (e) {
      console.warn("[WebLLM Service] Error during engine unload:", e);
    } finally {
      engine = null;
      currentModelId = null;
      currentState = 'idle';
    }
  }
}

export async function resetEngine(): Promise<void> {
  console.log("[WebLLM Service] Resetting engine state...");
  engine = null;
  currentModelId = null;
  currentState = 'idle';
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

export function getRuntimeState(): RuntimeState {
  return currentState;
}

export function stopGeneration() {
  if (abortController) {
    abortController.abort();
    abortController = null;
    if (currentState === 'generating') {
      currentState = 'ready';
    }
  }
}

export async function ensureModelReady(modelId: string): Promise<void> {
  if (currentState === 'ready' && currentModelId === modelId) {
    return;
  }
  await switchModel(modelId);
}

export async function switchModel(modelId: string): Promise<void> {
  await mutex.lock();
  try {
    currentState = 'loading';
    if (engine) {
      await engine.unload();
      engine = null;
    }
    
    // In a real implementation, this would involve loading the model via webllm.CreateMLCEngine
    // For now, we simulate the state transition
    currentModelId = modelId;
    currentState = 'ready';
  } catch (error) {
    currentState = 'error';
    throw new Error(`Failed to switch model: ${error}`);
  } finally {
    mutex.unlock();
  }
}

export async function* streamWebLLMChat(messages: any[], options: { temperature?: number, top_p?: number, max_tokens?: number, repetition_penalty?: number } = {}) {
  if (!engine) {
    throw new Error("engine_not_initialized");
  }

  currentState = 'generating';
  abortController = new AbortController();

  try {
    const chatMessages: webllm.ChatCompletionMessageParam[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const asyncGenerator = await engine.chat.completions.create({
      messages: chatMessages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 0.95,
      max_tokens: options.max_tokens ?? 2048,
      repetition_penalty: options.repetition_penalty ?? 1.1,
    });

    for await (const chunk of asyncGenerator) {
      if (abortController.signal.aborted) {
        break;
      }
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes("Device was lost") || errorMsg.includes("Instance dropped")) {
      console.error("[WebLLM Service] Fatal GPU error detected. Resetting engine.");
      await resetEngine();
    }
    currentState = 'error';
    console.error("[WebLLM Service] Chat error:", error);
    throw error;
  } finally {
    if (currentState === 'generating') {
      currentState = 'ready';
    }
  }
}

export function getRuntimeDiagnostics() {
  return {
    state: currentState,
    modelId: currentModelId,
    hasEngine: !!engine,
  };
}
