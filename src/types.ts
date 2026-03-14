export type ModelStatus = 
  | 'NOT_INSTALLED' 
  | 'DOWNLOADING' 
  | 'VERIFYING' 
  | 'INSTALLED' 
  | 'READY' 
  | 'SUSPENDED' 
  | 'INCOMPATIBLE' 
  | 'CORRUPTED'
  | 'FAILED';

export type ModelInstallState = ModelStatus;

export enum RuntimeSource {
  CLOUD = "cloud",
  LOCAL = "local",
}

export interface ModelManifest {
  modelId: string;
  canonicalName: string;
  alias: string;
  provider: string;
  quantization: string;
  artifactUrls: string[];
  expectedSha256: string[] | null;
  totalBytes: number;
  minRAM: number;
  recommendedRAM: number;
  visionSupport: boolean;
  tags: string[];
  description?: string;
  recommendation?: string;
}

export interface DeviceReadinessReport {
  webgpuAvailable: boolean;
  adapterPresent: boolean;
  shaderF16Supported: boolean;
  persistentStorageGranted: boolean;
  quotaEstimate: number;
  recommendedTier: 'low' | 'medium' | 'high';
}

export interface BenchmarkResult {
  modelId: string;
  tokensPerSecond: number;
  timestamp: string;
}

export interface ThreadExportPayload {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

export interface PersistedAppState {
  schemaVersion: number;
  settings: Settings;
  threads: ChatThread[];
}

export interface MessageAttachment {
  type: 'image' | 'file';
  url: string;
  mimeType: string;
}

export interface CloudFallbackSettings {
  enabled: boolean;
  accepted: boolean;
}

export interface MigrationResult {
  success: boolean;
  error?: string;
  version: number;
}

export interface Model {
  id: string;
  name: string;
  runtime: 'WEBLLM' | 'GGUF';
  size: string;
  sizeBytes: number;
  tags: string[];
  status: ModelStatus;
  statusText?: string;
  progress?: number;
  downloadSpeed?: string;
  eta?: string;
  description?: string;
  recommendation?: string;
  actualSizeBytes?: number;
  isCached?: boolean;
  provider?: string;
  format?: string;
  quantization?: string;
  ramRequirementGB?: number;
  storageRequirementGB?: number;
  checksum?: string;
  recommendedDevices?: string[];
  isFavorite?: boolean;
  alias?: string;
}

export interface Settings {
  performanceMode: 'Balanced' | 'High Performance' | 'Power Saver';
  isolatedInference: boolean;
  vulkanAcceleration: boolean;
  autoSuspend: boolean;
  suspendOnHide: boolean;
  keepAlive: boolean;
  localOnlyMode: boolean;
  cloudFallbackEnabled: boolean;
  cloudFallbackAccepted: boolean;
  streamingSpeed: 'Normal' | 'Fast' | 'Instant';
  contextLength: number;
  temperature: number;
  topP: number;
  maxImageTokens?: number;
  diagnosticsEnabled: boolean;
  privacyMode: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: MessageAttachment[];
}

export interface ChatThread {
  id: string;
  title: string;
  modelId: string;
  messages: Message[];
  createdAt: string;
  isPinned?: boolean;
}
