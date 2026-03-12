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
}

export function getCurrentModelId(): string | null {
  return currentModelId;
}

export function getLastModelId(): string | null {
  return currentModelId; // For now, same as current
}

export async function unloadEngine(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
    currentModelId = null;
    currentState = 'idle';
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

    // In a real implementation, we would pass the abort signal
    const asyncGenerator = await engine.chat.completions.create({
      messages: chatMessages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 0.95,
      max_tokens: options.max_tokens ?? 2048,
      repetition_penalty: options.repetition_penalty ?? 1.1, // Default to 1.1 to prevent looping
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
