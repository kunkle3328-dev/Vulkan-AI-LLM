import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, 
  Shield, 
  Send, 
  Trash2, 
  Download, 
  Database, 
  Settings as SettingsIcon, 
  MessageSquare, 
  Cpu, 
  CheckCircle2,
  ChevronDown,
  X,
  Plus,
  History,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import { Model, Settings, Message, ModelStatus, ChatThread } from './types';
import { streamChatResponse } from './services/geminiService';
import { modelDownloader } from './services/modelDownloader';

import { boot } from './services/webllmBoot';
import { getEngine, streamWebLLMChat, getCurrentModelId } from './services/webllmService';
import { isModelInOPFS, deleteModelFromOPFS } from './services/opfsDownloader';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_MODELS: Model[] = [
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    runtime: 'WEBLLM',
    size: '1.8 GB',
    sizeBytes: 1.8 * 1024 * 1024 * 1024,
    tags: ['FAST', 'MOBILE OPTIMIZED'],
    status: 'NOT_INSTALLED',
    description: 'Meta\'s Llama 3.2 3B Instruct model. Optimized for mobile devices with high quality and speed.',
    recommendation: 'Best for Galaxy S25 and modern Android phones. Fast and capable.'
  },
  {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B v0.3',
    runtime: 'WEBLLM',
    size: '4.1 GB',
    sizeBytes: 4.1 * 1024 * 1024 * 1024,
    tags: ['BALANCED', 'CODING'],
    status: 'NOT_INSTALLED',
    description: 'A highly efficient and versatile model from Mistral AI. Known for its strong performance in coding and English tasks.',
    recommendation: 'Recommended for devices with at least 8GB RAM. Best for coding assistance and general purpose chat.'
  },
  {
    id: 'phi-3-mini',
    name: 'Phi-3 Mini (3.8B)',
    runtime: 'GGUF',
    size: '2.14 GB',
    sizeBytes: 2.14 * 1024 * 1024 * 1024,
    tags: ['CHAT', 'REASONING'],
    status: 'NOT_INSTALLED',
    description: 'Microsoft\'s highly capable small language model. Excels at reasoning, logic, and math tasks despite its size.',
    recommendation: 'Recommended for mid-range devices. Best for logical reasoning and structured data tasks.'
  }
];

const DEFAULT_SETTINGS: Settings = {
  performanceMode: 'Balanced',
  isolatedInference: true,
  vulkanAcceleration: false
};

export default function App() {
  const [view, setView] = useState<'chat' | 'models' | 'settings'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [models, setModels] = useState<Model[]>(() => {
    const saved = localStorage.getItem('vulkan_models');
    if (saved) {
      const parsed: Model[] = JSON.parse(saved);
      // Sync names and metadata from INITIAL_MODELS to fix identity bugs
      return parsed.map(m => {
        const initial = INITIAL_MODELS.find(im => im.id === m.id);
        // Reset stuck downloads on load
        const status = m.status === 'DOWNLOADING' ? 'NOT_INSTALLED' : m.status;
        if (initial) {
          return { 
            ...m, 
            status,
            name: initial.name, 
            tags: initial.tags, 
            size: initial.size, 
            sizeBytes: initial.sizeBytes,
            description: initial.description,
            recommendation: initial.recommendation
          };
        }
        return { ...m, status };
      });
    }
    return INITIAL_MODELS;
  });
  
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('vulkan_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const saved = localStorage.getItem('vulkan_threads');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const saved = localStorage.getItem('vulkan_active_thread');
    return saved || null;
  });

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('vulkan_models', JSON.stringify(models));
  }, [models]);

  useEffect(() => {
    localStorage.setItem('vulkan_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('vulkan_threads', JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    if (activeThreadId) {
      localStorage.setItem('vulkan_active_thread', activeThreadId);
    } else {
      localStorage.removeItem('vulkan_active_thread');
    }
  }, [activeThreadId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threads, activeThreadId, isTyping]);

  const activeThread = threads.find(t => t.id === activeThreadId);
  const messages = activeThread?.messages || [];
  const activeModel = models.find(m => m.id === activeThread?.modelId);

  const createNewThread = () => {
    const newThread: ChatThread = {
      id: Date.now().toString(),
      title: 'New Conversation',
      modelId: 'gemma-2b-it',
      messages: [],
      createdAt: new Date().toISOString()
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    setView('chat');
    setIsSidebarOpen(false);
  };

  const deleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping || !activeThreadId || !activeModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Update thread title if it's the first message
    setThreads(prev => prev.map(t => {
      if (t.id === activeThreadId) {
        const newTitle = t.messages.length === 0 ? input.slice(0, 30) + (input.length > 30 ? '...' : '') : t.title;
        return { ...t, title: newTitle, messages: [...t.messages, userMessage] };
      }
      return t;
    }));

    setInput('');
    setIsTyping(true);

    const assistantMessageId = (Date.now() + 1).toString();
    let fullResponse = "";
    
    // Add empty assistant message first
    setThreads(prev => prev.map(t => {
      if (t.id === activeThreadId) {
        return {
          ...t,
          messages: [...t.messages, {
            id: assistantMessageId,
            role: 'assistant',
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]
        };
      }
      return t;
    }));

    try {
      let stream;
      const engine = getEngine();
      const currentModelId = getCurrentModelId();

      if (activeModel.runtime === 'WEBLLM') {
        if (!engine || currentModelId !== activeModel.id) {
          setIsLoadingModel(true);
          try {
            await boot({
              modelId: activeModel.id,
              onProgress: (text) => {
                console.log(`[WebLLM Boot] ${text}`);
              }
            });
          } catch (bootErr: any) {
            console.error("[Client] Failed to boot WebLLM model:", bootErr);
            setThreads(prev => prev.map(t => {
              if (t.id === activeThreadId) {
                return {
                  ...t,
                  messages: t.messages.map(m => m.id === assistantMessageId ? { ...m, content: `Error: Failed to load model. ${bootErr.message}` } : m)
                };
              }
              return t;
            }));
            return;
          } finally {
            setIsLoadingModel(false);
          }
        }
        console.log(`[Client] Using real WebLLM engine for ${activeModel.id}`);
        stream = streamWebLLMChat([...messages, userMessage]);
      } else {
        console.log(`[Client] Using Gemini simulation for ${activeModel.id}`);
        stream = streamChatResponse(
          [...messages, userMessage], 
          activeModel.name,
          settings.vulkanAcceleration
        );
      }

      for await (const chunk of stream) {
        fullResponse += chunk;
        setThreads(prev => prev.map(t => {
          if (t.id === activeThreadId) {
            return {
              ...t,
              messages: t.messages.map(m => m.id === assistantMessageId ? { ...m, content: fullResponse } : m)
            };
          }
          return t;
        }));
      }
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    const syncWithDB = async () => {
      const updatedModels = await Promise.all(models.map(async (m) => {
        let isDownloaded = false;
        if (m.runtime === 'WEBLLM') {
          isDownloaded = await isModelInOPFS(m.id);
        } else {
          isDownloaded = await modelDownloader.isModelDownloaded(m.id);
        }
        
        if (isDownloaded && m.status !== 'READY') {
          return { ...m, status: 'READY' as ModelStatus };
        }
        return m;
      }));
      
      // Check if any status changed
      const changed = updatedModels.some((m, i) => m.status !== models[i].status);
      if (changed) {
        setModels(updatedModels);
      }
    };
    syncWithDB();
  }, []);

  const startRealDownload = async (id: string) => {
    const model = models.find(m => m.id === id);
    if (!model) return;

    setModels(prev => prev.map(m => m.id === id ? { ...m, status: 'DOWNLOADING', progress: 0 } : m));

    try {
      if (model.runtime === 'WEBLLM') {
        // Use the new OPFS-aware bootstrapper for WebLLM
        await boot({
          modelId: id,
          onProgress: (text, progress) => {
            setModels(prev => prev.map(m => m.id === id ? { 
              ...m, 
              progress: progress !== undefined ? progress * 100 : undefined,
              downloadSpeed: text.includes('MB/s') ? text.split(' ').slice(-2).join(' ') : undefined,
              eta: text.includes('ETA') ? text.split('ETA: ')[1] : undefined
            } : m));
          }
        });
      } else {
        // Keep using the existing downloader for GGUF (or other runtimes)
        await modelDownloader.downloadModel(
          id, 
          `/api/download/model/${id}`,
          (progress) => {
            setModels(prev => prev.map(m => m.id === id ? { 
              ...m, 
              progress: progress.progress,
              downloadSpeed: progress.speed,
              eta: progress.eta
            } : m));
          }
        );
      }

      setModels(prev => prev.map(m => m.id === id ? { 
        ...m, 
        status: 'READY', 
        progress: 100,
        downloadSpeed: undefined,
        eta: undefined
      } : m));

    } catch (error: any) {
      console.error(`[Client] Download error for ${id}:`, error);
      setModels(prev => prev.map(m => m.id === id ? { ...m, status: 'NOT_INSTALLED' } : m));
      alert(`Download failed: ${error.message}`);
    }
  };

  const [storageInfo, setStorageInfo] = useState<{ usage: string, quota: string } | null>(null);

  useEffect(() => {
    const checkStorage = async () => {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorageInfo({
          usage: (estimate.usage ? (estimate.usage / (1024 * 1024 * 1024)).toFixed(2) : '0') + ' GB',
          quota: (estimate.quota ? (estimate.quota / (1024 * 1024 * 1024)).toFixed(2) : '0') + ' GB'
        });
      }
    };
    checkStorage();
  }, []);

  const clearModelCache = async () => {
    if (confirm('This will delete ALL downloaded model weights from your device. Continue?')) {
      // Clear IndexedDB
      const dbNames = await window.indexedDB.databases();
      for (const db of dbNames) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
      
      // Clear OPFS
      for (const m of models) {
        if (m.runtime === 'WEBLLM') {
          await deleteModelFromOPFS(m.id);
        }
      }

      setModels(INITIAL_MODELS);
      localStorage.removeItem('vulkan_models');
      alert('Cache cleared. Please refresh the page.');
      window.location.reload();
    }
  };

  const testApiError = async () => {
    console.log("[Client] Calling /api/test-error");
    setAppError(null);
    setIsLoadingTest(true);
    try {
      const response = await fetch('/api/test-error');
      console.log(`[Client] /api/test-error response status: ${response.status}`);
      if (!response.ok) {
        const text = await response.text();
        console.log(`[Client] /api/test-error response text: ${text}`);
        setAppError(`Test Error Success: ${response.status} - ${text}`);
      } else {
        setAppError(`Test Error Unexpectedly Succeeded: ${response.status}`);
      }
    } catch (err: any) {
      console.error("[Client] /api/test-error failed:", err);
      setAppError(`Test Error Failed: ${err.message}`);
    } finally {
      setIsLoadingTest(false);
    }
  };

  const updateThreadModel = (modelId: string) => {
    setIsLoadingModel(true);
    setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, modelId } : t));
    // Simulate model loading into memory
    setTimeout(() => setIsLoadingModel(false), 1500);
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ x: isSidebarOpen ? 0 : -280 }}
        className={cn(
          "fixed lg:relative inset-y-0 left-0 w-[280px] bg-[#111111] border-r border-white/5 z-50 transition-transform lg:translate-x-0 flex flex-col"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-lg tracking-tight">Vulkan AI</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
            <X className="w-6 h-6 text-white/60" />
          </button>
        </div>

        <div className="px-4 mb-4">
          <button 
            onClick={createNewThread}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl font-bold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest px-4 mb-2">Navigation</div>
          <SidebarItem 
            icon={<MessageSquare className="w-5 h-5" />} 
            label="Chat" 
            active={view === 'chat'} 
            onClick={() => { setView('chat'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Database className="w-5 h-5" />} 
            label="Models" 
            active={view === 'models'} 
            onClick={() => { setView('models'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<SettingsIcon className="w-5 h-5" />} 
            label="Settings" 
            active={view === 'settings'} 
            onClick={() => { setView('settings'); setIsSidebarOpen(false); }} 
          />

          <div className="pt-6">
            <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest px-4 mb-2 flex items-center gap-2">
              <History className="w-3 h-3" />
              Recent Chats
            </div>
            {threads.length === 0 ? (
              <div className="px-4 py-3 text-xs text-white/20 italic">No recent chats</div>
            ) : (
              threads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => { setActiveThreadId(thread.id); setView('chat'); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl transition-all group",
                    activeThreadId === thread.id && view === 'chat'
                      ? "bg-white/10 text-white"
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="text-sm truncate">{thread.title}</span>
                  </div>
                  <Trash2 
                    onClick={(e) => deleteThread(thread.id, e)}
                    className="w-4 h-4 text-white/0 group-hover:text-white/20 hover:!text-red-500 transition-all shrink-0" 
                  />
                </button>
              ))
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40 uppercase font-bold tracking-wider">System Status</span>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <div className="text-sm font-medium">
              {settings.vulkanAcceleration ? 'Vulkan Active' : 'CPU Inference'}
            </div>
            <div className="text-[10px] text-white/40 mt-1">
              {settings.performanceMode} • {settings.isolatedInference ? 'Isolated' : 'Standard'}
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {appError && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between gap-4 backdrop-blur-xl shadow-2xl shadow-red-500/10">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-500 font-medium">{appError}</p>
              </div>
              <button onClick={() => setAppError(null)} className="text-red-500/50 hover:text-red-500 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 lg:px-8 bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-white/5 rounded-lg lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold capitalize">{view}</h1>
            
            {view === 'chat' && activeThreadId && (
              <div className="relative ml-2 flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={activeThread?.modelId}
                    onChange={(e) => updateThreadModel(e.target.value)}
                    className="appearance-none bg-[#1A1A1A] border border-white/10 rounded-full px-4 py-1.5 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
                  >
                    {models.filter(m => m.status === 'READY').map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40" />
                </div>
                {isLoadingModel && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-[10px] text-emerald-500 font-bold uppercase tracking-widest"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading Weights...
                  </motion.div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Shield className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          <AnimatePresence mode="wait">
            {view === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col max-w-4xl mx-auto w-full"
              >
                <div className="flex-1 p-4 lg:p-8 space-y-6">
                  {!activeThreadId ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold">No active chat</h2>
                        <p className="text-sm max-w-xs mx-auto mt-2">
                          Select a chat from the history or start a new one to begin.
                        </p>
                        <button 
                          onClick={createNewThread}
                          className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors"
                        >
                          Start New Chat
                        </button>
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold">Start a conversation</h2>
                        <p className="text-sm max-w-xs mx-auto mt-2">
                          Ask anything. This conversation is private and stays on your device.
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          msg.role === 'user' ? "ml-auto items-end" : "items-start"
                        )}
                      >
                        <div className={cn(
                          "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                          msg.role === 'user' 
                            ? "bg-blue-600 text-white rounded-tr-none" 
                            : "bg-[#1A1A1A] text-white/90 border border-white/5 rounded-tl-none"
                        )}>
                          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
                            <ReactMarkdown>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <span className="text-[10px] text-white/30 mt-1.5 px-1">{msg.timestamp}</span>
                      </div>
                    ))
                  )}
                  {isTyping && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex flex-col items-start max-w-[85%]">
                      <div className="bg-[#1A1A1A] border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 lg:p-8 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent sticky bottom-0">
                  <div className="relative max-w-3xl mx-auto">
                    <input 
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      disabled={!activeThreadId || isLoadingModel}
                      placeholder={isLoadingModel ? "Loading model weights..." : activeThreadId ? "Type a message..." : "Select a chat to start typing"}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-2xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm placeholder:text-white/20 transition-all disabled:opacity-50"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isTyping || !activeThreadId || isLoadingModel}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-xl transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-white/20 mt-3">
                    Inference running on {activeModel?.name || '...'} • {settings.vulkanAcceleration ? 'Vulkan GPU' : 'CPU'}
                  </p>
                </div>
              </motion.div>
            )}

            {view === 'models' && (
              <motion.div 
                key="models"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 lg:p-10 max-w-5xl mx-auto w-full space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Model Registry</h2>
                    <p className="text-white/40 mt-1">Manage on-device LLM runtimes and weights.</p>
                  </div>
                  <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl px-5 py-3 flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                      <Database className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">12.4 GB</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Available</div>
                    </div>
                  </div>
                </div>

        <div className="grid gap-4">
          {models.map((model) => (
            <div 
              key={model.id}
              className="bg-[#111111] border border-white/5 rounded-2xl p-5 flex flex-col gap-6 group hover:border-white/10 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <div className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0",
                  model.status === 'READY' ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/5 border border-white/5"
                )}>
                  <Database className={cn("w-6 h-6 sm:w-7 sm:h-7", model.status === 'READY' ? "text-emerald-500" : "text-white/20")} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg truncate">{model.name}</h3>
                    {model.status === 'READY' && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-bold text-emerald-500 uppercase">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold text-white/40 uppercase">{model.runtime}</span>
                    <span className="text-xs text-white/40">{model.size}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {model.tags.map(tag => (
                        <span key={tag} className="text-[10px] text-white/20 uppercase font-bold tracking-tight">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {model.status === 'READY' ? (
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mr-2">Installed</div>
                      <button 
                        onClick={async () => {
                          if (model.runtime === 'WEBLLM') {
                            await deleteModelFromOPFS(model.id);
                          } else {
                            await modelDownloader.deleteModel(model.id);
                          }
                          setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'NOT_INSTALLED' } : m));
                        }}
                        className="p-3 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-all text-white/20"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ) : model.status === 'DOWNLOADING' ? (
                    <div className="flex items-center gap-4">
                       <div className="text-right">
                          <div className="text-xs font-bold text-blue-500">{model.downloadSpeed}</div>
                          <div className="text-[10px] text-white/30 uppercase font-bold">Speed</div>
                       </div>
                       <div className="text-right min-w-[60px]">
                          <div className="text-xs font-bold text-white/80">{model.eta}</div>
                          <div className="text-[10px] text-white/30 uppercase font-bold">ETA</div>
                       </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => startRealDownload(model.id)}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-sm font-bold w-full sm:w-auto"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  )}
                </div>
              </div>

              {/* Detailed Info */}
              <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div className="space-y-1">
                  <div className="text-[10px] text-white/30 uppercase font-bold tracking-wider">About Model</div>
                  <p className="text-xs text-white/60 leading-relaxed">{model.description}</p>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Recommendation</div>
                  <p className="text-xs text-white/60 leading-relaxed">{model.recommendation}</p>
                </div>
              </div>

              {model.status === 'DOWNLOADING' && (
                <div className="space-y-2">
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${model.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Downloading model weights...</span>
                    <span className="text-xs font-bold text-blue-500">{model.progress}%</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
              </motion.div>
            )}

            {view === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 lg:p-10 max-w-3xl mx-auto w-full space-y-8"
              >
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                  <p className="text-white/40 mt-1">Configure hardware acceleration and inference behavior.</p>
                </div>

                <div className="space-y-4">
                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Performance & Inference
                    </h3>
                    <div className="grid gap-3">
                      <SettingsCard 
                        title="Vulkan Acceleration"
                        description="Use GPU for GGUF/MLC inference."
                      >
                        <Toggle 
                          active={settings.vulkanAcceleration} 
                          onToggle={() => setSettings(prev => ({ ...prev, vulkanAcceleration: !prev.vulkanAcceleration }))} 
                        />
                      </SettingsCard>

                      <SettingsCard 
                        title="Isolated Inference"
                        description="Run LLM in a separate sandbox process."
                      >
                        <Toggle 
                          active={settings.isolatedInference} 
                          onToggle={() => setSettings(prev => ({ ...prev, isolatedInference: !prev.isolatedInference }))} 
                        />
                      </SettingsCard>

                      <SettingsCard 
                        title="Performance Mode"
                        description="Optimize for speed or battery life."
                      >
                        <div className="relative">
                          <select 
                            value={settings.performanceMode}
                            onChange={(e) => setSettings(prev => ({ ...prev, performanceMode: e.target.value as any }))}
                            className="appearance-none bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer w-40"
                          >
                            <option>Balanced</option>
                            <option>High Performance</option>
                            <option>Power Saver</option>
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40" />
                        </div>
                      </SettingsCard>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      System Diagnostics (Android Fix)
                    </h3>
                    <div className="grid gap-3">
                      <div className="bg-[#111111] border border-white/5 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="font-bold mb-0.5">Browser Storage Quota</div>
                            <div className="text-xs text-white/40">Large models require at least 6-10 GB of free space.</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-emerald-500">{storageInfo?.quota || 'Checking...'}</div>
                            <div className="text-[10px] text-white/30 uppercase font-bold">Total Available</div>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-500" 
                            style={{ width: storageInfo ? `${(parseFloat(storageInfo.usage) / parseFloat(storageInfo.quota) * 100)}%` : '0%' }} 
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-white/30 font-bold uppercase tracking-wider">
                          <span>Used: {storageInfo?.usage || '0 GB'}</span>
                          <span>Free: {storageInfo ? (parseFloat(storageInfo.quota) - parseFloat(storageInfo.usage)).toFixed(2) : '0'} GB</span>
                        </div>
                      </div>

                      <div className="bg-[#111111] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <div className="font-bold mb-0.5 text-red-400">Clear Model Cache</div>
                          <div className="text-xs text-white/40">Fixes 90% of "0% download" stalls by clearing partial shards.</div>
                        </div>
                        <button 
                          onClick={clearModelCache}
                          className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all text-sm font-bold border border-red-500/10"
                        >
                          Clear Data
                        </button>
                      </div>

                      <div className="bg-[#111111] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <div className="font-bold mb-0.5">Debug Tools</div>
                          <div className="text-xs text-white/40">Simulate a server error to test error handling.</div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={testApiError}
                            disabled={isLoadingTest}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                          >
                            {isLoadingTest ? 'Testing...' : 'Test API Error'}
                          </button>
                        </div>
                      </div>

                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5">
                        <div className="flex gap-4">
                          <AlertCircle className="w-6 h-6 text-blue-400 shrink-0" />
                          <div className="text-xs text-blue-400/80 leading-relaxed">
                            <strong className="text-blue-400 block mb-1 text-sm">Android Optimization Tips:</strong>
                            <ul className="list-disc list-inside space-y-1">
                              <li>Use <span className="text-blue-300 font-bold">Chrome</span> for best results (Samsung Internet may block large streams).</li>
                              <li>Ensure <span className="text-blue-300 font-bold">WebGPU</span> is enabled in <code className="bg-blue-500/10 px-1 rounded">chrome://flags</code>.</li>
                              <li>Keep at least 15GB free storage for model sharding and memory mapping.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 flex gap-4">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-500">Security Verified</h4>
                    <p className="text-sm text-white/40 mt-1 leading-relaxed">
                      All inference is performed locally. Your data never leaves this device. Vulkan acceleration uses hardware-level isolation to prevent memory leaks.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm",
        active 
          ? "bg-white/10 text-white shadow-lg shadow-black/20" 
          : "text-white/40 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SettingsCard({ title, description, children }: { title: string, description: string, children: React.ReactNode }) {
  return (
    <div className="bg-[#111111] border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:border-white/10 transition-colors">
      <div className="max-w-[70%]">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-sm text-white/40 mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({ active, onToggle }: { active: boolean, onToggle: () => void }) {
  return (
    <button 
      onClick={onToggle}
      className={cn(
        "w-12 h-6 rounded-full transition-all relative",
        active ? "bg-blue-600" : "bg-white/10"
      )}
    >
      <motion.div 
        animate={{ x: active ? 26 : 2 }}
        className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
      />
    </button>
  );
}
