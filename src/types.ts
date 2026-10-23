/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { Context } from 'grammy';
import type { BaseModule } from './core/base_module';
import type { DatabaseService } from './core/database';
import type { GuestClassification } from './core/guest_router';

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  WEBHOOK_URL?: string;
  DB?: D1Database;
  AI?: Ai;
  OWNER_ID?: string | number;
  ENVIRONMENT?: string;
  [key: string]: unknown;
}

export type ModuleConstructor = new () => BaseModule;

export interface CommandMeta {
  command: string;
  description: string;
  moduleId: string;
  moduleName: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  commands: string[];
}

export interface BotContext extends Context {
  env: Env;
  db: DatabaseService;
  request?: Request;
  cf?: Record<string, unknown>;
  isColdStart?: boolean;
  modules?: ModuleInfo[];
  executionCtx: ExecutionContext;
  waitUntil: (promise: Promise<unknown>) => void;
  guest?: GuestClassification;
}
