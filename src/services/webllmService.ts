import * as webllm from "@mlc-ai/web-llm";

let engine: webllm.MLCEngineInterface | null = null;
let currentModelId: string | null = null;

export async function setEngine(newEngine: webllm.MLCEngineInterface, modelId: string) {
  engine = newEngine;
  currentModelId = modelId;
}

export function getEngine() {
  return engine;
}

export function getCurrentModelId() {
  return currentModelId;
}

export async function* streamWebLLMChat(messages: any[]) {
  if (!engine) {
    throw new Error("WebLLM engine not initialized");
  }

  const chatMessages: webllm.ChatCompletionMessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const asyncGenerator = await engine.chat.completions.create({
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of asyncGenerator) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}
