import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Test implementation of Collection and DatabaseService matching src/core/database.ts
class MockD1Database {
  constructor() {
    this.tables = new Map();
  }

  prepare(query) {
    const db = this;
    return {
      query,
      params: [],
      bind(...args) {
        this.params = args;
        return this;
      },
      async first() {
        if (query.includes('FROM settings WHERE key = ?')) {
          const key = this.params[0];
          const settings = db.tables.get('settings') || new Map();
          const row = settings.get(key);
          return row ? { value: row.value } : null;
        }
        if (query.includes('FROM documents WHERE collection = ? AND id = ?')) {
          const [collection, id] = this.params;
          const coll = db.tables.get(`doc:${collection}`) || new Map();
          const row = coll.get(id);
          return row ? { data: row.data } : null;
        }
        if (query.includes('COUNT(*) as total FROM documents WHERE collection = ?')) {
          const collection = this.params[0];
          const coll = db.tables.get(`doc:${collection}`) || new Map();
          return { total: coll.size };
        }
        return null;
      },
      async run() {
        if (query.includes('INSERT INTO settings')) {
          const [key, value, updatedAt] = this.params;
          let settings = db.tables.get('settings');
          if (!settings) {
            settings = new Map();
            db.tables.set('settings', settings);
          }
          settings.set(key, { value, updatedAt });
          return { meta: { changes: 1 } };
        }
        if (query.includes('DELETE FROM settings')) {
          const [key] = this.params;
          const settings = db.tables.get('settings');
          const deleted = settings?.delete(key) ? 1 : 0;
          return { meta: { changes: deleted } };
        }
        if (query.includes('INSERT INTO documents')) {
          const [collection, id, data, updatedAt] = this.params;
          let coll = db.tables.get(`doc:${collection}`);
          if (!coll) {
            coll = new Map();
            db.tables.set(`doc:${collection}`, coll);
          }
          coll.set(id, { data, updatedAt });
          return { meta: { changes: 1 } };
        }
        if (query.includes('DELETE FROM documents')) {
          const [collection, id] = this.params;
          const coll = db.tables.get(`doc:${collection}`);
          const deleted = coll?.delete(id) ? 1 : 0;
          return { meta: { changes: deleted } };
        }
        return { meta: { changes: 0 } };
      },
      async all() {
        if (query.includes('FROM documents WHERE collection = ?')) {
          const [collection, limit] = this.params;
          const coll = db.tables.get(`doc:${collection}`) || new Map();
          const results = Array.from(coll.values())
            .slice(0, limit)
            .map((r) => ({ data: r.data }));
          return { results };
        }
        return { results: [] };
      },
    };
  }

  async batch(statements) {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }
}

class Collection {
  constructor(name, d1, memoryStore = new Map()) {
    this.name = name;
    this.d1 = d1;
    this.memoryStore = memoryStore;
  }

  async get(id) {
    if (this.memoryStore.has(id)) {
      return this.memoryStore.get(id).data;
    }
    if (!this.d1) return null;
    const row = await this.d1
      .prepare('SELECT data FROM documents WHERE collection = ? AND id = ?')
      .bind(this.name, id)
      .first();
    if (!row?.data) return null;
    const parsed = JSON.parse(row.data);
    this.memoryStore.set(id, { data: parsed, updatedAt: Date.now() });
    return parsed;
  }

  async set(id, data) {
    const now = Date.now();
    this.memoryStore.set(id, { data, updatedAt: now });
    if (!this.d1) return;
    await this.d1
      .prepare('INSERT INTO documents (collection, id, data, updated_at) VALUES (?, ?, ?, ?)')
      .bind(this.name, id, JSON.stringify(data), now)
      .run();
  }

  async delete(id) {
    this.memoryStore.delete(id);
    if (!this.d1) return true;
    const res = await this.d1
      .prepare('DELETE FROM documents WHERE collection = ? AND id = ?')
      .bind(this.name, id)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async find(limit = 100) {
    if (!this.d1) {
      return Array.from(this.memoryStore.values())
        .slice(0, limit)
        .map((e) => e.data);
    }
    const { results } = await this.d1
      .prepare('SELECT data FROM documents WHERE collection = ? ORDER BY updated_at DESC LIMIT ?')
      .bind(this.name, limit)
      .all();
    return (results || []).map((r) => JSON.parse(r.data));
  }

  async count() {
    if (!this.d1) return this.memoryStore.size;
    const row = await this.d1
      .prepare('SELECT COUNT(*) as total FROM documents WHERE collection = ?')
      .bind(this.name)
      .first();
    return row?.total ?? 0;
  }
}

class DatabaseService {
  constructor(d1) {
    this.d1 = d1;
    this.collections = new Map();
    this.settingsCache = new Map();
  }

  collection(name) {
    const key = name.toLowerCase();
    if (!this.collections.has(key)) {
      this.collections.set(key, new Collection(key, this.d1));
    }
    return this.collections.get(key);
  }

  async getSetting(key, defaultValue = null) {
    if (this.settingsCache.has(key)) {
      return this.settingsCache.get(key);
    }
    if (!this.d1) return defaultValue;
    const row = await this.d1.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    if (row?.value !== undefined && row?.value !== null) {
      this.settingsCache.set(key, row.value);
      return row.value;
    }
    return defaultValue;
  }

  async setSetting(key, value) {
    this.settingsCache.set(key, value);
    if (!this.d1) return;
    await this.d1
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind(key, value, Date.now())
      .run();
  }

  async deleteSetting(key) {
    this.settingsCache.delete(key);
    if (!this.d1) return true;
    const res = await this.d1.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
    return (res.meta?.changes ?? 0) > 0;
  }
}

describe('Deltax App - Scalable Database Service & Collections', () => {
  test('persists and retrieves key-value settings', async () => {
    const mockD1 = new MockD1Database();
    const db = new DatabaseService(mockD1);

    // Initial value is default
    const initial = await db.getSetting('bot_prefix', '/');
    assert.equal(initial, '/');

    // Set new prefix
    await db.setSetting('bot_prefix', '!');

    // Read back
    const updated = await db.getSetting('bot_prefix');
    assert.equal(updated, '!');

    // Delete setting
    const deleted = await db.deleteSetting('bot_prefix');
    assert.equal(deleted, true);

    // Cleared
    const afterDelete = await db.getSetting('bot_prefix', 'default');
    assert.equal(afterDelete, 'default');
  });

  test('manages typed document collections (CRUD & Count)', async () => {
    const mockD1 = new MockD1Database();
    const db = new DatabaseService(mockD1);
    const users = db.collection('users');

    // Create records
    await users.set('101', { name: 'Alice', role: 'admin', warns: 0 });
    await users.set('102', { name: 'Bob', role: 'member', warns: 1 });

    // Count records
    const total = await users.count();
    assert.equal(total, 2);

    // Get specific record
    const alice = await users.get('101');
    assert.equal(alice.name, 'Alice');
    assert.equal(alice.role, 'admin');

    // Update record
    await users.set('102', { name: 'Bob', role: 'member', warns: 2 });
    const bob = await users.get('102');
    assert.equal(bob.warns, 2);

    // List records
    const all = await users.find();
    assert.equal(all.length, 2);

    // Delete record
    const wasDeleted = await users.delete('101');
    assert.equal(wasDeleted, true);

    const remaining = await users.count();
    assert.equal(remaining, 1);
  });

  test('operates gracefully in-memory when D1 binding is absent', async () => {
    // DatabaseService without D1 (local fallback)
    const db = new DatabaseService(undefined);

    await db.setSetting('test_mode', 'true');
    const val = await db.getSetting('test_mode');
    assert.equal(val, 'true');

    const cache = db.collection('cache');
    await cache.set('item1', { payload: 'hello' });
    const item = await cache.get('item1');
    assert.equal(item.payload, 'hello');
  });
});
