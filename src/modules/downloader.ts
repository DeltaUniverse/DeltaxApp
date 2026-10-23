import { InlineKeyboard } from 'grammy';
import { BaseModule, type CommandContext } from '../core';
import { html, rawHtml, escapeHtml, stripHtml, unescapeHtml } from '../html';
import type { BotContext } from '../types';
import {
  formatCount,
  getChatId,
  buildGuestMediaContainer,
  chunkMediaItems,
  createTelegramAlbum,
  truncateCaption,
  findSupportedUrl,
  extractMedia,
  extractDownloadTarget,
  type ExtractedResult,
  logger,
} from '../utils';

/**
 * DownloaderModule handles media extraction and downloads for Instagram, TikTok, and X.
 * Registers /dl, /download, and handles guest URL messages.
 */
export class DownloaderModule extends BaseModule {
  readonly id = 'downloader';
  readonly name = 'Downloader';
  readonly description = 'High-speed guest downloader for Instagram, TikTok, and X (Twitter)';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['dl', 'download'],
      async (ctx: CommandContext) => {
        const target = extractDownloadTarget(
          ctx.input,
          ctx.replyMsg,
          ctx.prefix,
          ctx.msg?.entities
        );
        if (!target) {
          const usageMsg = html`<b>Usage:</b> <code>${escapeHtml(ctx.prefix)}dl &lt;url&gt;</code>

            Send or reply to a link from: • <b>Instagram:</b> Reels, Posts, Carousels •
            <b>TikTok:</b> Videos, Photo slides • <b>X (Twitter):</b> Videos, GIFs, Photos`;
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

    this.on('guest_message:text', async (ctx: BotContext) => {
      if (ctx.guest?.kind === 'url') {
        await this.handleDownload(ctx, ctx.guest.url, ctx.guest.platform);
      }
    });
  }

  /**
   * Unified media processor and uploader:
   * Supports native multi-item Telegram albums (sendMediaGroup) for carousels & slides
   * across direct chat and group chats.
   */
  private async handleDownload(
    ctx: BotContext,
    url: string,
    platform: 'instagram' | 'tiktok' | 'twitter'
  ): Promise<void> {
    const platformLabel =
      platform === 'instagram' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : 'X (Twitter)';

    const chatId = getChatId(ctx);

    const replyMessageId = ctx.msg?.message_id;
    const isGuestQuery = Boolean(
      (ctx.msg as { guest_query_id?: string } | undefined)?.guest_query_id
    );

    if (chatId) {
      await ctx.api.sendChatAction(chatId, 'upload_video').catch(() => {});
    }

    let result: ExtractedResult | null = null;
    try {
      result = await extractMedia(url);
    } catch (err) {
      logger.error({ err, platform }, 'failed to extract media');
    }

    if (!result || result.items.length === 0) {
      const errorMsg = html`❌ <b>Unable to extract media from ${platformLabel}.</b>

        The post may be private, deleted, or restricted by the platform.`;

      if (isGuestQuery) {
        await ctx
          .answerGuestQuery({
            type: 'article',
            id: `guest_err_${Date.now()}`,
            title: `Unable to extract ${platformLabel}`,
            description: 'Post may be private, restricted, or deleted.',
            input_message_content: {
              message_text: `❌ <b>Unable to extract media from ${platformLabel}.</b>\n\nThe post may be private, deleted, or restricted.`,
              parse_mode: 'HTML',
            },
          })
          .catch(() => {});
      } else if (chatId) {
        await ctx.api
          .sendMessage(chatId, errorMsg, {
            reply_parameters: replyMessageId ? { message_id: replyMessageId } : undefined,
          })
          .catch(() => {});
      }
      return;
    }

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

    const cleanCaption = result.caption ? unescapeHtml(stripHtml(result.caption)).trim() : '';

    const authorName = result.author?.username
      ? result.author.username.startsWith('@')
        ? result.author.username
        : `@${result.author.username}`
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

    const isLive = Boolean(
      result.caption &&
      (result.caption.includes('LIVE') || result.caption.includes('Siaran') || result.id === 'live')
    );
    const buttonText = isLive ? 'Watch LIVE on TikTok' : 'Original Post';

    if (isGuestQuery) {
      const blocks: string[] = [];

      if (metrics.length > 0) {
        blocks.push(`<p><b>${metrics.join('&nbsp;&nbsp;')}</b></p>`);
      }

      if (cleanCaption) {
        const formattedLines = escapeHtml(cleanCaption).replace(/\r?\n/g, '<br/>');
        blocks.push(`<blockquote expandable>${formattedLines}</blockquote>`);
      }

      if (authorLine) {
        blocks.push(`<p>${authorLine}</p>`);
      }

      blocks.push(`<blockquote>${brandLine}</blockquote>`);

      const mediaContainer = buildGuestMediaContainer(result.items);
      const buttonRow = `<tg-button-row align="center">\n  <tg-button type="url" style="primary" url="${escapeHtml(url)}">${buttonText}</tg-button>\n</tg-button-row>`;
      const richHtml = [mediaContainer, ...blocks, buttonRow].join('\n\n');

      await ctx.answerGuestQuery({
        type: 'article',
        id: `guest_${Date.now()}`,
        title: isLive
          ? `🔴 TikTok LIVE: ${result.author?.name || 'Live'}`
          : `${platformLabel} ${result.items.length > 1 ? `Slideshow (${result.items.length} items)` : 'Media'}`,
        thumbnail_url: result.items[0].thumbnailUrl || result.items[0].url,
        input_message_content: {
          rich_message: {
            html: richHtml,
          },
        },
      });
      return;
    }

    // Truncate cleanly for 1024-character caption limit in standard Telegram chats
    const overhead =
      (metricsLine ? metricsLine.length + 2 : 0) +
      (authorLine ? authorLine.length + 2 : 0) +
      brandLine.length +
      95;
    const standardBody = truncateCaption(cleanCaption, 1024, overhead);

    const caption = buildStandardCaption(standardBody);
    const keyboard = new InlineKeyboard().url(buttonText, url);

    try {
      if (!chatId) {
        throw new Error('No target chatId found');
      }

      if (result.items.length === 1) {
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
        // Telegram sendMediaGroup supports albums between 2 and 10 items
        const chunks = chunkMediaItems(result.items, 10);
        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
          const chunk = chunks[chunkIdx];

          if (chunk.length === 1) {
            // Standalone leftover item
            const item = chunk[0];
            if (item.type === 'video') {
              await ctx.api.sendVideo(chatId, item.url);
            } else {
              await ctx.api.sendPhoto(chatId, item.url);
            }
          } else {
            const group = createTelegramAlbum(chunk, caption, chunkIdx === 0);

            await ctx.api.sendMediaGroup(chatId, group, {
              reply_parameters:
                chunkIdx === 0 && replyMessageId ? { message_id: replyMessageId } : undefined,
            });
          }
        }
      }
    } catch (sendErr) {
      logger.warn({ err: sendErr, platform }, 'direct media upload failed, attempting fallback');

      // Fallback for regular chat if Telegram server cannot download the media directly
      if (chatId) {
        const downloadLinksHtml = result.items
          .map(
            (it, idx) =>
              `• <a href="${escapeHtml(it.url)}">${it.type === 'video' ? 'Video' : 'Photo'} ${idx + 1}</a>`
          )
          .join('\n');

        const fallbackMsg = html`<b>${platformLabel} Media Extracted</b>

          ${metricsLine ? rawHtml(metricsLine + '\n\n') : ''}${standardBody ? rawHtml(`<blockquote expandable>${escapeHtml(standardBody)}</blockquote>\n\n`) : ''}${authorLine ? rawHtml(authorLine + '\n\n') : ''}${rawHtml(`<blockquote>${brandLine}</blockquote>\n\n`)}<b
            >Direct Download Links:</b
          >
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
