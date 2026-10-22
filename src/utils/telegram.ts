/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { escapeHtml } from '../html';

export interface UserLike {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface MessageEntityLike {
  type: string;
  url?: string;
  offset?: number;
  length?: number;
}

export interface MessageLike {
  text?: string;
  caption?: string;
  entities?: MessageEntityLike[];
  caption_entities?: MessageEntityLike[];
  chat?: { id?: number | string };
  guest_bot_caller_user?: UserLike;
  guest_bot_caller_chat?: { id?: number | string };
  guest_query_id?: string;
  message_id?: number;
  reply_to_message?: MessageLike;
}

export interface ContextLike {
  chat?: { id?: number | string };
  from?: UserLike;
  msg?: MessageLike;
  message?: MessageLike;
  update?: { guest_message?: unknown };
}

/**
 * Builds an HTML user mention string.
 */
export function getUserMention(user?: UserLike | null): string {
  if (!user) return 'there';
  if (user.first_name && user.id) {
    return `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`;
  }
  if (user.username) {
    return `@${escapeHtml(user.username)}`;
  }
  if (user.first_name) {
    return escapeHtml(user.first_name);
  }
  if (user.id) {
    return `<a href="tg://user?id=${user.id}">User</a>`;
  }
  return 'there';
}

export function getCallerUser(ctx: ContextLike | null | undefined): UserLike | undefined {
  return ctx?.msg?.guest_bot_caller_user || ctx?.from;
}

export function getChatId(ctx: ContextLike | null | undefined): number | string | undefined {
  return ctx?.chat?.id || ctx?.msg?.chat?.id || ctx?.msg?.guest_bot_caller_chat?.id;
}

export function isGuestMode(ctx: ContextLike | null | undefined): boolean {
  return Boolean(
    ctx?.msg?.guest_bot_caller_user || ctx?.msg?.guest_query_id || ctx?.update?.guest_message
  );
}

/**
 * Extracts raw text/caption and all URLs from message entities.
 */
export function extractMessageUrls(msg?: MessageLike | null): {
  text: string;
  entityUrls: string[];
} {
  if (!msg) return { text: '', entityUrls: [] };

  const text = msg.text || msg.caption || '';
  const entityUrls: string[] = [];

  const allEntities = [...(msg.entities || []), ...(msg.caption_entities || [])];
  for (const ent of allEntities) {
    if (ent.type === 'text_link' && ent.url) {
      entityUrls.push(ent.url);
    } else if (
      ent.type === 'url' &&
      typeof ent.offset === 'number' &&
      typeof ent.length === 'number'
    ) {
      const urlText = text.substring(ent.offset, ent.offset + ent.length);
      if (urlText) entityUrls.push(urlText);
    }
  }

  return { text, entityUrls };
}

/**
 * Telegram HTML tags used for auto-detecting parse_mode
 */
export const HTML_TAGS = [
  '<blockquote',
  '<b>',
  '<code>',
  '<pre',
  '<i>',
  '<spoiler',
  '<u>',
  '<s>',
  '<a ',
];

/**
 * Checks if a string contains any Telegram HTML formatting tags.
 */
export function hasHtmlTags(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return HTML_TAGS.some((tag) => lower.includes(tag));
}
