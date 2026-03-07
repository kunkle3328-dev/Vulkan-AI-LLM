import React, { useState, useEffect, useRef, memo } from 'react';
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
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Model, Settings, Message, ModelStatus, ChatThread } from './types';
import { streamChatResponse } from './services/geminiService';
import { modelDownloader } from './services/modelDownloader';

import { boot } from './services/webllmBoot';
import { checkWebGPUFeatures } from './services/webgpuUtils';
import { getEngine, streamWebLLMChat, getCurrentModelId, getLastModelId, unloadEngine } from './services/webllmService';
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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_MODELS: Model[] = [
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    runtime: 'WEBLLM',
    size: '1.8 GB',
    sizeBytes: 1932735283,
    tags: ['FAST', 'MOBILE OPTIMIZED'],
    status: 'NOT_INSTALLED',
    description: 'Meta\'s Llama 3.2 3B Instruct model. Optimized for mobile devices with high quality and speed.',
    recommendation: 'Best for Galaxy S25 and modern Android phones. Fast and capable.'
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B',
    runtime: 'WEBLLM',
    size: '1.9 GB',
    sizeBytes: 2040109465,
    tags: ['BALANCED', 'MOBILE'],
    status: 'NOT_INSTALLED',
    description: 'Alibaba\'s Qwen 2.5 3B model. Exceptional performance for its size, especially in math and coding.',
    recommendation: 'Perfect for high-end mobile devices like Galaxy S25. Very balanced and capable.'
  },
  {
    id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 Coder 3B',
    runtime: 'WEBLLM',
    size: '1.9 GB',
    sizeBytes: 2040109465,
    tags: ['CODING', 'MOBILE'],
    status: 'NOT_INSTALLED',
    description: 'Specialized coding version of Qwen 2.5 3B. Highly capable at programming tasks.',
    recommendation: 'Best for developers on mobile. Fast and accurate coding assistance.'
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B',
    runtime: 'WEBLLM',
    size: '1.6 GB',
    sizeBytes: 1717986918,
    tags: ['EFFICIENT', 'GOOGLE'],
    status: 'NOT_INSTALLED',
    description: 'Google\'s latest Gemma 2 2B model. Offers state-of-the-art performance for its compact size.',
    recommendation: 'Highly recommended for Galaxy S25. Exceptional quality-to-size ratio.'
  },
  {
    id: 'DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC',
    name: 'DeepSeek R1 Qwen 1.5B',
    runtime: 'WEBLLM',
    size: '1.1 GB',
    sizeBytes: 1181116006,
    tags: ['REASONING', 'FAST'],
    status: 'NOT_INSTALLED',
    description: 'DeepSeek R1 distilled model based on Qwen 1.5B. Specialized in complex reasoning and logic.',
    recommendation: 'Best for logical tasks on mobile. Very fast reasoning.'
  },
  {
    id: 'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC',
    name: 'DeepSeek R1 Llama 8B',
    runtime: 'WEBLLM',
    size: '5.2 GB',
    sizeBytes: 5583457484,
    tags: ['REASONING', 'POWERFUL'],
    status: 'NOT_INSTALLED',
    description: 'DeepSeek R1 distilled model based on Llama 3 8B. Industry-leading reasoning performance.',
    recommendation: 'Best for high-end mobile devices like S25 Ultra or desktops. Requires 8GB+ RAM.'
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    runtime: 'WEBLLM',
    size: '0.8 GB',
    sizeBytes: 858993459,
    tags: ['ULTRA-FAST', 'MOBILE'],
    status: 'NOT_INSTALLED',
    description: 'Meta\'s smallest Llama 3.2 model. Extremely fast and efficient for basic tasks.',
    recommendation: 'Best for entry-level mobile devices and ultra-fast responses.'
  },
  {
    id: 'Llama-3-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3 8B',
    runtime: 'WEBLLM',
    size: '4.7 GB',
    sizeBytes: 5046586572,
    tags: ['POWERFUL', 'GENERAL'],
    status: 'NOT_INSTALLED',
    description: 'The latest generation of Meta\'s Llama models. Offers industry-leading performance for its parameter class.',
    recommendation: 'Recommended for high-end PCs with dedicated GPUs. Best for creative writing and complex reasoning.'
  },
  {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B v0.3',
    runtime: 'WEBLLM',
    size: '4.1 GB',
    sizeBytes: 4402341478,
    tags: ['BALANCED', 'CODING'],
    status: 'NOT_INSTALLED',
    description: 'A highly efficient and versatile model from Mistral AI. Known for its strong performance in coding and English tasks.',
    recommendation: 'Recommended for devices with at least 8GB RAM. Best for coding assistance and general purpose chat.'
  },
  {
    id: 'Qwen2-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2 1.5B',
    runtime: 'WEBLLM',
    size: '1.1 GB',
    sizeBytes: 1181116006,
    tags: ['FAST', 'MULTILINGUAL'],
    status: 'NOT_INSTALLED',
    description: 'Alibaba\'s Qwen2 1.5B Instruct model. Excellent multilingual support and reasoning for its size.',
    recommendation: 'Great for multilingual tasks and efficient reasoning on mid-range devices.'
  },
  {
    id: 'DeepSeek-Coder-V2-Lite-Instruct-q4f16_1-MLC',
    name: 'DeepSeek Coder V2 Lite',
    runtime: 'WEBLLM',
    size: '4.5 GB',
    sizeBytes: 4831838208,
    tags: ['CODING', 'POWERFUL'],
    status: 'NOT_INSTALLED',
    description: 'DeepSeek\'s specialized coding model. Highly capable at programming tasks across many languages.',
    recommendation: 'Best for developers and complex coding assistance. Requires 8GB+ RAM.'
  },
  {
    id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
    name: 'Phi-3 Mini (3.8B)',
    runtime: 'WEBLLM',
    size: '2.14 GB',
    sizeBytes: 2297503744,
    tags: ['CHAT', 'REASONING'],
    status: 'NOT_INSTALLED',
    description: 'Microsoft\'s highly capable small language model. Excels at reasoning, logic, and math tasks despite its size.',
    recommendation: 'Recommended for mid-range devices. Best for logical reasoning and structured data tasks.'
  },
  {
    id: 'gemma-2b-it-q4f16_1-MLC',
    name: 'Gemma 2B IT',
    runtime: 'WEBLLM',
    size: '1.4 GB',
    sizeBytes: 1503238553,
    tags: ['LIGHTWEIGHT', 'GOOGLE'],
    status: 'NOT_INSTALLED',
    description: 'Google\'s lightweight Gemma model. Fast and efficient for simple tasks and chat.',
    recommendation: 'Best for entry-level devices. Very fast response times.'
  },
  {
    id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    name: 'TinyLlama 1.1B',
    runtime: 'WEBLLM',
    size: '0.7 GB',
    sizeBytes: 751619276,
    tags: ['LIGHTWEIGHT', 'FAST'],
    status: 'NOT_INSTALLED',
    description: 'A compact 1.1B parameter model trained on 3 trillion tokens. Surprisingly capable for its size.',
    recommendation: 'Perfect for low-resource devices and simple chat interactions.'
  },
  {
    id: 'SmolLM-135M-Instruct-q4f16_1-MLC',
    name: 'SmolLM 135M',
    runtime: 'WEBLLM',
    size: '0.1 GB',
    sizeBytes: 107374182,
    tags: ['EXPERIMENTAL', 'TINY'],
    status: 'NOT_INSTALLED',
    description: 'Hugging Face\'s ultra-compact SmolLM model. Designed for testing and extremely low-resource environments.',
    recommendation: 'Experimental use only. Useful for testing the app infrastructure without large downloads.'
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.1 8B',
    runtime: 'WEBLLM',
    size: '5.1 GB',
    sizeBytes: 5476083302,
    tags: ['POWERFUL', 'LATEST'],
    status: 'NOT_INSTALLED',
    description: 'The upgraded Llama 3.1 model with 128k context support. Offers significant improvements in reasoning and multilingual capabilities.',
    recommendation: 'Recommended for high-end PCs. Best for long-context tasks and complex reasoning.'
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 7B',
    runtime: 'WEBLLM',
    size: '4.5 GB',
    sizeBytes: 4831838208,
    tags: ['BALANCED', 'MULTILINGUAL'],
    status: 'NOT_INSTALLED',
    description: 'Alibaba\'s latest Qwen 2.5 model. Highly competitive performance across benchmarks, especially in math and coding.',
    recommendation: 'Excellent all-rounder for devices with 8GB+ RAM.'
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi-3.5 Mini',
    runtime: 'WEBLLM',
    size: '2.2 GB',
    sizeBytes: 2362232012,
    tags: ['REASONING', 'MICROSOFT'],
    status: 'NOT_INSTALLED',
    description: 'The latest iteration of Microsoft\'s Phi-3.5 mini. Enhanced reasoning capabilities and improved instruction following.',
    recommendation: 'Great for logical tasks on mid-range hardware.'
  },
  {
    id: 'Gemma-2-9b-it-q4f16_1-MLC',
    name: 'Gemma 2 9B',
    runtime: 'WEBLLM',
    size: '5.5 GB',
    sizeBytes: 5905580032,
    tags: ['POWERFUL', 'GOOGLE'],
    status: 'NOT_INSTALLED',
    description: 'Google\'s Gemma 2 9B model. Features a new architecture that delivers class-leading performance for its size.',
    recommendation: 'Best for high-end desktops. Exceptional quality for creative and analytical tasks.'
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B',
    runtime: 'WEBLLM',
    size: '1.1 GB',
    sizeBytes: 1181116006,
    tags: ['FAST', 'EFFICIENT'],
    status: 'NOT_INSTALLED',
    description: 'The second generation of SmolLM. Significantly more capable than the first version while remaining extremely fast.',
    recommendation: 'Excellent for mobile devices and fast interactions.'
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M',
    runtime: 'WEBLLM',
    size: '0.3 GB',
    sizeBytes: 322122547,
    tags: ['ULTRA-LIGHT', 'FAST'],
    status: 'NOT_INSTALLED',
    description: 'A tiny but surprisingly smart model. Perfect for basic classification or simple chat on very low-end hardware.',
    recommendation: 'Best for testing or extremely resource-constrained environments.'
  }
];

const DEFAULT_SETTINGS: Settings = {
  performanceMode: 'Balanced',
  isolatedInference: true,
  vulkanAcceleration: false,
  autoSuspend: true,
  suspendOnHide: false,
  keepAlive: true
};

function VulkanLogo({ className = "w-8 h-8", animated = true }: { className?: string, animated?: boolean }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <motion.svg 
        viewBox="0 0 100 100" 
        className="w-full h-full"
        initial={animated ? { rotate: -90, opacity: 0 } : false}
        animate={animated ? { rotate: 0, opacity: 1 } : false}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        {/* Outer Hexagon */}
        <motion.path
          d="M50 5 L90 25 L90 75 L50 95 L10 75 L10 25 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          initial={animated ? { pathLength: 0 } : false}
          animate={animated ? { pathLength: 1 } : false}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="text-emerald-500"
        />
        {/* Inner Core */}
        <motion.path
          d="M50 25 L75 40 L75 60 L50 75 L25 60 L25 40 Z"
          fill="currentColor"
          initial={animated ? { scale: 0, opacity: 0 } : false}
          animate={animated ? { scale: [0, 1.2, 1], opacity: 1 } : false}
          transition={{ delay: 1, duration: 1, times: [0, 0.7, 1] }}
          className="text-emerald-400"
        />
        {/* Pulsing Ring */}
        {animated && (
          <motion.path
            d="M50 5 L90 25 L90 75 L50 95 L10 75 L10 25 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="text-emerald-500/30"
          />
        )}
      </motion.svg>
    </div>
  );
}

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  
  const bootSequence = [
    "INITIALIZING VULKAN KERNEL v4.2.0...",
    "CHECKING WEBGPU CAPABILITIES...",
    "DETECTING HARDWARE ACCELERATION...",
    "MOUNTING OPFS STORAGE SYSTEM...",
    "LOADING NEURAL ENGINE RUNTIME...",
    "VERIFYING MODEL REGISTRY INTEGRITY...",
    "ESTABLISHING SECURE INFERENCE TUNNEL...",
    "SYSTEM READY. WELCOME TO THE FUTURE."
  ];

  useEffect(() => {
    let currentLog = 0;
    const logInterval = setInterval(() => {
      if (currentLog < bootSequence.length) {
        setLogs(prev => [...prev, `> ${bootSequence[currentLog]}`]);
        currentLog++;
        setProgress((currentLog / bootSequence.length) * 100);
      } else {
        clearInterval(logInterval);
        setTimeout(onComplete, 1000);
      }
    }, 400);

    return () => clearInterval(logInterval);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#050505] z-[100] flex flex-col items-center justify-center p-8 font-mono"
    >
      <div className="scanline" />
      
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center gap-6">
          <VulkanLogo className="w-24 h-24" />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <h1 className="text-3xl font-bold tracking-[0.2em] text-emerald-500 terminal-glow">VULKAN AI</h1>
            <p className="text-emerald-500/40 text-xs mt-2 tracking-widest uppercase">Decentralized Local Intelligence</p>
          </motion.div>
        </div>

        <div className="space-y-4 bg-black/40 border border-emerald-500/20 p-6 rounded-lg backdrop-blur-sm">
          <div className="h-48 overflow-hidden flex flex-col justify-end gap-1">
            <AnimatePresence mode="popLayout">
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[10px] text-emerald-500/70 leading-relaxed"
                >
                  {log}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] text-emerald-500/40 uppercase tracking-tighter">
              <span>Booting System</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1 w-full bg-emerald-500/10 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </div>

        <motion.div 
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-center text-[9px] text-emerald-500/20 uppercase tracking-[0.3em]"
        >
          Secure Environment Active
        </motion.div>
      </div>
    </motion.div>
  );
}

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
        "group flex flex-col gap-2 max-w-[85%] md:max-w-[75%]",
        message.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
      )}
    >
      <div className="flex items-center gap-2 px-2">
        <span className="text-[10px] text-emerald-500/40 uppercase tracking-widest font-bold">
          {message.role === 'user' ? 'Local User' : 'Neural Response'}
        </span>
        <span className="text-[9px] text-white/10">{message.timestamp}</span>
        {message.role === 'assistant' && (
          <CopyButton text={message.content} className="opacity-0 group-hover:opacity-100" />
        )}
      </div>
      
      <div className={cn(
        "relative p-4 rounded-2xl text-sm leading-relaxed",
        message.role === 'user' 
          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 rounded-tr-none" 
          : "bg-white/5 border border-white/10 text-white/90 rounded-tl-none"
      )}>
        <div className="prose prose-invert prose-sm max-w-none">
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
                  <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-emerald-400", className)} {...props}>
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

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [view, setView] = useState<'chat' | 'models' | 'settings'>('chat');
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

      // Sync names and metadata from INITIAL_MODELS to fix identity bugs
      const syncedModels = parsed.map(m => {
        // Match either the exact ID or the f16/f32 variant counterpart
        const initial = INITIAL_MODELS.find(im => 
          im.id === m.id || 
          im.id === m.id.replace('q4f32_1', 'q4f16_1') ||
          im.id === m.id.replace('q4f16_1', 'q4f32_1')
        );
        // Reset stuck downloads on load
        const status = m.status === 'DOWNLOADING' ? 'NOT_INSTALLED' : m.status;
        if (initial) {
          return { 
            ...m, 
            status,
            runtime: initial.runtime, // Ensure runtime is updated
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

      // Add any new models from INITIAL_MODELS that aren't in syncedModels
      const newModels = INITIAL_MODELS.filter(im => 
        !syncedModels.some(sm => 
          sm.id === im.id || 
          sm.id === im.id.replace('q4f16_1', 'q4f32_1') ||
          sm.id === im.id.replace('q4f32_1', 'q4f16_1')
        )
      );

      return [...syncedModels, ...newModels];
    }
    return INITIAL_MODELS;
  });
  
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('vulkan_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
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
  const [gpuFeatures, setGpuFeatures] = useState<{ supported: boolean, hasF16: boolean } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeApp = async () => {
      // 1. Check GPU Features
      const features = await checkWebGPUFeatures();
      setGpuFeatures({ supported: features.supported, hasF16: features.hasF16 });
      
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
          isDownloaded = await modelDownloader.isModelDownloaded(m.id);
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
            setThreads(prev => prev.map(t => {
              if (t.id === activeThreadId) {
                return {
                  ...t,
                  messages: [...t.messages, {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: `Error: Failed to load model. ${bootErr.message}`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }]
                };
              }
              return t;
            }));
            setStreamingMessage(null);
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

  const updateThreadModel = (modelId: string) => {
    setIsLoadingModel(true);
    setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, modelId } : t));
    // Simulate model loading into memory
    setTimeout(() => setIsLoadingModel(false), 1500);
  };

  return (
    <div className="flex h-screen bg-[#050505] text-[#E0E0E0] font-mono overflow-hidden selection:bg-emerald-500/30">
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
        <header className="h-16 border-b border-emerald-500/10 flex items-center justify-between px-4 lg:px-8 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-emerald-500/10 rounded-lg lg:hidden"
            >
              <Menu className="w-6 h-6 text-emerald-500/60" />
            </button>
            <h1 className="text-xs font-bold tracking-[0.2em] text-emerald-500 uppercase terminal-glow">{view}</h1>
            
            {view === 'chat' && activeThreadId && (
              <div className="relative ml-2 flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={activeThread?.modelId}
                    onChange={(e) => updateThreadModel(e.target.value)}
                    className="appearance-none bg-black border border-emerald-500/20 rounded-lg px-4 py-1.5 pr-10 text-[10px] font-bold uppercase tracking-widest text-emerald-500 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                  >
                    {models.filter(m => m.status === 'READY').map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500/40" />
                </div>
                {isLoadingModel && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-[9px] text-emerald-500 font-bold uppercase tracking-widest"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Syncing Weights...
                  </motion.div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
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
                <div className="flex items-center justify-between">
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

        <div className="grid gap-4">
          {models.map((model) => (
            <div 
              key={model.id}
              className="bg-[#080808] border border-emerald-500/10 rounded-lg p-5 flex flex-col gap-6 group hover:border-emerald-500/30 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <div className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 rounded flex items-center justify-center shrink-0 border",
                  model.status === 'READY' ? "bg-emerald-500/5 border-emerald-500/40" : "bg-black border-emerald-500/10"
                )}>
                  <Database className={cn("w-6 h-6 sm:w-7 sm:h-7", model.status === 'READY' ? "text-emerald-500" : "text-emerald-500/20")} />
                </div>
                
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 bg-emerald-500/5 border border-emerald-500/10 rounded text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest">{model.runtime}</span>
                    <span className="text-[10px] text-emerald-500/40 font-mono uppercase">
                      {model.status === 'READY' && model.actualSizeBytes 
                        ? `${(model.actualSizeBytes / (1024 ** 3)).toFixed(2)} GB on disk` 
                        : (model.status === 'READY' ? 'Ready' : model.size)}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {model.tags.map(tag => (
                        <span key={tag} className="text-[9px] text-emerald-500/20 uppercase font-bold tracking-[0.1em]">{tag}</span>
                      ))}
                    </div>
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
          <p className="text-[10px] text-emerald-500/40 leading-relaxed font-mono">{description}</p>
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
