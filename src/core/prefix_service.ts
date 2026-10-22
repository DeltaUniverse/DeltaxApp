/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { Env, BotContext } from '../types';
import { DatabaseService } from './database';
import { escapeRegex } from '../utils/misc';

let cachedBotPrefix: string | null = null;
let cachedGuestPrefix: string | null = null;

export const DEFAULT_BOT_PREFIX = '/';
export const DEFAULT_GUEST_PREFIX = '/';
export const DEFAULT_OWNER_ID = 7492470603;

export { escapeRegex };

export function isOwner(ctx: BotContext): boolean {
  const msg = ctx.msg as { guest_bot_caller_user?: { id?: number | string } } | undefined;
  const caller = msg?.guest_bot_caller_user || ctx.from;
  const callerId = caller?.id ? Number(caller.id) : null;
  const configuredOwnerId = ctx.env?.OWNER_ID ? Number(ctx.env.OWNER_ID) : DEFAULT_OWNER_ID;
  return Boolean(callerId && callerId === configuredOwnerId);
}

export class PrefixService {
  public static async getBotPrefix(env?: Env): Promise<string> {
    if (cachedBotPrefix) return cachedBotPrefix;

    if (env?.DB) {
      try {
        const db = new DatabaseService(env.DB);
        const val = await db.getSetting('bot_prefix');
        if (val) {
          cachedBotPrefix = val;
          return val;
        }
      } catch (err) {
        console.warn('[PrefixService] Could not read bot_prefix from database:', err);
      }
    }

    return DEFAULT_BOT_PREFIX;
  }

  public static async getGuestPrefix(env?: Env): Promise<string> {
    if (cachedGuestPrefix) return cachedGuestPrefix;

    if (env?.DB) {
      try {
        const db = new DatabaseService(env.DB);
        const val = await db.getSetting('guest_prefix');
        if (val) {
          cachedGuestPrefix = val;
          return val;
        }
      } catch (err) {
        console.warn('[PrefixService] Could not read guest_prefix from database:', err);
      }
    }

    return DEFAULT_GUEST_PREFIX;
  }

  public static async setBotPrefix(env: Env, prefix: string): Promise<void> {
    cachedBotPrefix = prefix;
    if (env.DB) {
      const db = new DatabaseService(env.DB);
      await db.setSetting('bot_prefix', prefix);
    }
  }

  public static async setGuestPrefix(env: Env, prefix: string): Promise<void> {
    cachedGuestPrefix = prefix;
    if (env.DB) {
      const db = new DatabaseService(env.DB);
      await db.setSetting('guest_prefix', prefix);
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

    const usernames = new Set<string>();
    if (botUsername) usernames.add(botUsername.toLowerCase());
    usernames.add('deltaxapp');

    const usernamePattern = Array.from(usernames).map(escapeRegex).join('|');

    const cleanArgs = (rawArgs: string): string => {
      let cleaned = rawArgs;
      for (const u of usernames) {
        const r = new RegExp(`(^|\\s+)@${escapeRegex(u)}(?=\\s|$|[?#])`, 'gi');
        cleaned = cleaned.replace(r, ' ');
      }
      return cleaned.replace(/\s+/g, ' ').trim();
    };

    let target = cleanText;
    target = target.replace(new RegExp(`^@(?:${usernamePattern})\\s+`, 'i'), '').trim();

    const allowedPrefixes = new Set([activePrefix, '/']);

    for (const name of names) {
      for (const p of allowedPrefixes) {
        const escP = escapeRegex(p);
        const cmdRegex = new RegExp(
          `^${escP}${escapeRegex(name)}(?:@(?:${usernamePattern}))?(?:\\s+([\\s\\S]*)|$)`,
          'i'
        );
        const m = target.match(cmdRegex);
        if (m) {
          const args = cleanArgs(m[1] || '');
          return { matched: true, command: name, args };
        }
      }
    }

    return null;
  }
}
