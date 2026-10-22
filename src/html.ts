/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

export * from '@grammyjs/parse-mode';

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Safely strips HTML tags repeatedly to prevent multi-character reintroduction vulnerabilities.
 * Conforms to CodeQL / OWASP iterative sanitization recommendations.
 */
export function stripHtml(input: string): string {
  if (!input) return '';
  let sanitized = input;
  let previous: string;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^<>]*>/g, '');
  } while (sanitized !== previous);
  return sanitized;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#064;': '@',
};

/**
 * Safely decodes standard HTML entities in a single linear pass to prevent double-escaping flaws.
 */
export function unescapeHtml(text: string): string {
  if (!text) return '';
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|#064);/gi, (match) => {
    return HTML_ENTITY_MAP[match.toLowerCase()] ?? match;
  });
}

export class SafeHtml {
  constructor(private readonly content: string) {}
  toString(): string {
    return this.content;
  }
}

export function rawHtml(content: string): SafeHtml {
  return new SafeHtml(content);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const safeStr = val instanceof SafeHtml ? val.toString() : escapeHtml(val);
    result += safeStr + strings[i + 1];
  }
  return result;
}

export function code(text: unknown): SafeHtml {
  return rawHtml(`<code>${escapeHtml(text)}</code>`);
}

export function pre(text: unknown, language?: string): SafeHtml {
  if (language) {
    return rawHtml(
      `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>`
    );
  }
  return rawHtml(`<pre>${escapeHtml(text)}</pre>`);
}

export function bold(text: unknown): SafeHtml {
  return rawHtml(`<b>${escapeHtml(text)}</b>`);
}

export function italic(text: unknown): SafeHtml {
  return rawHtml(`<i>${escapeHtml(text)}</i>`);
}

export function underline(text: unknown): SafeHtml {
  return rawHtml(`<u>${escapeHtml(text)}</u>`);
}

export function strike(text: unknown): SafeHtml {
  return rawHtml(`<s>${escapeHtml(text)}</s>`);
}

export function spoiler(text: unknown): SafeHtml {
  return rawHtml(`<span class="tg-spoiler">${escapeHtml(text)}</span>`);
}

export function blockquote(text: unknown, expandable = false): SafeHtml {
  if (expandable) {
    return rawHtml(`<blockquote expandable>${escapeHtml(text)}</blockquote>`);
  }
  return rawHtml(`<blockquote>${escapeHtml(text)}</blockquote>`);
}

export function link(text: unknown, url: string): SafeHtml {
  return rawHtml(`<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`);
}
