/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

export interface AnichinGenre {
  slug: string;
  name: string;
}

export const ANICHIN_GENRES: readonly AnichinGenre[] = [
  { slug: 'action', name: 'Action' },
  { slug: 'cultivation', name: 'Cultivation' },
  { slug: 'martial-arts', name: 'Martial Arts' },
  { slug: 'fantasy', name: 'Fantasy' },
  { slug: 'adventure', name: 'Adventure' },
  { slug: 'historical', name: 'Historical' },
  { slug: 'romance', name: 'Romance' },
  { slug: 'sci-fi', name: 'Sci-Fi' },
  { slug: 'comedy', name: 'Comedy' },
  { slug: 'supernatural', name: 'Supernatural' },
  { slug: 'mystery', name: 'Mystery' },
  { slug: 'drama', name: 'Drama' },
  { slug: 'super-power', name: 'Super Power' },
  { slug: 'urban-fantasy', name: 'Urban Fantasy' },
  { slug: 'reincaranation', name: 'Reincarnation' },
  { slug: 'time-travel', name: 'Time Travel' },
  { slug: 'suspense', name: 'Suspense' },
  { slug: 'psychological', name: 'Psychological' },
] as const;

export const ANICHIN_BASE_URL = 'https://anichin.moe';
export const ANICHIN_URL_REGEX =
  /^https?:\/\/(?:www\.)?anichin\.(?:moe|site|vip|care|lat|live|tv)(?:\/.*)?$/i;

export interface AnichinAnimeItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  status?: string;
  type?: string;
  episode?: string;
  sub?: string;
}

export interface AnichinSearchResult {
  query: string;
  page: number;
  hasNextPage: boolean;
  results: AnichinAnimeItem[];
}

export interface AnichinLatestItem {
  id: string;
  title: string;
  seriesTitle?: string;
  url: string;
  poster: string;
  status?: string;
  type?: string;
  episode?: string;
  sub?: string;
}

export interface AnichinLatestResult {
  page: number;
  hasNextPage: boolean;
  results: AnichinLatestItem[];
}

export interface AnichinEpisodeItem {
  number: string;
  title: string;
  url: string;
  date?: string;
}

export interface AnichinAnimeDetail {
  id: string;
  title: string;
  altTitle?: string;
  url: string;
  poster: string;
  rating?: string;
  synopsis?: string;
  status?: string;
  network?: string;
  studio?: string;
  released?: string;
  duration?: string;
  season?: string;
  country?: string;
  type?: string;
  totalEpisodes?: string;
  genres: string[];
  episodes: AnichinEpisodeItem[];
}

export interface AnichinStreamServer {
  name: string;
  embedUrl: string;
}

export interface AnichinDownloadLink {
  name: string;
  url: string;
}

export interface AnichinDownloadQuality {
  quality: string;
  links: AnichinDownloadLink[];
}

export interface AnichinEpisodeDetail {
  id: string;
  title: string;
  url: string;
  poster?: string;
  series?: {
    title: string;
    url: string;
  };
  prevEpisodeUrl?: string | null;
  nextEpisodeUrl?: string | null;
  servers: AnichinStreamServer[];
  downloads: AnichinDownloadQuality[];
}

export interface AnichinScheduleAnime {
  id: string;
  title: string;
  url: string;
}

export interface AnichinScheduleDay {
  day: string;
  anime: AnichinScheduleAnime[];
}

export interface AnichinScraperOptions {
  baseUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
  fetchFn?: typeof fetch;
}

export interface AnichinCacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Decodes HTML entities including named and decimal/hexadecimal numeric codes.
 */
export function decodeHtmlEntities(text?: string): string {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Strips HTML tags and normalizes whitespace while decoding entities.
 */
export function cleanHtmlText(text?: string): string {
  if (!text) return '';
  const stripped = text.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes relative or protocol-relative Anichin URLs into absolute HTTPS URLs.
 */
export function normalizeAnichinUrl(urlOrPath: string, baseUrl = ANICHIN_BASE_URL): string {
  if (!urlOrPath) return '';
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Extracts the canonical slug from an Anichin URL or slug string.
 */
export function extractAnichinSlug(input: string): string {
  if (!input) return '';
  let str = input.trim();
  str = str.replace(/[?#].*$/, '');
  str = str.replace(/^https?:\/\/[^/]+/i, '');
  str = str.replace(/^\/(anime\/)?/, '');
  str = str.replace(/\/+$/, '');
  return str;
}

/**
 * Checks whether a given string is a valid Anichin URL.
 */
export function isAnichinUrl(url: string): boolean {
  if (!url) return false;
  return ANICHIN_URL_REGEX.test(url.trim());
}

/**
 * Decodes base64 string safely across Node.js and Cloudflare Workers runtime.
 */
export function safeBase64Decode(str: string): string {
  if (!str) return '';
  try {
    if (typeof atob === 'function') {
      return atob(str.trim());
    }
  } catch {}
  return '';
}

/**
 * Pure parser for Anichin search results HTML.
 */
export function parseSearchResultHtml(
  html: string,
  query: string,
  page = 1,
  baseUrl = ANICHIN_BASE_URL
): AnichinSearchResult {
  const results: AnichinAnimeItem[] = [];
  const articleRegex = /<article class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
  let artMatch;

  while ((artMatch = articleRegex.exec(html)) !== null) {
    const artContent = artMatch[1];
    const linkMatch = artContent.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["']/i);
    const href = linkMatch ? linkMatch[1] : artContent.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;

    const titleAttr = linkMatch ? linkMatch[2] : '';
    const headline = artContent.match(/<h2 itemprop="headline">([\s\S]*?)<\/h2>/i)?.[1];
    const fallbackTitle = artContent.match(/<div class="tt">([\s\S]*?)<\/div>/i)?.[1];
    const rawTitle = titleAttr || headline || fallbackTitle || '';
    const title = cleanHtmlText(rawTitle);

    const posterMatch = artContent.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '';
    const poster = normalizeAnichinUrl(posterMatch, baseUrl);

    const statusMatch = artContent.match(/<div class="status ([^"']*)">([\s\S]*?)<\/div>/i);
    const typeMatch = artContent.match(/<div class="typez ([^"']*)">([\s\S]*?)<\/div>/i);
    const epMatch = artContent.match(/<span class="epx">([\s\S]*?)<\/span>/i);
    const subMatch = artContent.match(/<span class="sb Sub">([\s\S]*?)<\/span>/i);

    const epText = epMatch ? cleanHtmlText(epMatch[1]) : undefined;
    const statusText = statusMatch
      ? cleanHtmlText(statusMatch[2])
      : epText === 'Ongoing' || epText === 'Completed'
        ? epText
        : undefined;

    const typeText = typeMatch ? cleanHtmlText(typeMatch[2]) : 'Donghua';
    const subText = subMatch ? cleanHtmlText(subMatch[1]) : undefined;

    results.push({
      id: extractAnichinSlug(href),
      title,
      url: normalizeAnichinUrl(href, baseUrl),
      poster,
      status: statusText,
      type: typeText,
      episode: epText,
      sub: subText,
    });
  }

  const hasNextPage =
    html.includes('class="next page-numbers"') ||
    html.includes('rel="next"') ||
    new RegExp(`href=["'][^"']*/page/${page + 1}/`, 'i').test(html);

  return {
    query,
    page,
    hasNextPage,
    results,
  };
}

/**
 * Pure parser for Anichin latest releases homepage HTML.
 */
export function parseLatestResultHtml(
  html: string,
  page = 1,
  baseUrl = ANICHIN_BASE_URL
): AnichinLatestResult {
  const results: AnichinLatestItem[] = [];
  const articleRegex = /<article class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
  let artMatch;

  while ((artMatch = articleRegex.exec(html)) !== null) {
    const artContent = artMatch[1];
    const linkMatch = artContent.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["']/i);
    const href = linkMatch ? linkMatch[1] : artContent.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;

    const titleAttr = linkMatch ? linkMatch[2] : '';
    const headline = artContent.match(/<h2 itemprop="headline">([\s\S]*?)<\/h2>/i)?.[1];
    const ttBox = artContent.match(/<div class="tt">([\s\S]*?)<\/div>/i)?.[1] || '';
    const seriesTitle = cleanHtmlText(ttBox.replace(/<h2[\s\S]*?<\/h2>/i, ''));
    const title = cleanHtmlText(headline || titleAttr || seriesTitle);

    const posterMatch = artContent.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '';
    const poster = normalizeAnichinUrl(posterMatch, baseUrl);

    const statusMatch = artContent.match(/<div class="status ([^"']*)">([\s\S]*?)<\/div>/i);
    const typeMatch = artContent.match(/<div class="typez ([^"']*)">([\s\S]*?)<\/div>/i);
    const epMatch = artContent.match(/<span class="epx">([\s\S]*?)<\/span>/i);
    const subMatch = artContent.match(/<span class="sb Sub">([\s\S]*?)<\/span>/i);

    results.push({
      id: extractAnichinSlug(href),
      title,
      seriesTitle: seriesTitle || undefined,
      url: normalizeAnichinUrl(href, baseUrl),
      poster,
      status: statusMatch ? cleanHtmlText(statusMatch[2]) : undefined,
      type: typeMatch ? cleanHtmlText(typeMatch[2]) : 'Donghua',
      episode: epMatch ? cleanHtmlText(epMatch[1]) : undefined,
      sub: subMatch ? cleanHtmlText(subMatch[1]) : undefined,
    });
  }

  const hasNextPage =
    html.includes('class="next page-numbers"') ||
    html.includes('rel="next"') ||
    new RegExp(`href=["'][^"']*/page/${page + 1}/`, 'i').test(html);

  return {
    page,
    hasNextPage,
    results,
  };
}

/**
 * Pure parser for Anichin anime detail HTML.
 */
export function parseDetailHtml(
  html: string,
  currentUrl: string,
  baseUrl = ANICHIN_BASE_URL
): AnichinAnimeDetail | null {
  const titleMatch =
    html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];

  if (!titleMatch) return null;
  const title = cleanHtmlText(titleMatch);

  const altTitleMatch =
    html.match(/<div class="entry-content[^"]*"[^>]*>\s*<h4>([\s\S]*?)<\/h4>/i)?.[1] ||
    html.match(/<span class="alter">([\s\S]*?)<\/span>/i)?.[1];
  const altTitle = altTitleMatch ? cleanHtmlText(altTitleMatch) : undefined;

  const posterMatch =
    html.match(
      /<div class="thumb"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/i
    )?.[1] ||
    html.match(
      /<img[^>]+class="[^"]*attachment-post-thumbnail[^"]*"[^>]+(?:src|data-src)=["']([^"']+)["']/i
    )?.[1] ||
    html.match(/<img[^>]+itemprop="image"[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
    '';
  const poster = normalizeAnichinUrl(posterMatch, baseUrl);

  const ratingMatch =
    html.match(/itemprop="ratingValue" content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<strong>Rating\s*([0-9.]+)<\/strong>/i)?.[1] ||
    html.match(/<div class="num"[^>]*>([0-9.]+)<\/div>/i)?.[1];
  const rating = ratingMatch ? ratingMatch.trim() : undefined;

  const synMatch =
    html.match(/<div class="entry-content[^"]*" itemprop="description">([\s\S]*?)<\/div>/i)?.[1] ||
    html.match(/<div class="sinopsis"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  let synopsis: string | undefined;
  if (synMatch) {
    const withoutH4 = synMatch.replace(/<h4>[\s\S]*?<\/h4>/gi, '');
    synopsis = cleanHtmlText(withoutH4);
  }

  // Parse metadata in .spe
  const speMatch = html.match(/<div class="spe"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const metaMap: Record<string, string> = {};
  if (speMatch) {
    const spanRegex = /<span>\s*<b>([^<:]+):?<\/b>\s*([\s\S]*?)<\/span>/gi;
    let s;
    while ((s = spanRegex.exec(speMatch)) !== null) {
      const key = cleanHtmlText(s[1]).toLowerCase();
      const val = cleanHtmlText(s[2]);
      metaMap[key] = val;
    }
  }

  // Parse genres in .genxed
  const genxedMatch = html.match(/<div class="genxed"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const genres: string[] = [];
  if (genxedMatch) {
    const aRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let g;
    while ((g = aRegex.exec(genxedMatch)) !== null) {
      const genre = cleanHtmlText(g[1]);
      if (genre && !genres.includes(genre)) {
        genres.push(genre);
      }
    }
  }

  // Parse episodes in .eplister or .clstyle
  const eplisterBlock =
    html.match(/<div class="eplister"[^>]*>([\s\S]*?)<\/ul>/i)?.[0] ||
    html.match(/<ul class="clstyle"[^>]*>([\s\S]*?)<\/ul>/i)?.[0] ||
    '';

  const episodes: AnichinEpisodeItem[] = [];
  if (eplisterBlock) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRegex.exec(eplisterBlock)) !== null) {
      const content = li[1];
      const href = content.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1];
      if (!href) continue;

      const num = cleanHtmlText(
        content.match(/<div class="epl-num">([\s\S]*?)<\/div>/i)?.[1] || ''
      );
      const epTitle = cleanHtmlText(
        content.match(/<div class="epl-title">([\s\S]*?)<\/div>/i)?.[1] ||
          content.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
          ''
      );
      const epDate = cleanHtmlText(
        content.match(/<div class="epl-date">([\s\S]*?)<\/div>/i)?.[1] || ''
      );

      episodes.push({
        number: num || String(episodes.length + 1),
        title: epTitle,
        url: normalizeAnichinUrl(href, baseUrl),
        date: epDate || undefined,
      });
    }
  }

  return {
    id: extractAnichinSlug(currentUrl),
    title,
    altTitle,
    url: normalizeAnichinUrl(currentUrl, baseUrl),
    poster,
    rating,
    synopsis,
    status: metaMap['status'] || metaMap['status:'] || undefined,
    network: metaMap['network'] || metaMap['network:'] || undefined,
    studio: metaMap['studio'] || metaMap['studio:'] || undefined,
    released: metaMap['tanggal rilis'] || metaMap['released'] || undefined,
    duration: metaMap['durasi'] || metaMap['duration'] || undefined,
    season: metaMap['season'] || undefined,
    country: metaMap['negara'] || metaMap['country'] || undefined,
    type: metaMap['tipe'] || metaMap['type'] || 'Donghua',
    totalEpisodes: metaMap['episode'] || metaMap['episodes'] || undefined,
    genres,
    episodes,
  };
}

/**
 * Pure parser for Anichin episode HTML (streams & downloads).
 */
export function parseEpisodeHtml(
  html: string,
  currentUrl: string,
  baseUrl = ANICHIN_BASE_URL
): AnichinEpisodeDetail | null {
  const titleMatch =
    html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];

  if (!titleMatch) return null;
  const title = cleanHtmlText(titleMatch);

  // Series reference in .naveps
  const seriesLinkMatch = html.match(
    /<div class="nvs nvsc">\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
  );
  let series: { title: string; url: string } | undefined;
  if (seriesLinkMatch) {
    const sUrl = normalizeAnichinUrl(seriesLinkMatch[1], baseUrl);
    const sTitle = cleanHtmlText(seriesLinkMatch[2]);
    series = { title: sTitle || 'Series', url: sUrl };
  }

  // Prev / Next navigation
  const prevMatch = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*rel=["']prev["']/i)?.[1];
  const nextMatch = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*rel=["']next["']/i)?.[1];

  const prevEpisodeUrl = prevMatch ? normalizeAnichinUrl(prevMatch, baseUrl) : null;
  const nextEpisodeUrl = nextMatch ? normalizeAnichinUrl(nextMatch, baseUrl) : null;

  // Stream servers from mirror select
  const servers: AnichinStreamServer[] = [];
  const selectMatch = html.match(/<select class="mirror"[^>]*>([\s\S]*?)<\/select>/i)?.[1];
  if (selectMatch) {
    const optRegex = /<option[^>]+value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let opt;
    while ((opt = optRegex.exec(selectMatch)) !== null) {
      const rawVal = opt[1].trim();
      if (!rawVal) continue;
      const name = cleanHtmlText(opt[2]);
      const decoded = safeBase64Decode(rawVal);
      const srcMatch = decoded.match(/src=["']([^"']+)["']/i);
      if (srcMatch?.[1]) {
        servers.push({
          name,
          embedUrl: srcMatch[1].trim(),
        });
      }
    }
  }

  // Fallback iframe on page if mirror select has no options
  if (servers.length === 0) {
    const iframeSrc = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    if (iframeSrc) {
      servers.push({
        name: 'Default Player',
        embedUrl: iframeSrc.trim(),
      });
    }
  }

  // Downloads from .soraurlx
  const downloads: AnichinDownloadQuality[] = [];
  const soraRegex = /<div class="soraurlx"[^>]*>([\s\S]*?)<\/div>/gi;
  let sora;
  while ((sora = soraRegex.exec(html)) !== null) {
    const soraContent = sora[1];
    const qualityMatch = soraContent.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1];
    const quality = qualityMatch ? cleanHtmlText(qualityMatch) : 'Unknown';

    const links: AnichinDownloadLink[] = [];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = aRegex.exec(soraContent)) !== null) {
      const linkHref = a[1].trim();
      const linkName = cleanHtmlText(a[2]);
      if (linkHref && linkName) {
        links.push({
          name: linkName,
          url: linkHref,
        });
      }
    }

    if (links.length > 0) {
      downloads.push({
        quality,
        links,
      });
    }
  }

  const posterMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<img[^>]+itemprop=["']image["'][^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
    html.match(
      /<div class=["']thumb["'][^>]*>[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/i
    )?.[1] ||
    '';
  const poster = posterMatch ? normalizeAnichinUrl(posterMatch, baseUrl) : undefined;

  return {
    id: extractAnichinSlug(currentUrl),
    title,
    url: normalizeAnichinUrl(currentUrl, baseUrl),
    poster,
    series,
    prevEpisodeUrl,
    nextEpisodeUrl,
    servers,
    downloads,
  };
}

/**
 * Pure parser for Anichin weekly schedule HTML.
 */
export function parseScheduleHtml(html: string, baseUrl = ANICHIN_BASE_URL): AnichinScheduleDay[] {
  const scheduleDays: AnichinScheduleDay[] = [];
  const listRegex = /<div class="listSchh"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let listMatch;

  while ((listMatch = listRegex.exec(html)) !== null) {
    const block = listMatch[1];
    const dayName = cleanHtmlText(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
    if (!dayName) continue;

    const anime: AnichinScheduleAnime[] = [];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = aRegex.exec(block)) !== null) {
      const href = a[1].trim();
      const title = cleanHtmlText(a[2]);
      if (href && title) {
        const fullUrl = normalizeAnichinUrl(href, baseUrl);
        anime.push({
          id: extractAnichinSlug(fullUrl),
          title,
          url: fullUrl,
        });
      }
    }

    scheduleDays.push({
      day: dayName,
      anime,
    });
  }

  return scheduleDays;
}

/**
 * Calculates Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Computes a normalized similarity score between query tokens and target title.
 */
export function computeQuerySimilarity(query: string, target: string): number {
  const qWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tWords = target.toLowerCase().split(/\s+/).filter(Boolean);
  if (qWords.length === 0 || tWords.length === 0) return 0;

  let matched = 0;
  for (const qw of qWords) {
    if (
      tWords.some((tw) => tw.includes(qw) || qw.includes(tw) || levenshteinDistance(qw, tw) <= 1)
    ) {
      matched += 1;
    }
  }
  return matched / Math.max(qWords.length, tWords.length);
}

/**
 * High-performance, resilient scraper for https://anichin.moe/
 */
export class AnichinScraper {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly userAgent: string;
  private readonly _fetch?: typeof fetch;
  private readonly _cache = new Map<string, AnichinCacheEntry<unknown>>();

  constructor(options: AnichinScraperOptions = {}) {
    this.baseUrl = (options.baseUrl || ANICHIN_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.userAgent =
      options.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    this._fetch = options.fetchFn;
  }

  /**
   * Retrieves an item from the scraper memory cache if present and not expired.
   */
  getCache<T>(key: string): T | null {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Stores an item into the memory cache with an expiration TTL.
   */
  setCache<T>(key: string, data: T, ttlMs: number): T {
    if (this._cache.size > 500) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey) this._cache.delete(oldestKey);
    }
    this._cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    return data;
  }

  /**
   * Clears all cached scraper data.
   */
  clearCache(): void {
    this._cache.clear();
  }

  private async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const requestHeaders = {
        'User-Agent': this.userAgent,
        Referer: `${this.baseUrl}/`,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      };

      const res = this._fetch
        ? await this._fetch(url, {
            signal: controller.signal,
            headers: requestHeaders,
          })
        : await fetch(url, {
            signal: controller.signal,
            headers: requestHeaders,
          });

      if (!res.ok) {
        throw new Error(`Anichin HTTP error ${res.status} for ${url}`);
      }

      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Search Donghua series by title query with automatic token fallback on zero results.
   */
  async search(query: string, page = 1): Promise<AnichinSearchResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { query: '', page: 1, hasNextPage: false, results: [] };
    }

    const cacheKey = `search:${cleanQuery.toLowerCase()}:${page}`;
    const cached = this.getCache<AnichinSearchResult>(cacheKey);
    if (cached) return cached;

    const targetUrl =
      page > 1
        ? `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(cleanQuery)}`
        : `${this.baseUrl}/?s=${encodeURIComponent(cleanQuery)}`;

    const html = await this.fetchHtml(targetUrl);
    const exactResult = parseSearchResultHtml(html, cleanQuery, page, this.baseUrl);

    // If exact query returns results, or if it's page > 1, cache and return
    if (exactResult.results.length > 0 || page > 1) {
      return this.setCache(cacheKey, exactResult, 15 * 60 * 1000);
    }

    // Smart fallback for multi-word queries with potential typos (e.g. "Renegade imortal")
    const words = cleanQuery
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length >= 3);

    if (words.length > 1) {
      const candidateMap = new Map<string, AnichinAnimeItem & { score: number }>();

      const wordResults = await Promise.allSettled(
        words.map(async (w) => {
          const wUrl = `${this.baseUrl}/?s=${encodeURIComponent(w)}`;
          const wHtml = await this.fetchHtml(wUrl);
          return parseSearchResultHtml(wHtml, w, 1, this.baseUrl);
        })
      );

      for (const res of wordResults) {
        if (res.status === 'fulfilled' && res.value.results.length > 0) {
          for (const item of res.value.results) {
            if (!candidateMap.has(item.id)) {
              candidateMap.set(item.id, {
                ...item,
                score: computeQuerySimilarity(cleanQuery, item.title),
              });
            }
          }
        }
      }

      if (candidateMap.size > 0) {
        const sorted = Array.from(candidateMap.values())
          .sort((a, b) => b.score - a.score)
          .map(({ score: _score, ...item }) => item);

        const fallbackResult: AnichinSearchResult = {
          query: cleanQuery,
          page: 1,
          hasNextPage: false,
          results: sorted,
        };

        return this.setCache(cacheKey, fallbackResult, 15 * 60 * 1000);
      }
    }

    return this.setCache(cacheKey, exactResult, 15 * 60 * 1000);
  }

  /**
   * Fetch latest updated episodes from the homepage.
   */
  async getLatest(page = 1): Promise<AnichinLatestResult> {
    const cacheKey = `latest:${page}`;
    const cached = this.getCache<AnichinLatestResult>(cacheKey);
    if (cached) return cached;

    const targetUrl = page > 1 ? `${this.baseUrl}/page/${page}/` : `${this.baseUrl}/`;
    const html = await this.fetchHtml(targetUrl);
    const result = parseLatestResultHtml(html, page, this.baseUrl);
    return this.setCache(cacheKey, result, 5 * 60 * 1000);
  }

  /**
   * Fetch detailed information and episode list for a series.
   */
  async getDetail(urlOrSlug: string): Promise<AnichinAnimeDetail | null> {
    if (!urlOrSlug) return null;
    let targetUrl: string;

    if (urlOrSlug.startsWith('http://') || urlOrSlug.startsWith('https://')) {
      targetUrl = urlOrSlug;
    } else {
      const cleanSlug = extractAnichinSlug(urlOrSlug);
      targetUrl = `${this.baseUrl}/${cleanSlug}/`;
    }

    const cleanSlug = extractAnichinSlug(targetUrl);
    const cacheKey = `detail:${cleanSlug}`;
    const cached = this.getCache<AnichinAnimeDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(targetUrl);
      const detail = parseDetailHtml(html, targetUrl, this.baseUrl);
      if (detail) {
        this.setCache(cacheKey, detail, 2 * 60 * 60 * 1000);
      }
      return detail;
    } catch {
      return null;
    }
  }

  /**
   * Fetch stream video servers and download links for an episode.
   */
  async getEpisode(urlOrSlug: string): Promise<AnichinEpisodeDetail | null> {
    if (!urlOrSlug) return null;
    let targetUrl: string;

    if (urlOrSlug.startsWith('http://') || urlOrSlug.startsWith('https://')) {
      targetUrl = urlOrSlug;
    } else {
      const cleanSlug = extractAnichinSlug(urlOrSlug);
      targetUrl = `${this.baseUrl}/${cleanSlug}/`;
    }

    const cleanSlug = extractAnichinSlug(targetUrl);
    const cacheKey = `ep:${cleanSlug}`;
    const cached = this.getCache<AnichinEpisodeDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(targetUrl);
      const ep = parseEpisodeHtml(html, targetUrl, this.baseUrl);
      if (ep) {
        this.setCache(cacheKey, ep, 2 * 60 * 60 * 1000);
      }
      return ep;
    } catch {
      return null;
    }
  }

  /**
   * Fetch weekly release schedule.
   */
  async getSchedule(): Promise<AnichinScheduleDay[]> {
    const cacheKey = 'schedule';
    const cached = this.getCache<AnichinScheduleDay[]>(cacheKey);
    if (cached) return cached;

    const targetUrl = `${this.baseUrl}/schedule/`;
    const html = await this.fetchHtml(targetUrl);
    const schedule = parseScheduleHtml(html, this.baseUrl);
    return this.setCache(cacheKey, schedule, 2 * 60 * 60 * 1000);
  }

  /**
   * Fetch anime list filtered by genre/category.
   */
  async getByGenre(genreSlug: string, page = 1): Promise<AnichinSearchResult> {
    if (!genreSlug) {
      return { query: '', page: 1, hasNextPage: false, results: [] };
    }
    const cleanSlug = genreSlug.toLowerCase().trim();
    const cacheKey = `genre:${cleanSlug}:${page}`;
    const cached = this.getCache<AnichinSearchResult>(cacheKey);
    if (cached) return cached;

    const targetUrl =
      page > 1
        ? `${this.baseUrl}/genres/${cleanSlug}/page/${page}/`
        : `${this.baseUrl}/genres/${cleanSlug}/`;
    const html = await this.fetchHtml(targetUrl);
    const result = parseSearchResultHtml(html, cleanSlug, page, this.baseUrl);
    return this.setCache(cacheKey, result, 30 * 60 * 1000);
  }
}

/**
 * Default shared AnichinScraper singleton instance.
 */
export const anichin = new AnichinScraper();
