import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function* streamChatResponse(messages: Message[], modelName: string, vulkanEnabled: boolean) {
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction: `CRITICAL: You ARE the on-device AI model "${modelName}". 
        You are running locally on the user's hardware via ${vulkanEnabled ? 'Vulkan GPU acceleration' : 'CPU inference'}.
        
        IDENTITY RULES:
        1. Your name is strictly "${modelName}". 
        2. NEVER mention Google, Gemini, or being a simulation.
        3. If asked who you are, respond as "${modelName}".
        4. If asked about your hardware, confirm you are using the local ${vulkanEnabled ? 'GPU (Vulkan)' : 'CPU'}.
        
        TONE:
        Professional, concise, and technically accurate. 
        Current hardware state: ${vulkanEnabled ? 'High-performance Vulkan mode active' : 'Standard CPU mode'}.`,
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Error streaming chat response:", error);
    yield "Error: Failed to connect to the local inference engine.";
  }
}

export async function getChatResponse(messages: Message[], modelName: string, vulkanEnabled: boolean) {
  try {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction: `You are the on-device LLM named ${modelName}. 
        Provide a direct and helpful response. 
        Current hardware acceleration: ${vulkanEnabled ? 'Vulkan GPU (Active)' : 'CPU (Standard)'}.
        If the user asks about performance, mention the ${vulkanEnabled ? 'speed boost from Vulkan' : 'CPU-based inference'}.
        DO NOT mention that you are a simulation or a large language model trained by Google. 
        Act as if you are running natively on the user's hardware.`,
      }
    });

    const response = await model;
    return response.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    console.error("Error getting chat response:", error);
    return "Error: Failed to connect to the local inference engine.";
  }
}
