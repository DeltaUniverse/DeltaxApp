import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isScreenshotRequest(text, botUsername, activePrefix = '/') {
  if (!text) return false;
  const trimmed = text.trim();
  const escP = escapeRegex(activePrefix || '/');

  const directRegex = new RegExp(`^${escP}(?:ss|web)(?:@\\w+)?(?:\\s+|$|[?#])`, 'i');
  if (directRegex.test(trimmed)) return true;

  const mentionRegex = new RegExp(`^@\\w+\\s+${escP}(?:ss|web)(?:\\s+|$|[?#])`, 'i');
  if (mentionRegex.test(trimmed)) return true;

  return false;
}

function isSetPrefixRequest(text, botUsername, activePrefix = '/') {
  if (!text) return false;
  const trimmed = text.trim();
  const escP = escapeRegex(activePrefix || '/');

  const directRegex = new RegExp(`^${escP}setprefix(?:@\\w+)?(?:\\s+|$|[?#])`, 'i');
  if (directRegex.test(trimmed)) return true;

  const mentionRegex = new RegExp(`^@\\w+\\s+${escP}setprefix(?:\\s+|$|[?#])`, 'i');
  if (mentionRegex.test(trimmed)) return true;

  return false;
}

function isUnprefixedDownloadCommand(text, activePrefix = '/') {
  if (!text) return false;
  const trimmed = text.trim();
  const escP = escapeRegex(activePrefix || '/');

  if (new RegExp(`^${escP}(?:dl|download)(?:@\\w+)?(?:\\s+|$|[?#])`, 'i').test(trimmed)) {
    return false;
  }
  if (new RegExp(`^@\\w+\\s+${escP}(?:dl|download)(?:\\s+|$|[?#])`, 'i').test(trimmed)) {
    return false;
  }

  if (/^@\w+\s+(?:dl|download)(?:\s+|$|[?#])/i.test(trimmed)) return true;
  if (/^(?:dl|download)(?:\s+|$|[?#])/i.test(trimmed)) return true;
  if (
    activePrefix !== '/' &&
    (new RegExp(`^/(?:dl|download)(?:@\\w+)?(?:\\s+|$|[?#])`, 'i').test(trimmed) ||
      new RegExp(`^@\\w+\\s+/(?:dl|download)(?:\\s+|$|[?#])`, 'i').test(trimmed))
  ) {
    return true;
  }

  return false;
}

function isDownloadRequest(text, botUsername, activePrefix = '/') {
  if (!text) return false;
  const trimmed = text.trim();
  const escP = escapeRegex(activePrefix || '/');

  const directRegex = new RegExp(`^${escP}(?:dl|download)(?:@\\w+)?(?:\\s+|$|[?#])`, 'i');
  if (directRegex.test(trimmed)) return true;

  const mentionRegex = new RegExp(`^@\\w+\\s+${escP}(?:dl|download)(?:\\s+|$|[?#])`, 'i');
  if (mentionRegex.test(trimmed)) return true;

  return false;
}

const DEFAULT_OWNER_ID = 7492470603;

function isOwner(ctx) {
  const caller = ctx.msg?.guest_bot_caller_user || ctx.from;
  const callerId = caller?.id ? Number(caller.id) : null;
  const configuredOwnerId = ctx.env?.OWNER_ID ? Number(ctx.env.OWNER_ID) : DEFAULT_OWNER_ID;
  return Boolean(callerId && callerId === configuredOwnerId);
}

describe('Deltax App - Strict Prefix Enforcement & Owner Authorization', () => {
  test('rejects commands without prefix', () => {
    assert.equal(isScreenshotRequest('@deltaxapp ss google.com', 'deltaxapp', '/'), false);
    assert.equal(isScreenshotRequest('@deltaxapp ss https://google.com', 'deltaxapp', '/'), false);
    assert.equal(isScreenshotRequest('ss google.com', 'deltaxapp', '/'), false);
    assert.equal(isScreenshotRequest('ss', 'deltaxapp', '/'), false);
    assert.equal(isScreenshotRequest('web google.com', 'deltaxapp', '/'), false);
  });

  test('accepts commands with default / prefix', () => {
    assert.equal(isScreenshotRequest('/ss google.com', 'deltaxapp', '/'), true);
    assert.equal(isScreenshotRequest('/web google.com', 'deltaxapp', '/'), true);
    assert.equal(isScreenshotRequest('/ss', 'deltaxapp', '/'), true);
    assert.equal(isScreenshotRequest('/ss@deltaxapp google.com', 'deltaxapp', '/'), true);
    assert.equal(isScreenshotRequest('@deltaxapp /ss google.com', 'deltaxapp', '/'), true);
  });

  test('accepts commands with custom ! prefix and rejects un-prefixed commands', () => {
    assert.equal(isScreenshotRequest('!ss google.com', 'deltaxapp', '!'), true);
    assert.equal(isScreenshotRequest('!web google.com', 'deltaxapp', '!'), true);
    assert.equal(isScreenshotRequest('@deltaxapp !ss google.com', 'deltaxapp', '!'), true);
    // When prefix is '!', '/' MUST NOT be parsed as screenshot command
    assert.equal(isScreenshotRequest('/ss google.com', 'deltaxapp', '!'), false);
    assert.equal(isScreenshotRequest('/web google.com', 'deltaxapp', '!'), false);
    assert.equal(isScreenshotRequest('@deltaxapp /ss google.com', 'deltaxapp', '!'), false);
    assert.equal(isScreenshotRequest('@deltaxapp ss google.com', 'deltaxapp', '!'), false);
    assert.equal(isScreenshotRequest('ss google.com', 'deltaxapp', '!'), false);
  });

  test('identifies setprefix command requests', () => {
    assert.equal(isSetPrefixRequest('/setprefix !', 'deltaxapp', '/'), true);
    assert.equal(isSetPrefixRequest('@deltaxapp /setprefix !', 'deltaxapp', '/'), true);
    assert.equal(isSetPrefixRequest('!setprefix ?', 'deltaxapp', '!'), true);
    assert.equal(isSetPrefixRequest('@deltaxapp !setprefix ?', 'deltaxapp', '!'), true);
    // When prefix is '!', '/setprefix' MUST NOT be parsed
    assert.equal(isSetPrefixRequest('/setprefix !', 'deltaxapp', '!'), false);
    assert.equal(isSetPrefixRequest('setprefix !', 'deltaxapp', '/'), false);
  });

  test('authorizes owner ID 7492470603 and rejects non-owners', () => {
    const ownerCtx = {
      from: { id: 7492470603, first_name: 'Owner' },
      env: {},
    };
    const guestOwnerCtx = {
      msg: { guest_bot_caller_user: { id: 7492470603, first_name: 'Owner' } },
      env: {},
    };
    const regularUserCtx = {
      from: { id: 123456789, first_name: 'Random User' },
      env: {},
    };
    const nonOwnerGuestCtx = {
      msg: { guest_bot_caller_user: { id: 987654321, first_name: 'Attacker' } },
      env: {},
    };

    assert.equal(isOwner(ownerCtx), true);
    assert.equal(isOwner(guestOwnerCtx), true);
    assert.equal(isOwner(regularUserCtx), false);
    assert.equal(isOwner(nonOwnerGuestCtx), false);
  });

  test('respects custom OWNER_ID configured in env', () => {
    const customCtx = {
      from: { id: 999888777 },
      env: { OWNER_ID: '999888777' },
    };
    assert.equal(isOwner(customCtx), true);

    const oldOwnerCtx = {
      from: { id: 7492470603 },
      env: { OWNER_ID: '999888777' },
    };
    assert.equal(isOwner(oldOwnerCtx), false);
  });

  test('downloader strictly requires prefix and rejects un-prefixed dl command in guest mode', () => {
    // With custom prefix !
    const customPrefix = '!';
    assert.equal(isUnprefixedDownloadCommand('@deltaxapp dl https://www.instagram.com/p/123/', customPrefix), true);
    assert.equal(isDownloadRequest('@deltaxapp dl https://www.instagram.com/p/123/', 'deltaxapp', customPrefix), false);
    assert.equal(isUnprefixedDownloadCommand('@deltaxapp /dl https://www.instagram.com/p/123/', customPrefix), true);
    assert.equal(isDownloadRequest('@deltaxapp /dl https://www.instagram.com/p/123/', 'deltaxapp', customPrefix), false);
    assert.equal(isUnprefixedDownloadCommand('dl https://www.instagram.com/p/123/', customPrefix), true);
    assert.equal(isDownloadRequest('dl https://www.instagram.com/p/123/', 'deltaxapp', customPrefix), false);
    assert.equal(isUnprefixedDownloadCommand('/dl https://www.instagram.com/p/123/', customPrefix), true);
    assert.equal(isDownloadRequest('/dl https://www.instagram.com/p/123/', 'deltaxapp', customPrefix), false);

    // Valid prefixed commands
    assert.equal(isUnprefixedDownloadCommand('@deltaxapp !dl https://www.instagram.com/p/123/', customPrefix), false);
    assert.equal(isDownloadRequest('@deltaxapp !dl https://www.instagram.com/p/123/', 'deltaxapp', customPrefix), true);
    assert.equal(isUnprefixedDownloadCommand('!dl https://www.instagram.com/p/123/', customPrefix), false);
    assert.equal(isDownloadRequest('!dl https://www.instagram.com/p/123/', 'deltaxapp', customPrefix), true);

    // Default prefix /
    assert.equal(isUnprefixedDownloadCommand('@deltaxapp dl https://www.instagram.com/p/123/', '/'), true);
    assert.equal(isDownloadRequest('@deltaxapp dl https://www.instagram.com/p/123/', 'deltaxapp', '/'), false);
    assert.equal(isUnprefixedDownloadCommand('@deltaxapp /dl https://www.instagram.com/p/123/', '/'), false);
    assert.equal(isDownloadRequest('@deltaxapp /dl https://www.instagram.com/p/123/', 'deltaxapp', '/'), true);
  });

  test('strict filter: skips when mentioned by reply without explicit command', () => {
    const customPrefix = '!';
    const replyMsg = { message_id: 123, text: 'Check https://instagram.com/p/abc/' };

    // Mentioned by reply with NO command
    const mentionOnlyText = '@deltaxapp';
    const isDlReq = isDownloadRequest(mentionOnlyText, 'deltaxapp', customPrefix);
    const isSsReq = isScreenshotRequest(mentionOnlyText, 'deltaxapp', customPrefix);

    assert.equal(isDlReq, false);
    assert.equal(isSsReq, false);

    // Rule: if replyMsg is present and neither dl nor ss request, it MUST be skipped
    const shouldSkipGuestDownload = Boolean(replyMsg && !isDlReq);
    const shouldSkipGuestScreenshot = Boolean(replyMsg && !isSsReq);
    const shouldSkipGuestStart = Boolean(replyMsg);

    assert.equal(shouldSkipGuestDownload, true);
    assert.equal(shouldSkipGuestScreenshot, true);
    assert.equal(shouldSkipGuestStart, true);

    // Mentioned by reply WITH explicit command "!dl"
    const commandText = '@deltaxapp !dl';
    const isCommandDlReq = isDownloadRequest(commandText, 'deltaxapp', customPrefix);
    assert.equal(isCommandDlReq, true);
    assert.equal(Boolean(replyMsg && !isCommandDlReq), false); // Does not skip!
  });

  test('parses command arguments uniformly regardless of bot mention position', () => {
    function parseCommand(text, botUsername, activePrefix) {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const p = activePrefix || '/';
      const escP = escapeRegex(p);

      const usernames = new Set();
      if (botUsername) usernames.add(botUsername.toLowerCase());
      usernames.add('deltaxapp');

      const usernamePattern = Array.from(usernames).map(escapeRegex).join('|');

      const cleanInput = (rawInput) => {
        let cleaned = rawInput;
        for (const u of usernames) {
          const r = new RegExp(`(^|\\s+)@${escapeRegex(u)}(?=\\s|$|[?#])`, 'gi');
          cleaned = cleaned.replace(r, ' ');
        }
        return cleaned.replace(/\s+/g, ' ').trim();
      };

      const directMatch = trimmed.match(
        new RegExp(`^${escP}([a-zA-Z0-9_]+)(?:@(?:${usernamePattern}))?(?:\\s+([\\s\\S]*)|$)`, 'i')
      );
      if (directMatch) {
        const input = cleanInput(directMatch[2] || '');
        const args = input ? input.split(/\s+/).filter((arg) => !usernames.has(arg.replace(/^@/, '').toLowerCase())) : [];
        return {
          commandName: directMatch[1],
          input,
          args,
          prefixUsed: p,
        };
      }

      const mentionMatch = trimmed.match(
        new RegExp(`^@(?:${usernamePattern})\\s+${escP}([a-zA-Z0-9_]+)(?:\\s+([\\s\\S]*)|$)`, 'i')
      );
      if (mentionMatch) {
        const input = cleanInput(mentionMatch[2] || '');
        const args = input ? input.split(/\s+/).filter((arg) => !usernames.has(arg.replace(/^@/, '').toLowerCase())) : [];
        return {
          commandName: mentionMatch[1],
          input,
          args,
          prefixUsed: p,
        };
      }

      return null;
    }

    // 1. Trailing mention: "!bing random @deltaxapp"
    const trailing = parseCommand('!bing random @deltaxapp', 'deltaxapp', '!');
    assert.deepEqual(trailing, {
      commandName: 'bing',
      input: 'random',
      args: ['random'],
      prefixUsed: '!',
    });

    // 2. Leading mention: "@deltaxapp !bing random"
    const leading = parseCommand('@deltaxapp !bing random', 'deltaxapp', '!');
    assert.deepEqual(leading, {
      commandName: 'bing',
      input: 'random',
      args: ['random'],
      prefixUsed: '!',
    });

    // 3. Inline mention: "!bing @deltaxapp random"
    const inline = parseCommand('!bing @deltaxapp random', 'deltaxapp', '!');
    assert.deepEqual(inline, {
      commandName: 'bing',
      input: 'random',
      args: ['random'],
      prefixUsed: '!',
    });

    // 4. Attached mention: "!bing@deltaxapp random"
    const attached = parseCommand('!bing@deltaxapp random', 'deltaxapp', '!');
    assert.deepEqual(attached, {
      commandName: 'bing',
      input: 'random',
      args: ['random'],
      prefixUsed: '!',
    });

    // 5. Multiple args with trailing mention: "!wallpaper 4K en-US @deltaxapp"
    const multi = parseCommand('!wallpaper 4K en-US @deltaxapp', 'deltaxapp', '!');
    assert.deepEqual(multi, {
      commandName: 'wallpaper',
      input: '4K en-US',
      args: ['4K', 'en-US'],
      prefixUsed: '!',
    });

    // 6. Mention of another user preserved: "!info @john_doe @deltaxapp"
    const otherUser = parseCommand('!info @john_doe @deltaxapp', 'deltaxapp', '!');
    assert.deepEqual(otherUser, {
      commandName: 'info',
      input: '@john_doe',
      args: ['@john_doe'],
      prefixUsed: '!',
    });
  });
});
