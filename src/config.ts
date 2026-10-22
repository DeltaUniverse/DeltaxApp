/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

export const BOT_CONFIG = {
  NAME: 'Deltax App',
  VERSION: '1.2.0',
  FRAMEWORK: 'grammY (TypeScript OOP)',
  RUNTIME: 'Cloudflare Workers (V8 Isolate)',
  DEFAULT_ENVIRONMENT: 'production',
  DEFAULT_PARSE_MODE: 'HTML' as const,
} as const;

export const ROUTES = {
  HEALTH: '/health',
  ROOT: '/',
  WEBHOOK: '/webhook',
  SET_WEBHOOK: '/setWebhook',
  GET_WEBHOOK_INFO: '/getWebhookInfo',
  DELETE_WEBHOOK: '/deleteWebhook',
} as const;

export const HTTP_HEADERS = {
  JSON: { 'Content-Type': 'application/json' },
  SECRET_TOKEN_HEADER: 'x-telegram-bot-api-secret-token',
} as const;
