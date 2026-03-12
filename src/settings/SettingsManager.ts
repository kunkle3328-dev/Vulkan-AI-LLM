import { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  performanceMode: 'Balanced',
  isolatedInference: true,
  vulkanAcceleration: false,
  autoSuspend: true,
  suspendOnHide: false,
  keepAlive: true,
  localOnlyMode: true,
  cloudFallbackEnabled: false,
  cloudFallbackAccepted: false,
  streamingSpeed: 'Normal',
  contextLength: 4096,
  temperature: 0.7,
  topP: 0.95,
  diagnosticsEnabled: false,
  privacyMode: false
};
