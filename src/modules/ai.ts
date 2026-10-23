/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { BaseModule, type CommandContext } from '../core';
import { escapeHtml, stripHtml, unescapeHtml } from '../html';
import type { Env } from '../types';
import { logger } from '../utils';

export const MODEL_PRIMARY = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MODEL_FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fp8';
export const MAX_TOKENS = 100;
export const TEMPERATURE = 0.8;
export const TOP_P = 0.9;
export const REPETITION_PENALTY = 1.1;
export const MAX_MESSAGE_LENGTH = 4000;
export const AI_TIMEOUT_MS = 30000;
export const CACHE_VERSION = 'v4';
export const CACHE_TTL_SECONDS = 3600;
export const USER_COOLDOWN_MS = 3000;
export const DRAFT_THROTTLE_MS = 350;

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const FEW_SHOT_EXAMPLES: AiChatMessage[] = [
  { role: 'user', content: 'halo' },
  { role: 'assistant', content: 'Yo! Lagi apa nih?' },
  { role: 'user', content: 'lagi gabut nih' },
  { role: 'assistant', content: 'Sama bray, rebahan doang dari tadi wkwk.' },
  { role: 'user', content: 'capek banget hari ini kerjaan numpuk parah' },
  { role: 'assistant', content: 'Semangat cuy, istirahat dulu gih jangan diforsir amat.' },
  { role: 'user', content: 'menurut lo enakan nonton film apa nongkrong?' },
  {
    role: 'assistant',
    content: 'Kalo lagi mager mending nonton sih, tapi kalo ada duit gas nongkrong.',
  },
  { role: 'user', content: 'eh anw lo tau drama netizen kemarin ga?' },
  { role: 'assistant', content: 'Tau dong, asli timeline rame parah gara-gara itu wkwk.' },
  { role: 'user', content: 'spill tea dong' },
  { role: 'assistant', content: 'Gas, jadi ceritanya si itu kemarin kegep cuy wkwk.' },
];

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

export function buildAiMessages(
  query: string,
  replyText?: string | null,
  botName = 'Delta',
  history?: AiChatMessage[]
): AiChatMessage[] {
  const name = botName.trim() || 'Delta';
  const systemPrompt =
    `Kamu adalah ${name}, teman ngobrol akrab yang santai banget.\n` +
    `Gunakan bahasa Indonesia kasual ala anak Jaksel atau Gen Z sesuai gaya lawan bicara.\n` +
    `Jawab super singkat (1-2 kalimat saja), santai layaknya chat WhatsApp.\n` +
    `Langsung ke inti obrolan tanpa pembuka kaku atau basa-basi robotik.\n` +
    `Jangan gunakan format list ataupun markdown.`;

  const conversationTurns: AiChatMessage[] = [];
  if (history && history.length > 0) {
    conversationTurns.push(...history);
  }

  if (replyText && replyText.trim()) {
    const trimmedReply = replyText.trim();
    if (query && query.trim()) {
      conversationTurns.push({
        role: 'user',
        content: `Context dari chat sebelumnya:\n"${trimmedReply}"\n\n${query.trim()}`,
      });
    } else {
      conversationTurns.push({
        role: 'user',
        content: trimmedReply,
      });
    }
  } else if (query && query.trim()) {
    conversationTurns.push({
      role: 'user',
      content: query.trim(),
    });
  }

  // Trim conversation history to the last ~10 messages
  const trimmedHistory = conversationTurns.slice(-10);

  return [{ role: 'system', content: systemPrompt }, ...FEW_SHOT_EXAMPLES, ...trimmedHistory];
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

export async function streamAiCompletion(
  ai: NonNullable<Env['AI']>,
  messages: AiChatMessage[],
  onChunk: (partialText: string) => Promise<void> | void,
  options?: { gatewayId?: string; skipCache?: boolean }
): Promise<string> {
  const aiOptions = options?.gatewayId
    ? {
        gateway: {
          id: options.gatewayId,
          cacheTtl: CACHE_TTL_SECONDS,
          skipCache: options.skipCache,
        },
      }
    : undefined;

  const stream = (await runWithTimeout(
    ai.run(
      MODEL_PRIMARY,
      {
        messages,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        top_p: TOP_P,
        repetition_penalty: REPETITION_PENALTY,
        stream: true,
      },
      aiOptions
    ),
    AI_TIMEOUT_MS
  )) as ReadableStream<Uint8Array>;

  let accumulated = '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr) as { response?: string };
          if (parsed.response) {
            accumulated += parsed.response;
            await onChunk(accumulated);
          }
        } catch {
          // ignore malformed SSE line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated.trim();
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
      ai.run(
        MODEL_PRIMARY,
        {
          messages,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          top_p: TOP_P,
          repetition_penalty: REPETITION_PENALTY,
        },
        aiOptions
      ),
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
    ai.run(
      MODEL_FALLBACK,
      {
        messages,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        top_p: TOP_P,
        repetition_penalty: REPETITION_PENALTY,
      },
      aiOptions
    ),
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

        const botName =
          [ctx.me?.first_name, ctx.me?.last_name].filter(Boolean).join(' ') ||
          ctx.me?.username ||
          'Delta';
        const messages = buildAiMessages(rawQuery, replyText, botName);
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

        const isPrivateChat = !ctx.isGuest && ctx.chat?.type === 'private';
        let rawMarkdown = cachedMarkdown;

        if (!rawMarkdown) {
          const gatewayId = (ctx.env.AI_GATEWAY_ID || ctx.env.AI_GATEWAY) as string | undefined;
          let isFallbackModel = false;

          if (isPrivateChat) {
            let lastDraftTime = 0;
            try {
              rawMarkdown = await streamAiCompletion(
                ctx.env.AI,
                messages,
                async (partial) => {
                  const now = Date.now();
                  if (now - lastDraftTime >= DRAFT_THROTTLE_MS && partial.length > 5) {
                    lastDraftTime = now;
                    if (typeof ctx.replyWithDraft === 'function') {
                      await ctx.replyWithDraft(partial).catch(() => {});
                    }
                  }
                },
                { gatewayId, skipCache: isFresh }
              );
            } catch (streamErr) {
              logger.warn(
                { err: streamErr },
                'streaming ai completion failed, falling back to standard execution'
              );
            }
          }

          if (!rawMarkdown) {
            try {
              const completion = await requestAiCompletion(ctx.env.AI, messages, {
                gatewayId,
                skipCache: isFresh,
              });
              rawMarkdown = completion.text;
              isFallbackModel = completion.isFallback;
            } catch (execErr) {
              logger.error({ err: execErr }, 'workers ai execution failed');
              await ctx.respond(
                '⚠️ An error occurred while generating a response from Workers AI.'
              );
              return;
            }
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
              const plain = unescapeHtml(stripHtml(formatted));
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
