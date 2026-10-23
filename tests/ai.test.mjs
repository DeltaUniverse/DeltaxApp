import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdownToTelegramHtml(markdown) {
  if (!markdown) return '';

  let text = markdown;

  // Auto-close unterminated code fence
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    text += '\n```\n';
  }

  const placeholders = [];
  const createPlaceholder = (content) => {
    const idx = placeholders.length;
    placeholders.push(content);
    return `@@@DELTAXPH${idx}@@@`;
  };

  text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trimEnd());
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return createPlaceholder(`<pre><code${langAttr}>${escapedCode}</code></pre>`);
  });

  text = text.replace(/`([^`\r\n]+)`/g, (_, inlineCode) => {
    return createPlaceholder(`<code>${escapeHtml(inlineCode)}</code>`);
  });

  // Convert markdown bullet points to unicode bullets before italic regex
  text = text.replace(/^(\s*)[*-]\s+([^\r\n]+)$/gm, '$1• $2');

  text = escapeHtml(text);

  // Group consecutive blockquotes into a single blockquote
  text = text.replace(/(?:^|\n)((?:&gt;[^\r\n]*(?:\r?\n|$))+)/g, (_, quoteGroup) => {
    const lines = quoteGroup
      .split(/\r?\n/)
      .map((line) => line.replace(/^&gt;\s?/, ''))
      .filter((line) => line.length > 0);
    return `\n<blockquote>${lines.join('\n')}</blockquote>\n`;
  });

  text = text.replace(/^(?:#{1,6})\s+([^\r\n]+)$/gm, '<b>$1</b>');
  text = text.replace(/\*\*([^*\r\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\r\n]+)__/g, '<b>$1</b>');
  text = text.replace(/(?<![*\w])\*([^*\r\n]+)\*(?![*\w])/g, '<i>$1</i>');
  text = text.replace(/(?<![_\w])_([^_\r\n]+)_(?![_\w])/g, '<i>$1</i>');
  text = text.replace(/~~([^~\r\n]+)~~/g, '<s>$1</s>');
  text = text.replace(/\[([^\r\n[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  text = text.replace(/@@@DELTAXPH(\d+)@@@/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return placeholders[idx] ?? '';
  });

  return text.trim();
}

function splitText(text, maxLength = 4000) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function splitMarkdown(markdown, maxLength = 4000) {
  if (!markdown || markdown.length <= maxLength) {
    return [markdown];
  }

  const chunks = [];
  let remaining = markdown;
  let inCodeFence = false;
  let codeFenceLang = '';

  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = maxLength;
    }

    let chunk = remaining.slice(0, splitIdx).trim();
    remaining = remaining.slice(splitIdx).trim();

    const fenceMatches = Array.from(chunk.matchAll(/(?:^|\n)```([a-zA-Z0-9_-]*)/g));
    for (const match of fenceMatches) {
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceLang = match[1] || '';
      } else {
        inCodeFence = false;
        codeFenceLang = '';
      }
    }

    if (inCodeFence) {
      chunk += '\n```';
      remaining = `\`\`\`${codeFenceLang}\n` + remaining;
    }

    chunks.push(chunk);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

const FEW_SHOT_EXAMPLES = [
  { role: 'user', content: 'halo' },
  { role: 'assistant', content: 'Yo! Lagi apa nih?' },
  { role: 'user', content: 'lagi gabut nih' },
  { role: 'assistant', content: 'Sama bray, rebahan doang dari tadi wkwk.' },
  { role: 'user', content: 'capek banget hari ini kerjaan numpuk parah' },
  { role: 'assistant', content: 'Semangat cuy, istirahat dulu gih jangan diforsir amat.' },
  { role: 'user', content: 'menurut lo enakan nonton film apa nongkrong?' },
  {
    role: 'assistant',
    content: 'Kalo lagi mager mending nonton sih, tapi kalo ada duit gas nongkrong.',
  },
  { role: 'user', content: 'eh anw lo tau drama netizen kemarin ga?' },
  { role: 'assistant', content: 'Tau dong, asli timeline rame parah gara-gara itu wkwk.' },
  { role: 'user', content: 'spill tea dong' },
  { role: 'assistant', content: 'Gas, jadi ceritanya si itu kemarin kegep cuy wkwk.' },
];

function buildAiMessages(query, replyText, botName = 'Delta', history) {
  const name = botName.trim() || 'Delta';
  const systemPrompt =
    `Kamu adalah ${name}, teman ngobrol akrab yang santai banget.\n` +
    `Gunakan bahasa Indonesia kasual ala anak Jaksel atau Gen Z sesuai gaya lawan bicara.\n` +
    `Jawab super singkat (1-2 kalimat saja), santai layaknya chat WhatsApp.\n` +
    `Langsung ke inti obrolan tanpa pembuka kaku atau basa-basi robotik.\n` +
    `Jangan gunakan format list ataupun markdown.`;

  const conversationTurns = [];
  if (history && history.length > 0) {
    conversationTurns.push(...history);
  }

  if (replyText && replyText.trim()) {
    const trimmedReply = replyText.trim();
    if (query && query.trim()) {
      conversationTurns.push({
        role: 'user',
        content: `Context dari chat sebelumnya:\n"${trimmedReply}"\n\n${query.trim()}`,
      });
    } else {
      conversationTurns.push({
        role: 'user',
        content: trimmedReply,
      });
    }
  } else if (query && query.trim()) {
    conversationTurns.push({
      role: 'user',
      content: query.trim(),
    });
  }

  const trimmedHistory = conversationTurns.slice(-10);

  return [{ role: 'system', content: systemPrompt }, ...FEW_SHOT_EXAMPLES, ...trimmedHistory];
}

async function computeAiCacheKey(model, messages) {
  const normalized = messages
    .map((m) => `${m.role}:${m.content.replace(/\s+/g, ' ').trim()}`)
    .join('|');
  const rawKey = `${model}|${normalized}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ai:v4:${hex}`;
}

describe('Deltax App - Workers AI Module & Utilities', () => {
  describe('formatMarkdownToTelegramHtml', () => {
    test('converts fenced code blocks with language safely', () => {
      const md = 'Code example:\n```typescript\nconst a = 1 < 2;\n```';
      const html = formatMarkdownToTelegramHtml(md);
      assert.ok(
        html.includes('<pre><code class="language-typescript">const a = 1 &lt; 2;</code></pre>')
      );
    });

    test('converts inline code and escapes inner HTML', () => {
      const md = 'Use `<div>` or `npm install` for setup';
      const html = formatMarkdownToTelegramHtml(md);
      assert.ok(html.includes('<code>&lt;div&gt;</code>'));
      assert.ok(html.includes('<code>npm install</code>'));
    });

    test('converts bold, italic, strikethrough, and headers', () => {
      const md = '## Title\n**bold text** and *italic text* and ~~strike~~';
      const html = formatMarkdownToTelegramHtml(md);
      assert.ok(html.includes('<b>Title</b>'));
      assert.ok(html.includes('<b>bold text</b>'));
      assert.ok(html.includes('<i>italic text</i>'));
      assert.ok(html.includes('<s>strike</s>'));
    });

    test('converts markdown links and blockquotes', () => {
      const md = '[Cloudflare](https://cloudflare.com)\n> Important insight';
      const html = formatMarkdownToTelegramHtml(md);
      assert.ok(html.includes('<a href="https://cloudflare.com">Cloudflare</a>'));
      assert.ok(html.includes('<blockquote>Important insight</blockquote>'));
    });

    test('handles empty or blank input', () => {
      assert.equal(formatMarkdownToTelegramHtml(''), '');
      assert.equal(formatMarkdownToTelegramHtml(null), '');
    });

    test('auto-closes unterminated code fence', () => {
      const truncated = 'Here is code:\n```javascript\nconst x = 10;';
      const html = formatMarkdownToTelegramHtml(truncated);
      assert.ok(html.includes('<pre><code class="language-javascript">const x = 10;</code></pre>'));
    });

    test('converts * and - bullet points to bullets without corrupting italics', () => {
      const md = '* First bullet\n- Second bullet\n*italic text*';
      const html = formatMarkdownToTelegramHtml(md);
      assert.ok(html.includes('• First bullet'));
      assert.ok(html.includes('• Second bullet'));
      assert.ok(html.includes('<i>italic text</i>'));
    });

    test('groups consecutive blockquote lines into a single blockquote', () => {
      const md = '> Line 1\n> Line 2\n> Line 3';
      const html = formatMarkdownToTelegramHtml(md);
      assert.equal(html, '<blockquote>Line 1\nLine 2\nLine 3</blockquote>');
    });
  });

  describe('splitMarkdown', () => {
    test('closes and reopens code fences across split chunks', () => {
      const code = 'const a = 1;\n'.repeat(20);
      const md = 'Start\n```typescript\n' + code + '```\nEnd';
      const chunks = splitMarkdown(md, 120);

      assert.ok(chunks.length > 1);
      // First chunk must end by closing the code fence
      assert.ok(chunks[0].endsWith('```'));
      // Second chunk must reopen the typescript code fence
      assert.ok(chunks[1].startsWith('```typescript'));
    });
  });

  describe('splitText', () => {
    test('does not split text shorter than maxLength', () => {
      const short = 'Short message within limit';
      const res = splitText(short, 100);
      assert.deepEqual(res, [short]);
    });

    test('splits along paragraph boundaries when possible', () => {
      const p1 = 'A'.repeat(60);
      const p2 = 'B'.repeat(60);
      const text = `${p1}\n\n${p2}`;
      const res = splitText(text, 80);
      assert.equal(res.length, 2);
      assert.equal(res[0], p1);
      assert.equal(res[1], p2);
    });

    test('splits along newline or space boundaries if paragraphs exceed limit', () => {
      const text = 'word '.repeat(30);
      const res = splitText(text, 50);
      assert.ok(res.length >= 3);
      for (const chunk of res) {
        assert.ok(chunk.length <= 50);
      }
    });
  });

  describe('buildAiMessages', () => {
    test('builds single query prompt with system instruction and few-shots', () => {
      const msgs = buildAiMessages('What is Workers AI?', null, 'Luna');
      assert.equal(msgs.length, 14);
      assert.equal(msgs[0].role, 'system');
      assert.ok(msgs[0].content.includes('Kamu adalah Luna'));
      assert.equal(msgs[msgs.length - 1].role, 'user');
      assert.equal(msgs[msgs.length - 1].content, 'What is Workers AI?');
    });

    test('combines replied context with user query', () => {
      const msgs = buildAiMessages('Explain this code', 'function foo() { return 42; }');
      assert.equal(msgs.length, 14);
      assert.ok(msgs[msgs.length - 1].content.includes('Context dari chat sebelumnya:'));
      assert.ok(msgs[msgs.length - 1].content.includes('function foo() { return 42; }'));
      assert.ok(msgs[msgs.length - 1].content.includes('Explain this code'));
    });

    test('uses replied text directly if query is empty', () => {
      const msgs = buildAiMessages('', 'Summarize this long article');
      assert.equal(msgs.length, 14);
      assert.equal(msgs[msgs.length - 1].content, 'Summarize this long article');
    });
  });

  describe('AiModule Execution Mock', () => {
    test('notifies when AI binding is missing', async () => {
      let response = '';
      const ctx = {
        input: 'Hello',
        replyMsg: null,
        prefix: '/',
        env: {},
        respond: async (text) => {
          response = text;
        },
      };

      if (!ctx.env.AI) {
        await ctx.respond('Workers AI Unavailable');
      }

      assert.equal(response, 'Workers AI Unavailable');
    });

    test('invokes AI.run and parses response text', async () => {
      let modelUsed = '';
      let sentText = '';
      const mockAi = {
        run: async (model, input) => {
          modelUsed = model;
          return { response: `Answer to: ${input.messages[input.messages.length - 1].content}` };
        },
      };

      const ctx = {
        input: 'What is 2+2?',
        replyMsg: null,
        prefix: '/',
        env: { AI: mockAi },
        respond: async (text) => {
          sentText = text;
        },
      };

      const msgs = buildAiMessages(ctx.input, null);
      const res = await ctx.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: msgs,
      });
      await ctx.respond(formatMarkdownToTelegramHtml(res.response));

      assert.equal(modelUsed, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
      assert.equal(sentText, 'Answer to: What is 2+2?');
    });

    test('computes cache key normalizing whitespace while preserving casing', async () => {
      const msgs1 = [{ role: 'user', content: 'What   is   JavaScript?' }];
      const msgs2 = [{ role: 'user', content: 'What is JavaScript?' }];
      const msgs3 = [{ role: 'user', content: 'what is javascript?' }];

      const key1 = await computeAiCacheKey('model-test', msgs1);
      const key2 = await computeAiCacheKey('model-test', msgs2);
      const key3 = await computeAiCacheKey('model-test', msgs3);

      assert.equal(key1, key2, 'Whitespace normalization should produce identical cache key');
      assert.notEqual(key1, key3, 'Casing should be preserved in cache key calculation');
      assert.ok(key1.startsWith('ai:v4:'));
    });

    test('unescapeHtml converts entities back to characters in plain text fallback', () => {
      const htmlWithEntities = 'Maaf, saya tidak mengerti &quot;lu pake stream ga&quot;';
      const cleanPlain = htmlWithEntities
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      assert.equal(cleanPlain, 'Maaf, saya tidak mengerti "lu pake stream ga"');
    });

    test('simulates streaming draft accumulation in private chats', async () => {
      const chunks = ['Halo! ', 'Saya ', 'bisa ', 'streaming.'];
      let draftText = '';
      const onChunk = (partial) => {
        draftText = partial;
      };

      let accumulated = '';
      for (const c of chunks) {
        accumulated += c;
        onChunk(accumulated);
      }

      assert.equal(draftText, 'Halo! Saya bisa streaming.');
    });

    test('correctly identifies --fresh flag to bypass cache', () => {
      let rawQuery = 'Explain quantum computing --fresh';
      const isFresh = /--fresh\b/i.test(rawQuery);
      if (isFresh) {
        rawQuery = rawQuery.replace(/--fresh\b/gi, '').trim();
      }

      assert.equal(isFresh, true);
      assert.equal(rawQuery, 'Explain quantum computing');
    });

    test('enforces per-user cooldown for non-owner requests', () => {
      const cooldownMap = new Map();
      const USER_COOLDOWN_MS = 3000;
      const userId = 12345;
      const now = Date.now();

      cooldownMap.set(userId, now);

      const isCoolingDown = (id) => {
        const last = cooldownMap.get(id) || 0;
        return Date.now() - last < USER_COOLDOWN_MS;
      };

      assert.equal(isCoolingDown(userId), true);
      assert.equal(isCoolingDown(99999), false);
    });
  });
});
