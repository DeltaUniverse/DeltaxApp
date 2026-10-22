/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { escapeRegex } from '../utils/misc';
import { findSupportedUrl, type SupportedPlatform } from '../utils/extractors';
import type { ContextLike } from '../utils/telegram';
import type { BotContext } from '../types';

export type GuestClassification =
  | { kind: 'reply' }
  | { kind: 'command'; name: string; args: string }
  | { kind: 'wrong-prefix'; name: string }
  | { kind: 'url'; url: string; platform: SupportedPlatform }
  | { kind: 'none' };

export function buildCommandRegex(prefix: string, names: string[]): RegExp {
  const escPrefix = escapeRegex(prefix);
  const sorted = names.slice().sort((a, b) => b.length - a.length);
  const namePattern = sorted.length > 0 ? sorted.map(escapeRegex).join('|') : '$^';
  return new RegExp(
    `^(?:@\\w+\\s+)?${escPrefix}(${namePattern})(?:@\\w+)?(?:\\s+([\\s\\S]*)|$)`,
    'i'
  );
}

export function classifyGuestMessage(
  ctx: ContextLike | BotContext,
  registeredCommandNames: string[],
  activePrefix: string = '/'
): GuestClassification {
  const msg = ctx.msg;
  const rawText = msg?.text || ctx.message?.text || '';
  const text = rawText.trim();
  const replyMsg = msg?.reply_to_message;

  if (text && registeredCommandNames.length > 0) {
    const cmdMatch = text.match(buildCommandRegex(activePrefix, registeredCommandNames));
    if (cmdMatch) {
      const result: GuestClassification = {
        kind: 'command',
        name: cmdMatch[1].toLowerCase(),
        args: (cmdMatch[2] || '').trim(),
      };
      (ctx as { guest?: GuestClassification }).guest = result;
      return result;
    }
  }

  if (replyMsg) {
    const result: GuestClassification = { kind: 'reply' };
    (ctx as { guest?: GuestClassification }).guest = result;
    return result;
  }

  if (text && registeredCommandNames.length > 0) {
    const unprefixedMatch = text.match(buildCommandRegex('', registeredCommandNames));
    if (unprefixedMatch) {
      const result: GuestClassification = {
        kind: 'wrong-prefix',
        name: unprefixedMatch[1].toLowerCase(),
      };
      (ctx as { guest?: GuestClassification }).guest = result;
      return result;
    }

    if (activePrefix !== '/') {
      const slashMatch = text.match(buildCommandRegex('/', registeredCommandNames));
      if (slashMatch) {
        const result: GuestClassification = {
          kind: 'wrong-prefix',
          name: slashMatch[1].toLowerCase(),
        };
        (ctx as { guest?: GuestClassification }).guest = result;
        return result;
      }
    }
  }

  if (text) {
    const detected = findSupportedUrl(text);
    if (detected) {
      const result: GuestClassification = {
        kind: 'url',
        url: detected.url,
        platform: detected.platform,
      };
      (ctx as { guest?: GuestClassification }).guest = result;
      return result;
    }
  }

  const result: GuestClassification = { kind: 'none' };
  (ctx as { guest?: GuestClassification }).guest = result;
  return result;
}
