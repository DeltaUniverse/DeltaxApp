/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { Env, BotContext } from '../types';

let cachedBotPrefix: string | null = null;
let cachedGuestPrefix: string | null = null;

export const DEFAULT_BOT_PREFIX = '/';
export const DEFAULT_GUEST_PREFIX = '/';
export const DEFAULT_OWNER_ID = 7492470603;

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isOwner(ctx: BotContext): boolean {
  const caller = (ctx.msg as any)?.guest_bot_caller_user || ctx.from;
  const callerId = caller?.id ? Number(caller.id) : null;
  const configuredOwnerId = ctx.env?.OWNER_ID ? Number(ctx.env.OWNER_ID) : DEFAULT_OWNER_ID;
  return Boolean(callerId && callerId === configuredOwnerId);
}

export class PrefixService {
  public static async getBotPrefix(env?: Env): Promise<string> {
    if (cachedBotPrefix) return cachedBotPrefix;

    if (env?.DB) {
      try {
        const row = await env.DB.prepare(
          'SELECT value FROM settings WHERE key = ?'
        )
          .bind('bot_prefix')
          .first<{ value: string }>();

        if (row?.value) {
          cachedBotPrefix = row.value;
          return row.value;
        }
      } catch (err) {
        console.warn('[PrefixService] Could not read bot_prefix from D1:', err);
      }
    }

    return DEFAULT_BOT_PREFIX;
  }

  public static async getGuestPrefix(env?: Env): Promise<string> {
    if (cachedGuestPrefix) return cachedGuestPrefix;

    if (env?.DB) {
      try {
        const row = await env.DB.prepare(
          'SELECT value FROM settings WHERE key = ?'
        )
          .bind('guest_prefix')
          .first<{ value: string }>();

        if (row?.value) {
          cachedGuestPrefix = row.value;
          return row.value;
        }
      } catch (err) {
        console.warn('[PrefixService] Could not read guest_prefix from D1:', err);
      }
    }

    return DEFAULT_GUEST_PREFIX;
  }

  public static async setBotPrefix(env: Env, prefix: string): Promise<void> {
    cachedBotPrefix = prefix;
    if (env.DB) {
      await env.DB.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
        .bind('bot_prefix', prefix, Date.now())
        .run();
    }
  }

  public static async setGuestPrefix(env: Env, prefix: string): Promise<void> {
    cachedGuestPrefix = prefix;
    if (env.DB) {
      await env.DB.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
        .bind('guest_prefix', prefix, Date.now())
        .run();
    }
  }

  public static matchCommand(
    text: string,
    commandNames: string | string[],
    activePrefix: string = '/',
    botUsername?: string
  ): { matched: boolean; command: string; args: string } | null {
    if (!text) return null;

    const names = Array.isArray(commandNames) ? commandNames : [commandNames];
    const cleanText = text.trim();

    let target = cleanText;
    if (botUsername) {
      const mentionRegex = new RegExp(`^@${botUsername}\\b`, 'i');
      target = target.replace(mentionRegex, '').trim();
    }

    const allowedPrefixes = new Set([activePrefix, '/']);

    for (const name of names) {
      for (const p of allowedPrefixes) {
        const prefixCmd = `${p}${name}`;
        if (
          target.toLowerCase() === prefixCmd.toLowerCase() ||
          target.toLowerCase().startsWith(`${prefixCmd.toLowerCase()} `)
        ) {
          const args = target.slice(prefixCmd.length).trim();
          return { matched: true, command: name, args };
        }
      }
    }

    return null;
  }
}
