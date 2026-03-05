export type ModelStatus = 'READY' | 'DOWNLOADING' | 'NOT_INSTALLED';

export interface Model {
  id: string;
  name: string;
  runtime: 'WEBLLM' | 'GGUF';
  size: string;
  sizeBytes: number;
  tags: string[];
  status: ModelStatus;
  progress?: number;
  downloadSpeed?: string;
  eta?: string;
  description?: string;
  recommendation?: string;
  actualSizeBytes?: number;
}

export interface Settings {
  performanceMode: 'Balanced' | 'High Performance' | 'Power Saver';
  isolatedInference: boolean;
  vulkanAcceleration: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatThread {
  id: string;
  title: string;
  modelId: string;
  messages: Message[];
  createdAt: string;
}
