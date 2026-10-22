/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types';
import type { ExtractedMediaItem } from './extractors/types';
import { escapeHtml } from '../html';

/**
 * Splits an array into chunks of a given maximum size (e.g. 10 for Telegram albums).
 */
export function chunkMediaItems<T>(items: T[], size = 10): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Builds an array of Telegram InputMedia objects (InputMediaPhoto | InputMediaVideo) for sendMediaGroup.
 * Only the first item in the album receives the caption and parse_mode per Telegram Bot API specifications.
 */
export function createTelegramAlbum(
  items: ExtractedMediaItem[],
  caption?: string,
  includeCaption = true
): (InputMediaPhoto | InputMediaVideo)[] {
  return items.map((item, idx) => {
    const isFirst = includeCaption && idx === 0;
    if (item.type === 'video') {
      const videoMedia: InputMediaVideo = {
        type: 'video',
        media: item.url,
        caption: isFirst ? caption : undefined,
        parse_mode: isFirst && caption ? 'HTML' : undefined,
      };
      return videoMedia;
    }

    const photoMedia: InputMediaPhoto = {
      type: 'photo',
      media: item.url,
      caption: isFirst ? caption : undefined,
      parse_mode: isFirst && caption ? 'HTML' : undefined,
    };
    return photoMedia;
  });
}

/**
 * Generates rich media HTML tags:
 * Single item -> `<figure><img ...></figure>` or `<figure><video ...></figure>`
 * Multi item  -> `<tg-slideshow>...</tg-slideshow>`
 */
export function buildGuestMediaContainer(items: ExtractedMediaItem[]): string {
  if (items.length === 0) return '';

  if (items.length === 1) {
    const item = items[0];
    const mediaTag =
      item.type === 'video'
        ? `<video src="${escapeHtml(item.url)}"></video>`
        : `<img src="${escapeHtml(item.url)}" />`;

    return `<figure>${mediaTag}</figure>`;
  }

  const mediaTags = items.map((item) =>
    item.type === 'video'
      ? `<video src="${escapeHtml(item.url)}"></video>`
      : `<img src="${escapeHtml(item.url)}" />`
  );

  return `<tg-slideshow>\n${mediaTags.join('\n')}\n</tg-slideshow>`;
}

/**
 * Safely truncates caption text to conform to Telegram's 1024-character caption limit,
 * taking overhead (metrics, signatures, footers) into account.
 */
export function truncateCaption(caption: string, maxLen = 1024, overhead = 0): string {
  if (!caption) return '';
  const available = Math.max(100, maxLen - overhead);
  if (caption.length <= available) return caption;
  return caption.slice(0, available).trimEnd() + '...';
}
