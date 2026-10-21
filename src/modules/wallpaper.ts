/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { InlineKeyboard } from 'grammy';
import { BaseModule, type CommandContext } from '../core';
import { escapeHtml } from '../html';
import {
  fetchBingWallpaper,
  getChatId,
  isGuestMode,
  BING_RESOLUTIONS,
  BING_MARKETS,
} from '../utils';

/**
 * Parses user arguments for resolution, market, and archive index.
 */
function parseWallpaperArgs(args: string[]): {
  resolution?: string;
  mkt?: string;
  index?: number | 'random';
} {
  const result: { resolution?: string; mkt?: string; index?: number | 'random' } = {};

  for (const arg of args) {
    const raw = arg.trim();
    const lower = raw.toLowerCase();

    if (lower === 'random') {
      result.index = 'random';
      continue;
    }

    if (lower === 'uhd' || lower === '4k' || lower === '1920' || lower === '1366' || BING_RESOLUTIONS[raw] || BING_RESOLUTIONS[lower]) {
      result.resolution = raw;
      continue;
    }

    if (/^[0-7]$/.test(raw)) {
      result.index = parseInt(raw, 10);
      continue;
    }

    if (BING_MARKETS.some((m) => m.toLowerCase() === lower)) {
      result.mkt = raw;
      continue;
    }
  }

  return result;
}

/**
 * WallpaperModule delivers daily Bing wallpapers with high-resolution 4K/UHD support,
 * multi-region markets, and archive history.
 * Sourced from the TimothyYe/bing-wallpaper architecture.
 */
export class WallpaperModule extends BaseModule {
  readonly id = 'wallpaper';
  readonly name = 'Wallpaper';
  readonly description = 'Fetches daily Bing wallpapers with high-resolution 4K/UHD support';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['wallpaper', 'bing'],
      async (ctx: CommandContext) => {
        const chatId = getChatId(ctx);
        const replyMessageId = ctx.msg?.message_id;
        const guestMode = ctx.isGuest || isGuestMode(ctx);

        if (chatId && !guestMode) {
          await ctx.replyWithChatAction('upload_photo').catch(() => {});
        }

        const options = parseWallpaperArgs(ctx.args);

        let data;
        try {
          data = await fetchBingWallpaper({
            resolution: options.resolution || 'UHD',
            mkt: options.mkt,
            index: options.index,
          });
        } catch (err) {
          console.error('[WallpaperModule] Failed to fetch Bing wallpaper:', err);
          await ctx.respond(
            '❌ <b>Failed to fetch Bing wallpaper.</b>\n\nPlease try again later.'
          );
          return;
        }

        const formattedDate = data.start_date
          ? `${data.start_date.slice(0, 4)}-${data.start_date.slice(4, 6)}-${data.start_date.slice(6, 8)}`
          : 'Today';

        const caption =
          `🖼️ <b>${escapeHtml(data.title)}</b>\n\n` +
          `<blockquote expandable>` +
          `<b>Description:</b> ${escapeHtml(data.copyright)}\n` +
          `<b>Date:</b> <code>${escapeHtml(formattedDate)}</code>\n` +
          `<b>Region:</b> <code>${escapeHtml(data.market)}</code>` +
          `</blockquote>\n\n` +
          `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

        const keyboard = new InlineKeyboard()
          .url('4K UHD Wallpaper', data.uhd_url || data.url)
          .row()
          .url('Bing Story', data.copyright_link);

        if (guestMode) {
          await ctx.answerGuestQuery({
            type: 'photo',
            id: `guest_wp_${Date.now()}`,
            photo_url: data.url,
            thumbnail_url: data.url,
            title: data.title,
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          }).catch(async () => {
            const richHtml =
              `<figure><img src="${escapeHtml(data.url)}" /></figure>\n\n` +
              caption +
              `\n\n<tg-button-row align="center">\n  <tg-button type="url" style="primary" url="${escapeHtml(data.uhd_url || data.url)}">4K UHD Wallpaper</tg-button>\n</tg-button-row>`;

            await ctx.answerGuestQuery({
              type: 'article',
              id: `guest_wp_art_${Date.now()}`,
              title: data.title,
              thumbnail_url: data.url,
              input_message_content: {
                rich_message: {
                  html: richHtml,
                },
              },
            }).catch(() => {});
          });
          return;
        }

        // Standard Chat Mode
        if (!chatId) return;

        try {
          await ctx.api.sendPhoto(chatId, data.url, {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
            reply_parameters: replyMessageId ? { message_id: replyMessageId } : undefined,
          });
        } catch (sendErr) {
          console.warn('[WallpaperModule] Failed to send photo directly, falling back:', sendErr);
          const fallbackText =
            `🖼️ <b>${escapeHtml(data.title)}</b>\n\n` +
            `<blockquote expandable>` +
            `<b>Description:</b> ${escapeHtml(data.copyright)}\n` +
            `<b>Date:</b> <code>${escapeHtml(formattedDate)}</code>\n` +
            `<b>Region:</b> <code>${escapeHtml(data.market)}</code>\n\n` +
            `• <a href="${escapeHtml(data.uhd_url || data.url)}">Direct 4K UHD Wallpaper</a>\n` +
            `• <a href="${escapeHtml(data.copyright_link)}">Bing Story Search</a>` +
            `</blockquote>\n\n` +
            `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

          await ctx.respond(fallbackText, { reply_markup: keyboard });
        }
      },
      {
        description: 'Fetch and send daily Bing wallpaper (UHD/4K)',
        usage: '[UHD|1080x1920|random] [en-US|zh-CN] [0-7]',
      }
    );
  }
}
