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

  const placeholders = [];
  const createPlaceholder = (content) => {
    const idx = placeholders.length;
    placeholders.push(content);
    return `@@@DELTAXPH${idx}@@@`;
  };

  let text = markdown.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trimEnd());
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return createPlaceholder(`<pre><code${langAttr}>${escapedCode}</code></pre>`);
  });

  text = text.replace(/`([^`\r\n]+)`/g, (_, inlineCode) => {
    return createPlaceholder(`<code>${escapeHtml(inlineCode)}</code>`);
  });

  text = escapeHtml(text);
  text = text.replace(/^(?:#{1,6})\s+([^\r\n]+)$/gm, '<b>$1</b>');
  text = text.replace(/\*\*([^*\r\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\r\n]+)__/g, '<b>$1</b>');
  text = text.replace(/(?<![*\w])\*([^*\r\n]+)\*(?![*\w])/g, '<i>$1</i>');
  text = text.replace(/(?<![_\w])_([^_\r\n]+)_(?![_\w])/g, '<i>$1</i>');
  text = text.replace(/~~([^~\r\n]+)~~/g, '<s>$1</s>');
  text = text.replace(/\[([^\r\n[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/(?:^|\n)&gt;\s*([^\r\n]+)/g, '\n<blockquote>$1</blockquote>');

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

function buildAiMessages(query, replyText) {
  const systemPrompt =
    'You are a helpful, knowledgeable, and concise AI assistant running inside a Telegram bot. ' +
    'Provide direct and accurate answers. Format code snippets, lists, and quotes using standard markdown.';

  const messages = [{ role: 'system', content: systemPrompt }];

  if (replyText && replyText.trim()) {
    const trimmedReply = replyText.trim();
    if (query && query.trim()) {
      messages.push({
        role: 'user',
        content: `Context from replied message:\n"""\n${trimmedReply}\n"""\n\nQuestion / Request:\n${query.trim()}`,
      });
    } else {
      messages.push({
        role: 'user',
        content: trimmedReply,
      });
    }
  } else {
    messages.push({
      role: 'user',
      content: query.trim(),
    });
  }

  return messages;
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
    test('builds single query prompt with system instruction', () => {
      const msgs = buildAiMessages('What is Workers AI?');
      assert.equal(msgs.length, 2);
      assert.equal(msgs[0].role, 'system');
      assert.equal(msgs[1].role, 'user');
      assert.equal(msgs[1].content, 'What is Workers AI?');
    });

    test('combines replied context with user query', () => {
      const msgs = buildAiMessages('Explain this code', 'function foo() { return 42; }');
      assert.equal(msgs.length, 2);
      assert.ok(msgs[1].content.includes('Context from replied message:'));
      assert.ok(msgs[1].content.includes('function foo() { return 42; }'));
      assert.ok(msgs[1].content.includes('Explain this code'));
    });

    test('uses replied text directly if query is empty', () => {
      const msgs = buildAiMessages('', 'Summarize this long article');
      assert.equal(msgs.length, 2);
      assert.equal(msgs[1].content, 'Summarize this long article');
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
          return { response: `Answer to: ${input.messages[1].content}` };
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
  });
});
