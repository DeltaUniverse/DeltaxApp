import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper utilities replicated from src/utils for zero-build testing in Node.js
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getUserMention(user) {
  if (!user) return 'there';
  if (user.first_name && user.id) {
    return `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`;
  }
  if (user.username) {
    return `@${escapeHtml(user.username)}`;
  }
  if (user.first_name) {
    return escapeHtml(user.first_name);
  }
  if (user.id) {
    return `<a href="tg://user?id=${user.id}">User</a>`;
  }
  return 'there';
}

function getCallerUser(ctx) {
  return ctx?.msg?.guest_bot_caller_user || ctx?.from;
}

function getChatId(ctx) {
  return (
    ctx?.chat?.id ||
    ctx?.msg?.chat?.id ||
    ctx?.msg?.guest_bot_caller_chat?.id
  );
}

function isGuestMode(ctx) {
  return Boolean(
    ctx?.msg?.guest_bot_caller_user ||
    ctx?.msg?.guest_query_id ||
    ctx?.update?.guest_message
  );
}

function extractMessageUrls(msg) {
  if (!msg) return { text: '', entityUrls: [] };

  const text = msg.text || msg.caption || '';
  const entityUrls = [];

  const allEntities = [...(msg.entities || []), ...(msg.caption_entities || [])];
  for (const ent of allEntities) {
    if (ent.type === 'text_link' && ent.url) {
      entityUrls.push(ent.url);
    } else if (
      ent.type === 'url' &&
      typeof ent.offset === 'number' &&
      typeof ent.length === 'number'
    ) {
      const urlText = text.substring(ent.offset, ent.offset + ent.length);
      if (urlText) entityUrls.push(urlText);
    }
  }

  return { text, entityUrls };
}

const HTML_TAGS = [
  '<blockquote',
  '<b>',
  '<code>',
  '<pre',
  '<i>',
  '<spoiler',
  '<u>',
  '<s>',
  '<a ',
];

function hasHtmlTags(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return HTML_TAGS.some((tag) => lower.includes(tag));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatCount(val) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function parseKNumber(str) {
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

function randomAlphaNumeric(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

function parseDomainAndUrl(raw) {
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

function chunkMediaItems(items, size = 10) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function createTelegramAlbum(items, caption, includeCaption = true) {
  return items.map((item, idx) => {
    const isFirst = includeCaption && idx === 0;
    if (item.type === 'video') {
      return {
        type: 'video',
        media: item.url,
        caption: isFirst ? caption : undefined,
        parse_mode: isFirst && caption ? 'HTML' : undefined,
      };
    }
    return {
      type: 'photo',
      media: item.url,
      caption: isFirst ? caption : undefined,
      parse_mode: isFirst && caption ? 'HTML' : undefined,
    };
  });
}

function buildGuestMediaContainer(items) {
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

function truncateCaption(caption, maxLen = 1024, overhead = 0) {
  if (!caption) return '';
  const available = Math.max(100, maxLen - overhead);
  if (caption.length <= available) return caption;
  return caption.slice(0, available).trimEnd() + '...';
}

describe('Deltax App - Utilities (Telegram, Media, Misc)', () => {
  describe('Telegram Utilities', () => {
    test('getUserMention creates HTML link when first_name and id exist', () => {
      const mention = getUserMention({ id: 123456, first_name: 'Alice' });
      assert.equal(mention, '<a href="tg://user?id=123456">Alice</a>');
    });

    test('getUserMention escapes HTML characters in user first_name', () => {
      const mention = getUserMention({ id: 999, first_name: '<script>alert("x")</script>' });
      assert.equal(
        mention,
        '<a href="tg://user?id=999">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</a>'
      );
    });

    test('getUserMention falls back to @username when no first_name', () => {
      const mention = getUserMention({ username: 'alice_dev' });
      assert.equal(mention, '@alice_dev');
    });

    test('getUserMention falls back to User link when only id is present', () => {
      const mention = getUserMention({ id: 456789 });
      assert.equal(mention, '<a href="tg://user?id=456789">User</a>');
    });

    test('getUserMention returns "there" when user is null or empty', () => {
      assert.equal(getUserMention(null), 'there');
      assert.equal(getUserMention(undefined), 'there');
      assert.equal(getUserMention({}), 'there');
    });

    test('getCallerUser and getChatId resolve caller and chat ID correctly', () => {
      const guestCtx = {
        msg: {
          guest_bot_caller_user: { id: 777, first_name: 'GuestUser' },
          guest_bot_caller_chat: { id: -100123456 },
          guest_query_id: 'q123',
        },
      };
      assert.deepEqual(getCallerUser(guestCtx), { id: 777, first_name: 'GuestUser' });
      assert.equal(getChatId(guestCtx), -100123456);
      assert.equal(isGuestMode(guestCtx), true);

      const standardCtx = {
        from: { id: 888, first_name: 'StandardUser' },
        chat: { id: 888 },
      };
      assert.deepEqual(getCallerUser(standardCtx), { id: 888, first_name: 'StandardUser' });
      assert.equal(getChatId(standardCtx), 888);
      assert.equal(isGuestMode(standardCtx), false);
    });

    test('extractMessageUrls pulls links from text_link and url entities', () => {
      const msg = {
        text: 'Check this link: https://example.com/test and inline link',
        entities: [
          { type: 'text_link', url: 'https://instagram.com/p/C123' },
          { type: 'url', offset: 17, length: 24 },
        ],
      };
      const res = extractMessageUrls(msg);
      assert.equal(res.text, msg.text);
      assert.deepEqual(res.entityUrls, [
        'https://instagram.com/p/C123',
        'https://example.com/test',
      ]);
    });

    test('hasHtmlTags identifies Telegram HTML formatting tags', () => {
      assert.equal(hasHtmlTags('<b>Bold Text</b>'), true);
      assert.equal(hasHtmlTags('<code>const x = 1;</code>'), true);
      assert.equal(hasHtmlTags('<blockquote expandable>quote</blockquote>'), true);
      assert.equal(hasHtmlTags('Plain unformatted text'), false);
    });
  });

  describe('Misc Utilities', () => {
    test('formatCount formats small numbers, thousands, and millions', () => {
      assert.equal(formatCount(0), '0');
      assert.equal(formatCount(500), '500');
      assert.equal(formatCount(1200), '1.2K');
      assert.equal(formatCount(10000), '10K');
      assert.equal(formatCount(2500000), '2.5M');
      assert.equal(formatCount(3000000), '3M');
      assert.equal(formatCount('invalid'), 'invalid');
    });

    test('parseKNumber parses formatted strings into numbers', () => {
      assert.equal(parseKNumber('500'), 500);
      assert.equal(parseKNumber('1.5K'), 1500);
      assert.equal(parseKNumber('2.5M'), 2500000);
      assert.equal(parseKNumber('1,000,000'), 1000000);
      assert.equal(parseKNumber(''), undefined);
      assert.equal(parseKNumber('abc'), undefined);
    });

    test('escapeRegex escapes special regex characters safely', () => {
      assert.equal(escapeRegex('dl?query=*&test=[1]'), 'dl\\?query=\\*&test=\\[1\\]');
    });

    test('randomAlphaNumeric generates string of requested length', () => {
      const rand = randomAlphaNumeric(16);
      assert.equal(rand.length, 16);
      assert.match(rand, /^[A-Za-z0-9]{16}$/);
    });

    test('parseDomainAndUrl normalizes URLs and strips punctuation', () => {
      const parsed1 = parseDomainAndUrl('google.com');
      assert.deepEqual(parsed1, { url: 'https://google.com', domain: 'google.com' });

      const parsed2 = parseDomainAndUrl('https://www.instagram.com/p/test,;:');
      assert.deepEqual(parsed2, {
        url: 'https://www.instagram.com/p/test',
        domain: 'instagram.com',
      });

      assert.equal(parseDomainAndUrl('invalid-no-dot'), null);
      assert.equal(parseDomainAndUrl(''), null);
    });
  });

  describe('Media Utilities', () => {
    test('chunkMediaItems splits items into batches of 10 or specified size', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1);
      const chunks = chunkMediaItems(items, 10);
      assert.equal(chunks.length, 3);
      assert.equal(chunks[0].length, 10);
      assert.equal(chunks[1].length, 10);
      assert.equal(chunks[2].length, 5);
    });

    test('createTelegramAlbum sets caption only on the first item', () => {
      const items = [
        { type: 'photo', url: 'https://example.com/1.jpg' },
        { type: 'video', url: 'https://example.com/2.mp4' },
      ];
      const album = createTelegramAlbum(items, '<b>Caption</b>', true);
      assert.equal(album[0].caption, '<b>Caption</b>');
      assert.equal(album[0].parse_mode, 'HTML');
      assert.equal(album[1].caption, undefined);
      assert.equal(album[1].parse_mode, undefined);
    });

    test('buildGuestMediaContainer outputs figure for 1 item and tg-slideshow for multiple', () => {
      const single = [{ type: 'photo', url: 'https://example.com/pic.jpg' }];
      assert.equal(buildGuestMediaContainer(single), '<figure><img src="https://example.com/pic.jpg" /></figure>');

      const multi = [
        { type: 'photo', url: 'https://example.com/1.jpg' },
        { type: 'video', url: 'https://example.com/2.mp4' },
      ];
      const container = buildGuestMediaContainer(multi);
      assert.ok(container.startsWith('<tg-slideshow>'));
      assert.ok(container.includes('<img src="https://example.com/1.jpg" />'));
      assert.ok(container.includes('<video src="https://example.com/2.mp4"></video>'));
      assert.ok(container.endsWith('</tg-slideshow>'));
    });

    test('truncateCaption truncates long text cleanly to 1024 characters', () => {
      const longText = 'A'.repeat(1200);
      const truncated = truncateCaption(longText, 1024, 100);
      assert.ok(truncated.length <= 1024);
      assert.ok(truncated.endsWith('...'));

      const shortText = 'Short text';
      assert.equal(truncateCaption(shortText, 1024, 50), 'Short text');
    });
  });

  describe('Bing Wallpaper Utilities', () => {
    const BING_RESOLUTIONS = {
      '1366': '1366x768.jpg',
      '1920': '1920x1080.jpg',
      '3840': 'UHD.jpg',
      'UHD': 'UHD.jpg',
      'uhd': 'UHD.jpg',
      '4k': 'UHD.jpg',
      '4K': 'UHD.jpg',
      '1080x1920': '1080x1920.jpg',
    };

    function resolveResolutionSuffix(resolution = '1920') {
      const trimmed = resolution.trim();
      const found = BING_RESOLUTIONS[trimmed] || BING_RESOLUTIONS[trimmed.toUpperCase()];
      if (found) return found;
      return '1920x1080.jpg';
    }

    test('resolveResolutionSuffix maps shorthand and standard resolutions', () => {
      assert.equal(resolveResolutionSuffix('UHD'), 'UHD.jpg');
      assert.equal(resolveResolutionSuffix('4k'), 'UHD.jpg');
      assert.equal(resolveResolutionSuffix('1920'), '1920x1080.jpg');
      assert.equal(resolveResolutionSuffix('1080x1920'), '1080x1920.jpg');
      assert.equal(resolveResolutionSuffix('unknown'), '1920x1080.jpg');
    });

    test('parses wallpaper command arguments correctly', () => {
      function parseWallpaperArgs(args) {
        const result = {};
        for (const arg of args) {
          const raw = arg.trim();
          const lower = raw.toLowerCase();
          if (lower.startsWith('@')) {
            continue;
          }
          if (lower === 'random') {
            result.index = 'random';
            continue;
          }
          if (lower === 'uhd' || lower === '4k' || lower === '1920' || lower === '1366') {
            result.resolution = raw;
            continue;
          }
          if (/^[0-7]$/.test(raw)) {
            result.index = parseInt(raw, 10);
            continue;
          }
          if (['zh-cn', 'en-us', 'ja-jp'].includes(lower)) {
            result.mkt = raw;
            continue;
          }
        }
        return result;
      }

      assert.deepEqual(parseWallpaperArgs(['UHD', 'en-US']), { resolution: 'UHD', mkt: 'en-US' });
      assert.deepEqual(parseWallpaperArgs(['random']), { index: 'random' });
      assert.deepEqual(parseWallpaperArgs(['random', '@deltaxapp']), { index: 'random' });
      assert.deepEqual(parseWallpaperArgs(['@deltaxapp', 'random']), { index: 'random' });
      assert.deepEqual(parseWallpaperArgs(['2']), { index: 2 });
    });
  });
});
