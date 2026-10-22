/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { Hono } from 'hono';
import { TelegramBotServer } from './core';
import { AUTO_MODULES } from './modules';
import type { Env } from './types';

let botServerInstance: TelegramBotServer | null = null;

export function getBotServer(token: string): TelegramBotServer {
  if (!botServerInstance) {
    botServerInstance = new TelegramBotServer(token);
    botServerInstance.registerModules(AUTO_MODULES);
    console.log(
      `[Worker] Initialized TelegramBotServer with ${AUTO_MODULES.length} auto-loaded modules.`
    );
  }
  return botServerInstance;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  if (!c.env.BOT_TOKEN) {
    return c.json(
      {
        error: 'Configuration Error',
        message:
          'BOT_TOKEN is missing. Please set BOT_TOKEN in .dev.vars (for dev) or run `wrangler secret put BOT_TOKEN` (for production).',
      },
      500
    );
  }
  await next();
});

app.all('*', async (c) => {
  const server = getBotServer(c.env.BOT_TOKEN);
  return server.handleRequest(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});

export default app;
