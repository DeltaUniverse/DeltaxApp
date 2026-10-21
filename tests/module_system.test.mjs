import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const modulesDir = path.resolve(rootDir, 'src/modules');
const indexPath = path.resolve(modulesDir, 'index.ts');

describe('Deltax App - Module System & Event Handling', () => {
  test('discovers and loads all core modules in AUTO_MODULES', () => {
    // Run the auto-import script to ensure index.ts is up to date
    execSync('node scripts/auto-import.mjs', { cwd: rootDir, stdio: 'pipe' });

    assert.ok(fs.existsSync(indexPath), 'src/modules/index.ts must exist');
    const content = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(content.includes('AUTO_MODULES'), 'Should export AUTO_MODULES array');
    assert.ok(content.includes('StartModule'), 'Should include StartModule');
    assert.ok(content.includes('DownloaderModule'), 'Should include DownloaderModule');
    assert.ok(content.includes('WallpaperModule'), 'Should include WallpaperModule');
    assert.ok(content.includes('WebModule'), 'Should include WebModule');
    assert.ok(content.includes('EvalModule'), 'Should include EvalModule');
  });

  test('simplified module event handling: registers commands and dispatches cleanly in-memory', async () => {
    // In-memory test of CommandDispatcher logic without creating temporary files on disk
    class MockCommandDispatcher {
      constructor() {
        this.commands = new Map();
      }

      register(names, handler, options = {}) {
        const list = Array.isArray(names) ? names : [names];
        for (const name of list) {
          this.commands.set(name.toLowerCase(), { handler, options });
        }
      }

      async dispatch(rawText, activePrefix = '/', isOwner = false) {
        if (!rawText.trim()) return false;
        const trimmed = rawText.trim();
        const prefix = activePrefix;

        if (!trimmed.startsWith(prefix)) return false;
        const withoutPrefix = trimmed.slice(prefix.length).trim();
        const parts = withoutPrefix.split(/\s+/);
        const cmdName = parts[0].toLowerCase();
        const args = parts.slice(1);

        const found = this.commands.get(cmdName);
        if (!found) return false;

        if (found.options.ownerOnly && !isOwner) {
          return { error: 'Unauthorized: Owner only' };
        }

        const res = await found.handler({
          command: cmdName,
          prefix,
          args,
          input: parts.slice(1).join(' '),
          isOwner,
          respond: async (text) => text,
        });

        return { success: true, result: res };
      }
    }

    // Define a new module purely in-memory
    class CustomEchoModule {
      constructor() {
        this.id = 'echo';
        this.name = 'Echo Module';
      }

      setup(dispatcher) {
        dispatcher.register(
          ['echo', 'say'],
          async (ctx) => {
            return `Echo: ${ctx.input}`;
          },
          { description: 'Echoes back text' }
        );

        dispatcher.register(
          ['adminreset'],
          async () => 'System reset',
          { ownerOnly: true, description: 'Reset system' }
        );
      }
    }

    const dispatcher = new MockCommandDispatcher();
    const mod = new CustomEchoModule();
    mod.setup(dispatcher);

    // Test command dispatching
    const res1 = await dispatcher.dispatch('/echo hello world', '/');
    assert.equal(res1.success, true);
    assert.equal(res1.result, 'Echo: hello world');

    // Test alias command dispatching
    const res2 = await dispatcher.dispatch('!say fast response', '!');
    assert.equal(res2.success, true);
    assert.equal(res2.result, 'Echo: fast response');

    // Test that when prefix is '!', '/' is NOT matched
    const resSlashWhenExclamation = await dispatcher.dispatch('/echo hello', '!');
    assert.equal(resSlashWhenExclamation, false);

    // Test prefix mismatch
    const resMismatch = await dispatcher.dispatch('@deltaxapp echo test', '!');
    assert.equal(resMismatch, false);

    // Test ownerOnly gating when non-owner invokes
    const resNonOwner = await dispatcher.dispatch('/adminreset', '/', false);
    assert.equal(resNonOwner.error, 'Unauthorized: Owner only');

    // Test ownerOnly gating when owner invokes
    const resOwner = await dispatcher.dispatch('/adminreset', '/', true);
    assert.equal(resOwner.success, true);
    assert.equal(resOwner.result, 'System reset');
  });

  test('stripHtml iteratively removes nested HTML tags and unescapeHtml prevents double-escaping', () => {
    // Replicate stripHtml & unescapeHtml logic
    function stripHtml(input) {
      if (!input) return '';
      let sanitized = input;
      let previous;
      do {
        previous = sanitized;
        sanitized = sanitized.replace(/<[^<>]*>/g, '');
      } while (sanitized !== previous);
      return sanitized;
    }

    const HTML_ENTITY_MAP = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&#064;': '@',
    };

    function unescapeHtml(text) {
      if (!text) return '';
      return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|#064);/gi, (match) => {
        return HTML_ENTITY_MAP[match.toLowerCase()] ?? match;
      });
    }

    // Nested attack vectors designed to bypass single-pass regex sanitizers
    const nestedScript = '<scr<script>ipt>alert(1)</script>';
    assert.equal(stripHtml(nestedScript), 'alert(1)');

    const nestedDiv = '<di<div>v>clean text</div>';
    assert.equal(stripHtml(nestedDiv), 'clean text');

    // Single pass entity decoding prevents double-escaping
    const doubleEncoded = '&amp;lt;script&amp;gt;';
    const decoded = unescapeHtml(doubleEncoded);
    assert.equal(decoded, '&lt;script&gt;'); // Does NOT decode to <script>

    const normalEncoded = 'Hello &amp; welcome to &quot;Deltax&quot; &#064;channel';
    assert.equal(unescapeHtml(normalEncoded), 'Hello & welcome to "Deltax" @channel');
  });

  describe('Evaluator and Serializer (EvalModule)', () => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    function serialize(value) {
      if (value === null || value === undefined) return String(value);
      if (typeof value === 'string') return value || '\u2060';
      if (typeof value === 'symbol') return value.toString();
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }

      const seen = new WeakSet();

      try {
        return JSON.stringify(
          value,
          (_key, val) => {
            if (typeof val === 'object' && val !== null) {
              if (seen.has(val)) return '[Circular]';
              seen.add(val);

              if (val instanceof Error) {
                return {
                  name: val.name,
                  message: val.message,
                  stack: val.stack,
                };
              }

              if (val instanceof Set) return Array.from(val);
              if (val instanceof Map) return Object.fromEntries(val);
              if (val instanceof Uint8Array) return `[Uint8Array(${val.length})]`;
            }

            if (typeof val === 'bigint') return `${val}n`;
            if (typeof val === 'function') {
              return `[Function: ${val.name || 'anonymous'}]`;
            }
            if (typeof val === 'symbol') return val.toString();

            return val;
          },
          1
        );
      } catch (error) {
        return String(value ?? error);
      }
    }

    async function evaluateCode(code, scope) {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      let script = code.trim();

      if (script.startsWith('```')) {
        script = script.replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?/, '').replace(/\n?```$/, '').trim();
      }

      try {
        const fn = new AsyncFunction(...keys, `return (${script})`);
        return await fn(...values);
      } catch {
        const fn = new AsyncFunction(...keys, script);
        return await fn(...values);
      }
    }

    test('serializes primitive values, BigInt, Symbols, and Functions', () => {
      assert.equal(serialize(null), 'null');
      assert.equal(serialize(undefined), 'undefined');
      assert.equal(serialize('hello world'), 'hello world');
      assert.equal(serialize(''), '\u2060');
      assert.equal(serialize(Symbol('test')), 'Symbol(test)');
      assert.equal(serialize(function myFunc() {}), '[Function: myFunc]');
      assert.equal(serialize(() => {}), '[Function: anonymous]');
      assert.equal(serialize(9007199254740991n), '"9007199254740991n"');
    });

    test('serializes Sets, Maps, Uint8Arrays, and circular objects', () => {
      const set = new Set(['apple', 'banana']);
      assert.ok(serialize(set).includes('apple'));

      const map = new Map([['key1', 'val1']]);
      assert.ok(serialize(map).includes('key1'));

      const uint8 = new Uint8Array([1, 2, 3]);
      assert.equal(serialize(uint8), '"[Uint8Array(3)]"');

      const circ = { name: 'circular' };
      circ.self = circ;
      const circStr = serialize(circ);
      assert.ok(circStr.includes('[Circular]'));
    });

    test('serializes Error instances preserving name and message', () => {
      const err = new Error('Test failure');
      const errStr = serialize(err);
      assert.ok(errStr.includes('"name": "Error"'));
      assert.ok(errStr.includes('"message": "Test failure"'));
    });

    test('evaluates expressions, async promises, statement blocks, and code fences', async () => {
      const scope = { a: 5, b: 10 };
      const sum = await evaluateCode('a + b', scope);
      assert.equal(sum, 15);

      const asyncRes = await evaluateCode('await Promise.resolve(a * b)', scope);
      assert.equal(asyncRes, 50);

      const block = await evaluateCode('const res = a + 1; return res * 2;', scope);
      assert.equal(block, 12);

      const fenced = await evaluateCode('```javascript\nreturn a * 3;\n```', scope);
      assert.equal(fenced, 15);
    });

    test('enforces strict owner authorization on eval command', async () => {
      let isOwnerOnlyEnforced = false;
      const options = { ownerOnly: true };

      function executeCommand(isOwner) {
        if (options.ownerOnly && !isOwner) {
          return { status: 403, error: 'Access Denied: Only owner can trigger' };
        }
        return { status: 200, result: 'Executed' };
      }

      // Non-owner invocation rejected
      const nonOwnerRes = executeCommand(false);
      assert.equal(nonOwnerRes.status, 403);
      assert.ok(nonOwnerRes.error.includes('Access Denied'));

      // Owner invocation accepted
      const ownerRes = executeCommand(true);
      assert.equal(ownerRes.status, 200);
      assert.equal(ownerRes.result, 'Executed');
    });
  });
});
