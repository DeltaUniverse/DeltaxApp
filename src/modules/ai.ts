/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { BaseModule, type CommandContext } from '../core';
import { escapeHtml, stripHtml } from '../html';
import type { Env } from '../types';
import { logger } from '../utils';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function formatMarkdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';

  const placeholders: string[] = [];
  const createPlaceholder = (content: string): string => {
    const idx = placeholders.length;
    placeholders.push(content);
    return `@@@DELTAXPH${idx}@@@`;
  };

  let text = markdown.replace(
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

  text = escapeHtml(text);
  text = text.replace(/^(?:#{1,6})\s+([^\r\n]+)$/gm, '<b>$1</b>');
  text = text.replace(/\*\*([^*\r\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\r\n]+)__/g, '<b>$1</b>');
  text = text.replace(/(?<![*\w])\*([^*\r\n]+)\*(?![*\w])/g, '<i>$1</i>');
  text = text.replace(/(?<![_\w])_([^_\r\n]+)_(?![_\w])/g, '<i>$1</i>');
  text = text.replace(/~~([^~\r\n]+)~~/g, '<s>$1</s>');
  text = text.replace(/\[([^\r\n[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/(?:^|\n)&gt;\s*([^\r\n]+)/g, '\n<blockquote>$1</blockquote>');

  text = text.replace(/@@@DELTAXPH(\d+)@@@/g, (_: string, idxStr: string) => {
    const idx = parseInt(idxStr, 10);
    return placeholders[idx] ?? '';
  });

  return text.trim();
}

export function splitText(text: string, maxLength = 4000): string[] {
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

export function buildAiMessages(query: string, replyText?: string | null): AiChatMessage[] {
  const systemPrompt =
    'You are a helpful, knowledgeable, and concise AI assistant running inside a Telegram bot. ' +
    'Provide direct and accurate answers. Format code snippets, lists, and quotes using standard markdown.';

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

async function requestAiCompletion(
  ai: NonNullable<Env['AI']>,
  messages: AiChatMessage[]
): Promise<string> {
  try {
    const result = (await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages,
      max_tokens: 2048,
    })) as { response?: string };

    return result?.response?.trim() || '';
  } catch (primaryErr) {
    logger.warn(
      { err: primaryErr },
      'primary ai model failed, attempting fallback to llama-3.1-8b'
    );
    const fallbackResult = (await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages,
      max_tokens: 2048,
    })) as { response?: string };

    return fallbackResult?.response?.trim() || '';
  }
}

export class AiModule extends BaseModule {
  readonly id = 'ai';
  readonly name = 'AI';
  readonly description = 'Conversational intelligence powered by Cloudflare Workers AI';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['ai', 'ask', 'chat'],
      async (ctx: CommandContext) => {
        const query = ctx.input.trim();
        const replyText = ctx.replyMsg?.text || ctx.replyMsg?.caption || '';

        if (!query && !replyText) {
          const usageMsg =
            `<b>Workers AI Assistant</b>\n\n` +
            `<blockquote expandable>` +
            `<b>Usage:</b>\n` +
            `• <code>${escapeHtml(ctx.prefix)}ai &lt;question&gt;</code>\n` +
            `• <code>${escapeHtml(ctx.prefix)}ask &lt;question&gt;</code>\n` +
            `• Reply to any message with <code>${escapeHtml(ctx.prefix)}ai</code>\n\n` +
            `<b>Example:</b>\n` +
            `<code>${escapeHtml(ctx.prefix)}ai Write a haiku about Cloudflare Workers</code>` +
            `</blockquote>`;
          await ctx.respond(usageMsg);
          return;
        }

        if (!ctx.env.AI) {
          const errorMsg =
            `⚠️ <b>Workers AI Unavailable:</b>\n\n` +
            `<blockquote expandable>` +
            `The <code>AI</code> binding is not configured in this environment.\n` +
            `Ensure <code>wrangler.jsonc</code> contains:\n` +
            `<code>"ai": { "binding": "AI" }</code>` +
            `</blockquote>`;
          await ctx.respond(errorMsg);
          return;
        }

        await ctx.replyWithChatAction?.('typing').catch(() => {});

        const messages = buildAiMessages(query, replyText);

        let responseText: string;
        try {
          responseText = await requestAiCompletion(ctx.env.AI, messages);
        } catch (execErr) {
          logger.error({ err: execErr }, 'workers ai execution failed');
          await ctx.respond('⚠️ An error occurred while generating a response from Workers AI.');
          return;
        }

        if (!responseText) {
          await ctx.respond('⚠️ No response received from Workers AI.');
          return;
        }

        const formatted = formatMarkdownToTelegramHtml(responseText);
        const chunks = splitText(formatted, 4000);

        for (const chunk of chunks) {
          try {
            await ctx.respond(chunk);
          } catch (sendErr) {
            logger.warn(
              { err: sendErr },
              'failed to send formatted ai response, falling back to plain text'
            );
            const plainChunks = splitText(stripHtml(chunk), 4000);
            for (const plain of plainChunks) {
              await ctx.respond(plain, { parse_mode: undefined });
            }
          }
        }
      },
      {
        description: 'Ask Workers AI (Llama 3.3)',
        usage: '<prompt>',
        aliases: ['ask', 'chat'],
      }
    );
  }
}
