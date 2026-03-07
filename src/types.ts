export type ModelStatus = 'READY' | 'DOWNLOADING' | 'NOT_INSTALLED' | 'SUSPENDED';

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
  isCached?: boolean;
}

export interface Settings {
  performanceMode: 'Balanced' | 'High Performance' | 'Power Saver';
  isolatedInference: boolean;
  vulkanAcceleration: boolean;
  autoSuspend: boolean;
  suspendOnHide: boolean;
  keepAlive: boolean;
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
