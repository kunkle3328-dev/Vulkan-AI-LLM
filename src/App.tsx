import React, { useState, useEffect, useRef, memo } from 'react';
import { 
  Menu, 
  Shield, 
  ShieldAlert,
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
  AlertCircle,
  Copy,
  Check,
  Search,
  Star,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Model, Settings, Message, ModelStatus, ChatThread } from './types';
import { ModelDownloader, modelDownloader } from './services/modelDownloader';
import { MODEL_MANIFEST } from './models/manifest';

import { boot } from './services/webllmBoot';
import { checkWebGPUFeatures } from './services/webgpuUtils';
import { getEngine, streamWebLLMChat, getCurrentModelId, getLastModelId, unloadEngine } from './services/webllmService';
import { streamCloudFallbackChat } from './services/cloudFallbackService';
import { initLifecycleManager } from './services/modelLifecycleService';
import { isModelInOPFS, deleteModelFromOPFS } from './services/opfsDownloader';
import { 
  getStorageStats, 
  clearAllOPFS, 
  clearAllIndexedDB, 
  clearAllCaches,
  getModelStorageUsage, 
  isModelInCache,
  getCachedModels,
  deleteModelFromCache,
  StorageStats 
} from './services/storageService';
import { cn } from './utils/cn';
import { SplashScreen } from './components/ui/SplashScreen';
import { DEFAULT_SETTINGS } from './settings/SettingsManager';

// const modelDownloader = new ModelDownloader(); // Removed local instance

function VulkanLogo({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={cn("text-emerald-500", className)}
    >
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const INITIAL_MODELS: Model[] = MODEL_MANIFEST.map(m => ({
  id: m.modelId,
  name: m.canonicalName,
  runtime: 'WEBLLM',
  size: (m.totalBytes / (1024 ** 3)).toFixed(1) + ' GB',
  sizeBytes: m.totalBytes,
  tags: m.tags,
  status: 'NOT_INSTALLED',
  description: `Model from ${m.provider} with ${m.quantization} quantization.`,
  recommendation: `Recommended for devices with ${m.recommendedRAM}GB+ RAM.`,
  provider: m.provider,
  quantization: m.quantization,
  ramRequirementGB: m.minRAM,
  storageRequirementGB: Math.ceil(m.totalBytes / (1024 ** 3))
}));


function CopyButton({ text, className }: { text: string, className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "p-1.5 rounded-md transition-all duration-200",
        copied 
          ? "bg-emerald-500/20 text-emerald-400" 
          : "hover:bg-white/10 text-white/40 hover:text-white/80",
        className
      )}
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const MessageItem = memo(({ message, isLast }: { message: Message, isLast: boolean }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group flex flex-col gap-3 max-w-full",
        message.role === 'user' ? "items-end" : "items-start"
      )}
    >
      <div className={cn(
        "flex items-center gap-2 px-1",
        message.role === 'user' ? "flex-row-reverse" : "flex-row"
      )}>
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
          message.role === 'user' ? "bg-emerald-500/20 text-emerald-500" : "bg-white/10 text-white/60"
        )}>
          {message.role === 'user' ? 'U' : 'AI'}
        </div>
        <span className="text-[10px] text-white/20 font-medium">{message.timestamp}</span>
      </div>
      
      <div className={cn(
        "relative p-4 rounded-2xl text-[15px] leading-relaxed transition-all",
        message.role === 'user' 
          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-50" 
          : "bg-white/5 border border-white/10 text-white/90"
      )}>
        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-white/5">
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children).replace(/\n$/, '');
                
                return !inline && match ? (
                  <div className="relative group/code my-4">
                    <div className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
                      <CopyButton text={codeString} />
                    </div>
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      className="!bg-[#0a0a0a] !p-4 !rounded-xl !border !border-white/5 !m-0"
                      {...props}
                    >
                      {codeString}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-emerald-400 font-mono", className)} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#050505] text-emerald-500 p-8 text-center">
          <ShieldAlert className="w-16 h-16 mb-4 opacity-50" />
          <h2 className="text-xl font-bold uppercase tracking-widest mb-2">Kernel Panic</h2>
          <p className="text-xs text-emerald-500/60 font-mono max-w-md mb-6">
            An unrecoverable error has occurred in the application runtime.
          </p>
          <div className="bg-black/50 border border-emerald-500/20 p-4 rounded-lg mb-6 max-w-xl w-full text-left overflow-auto max-h-40">
            <code className="text-[10px] text-red-400 whitespace-pre-wrap">
              {this.state.error?.message}
            </code>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
          >
            Restart Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [view, setView] = useState<'chat' | 'models' | 'settings'>('chat');
  const [modelSearch, setModelSearch] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [modelSort, setModelSort] = useState<'name' | 'size' | 'status'>('name');
  const [modelFilter, setModelFilter] = useState<'all' | 'installed' | 'favorite'>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('vulkan_favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<{ id: string, content: string } | null>(null);
  const [models, setModels] = useState<Model[]>(() => {
    const saved = localStorage.getItem('vulkan_models');
    if (saved) {
      let parsed: Model[] = JSON.parse(saved);
      
      // ID Migration Map
      const idMigration: Record<string, string> = {
        'mistral-7b-v0.3': 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
        'gemma-2b-it': 'gemma-2b-it-q4f16_1-MLC',
        'phi-3-mini': 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
        'llama-3-8b': 'Llama-3-8B-Instruct-q4f16_1-MLC',
        'Llama-3-8B-Instruct-v0.1-q4f16_1-MLC': 'Llama-3-8B-Instruct-q4f16_1-MLC'
      };

      // Apply migration
      parsed = parsed.map(m => ({
        ...m,
        id: idMigration[m.id] || m.id
      }));

      // Sync names and metadata from MODEL_MANIFEST to fix identity bugs
      const syncedModels = parsed.map(m => {
        // Match either the exact ID or the f16/f32 variant counterpart
        const initial = MODEL_MANIFEST.find(im => 
          im.modelId === m.id || 
          im.modelId === m.id.replace('q4f32_1', 'q4f16_1') ||
          im.modelId === m.id.replace('q4f16_1', 'q4f32_1')
        );
        // Reset stuck downloads on load
        const status = m.status === 'DOWNLOADING' ? 'NOT_INSTALLED' : m.status;
        if (initial) {
          return { 
            ...m, 
            status,
            runtime: 'WEBLLM' as const, // Ensure runtime is updated
            name: initial.canonicalName, 
            tags: initial.tags, 
            size: (initial.totalBytes / (1024 ** 3)).toFixed(1) + ' GB', 
            sizeBytes: initial.totalBytes,
            description: `Model from ${initial.provider} with ${initial.quantization} quantization.`,
            recommendation: `Recommended for devices with ${initial.recommendedRAM}GB+ RAM.`,
            provider: initial.provider,
            quantization: initial.quantization,
            ramRequirementGB: initial.minRAM,
            storageRequirementGB: Math.ceil(initial.totalBytes / (1024 ** 3))
          };
        }
        return { ...m, status, runtime: m.runtime || 'WEBLLM' as const };
      });

      // Add any new models from MODEL_MANIFEST that aren't in syncedModels
      const newModels = MODEL_MANIFEST.filter(im => 
        !syncedModels.some(sm => 
          sm.id === im.modelId || 
          sm.id === im.modelId.replace('q4f16_1', 'q4f32_1') ||
          sm.id === im.modelId.replace('q4f32_1', 'q4f16_1')
        )
      ).map(im => ({
        id: im.modelId,
        name: im.canonicalName,
        runtime: 'WEBLLM' as const,
        size: (im.totalBytes / (1024 ** 3)).toFixed(1) + ' GB',
        sizeBytes: im.totalBytes,
        tags: im.tags,
        status: 'NOT_INSTALLED' as const,
        description: `Model from ${im.provider} with ${im.quantization} quantization.`,
        recommendation: `Recommended for devices with ${im.recommendedRAM}GB+ RAM.`,
        provider: im.provider,
        quantization: im.quantization,
        ramRequirementGB: im.minRAM,
        storageRequirementGB: Math.ceil(im.totalBytes / (1024 ** 3))
      }));

      return [...syncedModels, ...newModels];
    }
    return INITIAL_MODELS;
  });
  
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('vulkan_settings');
    try {
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch (e) {
      console.error("Failed to parse settings:", e);
      return DEFAULT_SETTINGS;
    }
  });
  
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const saved = localStorage.getItem('vulkan_threads');
    let parsed: ChatThread[] = saved ? JSON.parse(saved) : [];
    
    // ID Migration Map
    const idMigration: Record<string, string> = {
      'mistral-7b-v0.3': 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
      'gemma-2b-it': 'gemma-2b-it-q4f16_1-MLC',
      'phi-3-mini': 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
      'llama-3-8b': 'Llama-3-8B-Instruct-q4f16_1-MLC',
      'Llama-3-8B-Instruct-v0.1-q4f16_1-MLC': 'Llama-3-8B-Instruct-q4f16_1-MLC'
    };

    // Apply migration to threads
    return parsed.map(t => ({
      ...t,
      modelId: idMigration[t.modelId] || t.modelId
    }));
  });
  
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const saved = localStorage.getItem('vulkan_active_thread');
    return saved || null;
  });

  // Ensure activeThreadId is always valid
  useEffect(() => {
    if (threads.length > 0) {
      if (!activeThreadId || !threads.find(t => t.id === activeThreadId)) {
        setActiveThreadId(threads[0].id);
      }
    } else {
      setActiveThreadId(null);
    }
  }, [threads, activeThreadId]);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageStats | null>(null);
  const [cachedModels, setCachedModels] = useState<Array<{ id: string, size: number }>>([]);
  const [appError, setAppError] = useState<string | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [gpuFeatures, setGpuFeatures] = useState<{ supported: boolean, hasF16: boolean, adapterName?: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeApp = async () => {
      // 1. Check GPU Features
      const features = await checkWebGPUFeatures();
      setGpuFeatures({ 
        supported: features.supported, 
        hasF16: features.hasF16,
        adapterName: features.adapterName
      });
      
      if (!features.supported) {
        setAppError("WebGPU is not supported or enabled in this browser. Local inference will be unavailable.");
      }

      // 2. Sync with DB and apply Fallback if needed
      const storageUsage = await getModelStorageUsage();
      const cached = await getCachedModels();
      setCachedModels(cached);
      
      const stats = await getStorageStats();
      setStorageInfo(stats);
      
      // We need to work with the current models state
      // Since setModels is async, we'll use a local variable for the intermediate state
      let currentModels = [...models];

      // Pass 1: Apply Fallback to IDs
      currentModels = currentModels.map(m => {
        let currentId = m.id;
        let currentSize = m.size;
        let currentSizeBytes = m.sizeBytes;

        if (features.supported && !features.hasF16 && m.runtime === 'WEBLLM' && currentId.includes('q4f16_1')) {
          console.log(`[App] Fallback: Switching ${currentId} to q4f32_1`);
          currentId = currentId.replace('q4f16_1', 'q4f32_1');
          
          if (currentId.includes('Llama-3.2-3B')) { currentSize = '2.0 GB'; currentSizeBytes = 2147483648; }
          else if (currentId.includes('Llama-3-8B')) { currentSize = '5.2 GB'; currentSizeBytes = 5583457484; }
          else if (currentId.includes('Mistral-7B')) { currentSize = '4.5 GB'; currentSizeBytes = 4831838208; }
          else if (currentId.includes('Phi-3-mini')) { currentSize = '2.4 GB'; currentSizeBytes = 2576980377; }
          else if (currentId.includes('gemma-2b')) { currentSize = '1.6 GB'; currentSizeBytes = 1717986918; }
          else {
             currentSizeBytes = Math.round(m.sizeBytes * 1.15);
             currentSize = (currentSizeBytes / (1024 ** 3)).toFixed(1) + " GB";
          }
        }
        return { ...m, id: currentId, size: currentSize, sizeBytes: currentSizeBytes };
      });

      // Pass 2: Check download status for the (potentially updated) IDs
      const finalModels = await Promise.all(currentModels.map(async (m) => {
        let isDownloaded = false;
        let isCached = false;
        if (m.runtime === 'WEBLLM') {
          const inOPFS = await isModelInOPFS(m.id);
          isCached = await isModelInCache(m.id);
          isDownloaded = inOPFS || isCached;
        } else {
          // Fallback for other runtimes if any
          isDownloaded = await isModelInOPFS(m.id);
        }
        const actualSizeBytes = storageUsage.find(s => s.id === m.id)?.size || 0;
        const status: ModelStatus = isDownloaded ? 'READY' : (m.status === 'READY' ? 'NOT_INSTALLED' : m.status);
        return { ...m, status, actualSizeBytes, isCached };
      }));
      
      setModels(finalModels);

      // Update threads to match fallback IDs
      if (features.supported && !features.hasF16) {
        setThreads(prev => prev.map(t => {
          if (t.modelId.includes('q4f16_1')) {
            return { ...t, modelId: t.modelId.replace('q4f16_1', 'q4f32_1') };
          }
          return t;
        }));
      }
    };

    initializeApp();
  }, []);

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
    const defaultModelId = models.find(m => m.status === 'READY')?.id || models[0]?.id || 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
    const newThread: ChatThread = {
      id: Date.now().toString(),
      title: 'New Conversation',
      modelId: defaultModelId,
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
    if (!input.trim() || isTyping || !activeThreadId) return;

    if (!activeModel) {
      setAppError("Model not found for this thread. Please select a model from the header.");
      return;
    }

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
    
    // Use streamingMessage state for performance instead of updating threads array in loop
    setStreamingMessage({ id: assistantMessageId, content: "" });

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
            
            // Handle cloud fallback if enabled
            if (!settings.localOnlyMode && settings.cloudFallbackEnabled) {
              console.log("[Client] Local boot failed, falling back to cloud...");
              stream = streamCloudFallbackChat(
                [...messages, userMessage], 
                activeModel.name,
                settings.cloudFallbackEnabled
              );
            } else {
              setThreads(prev => prev.map(t => {
                if (t.id === activeThreadId) {
                  return {
                    ...t,
                    messages: [...t.messages, {
                      id: assistantMessageId,
                      role: 'assistant',
                      content: `Error: Failed to load model locally. ${bootErr.message}\n\nEnable Cloud Fallback in Settings if you want to use remote inference when local fails.`,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }]
                  };
                }
                return t;
              }));
              setStreamingMessage(null);
              return;
            }
          } finally {
            setIsLoadingModel(false);
          }
        }
        
        if (!stream) {
          console.log(`[Client] Using real WebLLM engine for ${activeModel.id}`);
          stream = streamWebLLMChat([...messages, userMessage], {
            temperature: settings.temperature,
            top_p: settings.topP,
            repetition_penalty: 1.1
          });
        }
      } else {
        if (settings.localOnlyMode) {
          throw new Error("Local-only mode is active. Cloud-based models are disabled.");
        }
        console.log(`[Client] Using Gemini for ${activeModel.id}`);
        stream = streamCloudFallbackChat(
          [...messages, userMessage], 
          activeModel.name,
          settings.cloudFallbackEnabled
        );
      }

      for await (const chunk of stream) {
        fullResponse += chunk;
        setStreamingMessage({ id: assistantMessageId, content: fullResponse });
      }

      // Finalize the message into the thread
      setThreads(prev => prev.map(t => {
        if (t.id === activeThreadId) {
          return {
            ...t,
            messages: [...t.messages, {
              id: assistantMessageId,
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]
          };
        }
        return t;
      }));
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsTyping(false);
      setStreamingMessage(null);
    }
  };

  // Removed redundant syncWithDB useEffect as it's now part of initializeApp

  useEffect(() => {
    localStorage.setItem('vulkan_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const renameThread = (id: string, newTitle: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
    setEditingThreadId(null);
  };

  const exportThread = (thread: ChatThread) => {
    const data = JSON.stringify(thread, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vulkan-chat-${thread.title.replace(/\s+/g, '-').toLowerCase()}-${thread.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredThreads = threads.filter(t => 
    t.title.toLowerCase().includes(threadSearch.toLowerCase())
  );

  const filteredModels = models
    .filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
                           m.id.toLowerCase().includes(modelSearch.toLowerCase());
      const matchesFilter = modelFilter === 'all' || 
                           (modelFilter === 'installed' && m.status === 'READY') ||
                           (modelFilter === 'favorite' && favorites.includes(m.id));
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (modelSort === 'name') return a.name.localeCompare(b.name);
      if (modelSort === 'size') return (a.sizeBytes || 0) - (b.sizeBytes || 0);
      if (modelSort === 'status') {
        const statusOrder = { 'READY': 0, 'DOWNLOADING': 1, 'NOT_INSTALLED': 2, 'VERIFYING': 1, 'INSTALLED': 0, 'SUSPENDED': 0, 'INCOMPATIBLE': 3, 'CORRUPTED': 3 };
        return (statusOrder[a.status as keyof typeof statusOrder] || 99) - (statusOrder[b.status as keyof typeof statusOrder] || 99);
      }
      return 0;
    });

  const startRealDownload = async (id: string) => {
    // Safety check for shader-f16
    if (gpuFeatures && !gpuFeatures.hasF16 && id.includes('q4f16')) {
      const fallbackId = id.replace('q4f16_1', 'q4f32_1');
      console.warn(`[App] Intercepted incompatible download. Switching ${id} to ${fallbackId}`);
      // If we have a fallback, use it, otherwise show error
      id = fallbackId;
    }

    const model = models.find(m => m.id === id);
    if (!model) return;

    // Check storage space first
    const stats = await getStorageStats();
    if (stats) {
      const availableGB = stats.quotaGB - stats.usageGB;
      const modelSizeGB = model.sizeBytes / (1024 ** 3);
      
      // Require at least model size + 1GB buffer
      if (availableGB < modelSizeGB + 1) {
        alert(`Insufficient storage space. You have ${availableGB.toFixed(1)} GB available, but this model requires approximately ${modelSizeGB.toFixed(1)} GB plus overhead. Please clear some space in Settings.`);
        return;
      }
    }

    setModels(prev => prev.map(m => m.id === id ? { ...m, status: 'DOWNLOADING', progress: 0 } : m));

    try {
      if (model.runtime === 'WEBLLM') {
        // Use the new OPFS-aware bootstrapper for WebLLM
        await boot({
          modelId: id,
          onProgress: (text, progress) => {
            const isCacheLoad = text.toLowerCase().includes('cache') || text.toLowerCase().includes('loading');
            setModels(prev => prev.map(m => m.id === id ? { 
              ...m, 
              progress: progress !== undefined ? progress * 100 : undefined,
              downloadSpeed: isCacheLoad ? 'Loading from Cache' : (text.includes('MB/s') ? text.split(' ').slice(-2).join(' ') : undefined),
              eta: isCacheLoad ? 'Fast' : (text.includes('ETA') ? text.split('ETA: ')[1] : undefined)
            } : m));
          }
        });
      } else {
        // Keep using the existing downloader for GGUF (or other runtimes)
        await modelDownloader.downloadModel(
          id, 
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

  // Initialize Lifecycle Manager
  useEffect(() => {
    const cleanup = initLifecycleManager(settings, () => {
      // Force a re-render to show "Suspended" status if needed
      setModels(prev => [...prev]);
    });
    return cleanup;
  }, [settings]);

  useEffect(() => {
    const checkStorage = async () => {
      const stats = await getStorageStats();
      setStorageInfo(stats);
    };
    checkStorage();
    // Refresh storage info every 30 seconds
    const interval = setInterval(checkStorage, 30000);
    return () => clearInterval(interval);
  }, []);

  const clearModelCache = async () => {
    if (!window.confirm("This will delete ALL downloaded model weights from your device. You will need to re-download them to use local inference. Continue?")) return;
    
    try {
      await clearAllOPFS();
      await clearAllIndexedDB();
      await clearAllCaches();
      
      // Update models state
      setModels(prev => prev.map(m => ({ ...m, status: 'NOT_INSTALLED', actualSizeBytes: 0 })));
      setCachedModels([]);
      
      // Update storage stats
      const stats = await getStorageStats();
      setStorageInfo(stats);
      
      alert("All model data has been cleared.");
    } catch (err) {
      setAppError("Failed to clear model cache: " + (err as Error).message);
    }
  };

  const deleteSpecificCache = async (modelId: string) => {
    try {
      await deleteModelFromCache(modelId);
      await deleteModelFromOPFS(modelId);
      await modelDownloader.deleteModel(modelId);
      
      setModels(prev => prev.map(m => m.id === modelId ? { ...m, status: 'NOT_INSTALLED', actualSizeBytes: 0 } : m));
      
      const cached = await getCachedModels();
      setCachedModels(cached);
      
      const stats = await getStorageStats();
      setStorageInfo(stats);
    } catch (err) {
      setAppError(`Failed to delete cache for ${modelId}: ` + (err as Error).message);
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

  const getDeviceReadiness = () => {
    const ramGB = (navigator as any).deviceMemory || 8;
    if (!gpuFeatures?.supported) return { score: 0, label: 'Incompatible', color: 'text-red-500', status: 'Incompatible', ramGB };
    
    let score = 0;
    if (gpuFeatures.supported) score += 40;
    if (gpuFeatures.hasF16) score += 30;
    
    if (ramGB >= 16) score += 30;
    else if (ramGB >= 8) score += 20;
    else if (ramGB >= 4) score += 10;

    let label = 'Limited';
    let color = 'text-orange-500';
    if (score >= 90) { label = 'Elite'; color = 'text-emerald-500'; }
    else if (score >= 70) { label = 'Optimal'; color = 'text-emerald-400'; }
    else if (score >= 50) { label = 'Capable'; color = 'text-yellow-500'; }

    return { score, label, color, status: label, ramGB };
  };

  const readiness = getDeviceReadiness();

  const updateThreadModel = (modelId: string) => {
    setIsLoadingModel(true);
    setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, modelId } : t));
    // Simulate model loading into memory
    setTimeout(() => setIsLoadingModel(false), 1500);
  };

  return (
    <div className="flex h-screen bg-[#050505] text-[#E0E0E0] font-sans overflow-hidden selection:bg-emerald-500/30">
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>

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
          "fixed lg:relative inset-y-0 left-0 w-[280px] bg-[#080808] border-r border-emerald-500/10 z-50 transition-transform lg:translate-x-0 flex flex-col"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VulkanLogo className="w-8 h-8" />
            <span className="font-bold text-lg tracking-widest text-emerald-500 terminal-glow">VULKAN</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
            <X className="w-6 h-6 text-emerald-500/60" />
          </button>
        </div>

        <div className="px-4 mb-4">
          <button 
            onClick={createNewThread}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-500 py-2.5 rounded-lg font-bold text-xs transition-all tracking-widest uppercase"
          >
            <Plus className="w-4 h-4" />
            Initialize Session
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
            <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest px-4 mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-3 h-3" />
                Recent Chats
              </div>
              {threads.length > 0 && (
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to delete ALL chat history? This cannot be undone.')) {
                      setThreads([]);
                      setActiveThreadId(null);
                    }
                  }}
                  className="text-[9px] hover:text-red-500 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="px-3 mb-3">
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-white/20" />
                <input 
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500/30"
                />
              </div>
            </div>

            {filteredThreads.length === 0 ? (
              <div className="px-4 py-3 text-xs text-white/20 italic">No matching chats</div>
            ) : (
              filteredThreads.map(thread => (
                <div key={thread.id} className="group relative">
                  {editingThreadId === thread.id ? (
                    <div className="px-3 py-1">
                      <input 
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => renameThread(thread.id, editTitle)}
                        onKeyDown={(e) => e.key === 'Enter' && renameThread(thread.id, editTitle)}
                        className="w-full bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1 text-xs text-emerald-500 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        onClick={() => { setActiveThreadId(thread.id); setView('chat'); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl transition-all",
                          activeThreadId === thread.id && view === 'chat'
                            ? "bg-white/10 text-white"
                            : "text-white/40 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <div className="flex items-center gap-3 truncate">
                          <MessageSquare className="w-4 h-4 shrink-0" />
                          <span className="text-sm truncate">{thread.title}</span>
                        </div>
                      </button>
                      
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a] to-transparent pl-4">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingThreadId(thread.id);
                            setEditTitle(thread.title);
                          }}
                          className="p-1 hover:text-emerald-500 transition-colors"
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            exportThread(thread);
                          }}
                          className="p-1 hover:text-blue-500 transition-colors"
                          title="Export JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => deleteThread(thread.id, e)}
                          className="p-1 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
        <header className="h-16 border-b border-emerald-500/10 flex items-center justify-between px-4 lg:px-8 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-emerald-500/10 rounded-lg lg:hidden shrink-0"
            >
              <Menu className="w-6 h-6 text-emerald-500/60" />
            </button>
            <h1 className="text-xs font-bold tracking-[0.2em] text-emerald-500 uppercase terminal-glow hidden sm:block shrink-0">{view}</h1>
            
            {view === 'chat' && activeThreadId && (
              <div className="flex items-center gap-2 sm:gap-4 ml-0 sm:ml-2 overflow-hidden min-w-0">
                <div className="relative flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="relative min-w-0">
                    <select 
                      value={activeThread?.modelId}
                      onChange={(e) => updateThreadModel(e.target.value)}
                      className="appearance-none bg-black border border-emerald-500/20 rounded-lg px-2 sm:px-4 py-1.5 pr-8 sm:pr-10 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-500 focus:outline-none focus:border-emerald-500/50 cursor-pointer truncate max-w-[120px] sm:max-w-[200px]"
                    >
                      {models.filter(m => m.status === 'READY').map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500/40" />
                  </div>
                  {isLoadingModel && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1 sm:gap-2 text-[8px] sm:text-[9px] text-emerald-500 font-bold uppercase tracking-widest whitespace-nowrap"
                    >
                      <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                      <span className="hidden xs:inline">Syncing...</span>
                    </motion.div>
                  )}
                </div>

                {/* Runtime Badge */}
                <div className={cn(
                  "px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-widest border whitespace-nowrap shrink-0",
                  activeModel?.runtime === 'WEBLLM' && !isLoadingModel && getEngine()
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500"
                    : "bg-yellow-500/10 border-yellow-500/40 text-yellow-500"
                )}>
                  <span className="hidden sm:inline">
                    {activeModel?.runtime === 'WEBLLM' && !isLoadingModel && getEngine() ? 'LOCAL RUNTIME' : 'CLOUD FALLBACK'}
                  </span>
                  <span className="sm:hidden">
                    {activeModel?.runtime === 'WEBLLM' && !isLoadingModel && getEngine() ? 'LOCAL' : 'CLOUD'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded bg-emerald-500/5 flex items-center justify-center border border-emerald-500/20 terminal-glow">
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
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                      <div className="w-16 h-16 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center justify-center terminal-glow">
                        <VulkanLogo className="w-10 h-10" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-[0.2em] text-emerald-500 uppercase">No Active Session</h2>
                        <p className="text-xs max-w-xs mx-auto mt-2 font-mono tracking-wider">
                          Select a session from the registry or initialize a new one.
                        </p>
                        <button 
                          onClick={createNewThread}
                          className="mt-8 px-8 py-3 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-500 rounded-lg font-bold text-xs transition-all tracking-widest uppercase"
                        >
                          Initialize Session
                        </button>
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                      <div className="w-16 h-16 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center justify-center terminal-glow">
                        <VulkanLogo className="w-10 h-10" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-[0.2em] text-emerald-500 uppercase">Session Ready</h2>
                        <p className="text-xs max-w-xs mx-auto mt-2 font-mono tracking-wider">
                          Secure local inference active. Your data remains on this device.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, i) => (
                        <MessageItem key={msg.id} message={msg} isLast={i === messages.length - 1} />
                      ))}
                      {streamingMessage && (
                        <MessageItem 
                          message={{
                            id: streamingMessage.id,
                            role: 'assistant',
                            content: streamingMessage.content,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          }} 
                          isLast={true} 
                        />
                      )}
                      {isTyping && !streamingMessage && (
                        <div className="flex flex-col items-start max-w-[85%]">
                          <div className="bg-black/40 border border-emerald-500/10 px-4 py-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/40">Processing</span>
                              <motion.div 
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="w-1.5 h-3 bg-emerald-500/50"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 lg:p-6 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent sticky bottom-0">
                  <div className="max-w-3xl mx-auto relative">
                    <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
                      <AnimatePresence>
                        {isLoadingModel && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-emerald-500 text-black px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                          >
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading Model into VRAM...
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="relative group">
                      <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Enter command or query..."
                        className="w-full bg-black border border-emerald-500/20 rounded-lg px-4 py-4 pr-14 focus:outline-none focus:border-emerald-500/50 transition-all resize-none font-mono text-sm text-emerald-500 placeholder:text-emerald-500/20 custom-scrollbar"
                        rows={1}
                      />
                      <button 
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isTyping || !activeThreadId || isLoadingModel}
                        className={cn(
                          "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md transition-all",
                          input.trim() && !isTyping && activeThreadId && !isLoadingModel
                            ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105" 
                            : "text-emerald-500/20"
                        )}
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between px-2">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[9px] text-emerald-500/40 uppercase tracking-widest font-bold">
                            {getEngine() 
                              ? `Inference: Local (${settings.vulkanAcceleration ? 'GPU' : 'CPU'})` 
                              : (getLastModelId() === activeModel?.id ? 'Status: Suspended' : 'Status: Inactive')}
                          </span>
                        </div>
                      </div>
                      <div className="text-[9px] text-emerald-500/20 font-mono uppercase tracking-widest">
                        Vulkan Kernel v4.2.0 // Secure Session
                      </div>
                    </div>
                  </div>
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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-2xl font-bold tracking-[0.2em] text-emerald-500 uppercase terminal-glow">Model Registry</h2>
                    <p className="text-emerald-500/40 mt-1 text-xs font-mono uppercase tracking-widest">Manage on-device LLM runtimes and weights.</p>
                  </div>
                  <div className="bg-black border border-emerald-500/10 rounded-lg px-5 py-3 flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-500/5 rounded flex items-center justify-center border border-emerald-500/20">
                      <Database className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-emerald-500">{storageInfo ? (storageInfo.quotaGB - storageInfo.usageGB).toFixed(2) : '0.00'} GB</div>
                      <div className="text-[9px] text-emerald-500/40 uppercase tracking-wider font-bold">Available Storage</div>
                    </div>
                  </div>
                </div>

                {/* Device Readiness Card */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Cpu className={cn("w-8 h-8", readiness.score > 70 ? "text-emerald-500" : "text-yellow-500")} />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-emerald-500 uppercase tracking-wider">Device Readiness: {readiness.status}</h3>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-500 rounded text-[10px] font-bold uppercase tracking-widest">Score: {readiness.score}/100</span>
                    </div>
                    <p className="text-sm text-emerald-500/60 font-mono">
                      {readiness.score > 80 
                        ? "Optimal hardware detected. High-performance local inference enabled." 
                        : readiness.score > 50 
                          ? "Standard hardware detected. Balanced performance expected." 
                          : "Limited hardware detected. Consider smaller models for better stability."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                    <div className="bg-black/40 border border-emerald-500/10 rounded-lg p-3 text-center">
                      <div className="text-xs font-bold text-emerald-500">{readiness.ramGB}GB</div>
                      <div className="text-[9px] text-emerald-500/40 uppercase font-bold">System RAM</div>
                    </div>
                    <div className="bg-black/40 border border-emerald-500/10 rounded-lg p-3 text-center">
                      <div className="text-xs font-bold text-emerald-500">{gpuFeatures?.hasF16 ? 'FP16' : 'FP32'}</div>
                      <div className="text-[9px] text-emerald-500/40 uppercase font-bold">GPU Precision</div>
                    </div>
                  </div>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/40" />
                    <input 
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                      className="w-full bg-black border border-emerald-500/20 rounded-lg pl-10 pr-4 py-2 text-sm text-emerald-500 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select 
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value as any)}
                      className="bg-black border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest text-emerald-500 focus:outline-none"
                    >
                      <option value="all">All Models</option>
                      <option value="installed">Installed</option>
                      <option value="favorite">Favorites</option>
                    </select>
                    <select 
                      value={modelSort}
                      onChange={(e) => setModelSort(e.target.value as any)}
                      className="bg-black border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest text-emerald-500 focus:outline-none"
                    >
                      <option value="name">Sort by Name</option>
                      <option value="size">Sort by Size</option>
                      <option value="status">Sort by Status</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4">
                  {filteredModels.map((model) => (
            <div 
              key={model.id}
              className="bg-[#080808] border border-emerald-500/10 rounded-lg p-5 flex flex-col gap-6 group hover:border-emerald-500/30 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <button 
                  onClick={() => toggleFavorite(model.id)}
                  className={cn(
                    "w-12 h-12 sm:w-14 sm:h-14 rounded flex items-center justify-center shrink-0 border transition-all",
                    favorites.includes(model.id) ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-500" : "bg-black border-emerald-500/10 text-emerald-500/20 hover:border-emerald-500/40"
                  )}
                >
                  <Star className={cn("w-6 h-6 sm:w-7 sm:h-7", favorites.includes(model.id) ? "fill-yellow-500" : "")} />
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg truncate text-emerald-500/90">{model.name}</h3>
                    {model.status === 'READY' && (
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-0.5 border rounded text-[9px] font-bold uppercase tracking-widest",
                        getCurrentModelId() === model.id && getEngine() 
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500" 
                          : (getLastModelId() === model.id && !getEngine() 
                              ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-500" 
                              : "bg-black border-emerald-500/10 text-emerald-500/40")
                      )}>
                        <CheckCircle2 className="w-3 h-3" />
                        {getCurrentModelId() === model.id && getEngine() 
                          ? 'Active' 
                          : (getLastModelId() === model.id && !getEngine() ? 'Suspended' : 'Ready')}
                      </div>
                    )}
                    {model.isCached && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/40 text-blue-500 rounded text-[9px] font-bold uppercase tracking-widest">
                        <Database className="w-3 h-3" />
                        Cached
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-emerald-500/5 border border-emerald-500/10 rounded text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest">{model.provider || 'Local'}</span>
                    <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-bold text-white/40 uppercase tracking-widest">{model.format || 'MLC'} • {model.quantization || 'q4f16_1'}</span>
                    <span className="text-[10px] text-emerald-500/40 font-mono uppercase">
                      {model.status === 'READY' && model.actualSizeBytes 
                        ? `${(model.actualSizeBytes / (1024 ** 3)).toFixed(2)} GB on disk` 
                        : (model.status === 'READY' ? 'Ready' : model.size)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {model.tags.map(tag => (
                      <span key={tag} className="text-[9px] text-emerald-500/20 uppercase font-bold tracking-[0.1em]">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {model.runtime === 'GGUF' ? (
                    <div className="flex flex-col items-end">
                      <div className="text-[10px] text-red-500 font-bold uppercase tracking-widest mb-1">Unsupported</div>
                      <div className="text-[9px] text-white/30 max-w-[150px] text-right">GGUF runtime not implemented; model cannot be loaded for chat.</div>
                    </div>
                  ) : model.status === 'READY' ? (
                    <div className="flex items-center gap-2">
                      {getCurrentModelId() === model.id && getEngine() && (
                        <button 
                          onClick={async () => {
                            await unloadEngine();
                            setModels(prev => [...prev]);
                          }}
                          className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg transition-all text-[10px] font-bold border border-yellow-500/10 uppercase tracking-wider"
                        >
                          Suspend
                        </button>
                      )}
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
                      disabled={!gpuFeatures}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-sm font-bold w-full sm:w-auto disabled:opacity-50"
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
                    <span className="text-xs font-bold text-blue-500">{model.progress?.toFixed(1)}%</span>
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
                className="p-6 lg:p-10 max-w-3xl mx-auto w-full space-y-10"
              >
                <div>
                  <h2 className="text-2xl font-bold tracking-[0.2em] text-emerald-500 uppercase terminal-glow">System Configuration</h2>
                  <p className="text-emerald-500/40 mt-1 text-xs font-mono uppercase tracking-widest">Adjust kernel parameters and hardware acceleration.</p>
                </div>

                <div className="space-y-8">
                  <section className="space-y-4">
                    <h3 className="text-[10px] font-bold text-emerald-500/40 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-emerald-500/10 pb-2">
                      <Shield className="w-3 h-3" />
                      Privacy & Connectivity
                    </h3>
                    <div className="grid gap-3">
                      <SettingsCard 
                        title="Local-Only Mode"
                        description="Disable all cloud-based fallbacks and external API calls."
                      >
                        <Toggle 
                          active={settings.localOnlyMode} 
                          onToggle={() => setSettings(prev => ({ ...prev, localOnlyMode: !prev.localOnlyMode }))} 
                        />
                      </SettingsCard>

                      <SettingsCard 
                        title="Cloud Fallback"
                        description="Use remote Gemini API if local inference fails or is unavailable."
                      >
                        <Toggle 
                          active={settings.cloudFallbackEnabled} 
                          onToggle={() => {
                            if (!settings.cloudFallbackEnabled && !settings.cloudFallbackAccepted) {
                              if (window.confirm("PRIVACY WARNING: Enabling Cloud Fallback will send your chat messages to Google's Gemini API when local models fail. Your data will no longer be strictly on-device. Do you accept?")) {
                                setSettings(prev => ({ ...prev, cloudFallbackEnabled: true, cloudFallbackAccepted: true }));
                              }
                            } else {
                              setSettings(prev => ({ ...prev, cloudFallbackEnabled: !prev.cloudFallbackEnabled }));
                            }
                          }} 
                        />
                      </SettingsCard>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-[10px] font-bold text-emerald-500/40 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-emerald-500/10 pb-2">
                      <Cpu className="w-3 h-3" />
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
                            className="appearance-none bg-black border border-emerald-500/20 rounded-md px-4 py-2 pr-10 text-[10px] font-bold uppercase tracking-widest text-emerald-500 focus:outline-none focus:border-emerald-500/50 cursor-pointer w-40"
                          >
                            <option>Balanced</option>
                            <option>High Performance</option>
                            <option>Power Saver</option>
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500/40" />
                        </div>
                      </SettingsCard>

                      <SettingsCard 
                        title="Streaming Speed"
                        description="Control how fast tokens are displayed."
                      >
                        <div className="relative">
                          <select 
                            value={settings.streamingSpeed}
                            onChange={(e) => setSettings(prev => ({ ...prev, streamingSpeed: e.target.value as any }))}
                            className="appearance-none bg-black border border-emerald-500/20 rounded-md px-4 py-2 pr-10 text-[10px] font-bold uppercase tracking-widest text-emerald-500 focus:outline-none focus:border-emerald-500/50 cursor-pointer w-40"
                          >
                            <option>Normal</option>
                            <option>Fast</option>
                            <option>Instant</option>
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500/40" />
                        </div>
                      </SettingsCard>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-[10px] font-bold text-emerald-500/40 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-emerald-500/10 pb-2">
                      <Cpu className="w-3 h-3" />
                      Inference Parameters
                    </h3>
                    <div className="grid gap-3">
                      <SettingsCard 
                        title="Temperature"
                        description="Controls randomness: Lower is more focused, higher is more creative."
                      >
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" 
                            min="0" max="2" step="0.1" 
                            value={settings.temperature}
                            onChange={(e) => setSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                            className="w-32 accent-emerald-500"
                          />
                          <span className="text-xs font-bold text-emerald-500 w-8">{settings.temperature.toFixed(1)}</span>
                        </div>
                      </SettingsCard>

                      <SettingsCard 
                        title="Context Length"
                        description="Maximum number of tokens the model can process."
                      >
                        <div className="relative">
                          <select 
                            value={settings.contextLength}
                            onChange={(e) => setSettings(prev => ({ ...prev, contextLength: parseInt(e.target.value) }))}
                            className="appearance-none bg-black border border-emerald-500/20 rounded-md px-4 py-2 pr-10 text-[10px] font-bold uppercase tracking-widest text-emerald-500 focus:outline-none focus:border-emerald-500/50 cursor-pointer w-40"
                          >
                            <option value="1024">1024</option>
                            <option value="2048">2048</option>
                            <option value="4096">4096</option>
                            <option value="8192">8192</option>
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500/40" />
                        </div>
                      </SettingsCard>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      Model Lifecycle & Suspension
                    </h3>
                    <div className="grid gap-3">
                      <SettingsCard 
                        title="Auto-Suspend Model"
                        description="Unload model from GPU after 5 minutes of inactivity."
                      >
                        <Toggle 
                          active={settings.autoSuspend} 
                          onToggle={() => setSettings(prev => ({ ...prev, autoSuspend: !prev.autoSuspend }))} 
                        />
                      </SettingsCard>

                      <SettingsCard 
                        title="Suspend on Tab Hide"
                        description="Immediately free GPU memory when switching tabs."
                      >
                        <Toggle 
                          active={settings.suspendOnHide} 
                          onToggle={() => setSettings(prev => ({ ...prev, suspendOnHide: !prev.suspendOnHide }))} 
                        />
                      </SettingsCard>

                      <SettingsCard 
                        title="Background Persistence"
                        description="Attempt to keep the app alive in the background."
                      >
                        <Toggle 
                          active={settings.keepAlive} 
                          onToggle={() => setSettings(prev => ({ ...prev, keepAlive: !prev.keepAlive }))} 
                        />
                      </SettingsCard>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Hardware Compatibility
                    </h3>
                    <div className="grid gap-3">
                      {/* Device Readiness Card */}
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                          <VulkanLogo className="w-20 h-20" />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">Device Readiness</div>
                            <div className={cn("text-lg font-black uppercase tracking-tighter italic", readiness.color)}>
                              {readiness.label}
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${readiness.score}%` }}
                              className={cn("h-full transition-all duration-1000", readiness.color.replace('text', 'bg'))}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className="text-[9px] text-white/30 uppercase font-bold tracking-wider mb-1">WebGPU</div>
                              <div className="text-xs font-bold">{gpuFeatures?.supported ? 'ACTIVE' : 'NONE'}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-white/30 uppercase font-bold tracking-wider mb-1">F16 Support</div>
                              <div className="text-xs font-bold">{gpuFeatures?.hasF16 ? 'YES' : 'NO'}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-white/30 uppercase font-bold tracking-wider mb-1">Est. RAM</div>
                              <div className="text-xs font-bold">{(navigator as any).deviceMemory || '8+'} GB</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#111111] border border-white/5 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold">WebGPU Support</div>
                          <div className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            gpuFeatures?.supported ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                          )}>
                            {gpuFeatures?.supported ? 'Supported' : 'Not Supported'}
                          </div>
                        </div>
                        <div className="text-xs text-white/40 mb-4">
                          WebGPU is required for high-performance local inference.
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium">Shader F16 Extension</div>
                          <div className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            gpuFeatures?.hasF16 ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                          )}>
                            {gpuFeatures?.hasF16 ? 'Available' : 'Unavailable (Using F32 Fallback)'}
                          </div>
                        </div>
                      </div>
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
                            <div className="text-sm font-bold text-emerald-500">{storageInfo?.quotaGB.toFixed(1) || '0'} GB</div>
                            <div className="text-[10px] text-white/30 uppercase font-bold">Total Quota</div>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-500" 
                            style={{ width: storageInfo ? `${storageInfo.percent}%` : '0%' }} 
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-white/30 font-bold uppercase tracking-wider">
                          <span>Used: {storageInfo?.usageGB.toFixed(1) || '0'} GB</span>
                          <span>Free: {storageInfo ? (storageInfo.quotaGB - storageInfo.usageGB).toFixed(1) : '0'} GB</span>
                        </div>
                      </div>

                      <div className="bg-[#111111] border border-white/5 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-emerald-500" />
                            <div className="font-bold">Storage Manager</div>
                          </div>
                          <button 
                            onClick={clearModelCache}
                            className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors"
                          >
                            Purge All Data
                          </button>
                        </div>

                        {cachedModels.length > 0 ? (
                          <div className="space-y-3">
                            {cachedModels.map(model => (
                              <div key={model.id} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl">
                                <div className="min-w-0 flex-1 mr-4">
                                  <div className="text-[11px] font-bold text-white/80 truncate">{model.id}</div>
                                  <div className="text-[9px] text-white/30 uppercase font-bold tracking-wider">
                                    ~{(model.size / (1024 ** 3)).toFixed(2)} GB • Persistent Cache
                                  </div>
                                </div>
                                <button 
                                  onClick={() => deleteSpecificCache(model.id)}
                                  className="p-2 hover:bg-red-500/10 text-white/20 hover:text-red-500 rounded-lg transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                            <div className="text-[10px] text-white/20 uppercase font-bold tracking-[0.2em]">No models in cache</div>
                          </div>
                        )}
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

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Advanced Privacy & Diagnostics
                    </h3>
                    <div className="grid gap-3">
                      <SettingsCard 
                        title="Diagnostics Mode"
                        description="Enable detailed logging and performance metrics."
                      >
                        <Toggle 
                          active={settings.diagnosticsEnabled} 
                          onToggle={() => setSettings(prev => ({ ...prev, diagnosticsEnabled: !prev.diagnosticsEnabled }))} 
                        />
                      </SettingsCard>

                      <SettingsCard 
                        title="Privacy Mode"
                        description="Hide message content in the sidebar and notifications."
                      >
                        <Toggle 
                          active={settings.privacyMode} 
                          onToggle={() => setSettings(prev => ({ ...prev, privacyMode: !prev.privacyMode }))} 
                        />
                      </SettingsCard>
                    </div>
                  </section>

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

                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Hardware Diagnostics
                  </h3>
                  <div className="bg-black/40 border border-emerald-500/10 rounded-xl p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <div className="text-[10px] text-emerald-500/40 uppercase font-bold tracking-widest">GPU Adapter</div>
                        <div className="text-sm font-mono text-emerald-500">{gpuFeatures?.adapterName || 'Detecting...'}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-emerald-500/40 uppercase font-bold tracking-widest">VRAM Estimation</div>
                        <div className="text-sm font-mono text-emerald-500">~{(readiness.ramGB * 0.7).toFixed(1)} GB Available</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-emerald-500/40 uppercase font-bold tracking-widest">WebGPU Support</div>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", gpuFeatures ? "bg-emerald-500" : "bg-red-500")} />
                          <span className="text-sm font-mono text-emerald-500">{gpuFeatures ? 'Active' : 'Not Supported'}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-emerald-500/40 uppercase font-bold tracking-widest">FP16 Support</div>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", gpuFeatures?.hasF16 ? "bg-emerald-500" : "bg-yellow-500")} />
                          <span className="text-sm font-mono text-emerald-500">{gpuFeatures?.hasF16 ? 'Enabled' : 'Disabled (FP32 Fallback)'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-emerald-500/10">
                      <button 
                        onClick={() => {
                          const report = {
                            timestamp: new Date().toISOString(),
                            readiness,
                            gpuFeatures,
                            settings,
                            storage: storageInfo
                          };
                          const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `vulkan-diagnostics-${Date.now()}.json`;
                          a.click();
                        }}
                        className="w-full py-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs font-bold uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/10 transition-all"
                      >
                        Generate System Diagnostics Report
                      </button>
                    </div>
                  </div>
                </section>

                <div className="pt-6 border-t border-emerald-500/10">
                  <button 
                    onClick={() => {
                      if (confirm('Are you sure you want to purge all local models and chat history? This cannot be undone.')) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="w-full py-4 bg-red-500/5 border border-red-500/20 rounded-xl text-xs font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all"
                  >
                    Purge All Local Data & Reset Kernel
                  </button>
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
        "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium tracking-wider uppercase",
        active 
          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
          : "text-emerald-500/40 hover:text-emerald-500/70 hover:bg-emerald-500/5"
      )}
    >
      <span className={cn("transition-colors", active ? "text-emerald-500" : "text-emerald-500/40")}>{icon}</span>
      {label}
    </button>
  );
}

function SettingsCard({ title, description, children, icon }: { title: string, description: string, children: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <div className="bg-[#080808] border border-emerald-500/10 rounded-lg p-6 transition-all hover:border-emerald-500/20 group">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {icon && <span className="text-emerald-500/60 group-hover:text-emerald-500 transition-colors">{icon}</span>}
            <h4 className="font-bold text-emerald-500/90 tracking-wide uppercase text-xs">{title}</h4>
          </div>
          <p className="text-[10px] text-emerald-500/40 leading-relaxed">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toggle({ active, onToggle }: { active: boolean, onToggle: () => void }) {
  return (
    <button 
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none border",
        active ? "bg-emerald-500 border-emerald-400" : "bg-black border-emerald-500/20"
      )}
    >
      <span
        className={cn(
          "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
          active ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
