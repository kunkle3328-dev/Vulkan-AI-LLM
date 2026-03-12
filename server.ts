import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { MODEL_MANIFEST } from "./src/models/manifest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("[Server] Starting Express server...");
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV}`);
  
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

  apiRouter.get("/manifest", (req, res) => {
    res.json(MODEL_MANIFEST);
  });

  apiRouter.get("/download/model/:id", async (req, res) => {
    const modelId = req.params.id;
    console.log(`[Server] Download request for: ${modelId}`);
    
    const manifestEntry = MODEL_MANIFEST.find(m => m.modelId === modelId);
    if (!manifestEntry) {
      console.error(`[Server] Model not found in manifest: ${modelId}`);
      return res.status(404).send(`Model ${modelId} not found in manifest.`);
    }

    // For now, we continue to mock the download as the actual files aren't on the server disk
    const totalSize = manifestEntry.totalBytes;
    
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

        if (startPart) start = parseInt(startPart, 10);
        if (endPart) end = parseInt(endPart, 10);
        else end = totalSize - 1;
        
        if (isNaN(start)) start = 0;
        if (isNaN(end)) end = totalSize - 1;

        if (start >= totalSize) {
          res.status(416).set('Content-Range', `bytes */${totalSize}`).send('Requested range not satisfiable');
          return;
        }
        
        end = Math.min(end, totalSize - 1);
      } catch (rangeErr: any) {
        return res.status(400).send("Invalid Range header");
      }
    }

    const contentLength = end - start + 1;
    
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
        // Mocking data
        const canContinue = res.write(buffer);
        sentBytes += currentChunkSize;

        if (canContinue) setImmediate(sendChunk);
        else res.once('drain', sendChunk);
      } catch (err: any) {
        console.error(`[Server] Error during chunk send for ${modelId}:`, err);
        res.destroy();
      }
    };

    sendChunk();

    req.on('close', () => {
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
