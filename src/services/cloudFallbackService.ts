import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message } from "../types";

// Explicitly define the runtime source
export enum RuntimeSource {
  CLOUD = "cloud",
  LOCAL = "local",
}

export interface CloudFallbackMetadata {
  runtimeSource: RuntimeSource;
  provider: string;
  model: string;
}

export interface CloudFallbackResponse {
  text: string;
  metadata: CloudFallbackMetadata;
}

// Guard: Ensure API Key exists and cloud fallback is enabled
function checkCloudEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new Error("Cloud fallback is disabled in settings.");
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function* streamCloudFallbackChat(
  messages: Message[],
  modelName: string,
  enabled: boolean
): AsyncGenerator<string, void, unknown> {
  checkCloudEnabled(enabled);

  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview", // Keep using this model as requested
      contents: messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: `You are a helpful, intelligent AI assistant. Provide clear, concise, and accurate responses. Stay on topic and follow the user's instructions carefully. Format your output using Markdown for better readability.`,
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Error streaming cloud fallback response:", error);
    yield "Error: Failed to connect to the cloud fallback service.";
  }
}

export async function getCloudFallbackResponse(
  messages: Message[],
  modelName: string,
  enabled: boolean
): Promise<CloudFallbackResponse> {
  checkCloudEnabled(enabled);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: `You are an AI assistant providing cloud-based fallback support.`,
      },
    });

    return {
      text: response.text || "I'm sorry, I couldn't process that.",
      metadata: {
        runtimeSource: RuntimeSource.CLOUD,
        provider: "google",
        model: "gemini-3-flash-preview",
      },
    };
  } catch (error) {
    console.error("Error getting cloud fallback response:", error);
    throw new Error("Failed to connect to the cloud fallback service.");
  }
}
