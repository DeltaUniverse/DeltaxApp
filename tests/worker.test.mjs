import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Deltax App - Serverless Telegram Bot Worker', () => {
  let worker;

  before(async () => {
    const distFile = path.resolve(rootDir, 'dist/index.js');
    if (!fs.existsSync(distFile)) {
      execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
    }
    const module = await import(distFile);
    worker = module.default;
  });

  test('returns 500 when BOT_TOKEN is missing', async () => {
    const req = new Request('https://worker.local/');
    const env = { BOT_TOKEN: '' };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 500);

    const body = await res.json();
    assert.equal(body.error, 'Configuration Error');
  });

  test('health check returns 200 and lists auto-imported modules', async () => {
    const req = new Request('https://worker.local/health');
    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
      ENVIRONMENT: 'testing',
    };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'online');
    assert.equal(data.environment, 'testing');
    assert.ok(data.modulesCount >= 1, `Expected at least 1 module, got ${data.modulesCount}`);

    const moduleIds = data.modules.map((m) => m.id);
    assert.ok(moduleIds.includes('start'), 'Should have start module');
    assert.ok(moduleIds.includes('web'), 'Should have web module');
    assert.ok(moduleIds.includes('downloader'), 'Should have downloader module');
    assert.ok(moduleIds.includes('wallpaper'), 'Should have wallpaper module');
    assert.equal(data.isColdStart, true, 'First request on worker instance should be cold start');
  });

  test('tracks warm start on subsequent requests to the same isolate', async () => {
    const req = new Request('https://worker.local/health');
    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
      ENVIRONMENT: 'testing',
    };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.isColdStart, false, 'Subsequent request should report warm start');
  });

  test('rejects webhook request with invalid secret token', async () => {
    const req = new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
      },
      body: JSON.stringify({ update_id: 1001 }),
    });

    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
      WEBHOOK_SECRET: 'my-secret-token',
    };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 401);
  });

  test('accepts webhook update non-blockingly with valid secret token', async () => {
    let backgroundPromiseHandled = false;

    const req = new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'my-secret-token',
      },
      body: JSON.stringify({
        update_id: 1002,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 123456, type: 'private' },
          from: { id: 123456, is_bot: false, first_name: 'Tester' },
          text: '/start',
        },
      }),
    });

    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
      WEBHOOK_SECRET: 'my-secret-token',
    };

    const ctx = {
      waitUntil: (p) => {
        backgroundPromiseHandled = true;
        // Suppress errors from fake bot token calling real Telegram API
        p.catch(() => {});
      },
      passThroughOnException: () => {},
    };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.update_id, 1002);
    assert.equal(backgroundPromiseHandled, true, 'Update must be dispatched non-blockingly via ctx.waitUntil');
  });

  test('returns 400 for malformed JSON webhook payload', async () => {
    const req = new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid-json{{{',
    });

    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
    };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 400);
  });

  test('dispatches /start webhook update successfully on warm isolate', async () => {
    let handledPromise = null;
    const req = new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        update_id: 1003,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 123456, type: 'private' },
          from: { id: 123456, is_bot: false, first_name: 'Tester' },
          text: '/start',
        },
      }),
    });

    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
    };
    const ctx = {
      waitUntil: (p) => {
        handledPromise = p;
        p.catch(() => {});
      },
      passThroughOnException: () => {},
    };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.update_id, 1003);
    assert.ok(handledPromise !== null, 'Should have passed update processing promise to ctx.waitUntil');
  });

  test('dispatches guest_message update non-blockingly', async () => {
    let handledPromise = null;
    const req = new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        update_id: 1004,
        guest_message: {
          message_id: 3,
          guest_query_id: 'guest_query_test_123',
          date: Math.floor(Date.now() / 1000),
          chat: { id: -100123456789, type: 'supergroup', title: 'Community' },
          guest_bot_caller_user: { id: 123456, is_bot: false, first_name: 'Tester' },
          text: '@knowfield_bot /start',
        },
      }),
    });

    const env = {
      BOT_TOKEN: '123456789:AAFakeTokenForTest123456789',
    };
    const ctx = {
      waitUntil: (p) => {
        handledPromise = p;
        p.catch(() => {});
      },
      passThroughOnException: () => {},
    };

    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.update_id, 1004);
    assert.ok(handledPromise !== null, 'Should process guest_message via ctx.waitUntil');
  });
});
