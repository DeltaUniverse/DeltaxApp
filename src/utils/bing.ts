/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

export const BING_BASE_URL = 'https://www.bing.com';
export const BING_API_URL = 'https://www.bing.com/HPImageArchive.aspx?format=js';

export const BING_RESOLUTIONS: Record<string, string> = {
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

export const BING_MARKETS = [
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

export interface BingWallpaperOptions {
  index?: number | string;
  mkt?: string;
  resolution?: string;
  imageFormat?: 'jpg' | 'webp';
}

export interface BingWallpaperResponse {
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

export function getRandomMarket(): string {
  const idx = Math.floor(Math.random() * BING_MARKETS.length);
  return BING_MARKETS[idx];
}

export function getRandomIndex(): number {
  return Math.floor(Math.random() * 8);
}

/**
 * Resolves Bing wallpaper suffix according to requested resolution.
 */
export function resolveResolutionSuffix(resolution: string = '1920'): string {
  const trimmed = resolution.trim();
  const found = BING_RESOLUTIONS[trimmed] || BING_RESOLUTIONS[trimmed.toUpperCase()];
  if (found) return found;
  return '1920x1080.jpg';
}

/**
 * Fetches daily Bing wallpaper metadata and constructs high-resolution image URLs.
 * Matches functionality of TimothyYe/bing-wallpaper with native Cloudflare Workers performance.
 */
export async function fetchBingWallpaper(
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

  // Handle webp format request if applicable
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
