import { InlineKeyboard } from 'grammy';
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types';
import { BaseModule, PrefixService, escapeRegex, type CommandContext } from '../core';
import { html, code, link, rawHtml, escapeHtml } from '../html';
import type { BotContext } from '../types';
import { findSupportedUrl, extractMedia, type ExtractedResult } from '../extractors';

/**
 * Checks if a message attempts an un-prefixed download command (e.g. "@deltaxapp dl ...", "dl ...")
 */
export function isUnprefixedDownloadCommand(
  text: string,
  activePrefix: string = '/'
): boolean {
  if (!text) return false;
  const trimmed = text.trim();

  // If text starts with a valid prefix, it's NOT unprefixed!
  const prefixes = Array.from(new Set([activePrefix, '/']));
  for (const p of prefixes) {
    const escP = escapeRegex(p);
    if (new RegExp(`^${escP}(?:dl|download)(?:@\\w+)?(?:\\s+|$|[?#])`, 'i').test(trimmed)) {
      return false;
    }
    if (new RegExp(`^@\\w+\\s+${escP}(?:dl|download)(?:\\s+|$|[?#])`, 'i').test(trimmed)) {
      return false;
    }
  }

  // Matches "@bot dl ...", "@bot download ...", "dl ...", "download ..."
  if (/^@\w+\s+(?:dl|download)(?:\s+|$|[?#])/i.test(trimmed)) return true;
  if (/^(?:dl|download)(?:\s+|$|[?#])/i.test(trimmed)) return true;

  return false;
}

/**
 * Checks if a message is intended as a download command with strict prefix requirement
 */
export function isDownloadRequest(
  text: string,
  botUsername?: string,
  activePrefix: string = '/'
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  const prefixes = Array.from(new Set([activePrefix, '/']));

  for (const p of prefixes) {
    const escP = escapeRegex(p);
    // 1. Direct command: e.g. "!dl", "/dl", "!download", "/download"
    const directRegex = new RegExp(`^${escP}(?:dl|download)(?:@\\w+)?(?:\\s+|$|[?#])`, 'i');
    if (directRegex.test(trimmed)) return true;

    // 2. Mention followed by prefixed command: e.g. "@deltaxapp !dl", "@deltaxapp /dl"
    const mentionRegex = new RegExp(`^@\\w+\\s+${escP}(?:dl|download)(?:\\s+|$|[?#])`, 'i');
    if (mentionRegex.test(trimmed)) return true;
  }

  return false;
}

/**
 * Extracts target media URL from command arguments or replied message
 */
export function extractDownloadTarget(
  text: string,
  replyMsg?: any,
  customPrefix?: string,
  msgEntities?: any[]
): { url: string; platform: 'instagram' | 'tiktok' | 'twitter' } | null {
  // 1. Check if command message itself contains text_link entities
  if (msgEntities) {
    for (const ent of msgEntities) {
      if (ent.type === 'text_link' && ent.url) {
        const detected = findSupportedUrl(ent.url);
        if (detected) return detected;
      }
    }
  }

  // 2. Check text for supported URL
  const detectedInText = findSupportedUrl(text);
  if (detectedInText) return detectedInText;

  // 3. If no URL in text, inspect replied message
  if (replyMsg) {
    const replyText =
      (replyMsg && 'text' in replyMsg ? replyMsg.text : '') ||
      (replyMsg && 'caption' in replyMsg ? replyMsg.caption : '') ||
      '';

    const allEntities = [
      ...(replyMsg.entities || []),
      ...(replyMsg.caption_entities || []),
    ];

    for (const ent of allEntities) {
      if (ent.type === 'text_link' && ent.url) {
        const detected = findSupportedUrl(ent.url);
        if (detected) return detected;
      }
    }

    const detectedInReply = findSupportedUrl(replyText);
    if (detectedInReply) return detectedInReply;
  }

  return null;
}

/**
 * DownloaderModule provides guest extraction and direct delivery of
 * Instagram, TikTok, and X (Twitter) media.
 */
function formatCount(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export class DownloaderModule extends BaseModule {
  readonly id = 'downloader';
  readonly name = 'Downloader';
  readonly description = 'High-speed guest downloader for Instagram, TikTok, and X (Twitter)';
  readonly version = '1.0.0';

  public setup(): void {
    // 1. Explicit /dl or /download command (supports direct argument or replying to a link)
    this.command(
      ['dl', 'download'],
      async (ctx: CommandContext) => {
        const target = extractDownloadTarget(ctx.input, ctx.replyMsg, ctx.prefix, ctx.msg?.entities);
        if (!target) {
          const usageMsg = html`<b>Usage:</b> <code>${escapeHtml(ctx.prefix)}dl &lt;url&gt;</code>

Send or reply to a link from:
• <b>Instagram:</b> Reels, Posts, Carousels
• <b>TikTok:</b> Videos, Photo slides
• <b>X (Twitter):</b> Videos, GIFs, Photos`;
          await ctx.respond(usageMsg);
          return;
        }

        await this.handleDownload(ctx, target.url, target.platform);
      },
      {
        description: 'Download media from Instagram, TikTok, or X (Twitter)',
        usage: '<url>',
      }
    );

    // 2. Direct 1-on-1 private chat link paste without command
    this.on('message:text', async (ctx: BotContext) => {
      if (ctx.chat?.type === 'private') {
        const text = ctx.message?.text || '';
        if (text.startsWith('/')) return;

        const detected = findSupportedUrl(text);
        if (detected) {
          await this.handleDownload(ctx, detected.url, detected.platform);
        }
      }
    });

    // 3. Raw mention without command in guest mode: "@deltaxapp <link>" (only if NOT a reply)
    this.on('guest_message:text', async (ctx: BotContext) => {
      const text = ctx.msg?.text || '';
      const replyMsg = (ctx.msg as any)?.reply_to_message;

      // Strict filter: If mentioned in a reply, do NOT auto-download
      if (replyMsg) return;

      const guestPrefix = await PrefixService.getGuestPrefix(ctx.env);
      if (isUnprefixedDownloadCommand(text, guestPrefix)) return;

      const detected = findSupportedUrl(text);
      if (detected) {
        await this.handleDownload(ctx, detected.url, detected.platform);
      }
    });
  }

  /**
   * Unified media processor and uploader:
   * Supports native multi-item Telegram albums (sendMediaGroup) for carousels & slides
   * across direct chat, group chats, and Bot API 10.x Guest Mode.
   */
  private async handleDownload(
    ctx: BotContext,
    url: string,
    platform: 'instagram' | 'tiktok' | 'twitter'
  ): Promise<void> {
    const platformLabel =
      platform === 'instagram'
        ? 'Instagram'
        : platform === 'tiktok'
          ? 'TikTok'
          : 'X (Twitter)';

    const chatId =
      ctx.chat?.id ||
      ctx.msg?.chat?.id ||
      (ctx.msg as any)?.guest_bot_caller_chat?.id;

    const replyMessageId = ctx.msg?.message_id;
    const isGuestQuery = Boolean((ctx.msg as any)?.guest_query_id);

    // Indicate progress in chat
    if (chatId) {
      await ctx.api.sendChatAction(chatId, 'upload_video').catch(() => {});
    }

    let result: ExtractedResult | null = null;
    try {
      result = await extractMedia(url);
    } catch (err) {
      console.error(`[DownloaderModule] Failed to extract ${platform}:`, err);
    }

    if (!result || result.items.length === 0) {
      const errorMsg = html`❌ <b>Unable to extract media from ${platformLabel}.</b>

The post may be private, deleted, or restricted by the platform.`;

      if (isGuestQuery) {
        await ctx.answerGuestQuery({
          type: 'article',
          id: `guest_err_${Date.now()}`,
          title: `Unable to extract ${platformLabel}`,
          description: 'Post may be private, restricted, or deleted.',
          input_message_content: {
            message_text: `❌ <b>Unable to extract media from ${platformLabel}.</b>\n\nThe post may be private, deleted, or restricted.`,
            parse_mode: 'HTML',
          },
        }).catch(() => {});
      } else if (chatId) {
        await ctx.api.sendMessage(chatId, errorMsg, {
          reply_parameters: replyMessageId ? { message_id: replyMessageId } : undefined,
        }).catch(() => {});
      }
      return;
    }

    // 1. Engagement metrics
    const metrics: string[] = [];
    const stats = result.stats || {};
    if (stats.views !== undefined && stats.views !== null && stats.views !== 0) {
      metrics.push(`👁️ ${formatCount(stats.views)}`);
    }
    if (stats.likes !== undefined && stats.likes !== null && stats.likes !== 0) {
      metrics.push(`❤️ ${formatCount(stats.likes)}`);
    }
    if (stats.comments !== undefined && stats.comments !== null && stats.comments !== 0) {
      metrics.push(`💬 ${formatCount(stats.comments)}`);
    }
    if (stats.shares !== undefined && stats.shares !== null && stats.shares !== 0) {
      metrics.push(`🔁 ${formatCount(stats.shares)}`);
    }
    const metricsLine = metrics.length > 0 ? metrics.join('  ') : '';

    // 2. Clean caption text
    const cleanCaption = result.caption
      ? result.caption
          .replace(/<[^>]*>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x27;/gi, "'")
          .replace(/&#064;/gi, '@')
          .trim()
      : '';

    // 3. Author attribution & watermark footer
    const authorName = result.author?.username
      ? (result.author.username.startsWith('@')
          ? result.author.username
          : `@${result.author.username}`)
      : result.author?.name;
    const authorLine = authorName ? `— ${escapeHtml(authorName)}` : '';
    const brandLine = '<a href="https://t.me/deltadiscuss">© DeltaxApps</a>';

    const buildStandardCaption = (bodyText: string) => {
      const parts: string[] = [];
      if (metricsLine) parts.push(metricsLine);
      if (bodyText) {
        parts.push(`<blockquote expandable>${escapeHtml(bodyText)}</blockquote>`);
      }
      if (authorLine) parts.push(authorLine);
      parts.push(`<blockquote>${brandLine}</blockquote>`);

      return parts.join('\n\n');
    };

    // 1. Bot API 10.x Guest Mode: Deliver native rich media (Slideshow / Figure) via rich_message
    if (isGuestQuery) {
      const blocks: string[] = [];

      // 1. Engagement metrics
      if (metrics.length > 0) {
        blocks.push(`<p><b>${metrics.join('&nbsp;&nbsp;')}</b></p>`);
      }

      // 2. Caption in expandable blockquote
      if (cleanCaption) {
        const formattedLines = escapeHtml(cleanCaption).replace(/\r?\n/g, '<br/>');
        blocks.push(`<blockquote expandable>${formattedLines}</blockquote>`);
      }

      // 3. Author attribution
      if (authorLine) {
        blocks.push(`<p>${authorLine}</p>`);
      }

      // 4. Copyright quote with extra spacing
      blocks.push(`<blockquote>${brandLine}</blockquote>`);

      let mediaContainer: string;
      if (result.items.length === 1) {
        const item = result.items[0];
        const mediaTag =
          item.type === 'video'
            ? `<video src="${escapeHtml(item.url)}"></video>`
            : `<img src="${escapeHtml(item.url)}" />`;

        mediaContainer = `<figure>${mediaTag}</figure>`;
      } else {
        const mediaTags = result.items.map((item) =>
          item.type === 'video'
            ? `<video src="${escapeHtml(item.url)}"></video>`
            : `<img src="${escapeHtml(item.url)}" />`
        );

        mediaContainer = `<tg-slideshow>\n${mediaTags.join('\n')}\n</tg-slideshow>`;
      }

      const buttonRow = `<tg-button-row align="center">\n  <tg-button type="url" style="primary" url="${escapeHtml(url)}">Original Post</tg-button>\n</tg-button-row>`;
      const richHtml = [mediaContainer, ...blocks, buttonRow].join('\n\n');

      await ctx.answerGuestQuery({
        type: 'article',
        id: `guest_${Date.now()}`,
        title: `${platformLabel} ${result.items.length > 1 ? `Slideshow (${result.items.length} items)` : 'Media'}`,
        thumbnail_url: result.items[0].thumbnailUrl || result.items[0].url,
        input_message_content: {
          rich_message: {
            html: richHtml,
          },
        },
      });
      return;
    }

    // 2. Standard Chat / Command Mode: Deliver via sendPhoto/sendVideo or sendMediaGroup
    // Truncate cleanly for 1024-character caption limit in standard Telegram chats
    const overhead =
      (metricsLine ? metricsLine.length + 2 : 0) +
      (authorLine ? authorLine.length + 2 : 0) +
      brandLine.length +
      95;
    const maxBodyLen = Math.max(200, 1024 - overhead);
    const standardBody =
      cleanCaption.length > maxBodyLen
        ? cleanCaption.slice(0, maxBodyLen).trimEnd() + '...'
        : cleanCaption;

    const caption = buildStandardCaption(standardBody);
    const keyboard = new InlineKeyboard().url('Original Post', url);

    try {
      if (!chatId) {
        throw new Error('No target chatId found');
      }

      if (result.items.length === 1) {
        // Single media delivery with URL button
        const item = result.items[0];
        if (item.type === 'video') {
          await ctx.api.sendVideo(chatId, item.url, {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
            reply_parameters: replyMessageId ? { message_id: replyMessageId } : undefined,
          });
        } else {
          await ctx.api.sendPhoto(chatId, item.url, {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
            reply_parameters: replyMessageId ? { message_id: replyMessageId } : undefined,
          });
        }
      } else {
        // Native Telegram ALBUM (Media Group) delivery
        // Telegram sendMediaGroup supports albums between 2 and 10 items
        const totalChunks = Math.ceil(result.items.length / 10);
        for (let i = 0; i < result.items.length; i += 10) {
          const chunk = result.items.slice(i, i + 10);
          const chunkIdx = Math.floor(i / 10);

          if (chunk.length === 1) {
            // Standalone leftover item
            const item = chunk[0];
            if (item.type === 'video') {
              await ctx.api.sendVideo(chatId, item.url);
            } else {
              await ctx.api.sendPhoto(chatId, item.url);
            }
          } else {
            const group = chunk.map((item, idx) => {
              const isFirstItem = chunkIdx === 0 && idx === 0;
              if (item.type === 'video') {
                const videoMedia: InputMediaVideo = {
                  type: 'video',
                  media: item.url,
                  caption: isFirstItem ? caption : undefined,
                  parse_mode: 'HTML',
                };
                return videoMedia;
              }
              const photoMedia: InputMediaPhoto = {
                type: 'photo',
                media: item.url,
                caption: isFirstItem ? caption : undefined,
                parse_mode: 'HTML',
              };
              return photoMedia;
            });

            await ctx.api.sendMediaGroup(chatId, group, {
              reply_parameters:
                chunkIdx === 0 && replyMessageId ? { message_id: replyMessageId } : undefined,
            });
          }
        }
      }
    } catch (sendErr) {
      console.warn('[DownloaderModule] Direct media upload failed, attempting fallback:', sendErr);

      // Fallback for regular chat if Telegram server cannot download the media directly
      if (chatId) {
        const downloadLinksHtml = result.items
          .map(
            (it, idx) =>
              `• <a href="${escapeHtml(it.url)}">${it.type === 'video' ? 'Video' : 'Photo'} ${idx + 1}</a>`
          )
          .join('\n');

        const fallbackMsg = html`<b>${platformLabel} Media Extracted</b>

${metricsLine ? rawHtml(metricsLine + '\n\n') : ''}${standardBody ? rawHtml(`<blockquote expandable>${escapeHtml(standardBody)}</blockquote>\n\n`) : ''}${authorLine ? rawHtml(authorLine + '\n\n') : ''}${rawHtml(`<blockquote>${brandLine}</blockquote>\n\n`)}<b>Direct Download Links:</b>
${rawHtml(downloadLinksHtml)}

<i>Note: Direct Telegram delivery exceeded size/CDN limit.</i>`;

        await ctx.api
          .sendMessage(chatId, fallbackMsg, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
            reply_parameters: replyMessageId ? { message_id: replyMessageId } : undefined,
          })
          .catch(() => {});
      }
    }
  }
}
