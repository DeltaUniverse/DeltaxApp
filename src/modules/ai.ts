/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { BaseModule, type CommandContext } from '../core';
import { escapeHtml, stripHtml } from '../html';
import type { Env } from '../types';
import { logger } from '../utils';

export const MODEL_PRIMARY = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MODEL_FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fp8';
export const MAX_TOKENS = 2048;
export const MAX_MESSAGE_LENGTH = 4000;
export const AI_TIMEOUT_MS = 30000;
export const CACHE_VERSION = 'v1';
export const CACHE_TTL_SECONDS = 3600;
export const USER_COOLDOWN_MS = 3000;

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CacheEntry {
  text: string;
  cachedAt: number;
}

export function formatMarkdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';

  let text = markdown;

  // Auto-close unterminated code fence if truncated by token limit
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    text += '\n```\n';
  }

  const placeholders: string[] = [];
  const createPlaceholder = (content: string): string => {
    const idx = placeholders.length;
    placeholders.push(content);
    return `@@@DELTAXPH${idx}@@@`;
  };

  text = text.replace(
    /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g,
    (_: string, lang: string, codeText: string) => {
      const escapedCode = escapeHtml(codeText.trimEnd());
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return createPlaceholder(`<pre><code${langAttr}>${escapedCode}</code></pre>`);
    }
  );

  text = text.replace(/`([^`\r\n]+)`/g, (_: string, inlineCode: string) => {
    return createPlaceholder(`<code>${escapeHtml(inlineCode)}</code>`);
  });

  // Convert markdown bullet points to unicode bullets before italic regex
  text = text.replace(/^(\s*)[*-]\s+([^\r\n]+)$/gm, '$1• $2');

  text = escapeHtml(text);

  // Group consecutive blockquotes into a single blockquote
  text = text.replace(/(?:^|\n)((?:&gt;[^\r\n]*(?:\r?\n|$))+)/g, (_, quoteGroup: string) => {
    const lines = quoteGroup
      .split(/\r?\n/)
      .map((line) => line.replace(/^&gt;\s?/, ''))
      .filter((line) => line.length > 0);
    return `\n<blockquote>${lines.join('\n')}</blockquote>\n`;
  });

  text = text.replace(/^(?:#{1,6})\s+([^\r\n]+)$/gm, '<b>$1</b>');
  text = text.replace(/\*\*([^*\r\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\r\n]+)__/g, '<b>$1</b>');
  text = text.replace(/(?<![*\w])\*([^*\r\n]+)\*(?![*\w])/g, '<i>$1</i>');
  text = text.replace(/(?<![_\w])_([^_\r\n]+)_(?![_\w])/g, '<i>$1</i>');
  text = text.replace(/~~([^~\r\n]+)~~/g, '<s>$1</s>');
  text = text.replace(/\[([^\r\n[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  text = text.replace(/@@@DELTAXPH(\d+)@@@/g, (_: string, idxStr: string) => {
    const idx = parseInt(idxStr, 10);
    return placeholders[idx] ?? '';
  });

  return text.trim();
}

export function splitText(text: string, maxLength = MAX_MESSAGE_LENGTH): string[] {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function splitMarkdown(markdown: string, maxLength = MAX_MESSAGE_LENGTH): string[] {
  if (!markdown || markdown.length <= maxLength) {
    return [markdown];
  }

  const chunks: string[] = [];
  let remaining = markdown;
  let inCodeFence = false;
  let codeFenceLang = '';

  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = maxLength;
    }

    let chunk = remaining.slice(0, splitIdx).trim();
    remaining = remaining.slice(splitIdx).trim();

    const fenceMatches = Array.from(chunk.matchAll(/(?:^|\n)```([a-zA-Z0-9_-]*)/g));
    for (const match of fenceMatches) {
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceLang = match[1] || '';
      } else {
        inCodeFence = false;
        codeFenceLang = '';
      }
    }

    if (inCodeFence) {
      chunk += '\n```';
      remaining = `\`\`\`${codeFenceLang}\n` + remaining;
    }

    chunks.push(chunk);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function buildAiMessages(query: string, replyText?: string | null): AiChatMessage[] {
  const systemPrompt =
    'You are a helpful, knowledgeable, and concise AI assistant running inside a Telegram bot. ' +
    'Provide direct and accurate answers. Format code snippets, lists, and quotes using standard markdown. ' +
    'Avoid markdown tables and nested headings.';

  const messages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }];

  if (replyText && replyText.trim()) {
    const trimmedReply = replyText.trim();
    if (query && query.trim()) {
      messages.push({
        role: 'user',
        content: `Context from replied message:\n"""\n${trimmedReply}\n"""\n\nQuestion / Request:\n${query.trim()}`,
      });
    } else {
      messages.push({
        role: 'user',
        content: trimmedReply,
      });
    }
  } else {
    messages.push({
      role: 'user',
      content: query.trim(),
    });
  }

  return messages;
}

export async function computeAiCacheKey(model: string, messages: AiChatMessage[]): Promise<string> {
  const normalized = messages
    .map((m) => `${m.role}:${m.content.replace(/\s+/g, ' ').trim()}`)
    .join('|');
  const rawKey = `${model}|${normalized}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ai:${CACHE_VERSION}:${hex}`;
}

function isTelegramParseError(err: unknown): boolean {
  const msg = String(
    (err as { description?: string })?.description || (err as { message?: string })?.message || ''
  ).toLowerCase();
  return (
    msg.includes("can't parse entities") || msg.includes('parse mode') || msg.includes('entity')
  );
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`AI execution timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestAiCompletion(
  ai: NonNullable<Env['AI']>,
  messages: AiChatMessage[],
  options?: { gatewayId?: string; skipCache?: boolean }
): Promise<{ text: string; isFallback: boolean }> {
  const aiOptions = options?.gatewayId
    ? {
        gateway: {
          id: options.gatewayId,
          cacheTtl: CACHE_TTL_SECONDS,
          skipCache: options.skipCache,
        },
      }
    : undefined;

  try {
    const result = (await runWithTimeout(
      ai.run(MODEL_PRIMARY, { messages, max_tokens: MAX_TOKENS }, aiOptions),
      AI_TIMEOUT_MS
    )) as { response?: string };

    const text = result?.response?.trim() || '';
    if (text) {
      return { text, isFallback: false };
    }
    logger.warn('primary ai model returned empty response, attempting fallback to llama-3.1-8b');
  } catch (primaryErr) {
    const errMsg = (
      primaryErr instanceof Error
        ? primaryErr.message
        : typeof primaryErr === 'string'
          ? primaryErr
          : ''
    ).toLowerCase();
    if (errMsg.includes('context_length_exceeded') || errMsg.includes('maximum context length')) {
      throw primaryErr;
    }
    logger.warn(
      { err: primaryErr },
      'primary ai model failed, attempting fallback to llama-3.1-8b'
    );
  }

  const fallbackResult = (await runWithTimeout(
    ai.run(MODEL_FALLBACK, { messages, max_tokens: MAX_TOKENS }, aiOptions),
    AI_TIMEOUT_MS
  )) as { response?: string };

  return { text: fallbackResult?.response?.trim() || '', isFallback: true };
}

export class AiModule extends BaseModule {
  readonly id = 'ai';
  readonly name = 'AI';
  readonly description = 'Conversational intelligence powered by Cloudflare Workers AI';
  readonly version = '1.1.0';

  private readonly _userCooldowns = new Map<number, number>();

  public setup(): void {
    this.command(
      ['ai', 'ask', 'chat'],
      async (ctx: CommandContext) => {
        let rawQuery = ctx.input.trim();
        const replyText = ctx.replyMsg?.text || ctx.replyMsg?.caption || '';

        const isFresh = /--fresh\b/i.test(rawQuery);
        if (isFresh) {
          rawQuery = rawQuery.replace(/--fresh\b/gi, '').trim();
        }

        if (!rawQuery && !replyText) {
          const usageMsg =
            `<b>Workers AI Assistant</b>\n\n` +
            `<blockquote expandable>` +
            `<b>Usage:</b>\n` +
            `• <code>${escapeHtml(ctx.prefix)}ai &lt;question&gt;</code>\n` +
            `• <code>${escapeHtml(ctx.prefix)}ask &lt;question&gt;</code>\n` +
            `• <code>${escapeHtml(ctx.prefix)}ai --fresh &lt;question&gt;</code> (bypass cache)\n` +
            `• Reply to any message with <code>${escapeHtml(ctx.prefix)}ai</code>\n\n` +
            `<b>Example:</b>\n` +
            `<code>${escapeHtml(ctx.prefix)}ai Write a haiku about Cloudflare Workers</code>` +
            `</blockquote>`;
          await ctx.respond(usageMsg);
          return;
        }

        if (!ctx.env.AI) {
          logger.error('AI binding is not configured in environment');
          if (ctx.isOwner) {
            const errorMsg =
              `⚠️ <b>Workers AI Unavailable:</b>\n\n` +
              `<blockquote expandable>` +
              `The <code>AI</code> binding is not configured in this environment.\n` +
              `Ensure <code>wrangler.jsonc</code> contains:\n` +
              `<code>"ai": { "binding": "AI" }</code>` +
              `</blockquote>`;
            await ctx.respond(errorMsg);
          } else {
            await ctx.respond(
              '⚠️ <b>AI Unavailable:</b> AI assistant is currently not configured. Please try again later.'
            );
          }
          return;
        }

        const callerId = ctx.from?.id || ctx.msg?.from?.id;
        if (!ctx.isOwner && callerId) {
          const lastUsed = this._userCooldowns.get(callerId) || 0;
          if (Date.now() - lastUsed < USER_COOLDOWN_MS) {
            await ctx.respond('⚠️ Please wait a few seconds before asking another question.');
            return;
          }
        }

        // Send typing indicator concurrently
        void ctx.replyWithChatAction?.('typing').catch(() => {});

        const messages = buildAiMessages(rawQuery, replyText);
        const cacheKey = await computeAiCacheKey(MODEL_PRIMARY, messages);

        let cachedMarkdown: string | null = null;
        if (!isFresh) {
          const kvCache = ctx.env.AI_CACHE as
            { get: (k: string) => Promise<string | null> } | undefined;
          if (kvCache && typeof kvCache.get === 'function') {
            cachedMarkdown = await kvCache.get(cacheKey).catch(() => null);
          } else if (ctx.db) {
            const doc = await ctx.db
              .collection<CacheEntry>('ai_cache')
              .get(cacheKey)
              .catch(() => null);
            if (doc && Date.now() - doc.cachedAt < CACHE_TTL_SECONDS * 1000) {
              cachedMarkdown = doc.text;
            }
          }
        }

        let rawMarkdown = cachedMarkdown;

        if (!rawMarkdown) {
          const gatewayId = (ctx.env.AI_GATEWAY_ID || ctx.env.AI_GATEWAY) as string | undefined;
          let isFallbackModel: boolean;
          try {
            const completion = await requestAiCompletion(ctx.env.AI, messages, {
              gatewayId,
              skipCache: isFresh,
            });
            rawMarkdown = completion.text;
            isFallbackModel = completion.isFallback;
          } catch (execErr) {
            logger.error({ err: execErr }, 'workers ai execution failed');
            await ctx.respond('⚠️ An error occurred while generating a response from Workers AI.');
            return;
          }

          if (callerId && !ctx.isOwner) {
            this._userCooldowns.set(callerId, Date.now());
          }

          if (rawMarkdown && !isFallbackModel) {
            const kvCache = ctx.env.AI_CACHE as
              | { put: (k: string, v: string, opts?: { expirationTtl: number }) => Promise<void> }
              | undefined;
            if (kvCache && typeof kvCache.put === 'function') {
              ctx.waitUntil(
                kvCache
                  .put(cacheKey, rawMarkdown, { expirationTtl: CACHE_TTL_SECONDS })
                  .catch((err) => logger.warn({ err }, 'failed to store ai cache in KV'))
              );
            } else if (ctx.db) {
              ctx.waitUntil(
                ctx.db
                  .collection<CacheEntry>('ai_cache')
                  .set(cacheKey, { text: rawMarkdown, cachedAt: Date.now() })
                  .catch((err) => logger.warn({ err }, 'failed to store ai cache in D1'))
              );
            }
          }
        }

        if (!rawMarkdown) {
          await ctx.respond('⚠️ No response received from Workers AI.');
          return;
        }

        const mdChunks = splitMarkdown(rawMarkdown, MAX_MESSAGE_LENGTH);

        for (const mdChunk of mdChunks) {
          const formatted = formatMarkdownToTelegramHtml(mdChunk);
          try {
            await ctx.respond(formatted);
          } catch (sendErr) {
            if (isTelegramParseError(sendErr)) {
              logger.warn(
                { err: sendErr },
                'failed to send formatted ai response, falling back to plain text'
              );
              const plain = stripHtml(formatted);
              await ctx.respond(plain, { parse_mode: undefined });
            } else {
              throw sendErr;
            }
          }
        }
      },
      {
        description: 'Ask Workers AI (Llama 3.3 / 3.1)',
        usage: '<prompt>',
      }
    );
  }
}
