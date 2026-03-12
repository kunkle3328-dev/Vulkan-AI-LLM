import { ChatThread, Message } from '../types';

export class ChatManager {
  static createNewThread(models: any[]): ChatThread {
    const defaultModelId = models.find(m => m.status === 'READY')?.id || models[0]?.id;
    return {
      id: Date.now().toString(),
      title: 'New Conversation',
      modelId: defaultModelId,
      messages: [],
      createdAt: new Date().toISOString()
    };
  }
}
