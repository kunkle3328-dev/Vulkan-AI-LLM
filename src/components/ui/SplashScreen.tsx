import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';

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
        <motion.path
          d="M50 25 L75 40 L75 60 L50 75 L25 60 L25 40 Z"
          fill="currentColor"
          initial={animated ? { scale: 0, opacity: 0 } : false}
          animate={animated ? { scale: [0, 1.2, 1], opacity: 1 } : false}
          transition={{ delay: 1, duration: 1, times: [0, 0.7, 1] }}
          className="text-emerald-400"
        />
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

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
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
