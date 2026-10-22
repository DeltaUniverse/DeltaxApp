/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { escapeRegex } from './misc';
import { extractMessageUrls, type MessageLike, type MessageEntityLike } from './telegram';
import { findSupportedUrl, type SupportedPlatform } from './extractors';

/**
 * Parses, sanitizes, and normalizes a URL string and extracts its canonical domain.
 */
export function parseDomainAndUrl(raw: string): { url: string; domain: string } | null {
  if (!raw) return null;
  let targetUrl = raw.trim();
  targetUrl = targetUrl.replace(/[.,;:!?)]+$/, '');

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    const domain = parsed.hostname.replace(/^www\./i, '');
    return { url: targetUrl, domain };
  } catch {
    return null;
  }
}

/**
 * Extracts and resolves target URL and canonical domain from command text,
 * message entities, or a replied message.
 */
export function extractTargetUrl(
  text: string,
  replyMsg?: MessageLike | null,
  customPrefix?: string,
  msgEntities?: MessageEntityLike[]
): { url: string; domain: string } | null {
  if (msgEntities) {
    for (const ent of msgEntities) {
      if (ent.type === 'text_link' && ent.url) {
        const res = parseDomainAndUrl(ent.url);
        if (res) return res;
      }
    }
  }

  let cleaned = text.replace(/^@\w+\s+/i, '').trim();

  const prefixes = Array.from(new Set([customPrefix || '/', '/']));
  for (const p of prefixes) {
    const escP = escapeRegex(p);
    cleaned = cleaned
      .replace(new RegExp(`^${escP}web(?:\\s+ss)?(?:@\\w+)?(?:\\s+|$)`, 'i'), '')
      .replace(new RegExp(`^${escP}ss(?:@\\w+)?(?:\\s+|$)`, 'i'), '')
      .trim();
  }

  const matchInArgs =
    cleaned.match(/https?:\/\/[^\s]+/i) ||
    cleaned.match(/\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/i);

  if (matchInArgs) {
    const res = parseDomainAndUrl(matchInArgs[0]);
    if (res) return res;
  }

  if (replyMsg) {
    const { text: replyText, entityUrls } = extractMessageUrls(replyMsg);

    for (const u of entityUrls) {
      const res = parseDomainAndUrl(u);
      if (res) return res;
    }

    if (replyText) {
      const matchInReply =
        replyText.match(/https?:\/\/[^\s]+/i) ||
        replyText.match(/\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/i);

      if (matchInReply) {
        const res = parseDomainAndUrl(matchInReply[0]);
        if (res) return res;
      }
    }
  }

  return null;
}

/**
 * Extracts and resolves target social media download URL from command text,
 * message entities, or a replied message.
 */
export function extractDownloadTarget(
  text: string,
  replyMsg?: MessageLike | null,
  _customPrefix?: string,
  msgEntities?: MessageEntityLike[]
): { url: string; platform: SupportedPlatform } | null {
  if (msgEntities) {
    for (const ent of msgEntities) {
      if (ent.type === 'text_link' && ent.url) {
        const detected = findSupportedUrl(ent.url);
        if (detected) return detected;
      }
    }
  }

  const detectedInText = findSupportedUrl(text);
  if (detectedInText) return detectedInText;

  if (replyMsg) {
    const { text: replyText, entityUrls } = extractMessageUrls(replyMsg);

    for (const u of entityUrls) {
      const detected = findSupportedUrl(u);
      if (detected) return detected;
    }

    if (replyText) {
      const detectedInReply = findSupportedUrl(replyText);
      if (detectedInReply) return detectedInReply;
    }
  }

  return null;
}
