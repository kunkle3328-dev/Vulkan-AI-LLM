import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("[Server] Starting Express server...");
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV}`);
  
  // Write a startup file for verification
  fs.writeFileSync(path.join(__dirname, "server-started.txt"), `Started at ${new Date().toISOString()}`);

  const app = express();
  const PORT = 3000;

  // Request logger
  app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
  });

  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  apiRouter.get("/test-error", (req, res) => {
    console.log("[Server] Test error route triggered");
    res.status(500).send("This is a test error message from the server");
  });

  const MODEL_SIZES: Record<string, number> = {
    'gemma-2b-it': 1503238553,
    'phi-3-mini': 2297503744,
    'llama-3-8b': 5046586572,
    'mistral-7b-v0.3': 4402341478,
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': 1932735283,
    'Mistral-7B-Instruct-v0.3-q4f16_1-MLC': 4402341478,
    'Llama-3-8B-Instruct-v0.1-q4f16_1-MLC': 5046586572,
    'Gemma-2b-it-q4f16_1-MLC': 1503238553
  };

  apiRouter.get("/download/model/:id", async (req, res) => {
    const modelId = req.params.id;
    console.log(`[Server] Download request for: ${modelId}`);
    
    const totalSize = MODEL_SIZES[modelId];
    if (!totalSize) {
      console.error(`[Server] Model not found in registry: ${modelId}`);
      return res.status(404).send(`Model ${modelId} not found in server registry.`);
    }

    // Handle Range header
    const range = req.headers.range;
    let start = 0;
    let end = totalSize - 1;

    if (range) {
      try {
        const rangeStr = Array.isArray(range) ? range[0] : range;
        const parts = rangeStr.replace(/bytes=/, "").split("-");
        
        const startPart = parts[0].trim();
        const endPart = parts[1] ? parts[1].trim() : "";

        if (startPart) {
          start = parseInt(startPart, 10);
        }
        
        if (endPart) {
          end = parseInt(endPart, 10);
        } else {
          end = totalSize - 1;
        }
        
        if (isNaN(start)) start = 0;
        if (isNaN(end)) end = totalSize - 1;

        if (start >= totalSize) {
          console.warn(`[Server] Range not satisfiable: ${start} >= ${totalSize}`);
          res.status(416).set('Content-Range', `bytes */${totalSize}`).send('Requested range not satisfiable');
          return;
        }
        
        // Ensure end is not beyond totalSize
        end = Math.min(end, totalSize - 1);
        
        console.log(`[Server] Serving range: ${start}-${end}/${totalSize}`);
      } catch (rangeErr: any) {
        console.error(`[Server] Range parsing error: ${rangeErr.message}`);
        return res.status(400).send("Invalid Range header");
      }
    }

    const contentLength = end - start + 1;
    
    // Set headers using Express API for better compatibility
    res.status(range ? 206 : 200);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${modelId}.bin"`,
      'Content-Length': contentLength,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff'
    });

    if (range) {
      res.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    }

    // Use a simpler stream implementation to avoid potential issues with Readable constructor
    let sentBytes = start;
    const chunkSize = 1024 * 512; // 512KB chunks

    const sendChunk = () => {
      if (sentBytes > end) {
        res.end();
        return;
      }

      const remaining = end - sentBytes + 1;
      const currentChunkSize = Math.min(chunkSize, remaining);
      
      try {
        const buffer = Buffer.alloc(currentChunkSize);
        // In a real app, we would read from disk here:
        // fs.readSync(fd, buffer, 0, currentChunkSize, sentBytes);
        
        const canContinue = res.write(buffer);
        sentBytes += currentChunkSize;

        if (canContinue) {
          // Use setImmediate to avoid blocking the event loop too much
          setImmediate(sendChunk);
        } else {
          res.once('drain', sendChunk);
        }
      } catch (err: any) {
        console.error(`[Server] Error during chunk send for ${modelId}:`, err);
        res.destroy();
      }
    };

    sendChunk();

    req.on('close', () => {
      // Stop sending if client closes connection
      sentBytes = end + 1;
    });
  });

  app.use("/api", apiRouter);

  // Catch-all for API routes that aren't matched
  app.use("/api/*", (req, res) => {
    console.log(`[Server] 404 - API Route not found: ${req.originalUrl}`);
    res.status(404).json({ error: "API Route not found" });
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[Server] Global Error:", err);
    if (!res.headersSent) {
      res.status(500).send(`Internal Server Error: ${err.message || 'Unknown'}`);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
