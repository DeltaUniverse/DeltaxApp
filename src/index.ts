/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { Hono } from 'hono';
import { TelegramBotServer } from './core';
import { AUTO_MODULES } from './modules';
import type { Env } from './types';
import { HTTP_HEADERS } from './config';

/**
 * Singleton bot server instance to leverage isolate memory caching across warm requests
 */
let botServerInstance: TelegramBotServer | null = null;

export function getBotServer(token: string): TelegramBotServer {
  if (!botServerInstance) {
    botServerInstance = new TelegramBotServer(token);
    // Auto-register all discovered modules
    botServerInstance.registerModules(AUTO_MODULES);
    console.log(`[Worker] Initialized TelegramBotServer with ${AUTO_MODULES.length} auto-loaded modules.`);
  }
  return botServerInstance;
}

/**
 * Hono Application for Cloudflare Workers
 */
const app = new Hono<{ Bindings: Env }>();

// Guard against missing BOT_TOKEN
app.use('*', async (c, next) => {
  if (!c.env.BOT_TOKEN) {
    return c.json(
      {
        error: 'Configuration Error',
        message: 'BOT_TOKEN is missing. Please set BOT_TOKEN in .dev.vars (for dev) or run `wrangler secret put BOT_TOKEN` (for production).',
      },
      500
    );
  }
  await next();
});

// Delegate all routing cleanly to server.handleRequest (which maintains 100% test compatibility)
app.all('*', async (c) => {
  const server = getBotServer(c.env.BOT_TOKEN);
  return server.handleRequest(c.req.raw, c.env, c.executionCtx as any);
});

export default app;
