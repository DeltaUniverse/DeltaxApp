/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { InlineKeyboard } from 'grammy';
import { BaseModule, type CommandContext } from '../core';
import { escapeHtml } from '../html';
import { getChatId, isGuestMode } from '../utils';

const BING_BASE_URL = 'https://www.bing.com';
const BING_API_URL = 'https://www.bing.com/HPImageArchive.aspx?format=js';

const BING_RESOLUTIONS: Record<string, string> = {
  '1366': '1366x768.jpg',
  '1920': '1920x1080.jpg',
  '3840': 'UHD.jpg',
  'UHD': 'UHD.jpg',
  'uhd': 'UHD.jpg',
  '4k': 'UHD.jpg',
  '4K': 'UHD.jpg',
  '1920x1200': '1920x1200.jpg',
  '1920x1080': '1920x1080.jpg',
  '1366x768': '1366x768.jpg',
  '1280x768': '1280x768.jpg',
  '1024x768': '1024x768.jpg',
  '800x600': '800x600.jpg',
  '800x480': '800x480.jpg',
  '1080x1920': '1080x1920.jpg',
  '768x1280': '768x1280.jpg',
  '720x1280': '720x1280.jpg',
  '640x480': '640x480.jpg',
  '480x800': '480x800.jpg',
  '400x240': '400x240.jpg',
  '320x240': '320x240.jpg',
  '240x320': '240x320.jpg',
};

const BING_MARKETS = [
  'zh-CN',
  'en-US',
  'ja-JP',
  'en-AU',
  'en-GB',
  'de-DE',
  'en-NZ',
  'en-CA',
  'en-IN',
  'fr-FR',
  'fr-CA',
  'it-IT',
  'es-ES',
  'pt-BR',
  'en-ROW',
];

/**
 * Friendly market aliases mapping country codes/names to Bing markets.
 */
const MARKET_ALIASES: Record<string, string> = {
  // United States
  us: 'en-US',
  usa: 'en-US',
  // China
  cn: 'zh-CN',
  zh: 'zh-CN',
  china: 'zh-CN',
  // Japan
  jp: 'ja-JP',
  ja: 'ja-JP',
  japan: 'ja-JP',
  // United Kingdom
  uk: 'en-GB',
  gb: 'en-GB',
  // Germany
  de: 'de-DE',
  germany: 'de-DE',
  // France
  fr: 'fr-FR',
  france: 'fr-FR',
  // Canada
  ca: 'en-CA',
  canada: 'en-CA',
  // Australia
  au: 'en-AU',
  australia: 'en-AU',
  // India
  in: 'en-IN',
  india: 'en-IN',
  // Italy
  it: 'it-IT',
  italy: 'it-IT',
  // Spain
  es: 'es-ES',
  spain: 'es-ES',
  // Brazil
  br: 'pt-BR',
  brazil: 'pt-BR',
  // New Zealand
  nz: 'en-NZ',
  newzealand: 'en-NZ',
  // Global / Rest of World
  row: 'en-ROW',
  global: 'en-ROW',
  world: 'en-ROW',
};

function resolveMarketAlias(val: string): string | undefined {
  const lower = val.toLowerCase();
  if (MARKET_ALIASES[lower]) return MARKET_ALIASES[lower];
  return BING_MARKETS.find((m) => m.toLowerCase() === lower);
}

function getRandomMarket(): string {
  const idx = Math.floor(Math.random() * BING_MARKETS.length);
  return BING_MARKETS[idx];
}

function getRandomIndex(): number {
  return Math.floor(Math.random() * 8);
}

function resolveResolutionSuffix(resolution: string = '1920'): string {
  const trimmed = resolution.trim();
  const found = BING_RESOLUTIONS[trimmed] || BING_RESOLUTIONS[trimmed.toUpperCase()];
  if (found) return found;
  return '1920x1080.jpg';
}

interface BingWallpaperOptions {
  index?: number | string;
  mkt?: string;
  resolution?: string;
  imageFormat?: 'jpg' | 'webp';
}

interface BingWallpaperResponse {
  start_date: string;
  end_date: string;
  url: string;
  uhd_url: string;
  copyright: string;
  copyright_link: string;
  title: string;
  market: string;
  index: number;
}

async function fetchBingWallpaper(
  options: BingWallpaperOptions = {}
): Promise<BingWallpaperResponse> {
  let targetIndex: number;
  if (options.index === 'random' || options.index === undefined || options.index === null) {
    targetIndex = options.index === 'random' ? getRandomIndex() : 0;
  } else {
    const parsed = typeof options.index === 'number' ? options.index : parseInt(String(options.index), 10);
    targetIndex = isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 7);
  }

  let market = options.mkt?.trim() || 'en-US';
  if (market.toLowerCase() === 'random') {
    market = getRandomMarket();
  }

  const suffix = resolveResolutionSuffix(options.resolution || '1920');
  const apiUrl = `${BING_API_URL}&idx=${targetIndex}&n=1&mkt=${encodeURIComponent(market)}`;

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      Referer: BING_BASE_URL,
    },
  });

  if (!res.ok) {
    throw new Error(`Bing API returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    images?: Array<{
      startdate?: string;
      enddate?: string;
      urlbase?: string;
      url?: string;
      copyright?: string;
      copyrightlink?: string;
      title?: string;
    }>;
  };

  const image = data?.images?.[0];
  if (!image) {
    throw new Error('No wallpaper images found in Bing response');
  }

  const base = image.urlbase ? `${BING_BASE_URL}${image.urlbase}` : null;
  let finalUrl = base ? `${base}_${suffix}` : (image.url ? `${BING_BASE_URL}${image.url}` : '');
  const uhdUrl = base ? `${base}_UHD.jpg` : finalUrl;

  if (options.imageFormat === 'webp' && finalUrl.endsWith('.jpg')) {
    finalUrl = finalUrl.slice(0, -4) + '.webp';
  }

  return {
    start_date: image.startdate || '',
    end_date: image.enddate || '',
    url: finalUrl,
    uhd_url: uhdUrl,
    copyright: image.copyright || '',
    copyright_link: image.copyrightlink || 'https://www.bing.com',
    title: image.title || 'Bing Daily Wallpaper',
    market,
    index: targetIndex,
  };
}

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

    if (lower.startsWith('@')) {
      continue;
    }

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

    if (lower.startsWith('mkt:') || lower.startsWith('market:')) {
      const val = lower.replace(/^mkt:|^market:/, '');
      const resolved = resolveMarketAlias(val);
      if (resolved) {
        result.mkt = resolved;
        continue;
      }
    }

    const resolvedMkt = resolveMarketAlias(raw);
    if (resolvedMkt) {
      result.mkt = resolvedMkt;
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

        let data: BingWallpaperResponse;
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
        usage: '[random|0-7] [us|jp|cn|uk|de|fr...] [4k|uhd|1080]',
      }
    );
  }
}
