import { extractInstagram, INSTAGRAM_URL_REGEX, INSTAGRAM_SHARE_REGEX } from './instagram';
import { extractTikTok, TIKTOK_URL_REGEX, TIKTOK_VM_REGEX, TIKTOK_LIVE_REGEX } from './tiktok';
import { extractTwitter, TWITTER_URL_REGEX, TCO_URL_REGEX } from './twitter';
import type { ExtractedResult } from './types';

export * from './types';
export * from './instagram';
export * from './tiktok';
export * from './twitter';

export type SupportedPlatform = 'instagram' | 'tiktok' | 'twitter';

export interface DetectedUrl {
  platform: SupportedPlatform;
  url: string;
}

/**
 * Detect supported social media URLs from message text
 */
export function findSupportedUrl(text: string): DetectedUrl | null {
  if (!text) return null;

  // Instagram
  const igMatch = text.match(INSTAGRAM_URL_REGEX) || text.match(INSTAGRAM_SHARE_REGEX);
  if (igMatch) {
    return { platform: 'instagram', url: igMatch[0] };
  }

  // TikTok
  const ttMatch =
    text.match(TIKTOK_URL_REGEX) || text.match(TIKTOK_VM_REGEX) || text.match(TIKTOK_LIVE_REGEX);
  if (ttMatch) {
    return { platform: 'tiktok', url: ttMatch[0] };
  }

  // Twitter / X
  const twMatch = text.match(TWITTER_URL_REGEX) || text.match(TCO_URL_REGEX);
  if (twMatch) {
    return { platform: 'twitter', url: twMatch[0] };
  }

  return null;
}

/**
 * Universal media extraction routing
 */
export async function extractMedia(url: string): Promise<ExtractedResult | null> {
  const detected = findSupportedUrl(url);
  if (!detected) return null;

  switch (detected.platform) {
    case 'instagram':
      return extractInstagram(detected.url);
    case 'tiktok':
      return extractTikTok(detected.url);
    case 'twitter':
      return extractTwitter(detected.url);
    default:
      return null;
  }
}
