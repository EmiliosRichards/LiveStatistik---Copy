import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { warmChartCache } from "./cache-warmer";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

if (process.env.PREVIEW_BASIC_AUTH === '1') {
  app.use((req, res, next) => {
    if (req.path === '/healthz') {
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Preview Environment"');
      return res.status(401).send('Authentication required');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const validUser = process.env.PREVIEW_USER;
    const validPass = process.env.PREVIEW_PASS;

    if (username === validUser && password === validPass) {
      next();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Preview Environment"');
      res.status(401).send('Invalid credentials');
    }
  });
}

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
    commit: "66a4fb8"
  });
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  }
  // In production, Express is API-only (port 5001)
  // Next.js (port 5000) handles the frontend and proxies API requests here

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0';
  const listenOpts: any = { port, host };
  if (process.platform !== 'win32') {
    listenOpts.reusePort = true;
  }
  server.listen(listenOpts, () => {
    log(`serving on port ${port}`);
    
    // Pre-warm chart cache in background (don't block startup)
    // In production, delay significantly to ensure Next.js starts first
    const cacheWarmerDelay = process.env.NODE_ENV === 'production' ? 90000 : 5000;
    setTimeout(() => {
      warmChartCache().catch(err => {
        console.error('Cache warmer failed:', err);
      });
    }, cacheWarmerDelay); // Wait for servers to be fully ready
  });
})();
