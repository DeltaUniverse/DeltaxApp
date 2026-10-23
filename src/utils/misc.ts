/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatCount(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

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

export function randomAlphaNumeric(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

export { parseDomainAndUrl } from './url';
