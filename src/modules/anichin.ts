/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { InlineKeyboard } from 'grammy';
import { BaseModule, type CommandContext } from '../core';
import { escapeHtml } from '../html';
import type { BotContext } from '../types';
import {
  anichin,
  isAnichinUrl,
  extractAnichinSlug,
  ANICHIN_GENRES,
  type AnichinAnimeDetail,
  type AnichinEpisodeDetail,
  type AnichinLatestItem,
  type AnichinLatestResult,
  type AnichinSearchResult,
  type AnichinScheduleDay,
  logger,
  getChatId,
  isGuestMode,
} from '../utils';

export const NO_PREVIEW = { is_disabled: true };

export function buildCoverPreviewOptions(poster?: string): {
  is_disabled: boolean;
  url?: string;
  prefer_large_media?: boolean;
  show_above_text?: boolean;
} {
  if (!poster) return NO_PREVIEW;
  return {
    is_disabled: false,
    url: poster,
    prefer_large_media: true,
    show_above_text: true,
  };
}

export const ANICHIN_CATEGORY_COLS = 2;
export const ANICHIN_CATEGORY_ROWS = 3;
export const ANICHIN_CATEGORY_PAGE_SIZE = ANICHIN_CATEGORY_COLS * ANICHIN_CATEGORY_ROWS; // 6 categories (2x3 grid underneath top 2)
export const SCHEDULE_PAGE_SIZE = 8;

export const ANICHIN_DAYS = [
  { key: 'senin', name: 'Senin' },
  { key: 'selasa', name: 'Selasa' },
  { key: 'rabu', name: 'Rabu' },
  { key: 'kamis', name: 'Kamis' },
  { key: 'jumat', name: "Jum'at" },
  { key: 'sabtu', name: 'Sabtu' },
  { key: 'minggu', name: 'Minggu' },
  { key: 'acak', name: 'Acak' },
] as const;

/**
 * Normalizes day string for matching (e.g. "Jum'at" -> "jumat").
 */
export function normalizeDayKey(day: string): string {
  return day.toLowerCase().replace(/['`\s-]/g, '');
}

/**
 * Formats series or episode titles cleanly for compact inline buttons.
 * Strips redundant boilerplate like "Subtitle Indonesia", "Sub Indo", etc.,
 * and cleanly truncates to fit mobile inline button widths without awkward wrapping.
 */
export function formatButtonTitle(title: string, maxLength = 16): string {
  if (!title) return '';
  const clean = title
    .replace(/\s*[-–—:]*\s*(?:Subtitle\s+Indonesia|Sub\s+Indo|Subtitle\s+Indo)\b/gi, '')
    .replace(/\s*\(Donghua\)/gi, '')
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

/**
 * Appends standard action buttons: Main Menu and conditional Close button (omitted in guest mode).
 */
export function appendFooterButtons(
  keyboard: InlineKeyboard,
  isGuest = false,
  showMenu = true
): InlineKeyboard {
  if (showMenu) {
    keyboard.text('‹ Main Menu', 'ani:menu:1');
  }
  if (!isGuest) {
    keyboard.text('Close', 'ani:close');
  }
  return keyboard;
}

/**
 * Builds the 2x4 inline keyboard for the Anichin main menu:
 * - Row 1 (Top 2 buttons): [New Releases] [Schedule]
 * - Rows 2-4 (Underneath): 6 categories (2 cols x 3 rows)
 * - Row 5 (Pagination): [‹ Prev] [page/totalPages] [Next ›]
 * - Row 6 (Footer): [Close] (if not guest)
 */
export function buildAnichinMainMenuKeyboard(page = 1, isGuest = false): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Row 1: Top 2 primary action buttons
  keyboard.text('New Releases', 'ani:l:1').text('Schedule', 'ani:sched').row();

  const totalGenres = ANICHIN_GENRES.length;
  const totalPages = Math.max(1, Math.ceil(totalGenres / ANICHIN_CATEGORY_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIndex = (currentPage - 1) * ANICHIN_CATEGORY_PAGE_SIZE;
  const pageGenres = ANICHIN_GENRES.slice(startIndex, startIndex + ANICHIN_CATEGORY_PAGE_SIZE);

  let col = 0;
  for (const genre of pageGenres) {
    keyboard.text(genre.name, `ani:cat:${genre.slug}:1`);
    col++;
    if (col === ANICHIN_CATEGORY_COLS) {
      keyboard.row();
      col = 0;
    }
  }

  if (col > 0) {
    keyboard.row();
  }

  // Row 5: Category pagination controls
  if (totalPages > 1) {
    const prevPage = currentPage > 1 ? currentPage - 1 : totalPages;
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1;
    keyboard
      .text('‹ Prev', `ani:cp:${prevPage}`)
      .text(`${currentPage}/${totalPages}`, `ani:noop:${currentPage}:${totalPages}`)
      .text('Next ›', `ani:cp:${nextPage}`)
      .row();
  }

  if (!isGuest) {
    keyboard.text('Close', 'ani:close');
  }

  return keyboard;
}

/**
 * Formats the clean main menu message and keyboard.
 */
export function renderAnichinMainMenu(
  page = 1,
  prefix = '/',
  isGuest = false
): { text: string; keyboard: InlineKeyboard } {
  const totalGenres = ANICHIN_GENRES.length;
  const totalPages = Math.max(1, Math.ceil(totalGenres / ANICHIN_CATEGORY_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const text =
    `<b>Anichin Donghua</b>\n\n` +
    `Nonton and download Donghua Subtitle Indonesia from <a href="https://anichin.moe/">Anichin.moe</a>.\n\n` +
    `<b>Commands:</b>\n` +
    `• <code>${prefix}anichin &lt;title&gt;</code> — Search Donghua by name\n` +
    `• <code>${prefix}anichin latest [page]</code> — Browse latest episodes\n` +
    `• <code>${prefix}anichin schedule [day]</code> — Release schedule by day\n` +
    `• <code>${prefix}anichin detail &lt;slug|url&gt;</code> — Full series info & episodes\n` +
    `• <code>${prefix}anichin ep &lt;slug|url&gt;</code> — Streaming video & download links\n\n` +
    `<b>Examples:</b>\n` +
    `• <code>${prefix}anichin martial</code>\n` +
    `• <code>${prefix}anichin latest</code>\n` +
    `• <code>${prefix}anichin schedule senin</code>\n` +
    `• <code>${prefix}anichin detail renegade-immortal</code>`;

  const keyboard = buildAnichinMainMenuKeyboard(currentPage, isGuest);
  return { text, keyboard };
}

/**
 * Builds the schedule main menu keyboard with buttons for each day (2 columns x 4 rows)
 * plus navigation and conditional close button.
 */
export function buildAnichinScheduleKeyboard(isGuest = false): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  let col = 0;
  for (const day of ANICHIN_DAYS) {
    keyboard.text(day.name, `ani:day:${day.key}:1`);
    col++;
    if (col === 2) {
      keyboard.row();
      col = 0;
    }
  }

  if (col > 0) {
    keyboard.row();
  }

  appendFooterButtons(keyboard, isGuest, true);
  return keyboard;
}

/**
 * Formats the schedule day selection message and keyboard.
 */
export function renderScheduleMainMenu(isGuest = false): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const text =
    `<b>Release Schedule</b>\n\n` + `Select a day below to view scheduled Donghua releases:`;
  const keyboard = buildAnichinScheduleKeyboard(isGuest);
  return { text, keyboard };
}

/**
 * Formats the schedule results for a single day with anime pagination and day switcher.
 */
export function renderDayScheduleText(
  day: AnichinScheduleDay,
  dayKey: string,
  page = 1,
  isGuest = false
): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const keyboard = new InlineKeyboard();
  const totalAnime = day.anime.length;
  const totalPages = Math.max(1, Math.ceil(totalAnime / SCHEDULE_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * SCHEDULE_PAGE_SIZE;
  const pageAnime = day.anime.slice(startIndex, startIndex + SCHEDULE_PAGE_SIZE);

  const pageSuffix = totalPages > 1 ? `, Page ${currentPage}/${totalPages}` : '';
  let text = `<b>Release Schedule — ${escapeHtml(day.day)}</b> (${totalAnime} titles${pageSuffix})\n\n`;

  if (totalAnime === 0) {
    text += `<i>No scheduled releases found for this day.</i>`;
  } else {
    text += `<b>Scheduled Titles:</b>\n`;
    for (let i = 0; i < pageAnime.length; i++) {
      const a = pageAnime[i];
      text += `${startIndex + i + 1}. <a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a>\n`;
    }
  }

  // Top 4 anime quick detail buttons on current page
  const topItems = pageAnime.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      keyboard
        .text(formatButtonTitle(b1.title, 16), `ani:d:${b1.id}`)
        .text(formatButtonTitle(b2.title, 16), `ani:d:${b2.id}`)
        .row();
    } else if (b1) {
      keyboard.text(formatButtonTitle(b1.title, 32), `ani:d:${b1.id}`).row();
    }
  }

  // 1. Anime list pagination row if multiple pages
  if (totalPages > 1) {
    const prevPage = currentPage > 1 ? currentPage - 1 : totalPages;
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1;
    keyboard
      .text('‹ Prev', `ani:day:${dayKey}:${prevPage}`)
      .text(`${currentPage}/${totalPages}`, `ani:noop:${currentPage}:${totalPages}`)
      .text('Next ›', `ani:day:${dayKey}:${nextPage}`)
      .row();
  }

  // 2. Day-to-day switcher row (e.g. ‹ Minggu | Selasa ›)
  const normalizedKey = normalizeDayKey(dayKey);
  const dayIdx = ANICHIN_DAYS.findIndex((d) => d.key === normalizedKey);
  if (dayIdx !== -1) {
    const prevDay = ANICHIN_DAYS[(dayIdx - 1 + ANICHIN_DAYS.length) % ANICHIN_DAYS.length];
    const nextDay = ANICHIN_DAYS[(dayIdx + 1) % ANICHIN_DAYS.length];
    keyboard
      .text(`‹ ${prevDay.name}`, `ani:day:${prevDay.key}:1`)
      .text(`${nextDay.name} ›`, `ani:day:${nextDay.key}:1`)
      .row();
  }

  // 3. Navigation row
  keyboard.text('‹ All Days', 'ani:sched').text('‹ Main Menu', 'ani:menu:1');
  if (!isGuest) {
    keyboard.row().text('Close', 'ani:close');
  }

  return { text, keyboard };
}

/**
 * Formats search results cleanly with pagination and close button.
 */
export function renderSearchResultsText(
  res: AnichinSearchResult,
  prefix: string,
  isGuest = false
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();

  if (res.results.length === 0) {
    appendFooterButtons(keyboard, isGuest, true);
    return {
      text:
        `<b>Anichin Search</b>\n\n` +
        `<i>No Donghua found matching "<b>${escapeHtml(res.query)}</b>".</i>\n\n` +
        `<i>Tip: Try searching with a shorter keyword (e.g. <code>${escapeHtml(prefix)}anichin renegade</code>).</i>`,
      keyboard,
    };
  }

  let text =
    `<b>Anichin Search:</b> <code>${escapeHtml(res.query)}</code> (Page ${res.page})\n\n` +
    `<b>Results:</b>\n`;

  const displayResults = res.results.slice(0, 10);
  for (let i = 0; i < displayResults.length; i++) {
    const item = displayResults[i];
    const statusPart = item.status ? ` [${item.status}]` : '';
    const epPart = item.episode ? ` (${item.episode})` : '';
    text += `${i + 1}. <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>${epPart}${statusPart}\n`;
  }
  text += `\n<i>Use <code>${prefix}anichin detail &lt;slug&gt;</code> to view full series details.</i>`;

  // Buttons for top 4 results
  const topItems = res.results.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      keyboard
        .text(formatButtonTitle(b1.title, 16), `ani:d:${b1.id}`)
        .text(formatButtonTitle(b2.title, 16), `ani:d:${b2.id}`)
        .row();
    } else if (b1) {
      keyboard.text(formatButtonTitle(b1.title, 32), `ani:d:${b1.id}`).row();
    }
  }

  // Search pagination row
  const prevPage = Math.max(1, res.page - 1);
  const nextPage = res.page + 1;
  let hasNav = false;
  if (res.page > 1) {
    keyboard.text('‹ Prev', `ani:s:${encodeURIComponent(res.query)}:${prevPage}`);
    hasNav = true;
  }
  if (res.page > 1 || res.hasNextPage) {
    keyboard.text(`Page ${res.page}`, `ani:noop`);
    hasNav = true;
  }
  if (res.hasNextPage) {
    keyboard.text('Next ›', `ani:s:${encodeURIComponent(res.query)}:${nextPage}`);
    hasNav = true;
  }
  if (hasNav) keyboard.row();

  appendFooterButtons(keyboard, isGuest, true);
  return { text, keyboard };
}

/**
 * Formats category / genre browse results with pagination and close button.
 */
export function renderCategoryResultsText(
  res: AnichinSearchResult,
  genreName: string,
  genreSlug: string,
  isGuest = false
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();

  if (res.results.length === 0) {
    appendFooterButtons(keyboard, isGuest, true);
    return {
      text:
        `<b>Category: ${escapeHtml(genreName)}</b>\n\n` +
        `<i>No Donghua found in this category.</i>`,
      keyboard,
    };
  }

  let text =
    `<b>Category: ${escapeHtml(genreName)}</b> (Page ${res.page})\n\n` + `<b>Donghua Titles:</b>\n`;

  const displayResults = res.results.slice(0, 10);
  for (let i = 0; i < displayResults.length; i++) {
    const item = displayResults[i];
    const statusPart = item.status ? ` [${item.status}]` : '';
    const epPart = item.episode ? ` (${item.episode})` : '';
    text += `${i + 1}. <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>${epPart}${statusPart}\n`;
  }

  // Buttons for top 4 items
  const topItems = res.results.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      keyboard
        .text(formatButtonTitle(b1.title, 16), `ani:d:${b1.id}`)
        .text(formatButtonTitle(b2.title, 16), `ani:d:${b2.id}`)
        .row();
    } else if (b1) {
      keyboard.text(formatButtonTitle(b1.title, 32), `ani:d:${b1.id}`).row();
    }
  }

  // Category pagination row
  const prevPage = Math.max(1, res.page - 1);
  const nextPage = res.page + 1;
  let hasNav = false;
  if (res.page > 1) {
    keyboard.text('‹ Prev', `ani:cat:${genreSlug}:${prevPage}`);
    hasNav = true;
  }
  if (res.page > 1 || res.hasNextPage) {
    keyboard.text(`Page ${res.page}`, `ani:noop`);
    hasNav = true;
  }
  if (res.hasNextPage) {
    keyboard.text('Next ›', `ani:cat:${genreSlug}:${nextPage}`);
    hasNav = true;
  }
  if (hasNav) keyboard.row();

  appendFooterButtons(keyboard, isGuest, true);
  return { text, keyboard };
}

export const ANICHIN_LATEST_PAGE_SIZE = 10;
export const ANICHIN_LATEST_CHUNKS_PER_WEB = 5;

/**
 * Resolves paginated latest releases for Telegram view (10 items per page).
 * Translates telegram page to web page chunk with seamless in-memory caching.
 */
export async function getLatestReleasesForPage(page = 1): Promise<{
  page: number;
  hasNextPage: boolean;
  results: AnichinLatestItem[];
  startIndex: number;
}> {
  const targetPage = Math.max(1, page);
  const webPage = Math.floor((targetPage - 1) / ANICHIN_LATEST_CHUNKS_PER_WEB) + 1;
  const chunkIndex = (targetPage - 1) % ANICHIN_LATEST_CHUNKS_PER_WEB;
  const offset = chunkIndex * ANICHIN_LATEST_PAGE_SIZE;

  const webRes = await anichin.getLatest(webPage);
  const pageItems = webRes.results.slice(offset, offset + ANICHIN_LATEST_PAGE_SIZE);
  const hasNextPage =
    offset + ANICHIN_LATEST_PAGE_SIZE < webRes.results.length || webRes.hasNextPage;

  return {
    page: targetPage,
    hasNextPage,
    results: pageItems,
    startIndex: (targetPage - 1) * ANICHIN_LATEST_PAGE_SIZE,
  };
}

/**
 * Formats latest releases cleanly with pagination and close button.
 * Enforces ANICHIN_LATEST_PAGE_SIZE per message so outputs never exceed Telegram's 4096 character limit.
 */
export function renderLatestText(
  res: AnichinLatestResult & { startIndex?: number },
  prefix: string,
  isGuest = false
): {
  text: string;
  keyboard: InlineKeyboard;
  previewOptions: ReturnType<typeof buildCoverPreviewOptions>;
} {
  const keyboard = new InlineKeyboard();
  const startIndex = res.startIndex ?? (Math.max(1, res.page) - 1) * ANICHIN_LATEST_PAGE_SIZE;

  const displayItems =
    res.results.length > ANICHIN_LATEST_PAGE_SIZE
      ? res.results.slice(0, ANICHIN_LATEST_PAGE_SIZE)
      : res.results;

  if (displayItems.length === 0) {
    appendFooterButtons(keyboard, isGuest, true);
    return {
      text: `<b>Latest Releases</b>\n\n<i>No recent releases found.</i>`,
      keyboard,
      previewOptions: NO_PREVIEW,
    };
  }

  const coverUrl = displayItems[0]?.poster;
  let text = '';
  if (coverUrl) {
    text += `<a href="${escapeHtml(coverUrl)}">&#8205;</a>`;
  }
  text += `<b>Latest Releases</b> (Page ${res.page})\n\n<b>Recent Episodes:</b>\n`;

  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i];
    const epLabel = item.episode || 'Ep ?';
    text += `${startIndex + i + 1}. <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a> [<code>${escapeHtml(epLabel)}</code>]\n`;
  }
  text += `\n<i>Use <code>${prefix}anichin ep &lt;slug&gt;</code> to get stream & downloads.</i>`;

  const topItems = displayItems.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      keyboard
        .text(formatButtonTitle(b1.title, 16), `ani:e:${b1.id}`)
        .text(formatButtonTitle(b2.title, 16), `ani:e:${b2.id}`)
        .row();
    } else if (b1) {
      keyboard.text(formatButtonTitle(b1.title, 32), `ani:e:${b1.id}`).row();
    }
  }

  // Pagination row
  const prevPage = Math.max(1, res.page - 1);
  const nextPage = res.page + 1;
  let hasNav = false;
  if (res.page > 1) {
    keyboard.text('‹ Prev', `ani:l:${prevPage}`);
    hasNav = true;
  }
  if (res.page > 1 || res.hasNextPage) {
    keyboard.text(`Page ${res.page}`, `ani:noop:${res.page}`);
    hasNav = true;
  }
  if (res.hasNextPage) {
    keyboard.text('Next ›', `ani:l:${nextPage}`);
    hasNav = true;
  }
  if (hasNav) keyboard.row();

  appendFooterButtons(keyboard, isGuest, true);
  return { text, keyboard, previewOptions: buildCoverPreviewOptions(coverUrl) };
}

/**
 * Formats series detail information cleanly without emoji clutter.
 */
export function renderDetailText(
  detail: AnichinAnimeDetail,
  prefix: string,
  isGuest = false
): {
  text: string;
  keyboard: InlineKeyboard;
  previewOptions: ReturnType<typeof buildCoverPreviewOptions>;
} {
  const keyboard = new InlineKeyboard();

  let text = '';
  if (detail.poster) {
    text += `<a href="${escapeHtml(detail.poster)}">&#8205;</a>`;
  }
  text += `<b>${escapeHtml(detail.title)}</b>\n`;
  if (detail.altTitle) {
    text += `<i>${escapeHtml(detail.altTitle)}</i>\n`;
  }
  text += '\n';

  if (detail.rating) text += `• <b>Rating:</b> <code>${escapeHtml(detail.rating)}</code>\n`;
  if (detail.status) text += `• <b>Status:</b> <code>${escapeHtml(detail.status)}</code>\n`;
  if (detail.type) text += `• <b>Type:</b> <code>${escapeHtml(detail.type)}</code>\n`;
  if (detail.totalEpisodes)
    text += `• <b>Total Episodes:</b> <code>${escapeHtml(detail.totalEpisodes)}</code>\n`;
  if (detail.season) text += `• <b>Season:</b> <code>${escapeHtml(detail.season)}</code>\n`;
  if (detail.studio) text += `• <b>Studio:</b> <code>${escapeHtml(detail.studio)}</code>\n`;
  if (detail.network) text += `• <b>Network:</b> <code>${escapeHtml(detail.network)}</code>\n`;
  if (detail.duration) text += `• <b>Duration:</b> <code>${escapeHtml(detail.duration)}</code>\n`;
  if (detail.genres.length > 0)
    text += `• <b>Genres:</b> ${detail.genres.map((g) => `<code>${escapeHtml(g)}</code>`).join(', ')}\n`;
  if (detail.synopsis) {
    const shortSynopsis =
      detail.synopsis.length > 400 ? `${detail.synopsis.slice(0, 397).trim()}…` : detail.synopsis;
    text += `\n<b>Synopsis:</b>\n${escapeHtml(shortSynopsis)}\n`;
  }

  if (detail.episodes.length > 0) {
    text += `\n<b>Latest Episodes:</b>\n`;
    const recentEps = detail.episodes.slice(0, 10);
    for (const ep of recentEps) {
      const datePart = ep.date ? ` (${ep.date})` : '';
      text += `• <a href="${escapeHtml(ep.url)}">Episode ${escapeHtml(ep.number)}</a>${datePart}\n`;
    }
    if (detail.episodes.length > 10) {
      text += `<i>…and ${detail.episodes.length - 10} earlier episodes</i>\n`;
    }
    text += `\n<i>Use <code>${prefix}anichin ep &lt;slug&gt;</code> to get stream & downloads.</i>`;

    const latestEp = detail.episodes[0];
    if (latestEp) {
      keyboard
        .text(`Watch Ep ${latestEp.number}`, `ani:e:${extractAnichinSlug(latestEp.url)}`)
        .row();
    }
  }

  keyboard.url('Open on Anichin', detail.url).row();
  appendFooterButtons(keyboard, isGuest, true);

  return { text, keyboard, previewOptions: buildCoverPreviewOptions(detail.poster) };
}

/**
 * Formats episode streaming and download information cleanly.
 */
export function renderEpisodeText(
  ep: AnichinEpisodeDetail,
  isGuest = false
): {
  text: string;
  keyboard: InlineKeyboard;
  previewOptions: ReturnType<typeof buildCoverPreviewOptions>;
} {
  const keyboard = new InlineKeyboard();

  let text = '';
  if (ep.poster) {
    text += `<a href="${escapeHtml(ep.poster)}">&#8205;</a>`;
  }
  text += `<b>${escapeHtml(ep.title)}</b>\n\n`;

  if (ep.series) {
    text += `<b>Series:</b> <a href="${escapeHtml(ep.series.url)}">${escapeHtml(ep.series.title)}</a>\n\n`;
  }

  if (ep.servers.length > 0) {
    text += `<b>Streaming Servers:</b>\n`;
    for (const s of ep.servers) {
      text += `• <a href="${escapeHtml(s.embedUrl)}">${escapeHtml(s.name)}</a>\n`;
    }
    text += `\n`;
  }

  if (ep.downloads.length > 0) {
    text += `<b>Download Links:</b>\n`;
    for (const d of ep.downloads) {
      const linkTexts = d.links
        .map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.name)}</a>`)
        .join(' | ');
      text += `• <b>${escapeHtml(d.quality)}:</b> ${linkTexts}\n`;
    }
  }

  // Navigation row: Prev / Next
  let hasNav = false;
  if (ep.prevEpisodeUrl) {
    keyboard.text('‹ Prev Ep', `ani:e:${extractAnichinSlug(ep.prevEpisodeUrl)}`);
    hasNav = true;
  }
  if (ep.nextEpisodeUrl) {
    keyboard.text('Next Ep ›', `ani:e:${extractAnichinSlug(ep.nextEpisodeUrl)}`);
    hasNav = true;
  }
  if (hasNav) keyboard.row();

  keyboard.url('Open Web Page', ep.url).row();

  if (ep.series?.url) {
    const seriesSlug = extractAnichinSlug(ep.series.url);
    if (seriesSlug) {
      keyboard.text('‹ Series Details', `ani:d:${seriesSlug}`);
    }
  }
  appendFooterButtons(keyboard, isGuest, true);

  return { text, keyboard, previewOptions: buildCoverPreviewOptions(ep.poster) };
}

/**
 * AnichinModule provides full Donghua search, latest episode updates,
 * category exploration, detailed metadata, streaming video players,
 * and download links from https://anichin.moe/
 */
export class AnichinModule extends BaseModule {
  readonly id = 'anichin';
  readonly name = 'Anichin';
  readonly description = 'Nonton and download Donghua subtitle Indonesia from Anichin';
  readonly version = '1.2.0';

  public setup(): void {
    this.command(
      ['anichin', 'donghua', 'ani'],
      async (ctx: CommandContext) => {
        const chatId = getChatId(ctx);
        const guestMode = Boolean(ctx.isGuest || isGuestMode(ctx));
        const prefix = ctx.prefix || '/';

        if (chatId && !guestMode) {
          await ctx.replyWithChatAction('typing').catch(() => {});
        }

        const args = ctx.args;
        const sub = args[0]?.toLowerCase();

        // 1. Latest
        if (sub === 'latest' || sub === 'terbaru') {
          const page = parseInt(args[1], 10) || 1;
          try {
            const res = await getLatestReleasesForPage(page);
            const { text, keyboard, previewOptions } = renderLatestText(res, prefix, guestMode);
            await ctx.respond(text, {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: previewOptions,
            });
          } catch (err) {
            logger.error({ err }, 'anichin getLatest failed');
            const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
            await ctx.respond('<b>Failed to fetch latest Donghua episodes.</b> Please try again.', {
              reply_markup: keyboard,
              link_preview_options: NO_PREVIEW,
            });
          }
          return;
        }

        // 2. Schedule
        if (sub === 'schedule' || sub === 'jadwal' || sub === 'sched') {
          const requestedDay = args.slice(1).join(' ').trim();
          try {
            if (requestedDay) {
              const days = await anichin.getSchedule();
              const normalizedTarget = normalizeDayKey(requestedDay);
              const matchedDay = days.find(
                (d) =>
                  normalizeDayKey(d.day) === normalizedTarget ||
                  d.day.toLowerCase().includes(normalizedTarget)
              );

              if (matchedDay) {
                const dayKey =
                  ANICHIN_DAYS.find(
                    (d) => normalizeDayKey(d.name) === normalizeDayKey(matchedDay.day)
                  )?.key || normalizedTarget;
                const { text, keyboard } = renderDayScheduleText(matchedDay, dayKey, 1, guestMode);
                await ctx.respond(text, {
                  reply_markup: keyboard,
                  parse_mode: 'HTML',
                  link_preview_options: NO_PREVIEW,
                });
                return;
              }
            }

            // Main schedule day selection menu
            const { text, keyboard } = renderScheduleMainMenu(guestMode);
            await ctx.respond(text, {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: NO_PREVIEW,
            });
          } catch (err) {
            logger.error({ err }, 'anichin getSchedule failed');
            const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
            await ctx.respond('<b>Failed to fetch Donghua schedule.</b> Please try again.', {
              reply_markup: keyboard,
              link_preview_options: NO_PREVIEW,
            });
          }
          return;
        }

        // 3. Detail
        if (sub === 'detail' || sub === 'info') {
          const target = args.slice(1).join(' ').trim();
          if (!target) {
            const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
            await ctx.respond(
              `<b>Usage:</b> <code>${prefix}anichin detail &lt;slug | url&gt;</code>\n\n` +
                `<b>Example:</b> <code>${prefix}anichin detail oriental-martial-academy</code>`,
              {
                reply_markup: keyboard,
                link_preview_options: NO_PREVIEW,
              }
            );
            return;
          }

          try {
            const detail = await anichin.getDetail(target);
            if (!detail) {
              const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
              await ctx.respond('<i>Donghua not found on Anichin.</i>', {
                reply_markup: keyboard,
                link_preview_options: NO_PREVIEW,
              });
              return;
            }
            const { text, keyboard, previewOptions } = renderDetailText(detail, prefix, guestMode);
            await ctx.respond(text, {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: previewOptions,
            });
          } catch (err) {
            logger.error({ err, target }, 'anichin getDetail failed');
            const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
            await ctx.respond('<b>Failed to fetch Donghua details.</b> Please try again.', {
              reply_markup: keyboard,
              link_preview_options: NO_PREVIEW,
            });
          }
          return;
        }

        // 4. Episode
        if (sub === 'ep' || sub === 'episode' || sub === 'dl' || sub === 'stream') {
          const target = args.slice(1).join(' ').trim();
          if (!target) {
            const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
            await ctx.respond(
              `<b>Usage:</b> <code>${prefix}anichin ep &lt;slug | url&gt;</code>\n\n` +
                `<b>Example:</b> <code>${prefix}anichin ep oriental-martial-academy-episode-15-subtitle-indonesia</code>`,
              {
                reply_markup: keyboard,
                link_preview_options: NO_PREVIEW,
              }
            );
            return;
          }

          try {
            const ep = await anichin.getEpisode(target);
            if (!ep) {
              const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
              await ctx.respond('<i>Episode not found on Anichin.</i>', {
                reply_markup: keyboard,
                link_preview_options: NO_PREVIEW,
              });
              return;
            }
            const { text, keyboard, previewOptions } = renderEpisodeText(ep, guestMode);
            await ctx.respond(text, {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: previewOptions,
            });
          } catch (err) {
            logger.error({ err, target }, 'anichin getEpisode failed');
            const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
            await ctx.respond('<b>Failed to fetch episode details.</b> Please try again.', {
              reply_markup: keyboard,
              link_preview_options: NO_PREVIEW,
            });
          }
          return;
        }

        // 5. Direct Anichin URL
        const rawInput = ctx.input.trim();
        if (isAnichinUrl(rawInput)) {
          if (rawInput.includes('-episode-') || rawInput.includes('/episode-')) {
            const ep = await anichin.getEpisode(rawInput).catch(() => null);
            if (ep) {
              const { text: msgText, keyboard, previewOptions } = renderEpisodeText(ep, guestMode);
              await ctx.respond(msgText, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
                link_preview_options: previewOptions,
              });
              return;
            }
          } else {
            const detail = await anichin.getDetail(rawInput).catch(() => null);
            if (detail) {
              const {
                text: msgText,
                keyboard,
                previewOptions,
              } = renderDetailText(detail, prefix, guestMode);
              await ctx.respond(msgText, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
                link_preview_options: previewOptions,
              });
              return;
            }
          }
        }

        // 6. Search or Main Menu
        let query = rawInput;
        if (sub === 'search' || sub === 'cari') {
          query = args.slice(1).join(' ').trim();
        }

        // Without arguments: display 2x4 Main Menu with category exploration
        if (!query) {
          const { text, keyboard } = renderAnichinMainMenu(1, prefix, guestMode);
          await ctx.respond(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: NO_PREVIEW,
          });
          return;
        }

        // Perform search
        try {
          const res = await anichin.search(query, 1);
          const { text, keyboard } = renderSearchResultsText(res, prefix, guestMode);
          await ctx.respond(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: NO_PREVIEW,
          });
        } catch (err) {
          logger.error({ err, query }, 'anichin search failed');
          const keyboard = appendFooterButtons(new InlineKeyboard(), guestMode, true);
          await ctx.respond('<b>Search failed.</b> Please try again later.', {
            reply_markup: keyboard,
            link_preview_options: NO_PREVIEW,
          });
        }
      },
      {
        description: 'Search, stream, and download Donghua from Anichin.moe',
        usage: '[<query> | latest | detail <slug> | ep <slug> | schedule [day]]',
      }
    );

    // Concurrently acknowledge callback queries with Loading toast in parallel via fork
    this.callbackQuery(/^ani:(?!noop|close)/).fork(async (ctx: BotContext) => {
      await ctx.answerCallbackQuery({ text: 'Loading...' }).catch(() => {});
    });

    // Concurrently acknowledge close button without toast
    this.callbackQuery('ani:close').fork(async (ctx: BotContext) => {
      await ctx.answerCallbackQuery().catch(() => {});
    });

    // Concurrently answer page indicator toasts via fork
    this.callbackQuery(/^ani:noop(?::(\d+)(?::(\d+))?)?$/).fork(async (ctx: BotContext) => {
      const match = ctx.callbackQuery?.data?.match(/^ani:noop(?::(\d+)(?::(\d+))?)?$/);
      let text = 'Current Page';
      if (match?.[1] && match?.[2]) {
        text = `Page ${match[1]} of ${match[2]}`;
      } else if (match?.[1]) {
        text = `Page ${match[1]}`;
      }
      await ctx.answerCallbackQuery({ text }).catch(() => {});
    });

    // Close button handler (deletes message in chats, or edits text in inline queries)
    this.callbackQuery('ani:close', async (ctx: BotContext) => {
      if (ctx.chatId && ctx.msg?.message_id) {
        await ctx.deleteMessage().catch((err) => {
          logger.warn({ err }, 'failed to delete anichin message');
        });
        return;
      }
      await ctx
        .editMessageText('<i>Closed.</i>', {
          parse_mode: 'HTML',
          reply_markup: undefined,
        })
        .catch(() => {});
    });

    // Main menu navigation with category pagination: ani:menu:<page> or ani:cp:<page>
    this.callbackQuery(/^ani:(?:menu|cp):(\d+)$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:(?:menu|cp):(\d+)$/);
      const page = match ? parseInt(match[1], 10) || 1 : 1;
      const { text, keyboard } = renderAnichinMainMenu(page, '/', isGuest);

      await ctx
        .editMessageText(text, {
          reply_markup: keyboard,
          parse_mode: 'HTML',
          link_preview_options: NO_PREVIEW,
        })
        .catch((err) => {
          if (!String(err).includes('message is not modified')) {
            logger.error({ err, page }, 'failed to edit anichin menu');
          }
        });
    });

    // Search results pagination: ani:s:<query>:<page>
    this.callbackQuery(/^ani:s:([^:]+):(\d+)$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:s:([^:]+):(\d+)$/);
      const rawQuery = match?.[1] ? decodeURIComponent(match[1]) : '';
      const page = match ? parseInt(match[2], 10) || 1 : 1;

      try {
        const res = await anichin.search(rawQuery, page);
        const { text, keyboard } = renderSearchResultsText(res, '/', isGuest);
        await ctx
          .editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: NO_PREVIEW,
          })
          .catch((err) => {
            if (!String(err).includes('message is not modified')) {
              logger.error({ err, rawQuery, page }, 'failed to edit search results');
            }
          });
      } catch (err) {
        logger.error({ err, rawQuery, page }, 'failed to fetch search page');
      }
    });

    // Category browser: ani:cat:<slug>:<page>
    this.callbackQuery(/^ani:cat:([^:]+):(\d+)$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:cat:([^:]+):(\d+)$/);
      const slug = match?.[1] || '';
      const page = match ? parseInt(match[2], 10) || 1 : 1;
      const genre = ANICHIN_GENRES.find((g) => g.slug === slug);
      const genreName = genre ? genre.name : slug.charAt(0).toUpperCase() + slug.slice(1);

      try {
        const res = await anichin.getByGenre(slug, page);
        const { text, keyboard } = renderCategoryResultsText(res, genreName, slug, isGuest);
        await ctx
          .editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: NO_PREVIEW,
          })
          .catch((err) => {
            if (!String(err).includes('message is not modified')) {
              logger.error({ err, slug, page }, 'failed to edit category results');
            }
          });
      } catch (err) {
        logger.error({ err, slug, page }, 'failed to fetch category');
      }
    });

    // Schedule main menu: ani:sched
    this.callbackQuery('ani:sched', async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const { text, keyboard } = renderScheduleMainMenu(isGuest);
      await ctx
        .editMessageText(text, {
          reply_markup: keyboard,
          parse_mode: 'HTML',
          link_preview_options: NO_PREVIEW,
        })
        .catch((err) => {
          if (!String(err).includes('message is not modified')) {
            logger.error({ err }, 'failed to edit schedule menu');
          }
        });
    });

    // Schedule day view with pagination: ani:day:<key>[:<page>]
    this.callbackQuery(/^ani:day:([a-z0-9_-]+)(?::(\d+))?$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:day:([a-z0-9_-]+)(?::(\d+))?$/);
      const dayKey = match?.[1] || '';
      const page = match?.[2] ? parseInt(match[2], 10) || 1 : 1;

      try {
        const days = await anichin.getSchedule();
        const normalizedTarget = normalizeDayKey(dayKey);
        const matchedDay = days.find(
          (d) =>
            normalizeDayKey(d.day) === normalizedTarget ||
            d.day.toLowerCase().includes(normalizedTarget)
        );

        if (matchedDay) {
          const { text, keyboard } = renderDayScheduleText(matchedDay, dayKey, page, isGuest);
          await ctx
            .editMessageText(text, {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: NO_PREVIEW,
            })
            .catch((err) => {
              if (!String(err).includes('message is not modified')) {
                logger.error({ err, dayKey, page }, 'failed to edit day schedule');
              }
            });
        }
      } catch (err) {
        logger.error({ err, dayKey, page }, 'failed to fetch day schedule');
      }
    });

    // Latest releases pagination: ani:l:<page>
    this.callbackQuery(/^ani:l:(\d+)$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:l:(\d+)$/);
      const page = match ? parseInt(match[1], 10) || 1 : 1;

      try {
        const res = await getLatestReleasesForPage(page);
        const { text, keyboard, previewOptions } = renderLatestText(res, '/', isGuest);
        await ctx
          .editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: previewOptions,
          })
          .catch((err) => {
            if (!String(err).includes('message is not modified')) {
              logger.error({ err, page }, 'failed to edit latest releases');
            }
          });
      } catch (err) {
        logger.error({ err, page }, 'failed to edit latest releases');
        const keyboard = appendFooterButtons(new InlineKeyboard(), isGuest, true);
        await ctx
          .editMessageText('<b>Failed to load latest releases.</b> Please try again.', {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: NO_PREVIEW,
          })
          .catch(() => {});
      }
    });

    // Anime details: ani:d:<slug>
    this.callbackQuery(/^ani:d:(.+)$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:d:(.+)$/);
      const slug = match?.[1];
      if (!slug) return;

      try {
        const detail = await anichin.getDetail(slug);
        if (!detail) {
          const keyboard = appendFooterButtons(new InlineKeyboard(), isGuest, true);
          await ctx
            .editMessageText('<i>Donghua details not found.</i>', {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: NO_PREVIEW,
            })
            .catch(() => {});
          return;
        }
        const { text, keyboard, previewOptions } = renderDetailText(detail, '/', isGuest);
        await ctx
          .editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: previewOptions,
          })
          .catch((err) => {
            if (!String(err).includes('message is not modified')) {
              logger.error({ err, slug }, 'failed to edit anime details');
            }
          });
      } catch (err) {
        logger.error({ err, slug }, 'failed to edit anime details');
      }
    });

    // Episode streams & downloads: ani:e:<slug>
    this.callbackQuery(/^ani:e:(.+)$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^ani:e:(.+)$/);
      const slug = match?.[1];
      if (!slug) return;

      try {
        const ep = await anichin.getEpisode(slug);
        if (!ep) {
          const keyboard = appendFooterButtons(new InlineKeyboard(), isGuest, true);
          await ctx
            .editMessageText('<i>Episode details not found.</i>', {
              reply_markup: keyboard,
              parse_mode: 'HTML',
              link_preview_options: NO_PREVIEW,
            })
            .catch(() => {});
          return;
        }
        const { text, keyboard, previewOptions } = renderEpisodeText(ep, isGuest);
        await ctx
          .editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
            link_preview_options: previewOptions,
          })
          .catch((err) => {
            if (!String(err).includes('message is not modified')) {
              logger.error({ err, slug }, 'failed to edit episode info');
            }
          });
      } catch (err) {
        logger.error({ err, slug }, 'failed to edit episode info');
      }
    });

    // Handle direct link pasting in private chats
    this.on('message:text', async (ctx: BotContext) => {
      if (ctx.chat?.type === 'private') {
        const text = ctx.message?.text?.trim() || '';
        if (text.startsWith('/')) return;

        if (isAnichinUrl(text)) {
          if (text.includes('-episode-') || text.includes('/episode-')) {
            const ep = await anichin.getEpisode(text).catch(() => null);
            if (ep) {
              const { text: msgText, keyboard } = renderEpisodeText(ep, false);
              await ctx.reply(msgText, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
                link_preview_options: NO_PREVIEW,
              });
            }
          } else {
            const detail = await anichin.getDetail(text).catch(() => null);
            if (detail) {
              const { text: msgText, keyboard } = renderDetailText(detail, '/', false);
              await ctx.reply(msgText, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
                link_preview_options: NO_PREVIEW,
              });
            }
          }
        }
      }
    });
  }
}
