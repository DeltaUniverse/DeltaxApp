import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INSTAGRAM_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i;
const INSTAGRAM_SHARE_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/share\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i;
const TIKTOK_URL_REGEX =
  /https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[a-zA-Z0-9_.-]+\/(?:video|photo)\/(\d+)/i;
const TIKTOK_VM_REGEX = /https?:\/\/(?:vm|vt)\.tiktok\.com\/([a-zA-Z0-9]+)/i;
const TWITTER_URL_REGEX =
  /https?:\/\/(?:(?:www\.|mobile\.)?(?:twitter\.com|x\.com)|(?:fxtwitter\.com|vxtwitter\.com|fixupx\.com))\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/i;
const TCO_URL_REGEX = /https?:\/\/t\.co\/([a-zA-Z0-9_-]+)/i;

function findSupportedUrl(text) {
  if (!text) return null;
  const igMatch = text.match(INSTAGRAM_URL_REGEX) || text.match(INSTAGRAM_SHARE_REGEX);
  if (igMatch) return { platform: 'instagram', url: igMatch[0] };
  const ttMatch = text.match(TIKTOK_URL_REGEX) || text.match(TIKTOK_VM_REGEX);
  if (ttMatch) return { platform: 'tiktok', url: ttMatch[0] };
  const twMatch = text.match(TWITTER_URL_REGEX) || text.match(TCO_URL_REGEX);
  if (twMatch) return { platform: 'twitter', url: twMatch[0] };
  return null;
}

function buildCommandRegex(prefix, names) {
  const escPrefix = escapeRegex(prefix);
  const sorted = names.slice().sort((a, b) => b.length - a.length);
  const namePattern = sorted.length > 0 ? sorted.map(escapeRegex).join('|') : '$^';
  return new RegExp(
    `^(?:@\\w+\\s+)?${escPrefix}(${namePattern})(?:@\\w+)?(?:\\s+([\\s\\S]*)|$)`,
    'i'
  );
}

function classifyGuestMessage(ctx, registeredCommandNames, activePrefix = '/') {
  const msg = ctx.msg;
  const rawText = msg?.text || ctx.message?.text || '';
  const text = rawText.trim();
  const replyMsg = msg?.reply_to_message;

  if (text && registeredCommandNames.length > 0) {
    const cmdMatch = text.match(buildCommandRegex(activePrefix, registeredCommandNames));
    if (cmdMatch) {
      const result = {
        kind: 'command',
        name: cmdMatch[1].toLowerCase(),
        args: (cmdMatch[2] || '').trim(),
      };
      ctx.guest = result;
      return result;
    }
  }

  if (replyMsg) {
    const result = { kind: 'reply' };
    ctx.guest = result;
    return result;
  }

  if (text && registeredCommandNames.length > 0) {
    const unprefixedMatch = text.match(buildCommandRegex('', registeredCommandNames));
    if (unprefixedMatch) {
      const result = {
        kind: 'wrong-prefix',
        name: unprefixedMatch[1].toLowerCase(),
      };
      ctx.guest = result;
      return result;
    }

    if (activePrefix !== '/') {
      const slashMatch = text.match(buildCommandRegex('/', registeredCommandNames));
      if (slashMatch) {
        const result = {
          kind: 'wrong-prefix',
          name: slashMatch[1].toLowerCase(),
        };
        ctx.guest = result;
        return result;
      }
    }
  }

  if (text) {
    const detected = findSupportedUrl(text);
    if (detected) {
      const result = {
        kind: 'url',
        url: detected.url,
        platform: detected.platform,
      };
      ctx.guest = result;
      return result;
    }
  }

  const result = { kind: 'none' };
  ctx.guest = result;
  return result;
}

const DEFAULT_OWNER_ID = 7492470603;

function isOwner(ctx) {
  const caller = ctx.msg?.guest_bot_caller_user || ctx.from;
  const callerId = caller?.id ? Number(caller.id) : null;
  const configuredOwnerId = ctx.env?.OWNER_ID ? Number(ctx.env.OWNER_ID) : DEFAULT_OWNER_ID;
  return Boolean(callerId && callerId === configuredOwnerId);
}

describe('Deltax App - Strict Prefix Enforcement & Owner Authorization', () => {
  test('classifyGuestMessage: reply mention without command is classified as reply', () => {
    const commands = ['dl', 'download', 'ss', 'web', 'setprefix', 'start'];
    const replyMsg = { message_id: 123, text: 'Check https://instagram.com/p/abc/' };

    // With prefix "!"
    const replyCtxExclamation = {
      msg: { text: '@deltaxapp', reply_to_message: replyMsg },
    };
    assert.deepEqual(classifyGuestMessage(replyCtxExclamation, commands, '!'), { kind: 'reply' });
    assert.deepEqual(replyCtxExclamation.guest, { kind: 'reply' });

    // With prefix "/"
    const replyCtxSlash = {
      msg: { text: '@deltaxapp', reply_to_message: replyMsg },
    };
    assert.deepEqual(classifyGuestMessage(replyCtxSlash, commands, '/'), { kind: 'reply' });
    assert.deepEqual(replyCtxSlash.guest, { kind: 'reply' });

    // Reply mention with explicit command is classified as command, NOT reply
    const replyCommandExclamation = {
      msg: { text: '@deltaxapp !dl', reply_to_message: replyMsg },
    };
    assert.deepEqual(classifyGuestMessage(replyCommandExclamation, commands, '!'), {
      kind: 'command',
      name: 'dl',
      args: '',
    });

    const replyCommandSlash = {
      msg: { text: '@deltaxapp /dl', reply_to_message: replyMsg },
    };
    assert.deepEqual(classifyGuestMessage(replyCommandSlash, commands, '/'), {
      kind: 'command',
      name: 'dl',
      args: '',
    });
  });

  test('classifyGuestMessage: valid command "@bot !dl <url>" and "@bot /dl <url>"', () => {
    const commands = ['dl', 'download', 'ss', 'web', 'setprefix', 'start'];
    const url = 'https://www.instagram.com/p/123/';

    // Prefix "!"
    const ctxExclamation = { msg: { text: `@deltaxapp !dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(ctxExclamation, commands, '!'), {
      kind: 'command',
      name: 'dl',
      args: url,
    });
    assert.deepEqual(ctxExclamation.guest, {
      kind: 'command',
      name: 'dl',
      args: url,
    });

    // Direct without mention
    const directExclamation = { msg: { text: `!dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(directExclamation, commands, '!'), {
      kind: 'command',
      name: 'dl',
      args: url,
    });

    // Prefix "/"
    const ctxSlash = { msg: { text: `@deltaxapp /dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(ctxSlash, commands, '/'), {
      kind: 'command',
      name: 'dl',
      args: url,
    });
    assert.deepEqual(ctxSlash.guest, {
      kind: 'command',
      name: 'dl',
      args: url,
    });

    const directSlash = { msg: { text: `/dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(directSlash, commands, '/'), {
      kind: 'command',
      name: 'dl',
      args: url,
    });
  });

  test('classifyGuestMessage: wrong-prefix "@bot dl <url>" with prefix "!" and "/"', () => {
    const commands = ['dl', 'download', 'ss', 'web', 'setprefix', 'start'];
    const url = 'https://www.instagram.com/p/123/';

    // Prefix "!" with unprefixed command
    const ctxExclamation = { msg: { text: `@deltaxapp dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(ctxExclamation, commands, '!'), {
      kind: 'wrong-prefix',
      name: 'dl',
    });

    const directExclamation = { msg: { text: `dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(directExclamation, commands, '!'), {
      kind: 'wrong-prefix',
      name: 'dl',
    });

    // Prefix "!" with slash command
    const ctxSlashWhenExclamation = { msg: { text: `@deltaxapp /dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(ctxSlashWhenExclamation, commands, '!'), {
      kind: 'wrong-prefix',
      name: 'dl',
    });

    const directSlashWhenExclamation = { msg: { text: `/dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(directSlashWhenExclamation, commands, '!'), {
      kind: 'wrong-prefix',
      name: 'dl',
    });

    // Prefix "/" with unprefixed command
    const ctxSlash = { msg: { text: `@deltaxapp dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(ctxSlash, commands, '/'), {
      kind: 'wrong-prefix',
      name: 'dl',
    });

    const directSlash = { msg: { text: `dl ${url}` } };
    assert.deepEqual(classifyGuestMessage(directSlash, commands, '/'), {
      kind: 'wrong-prefix',
      name: 'dl',
    });
  });

  test('classifyGuestMessage: bare URL is classified as url', () => {
    const commands = ['dl', 'download', 'ss', 'web', 'setprefix', 'start'];
    const url = 'https://www.instagram.com/p/123';

    // Prefix "!"
    const ctxExclamation = { msg: { text: url } };
    assert.deepEqual(classifyGuestMessage(ctxExclamation, commands, '!'), {
      kind: 'url',
      url,
      platform: 'instagram',
    });

    const mentionUrlExclamation = { msg: { text: `@deltaxapp ${url}` } };
    assert.deepEqual(classifyGuestMessage(mentionUrlExclamation, commands, '!'), {
      kind: 'url',
      url,
      platform: 'instagram',
    });

    // Prefix "/"
    const ctxSlash = { msg: { text: url } };
    assert.deepEqual(classifyGuestMessage(ctxSlash, commands, '/'), {
      kind: 'url',
      url,
      platform: 'instagram',
    });

    const mentionUrlSlash = { msg: { text: `@deltaxapp ${url}` } };
    assert.deepEqual(classifyGuestMessage(mentionUrlSlash, commands, '/'), {
      kind: 'url',
      url,
      platform: 'instagram',
    });
  });

  test('classifyGuestMessage: "@bot !ss <url>" and "@bot !setprefix" handled with prefixes "/" and "!"', () => {
    const commands = ['dl', 'download', 'ss', 'web', 'setprefix', 'start', 'ping', 'p'];

    // Prefix "!"
    const ssExclamation = { msg: { text: '@deltaxapp !ss https://google.com' } };
    assert.deepEqual(classifyGuestMessage(ssExclamation, commands, '!'), {
      kind: 'command',
      name: 'ss',
      args: 'https://google.com',
    });

    // Ping command
    assert.deepEqual(classifyGuestMessage({ msg: { text: '@deltaxapp !ping' } }, commands, '!'), {
      kind: 'command',
      name: 'ping',
      args: '',
    });
    assert.deepEqual(classifyGuestMessage({ msg: { text: '@deltaxapp /p' } }, commands, '/'), {
      kind: 'command',
      name: 'p',
      args: '',
    });

    const setprefixExclamation = { msg: { text: '@deltaxapp !setprefix ?' } };
    assert.deepEqual(classifyGuestMessage(setprefixExclamation, commands, '!'), {
      kind: 'command',
      name: 'setprefix',
      args: '?',
    });

    // Prefix "!" wrong prefix cases
    const ssWrongExclamation = { msg: { text: '@deltaxapp ss https://google.com' } };
    assert.deepEqual(classifyGuestMessage(ssWrongExclamation, commands, '!'), {
      kind: 'wrong-prefix',
      name: 'ss',
    });

    const ssSlashWrongExclamation = { msg: { text: '@deltaxapp /ss https://google.com' } };
    assert.deepEqual(classifyGuestMessage(ssSlashWrongExclamation, commands, '!'), {
      kind: 'wrong-prefix',
      name: 'ss',
    });

    // Prefix "/"
    const ssSlash = { msg: { text: '@deltaxapp /ss https://google.com' } };
    assert.deepEqual(classifyGuestMessage(ssSlash, commands, '/'), {
      kind: 'command',
      name: 'ss',
      args: 'https://google.com',
    });

    const setprefixSlash = { msg: { text: '@deltaxapp /setprefix !' } };
    assert.deepEqual(classifyGuestMessage(setprefixSlash, commands, '/'), {
      kind: 'command',
      name: 'setprefix',
      args: '!',
    });

    // Prefix "/" wrong prefix case
    const ssWrongSlash = { msg: { text: '@deltaxapp ss https://google.com' } };
    assert.deepEqual(classifyGuestMessage(ssWrongSlash, commands, '/'), {
      kind: 'wrong-prefix',
      name: 'ss',
    });
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
        const args = input
          ? input.split(/\s+/).filter((arg) => !usernames.has(arg.replace(/^@/, '').toLowerCase()))
          : [];
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
        const args = input
          ? input.split(/\s+/).filter((arg) => !usernames.has(arg.replace(/^@/, '').toLowerCase()))
          : [];
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
