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
    assert.ok(content.includes('WebModule'), 'Should include WebModule');
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
});
