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
    res.status(500).send("This is a test error message");
  });

  const MODEL_SIZES: Record<string, number> = {
    'gemma-2b-it': 1503238553,
    'phi-3-mini': 2297503744,
    'llama-3-8b': 5046586572,
    'mistral-7b-v0.3': 4402341478
  };

  apiRouter.get("/download/model/:id", async (req, res) => {
    const modelId = req.params.id;
    console.log(`[Server] Starting download for model: ${modelId}`);
    
    const totalSize = MODEL_SIZES[modelId] || 50 * 1024 * 1024; 
    const chunkSize = 1024 * 128; // 128KB chunks

    // Handle Range header
    const range = req.headers.range;
    let start = 0;
    let end = totalSize - 1;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      
      if (start >= totalSize) {
        res.status(416).send(`Requested range not satisfiable\n${start} >= ${totalSize}`);
        return;
      }
    }

    const contentLength = end - start + 1;

    const headers: Record<string, string | number> = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${modelId}.bin"`,
      'Content-Length': contentLength,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'identity'
    };

    if (range && typeof range === 'string') {
      console.log(`[Server] Range requested: ${range}`);
      headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`;
    }

    try {
      res.writeHead(range ? 206 : 200, headers);

      let sentBytes = start;
      const stream = new Readable({
        read() {
          if (sentBytes > end) {
            this.push(null);
            return;
          }

          const remaining = end - sentBytes + 1;
          const currentChunk = Math.min(chunkSize, remaining);
          
          // In a real app, we would read from disk here
          // For simulation, we send a buffer of zeros
          const buffer = Buffer.alloc(currentChunk);
          sentBytes += currentChunk;
          
          this.push(buffer);
        }
      });

      stream.on('error', (err) => {
        console.error(`[Server] Stream error for ${modelId}:`, err);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy();
        }
      });

      stream.pipe(res);

      req.on('close', () => {
        console.log(`[Server] Client closed connection for model: ${modelId}`);
        stream.destroy();
      });

    } catch (err: any) {
      console.error(`[Server] Fatal error starting download for ${modelId}:`, err);
      if (!res.headersSent) {
        res.status(500).send(`Failed to start download: ${err.message}`);
      }
    }
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
