/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

/**
 * Escapes special characters for safe use in regular expressions.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats a numeric count or count string into a human-readable abbreviated string (e.g. 1.5K, 2.3M).
 */
export function formatCount(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/**
 * Parses an abbreviated count string (e.g. '1.5M', '20K', '1,234') into a numeric value.
 */
export function parseKNumber(str: string): number | undefined {
  if (!str) return undefined;
  const cleaned = str.trim().toUpperCase();
  if (cleaned.endsWith('M')) {
    const n = parseFloat(cleaned.slice(0, -1).replace(/,/g, ''));
    return isNaN(n) ? undefined : Math.round(n * 1_000_000);
  }
  if (cleaned.endsWith('K')) {
    const n = parseFloat(cleaned.slice(0, -1).replace(/,/g, ''));
    return isNaN(n) ? undefined : Math.round(n * 1_000);
  }
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

/**
 * Generates a random alphanumeric string of the specified length.
 */
export function randomAlphaNumeric(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

/**
 * Parses, sanitizes, and validates a URL string and extracts its canonical domain.
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
