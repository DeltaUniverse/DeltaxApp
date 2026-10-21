/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

export interface DatabaseRecord {
  id: string;
  data: string;
  updated_at: number;
}

export class Collection<T = Record<string, unknown>> {
  constructor(
    private readonly name: string,
    private readonly d1?: D1Database,
    private readonly memoryStore?: Map<string, { data: T; updatedAt: number }>
  ) {}

  public async get(id: string): Promise<T | null> {
    if (this.memoryStore?.has(id)) {
      return this.memoryStore.get(id)!.data;
    }

    if (!this.d1) return null;

    try {
      const row = await this.d1
        .prepare('SELECT data FROM documents WHERE collection = ? AND id = ?')
        .bind(this.name, id)
        .first<{ data: string }>();

      if (!row?.data) return null;
      const parsed = JSON.parse(row.data) as T;
      this.memoryStore?.set(id, { data: parsed, updatedAt: Date.now() });
      return parsed;
    } catch (err) {
      console.warn(`[Database:${this.name}] Failed to get id "${id}":`, err);
      return null;
    }
  }

  public async set(id: string, data: T): Promise<void> {
    const now = Date.now();
    this.memoryStore?.set(id, { data, updatedAt: now });

    if (!this.d1) return;

    try {
      const serialized = JSON.stringify(data);
      await this.d1
        .prepare(
          'INSERT INTO documents (collection, id, data, updated_at) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
        )
        .bind(this.name, id, serialized, now)
        .run();
    } catch (err) {
      console.error(`[Database:${this.name}] Failed to set id "${id}":`, err);
    }
  }

  public async delete(id: string): Promise<boolean> {
    this.memoryStore?.delete(id);

    if (!this.d1) return true;

    try {
      const res = await this.d1
        .prepare('DELETE FROM documents WHERE collection = ? AND id = ?')
        .bind(this.name, id)
        .run();
      return (res.meta?.changes ?? 1) > 0;
    } catch (err) {
      console.error(`[Database:${this.name}] Failed to delete id "${id}":`, err);
      return false;
    }
  }

  public async find(limit = 100): Promise<T[]> {
    if (!this.d1) {
      if (!this.memoryStore) return [];
      return Array.from(this.memoryStore.values())
        .slice(0, limit)
        .map((entry) => entry.data);
    }

    try {
      const { results } = await this.d1
        .prepare('SELECT data FROM documents WHERE collection = ? ORDER BY updated_at DESC LIMIT ?')
        .bind(this.name, limit)
        .all<{ data: string }>();

      return (results || []).map((row) => JSON.parse(row.data) as T);
    } catch (err) {
      console.error(`[Database:${this.name}] Failed to find records:`, err);
      return [];
    }
  }

  public async count(): Promise<number> {
    if (!this.d1) {
      return this.memoryStore?.size ?? 0;
    }

    try {
      const row = await this.d1
        .prepare('SELECT COUNT(*) as total FROM documents WHERE collection = ?')
        .bind(this.name)
        .first<{ total: number }>();
      return row?.total ?? 0;
    } catch (err) {
      console.error(`[Database:${this.name}] Failed to count records:`, err);
      return 0;
    }
  }
}

export class DatabaseService {
  private readonly _collections: Map<string, Collection<any>> = new Map();
  private readonly _memoryCollections: Map<string, Map<string, { data: any; updatedAt: number }>> = new Map();
  private readonly _settingsCache: Map<string, string> = new Map();
  private _tablesInitialized = false;

  constructor(private readonly _d1?: D1Database) {}

  public async init(): Promise<void> {
    if (this._tablesInitialized || !this._d1) return;

    try {
      await this._d1.batch([
        this._d1.prepare(
          'CREATE TABLE IF NOT EXISTS settings (' +
            'key TEXT PRIMARY KEY, ' +
            'value TEXT NOT NULL, ' +
            'updated_at INTEGER NOT NULL' +
            ')'
        ),
        this._d1.prepare(
          'CREATE TABLE IF NOT EXISTS documents (' +
            'collection TEXT NOT NULL, ' +
            'id TEXT NOT NULL, ' +
            'data TEXT NOT NULL, ' +
            'updated_at INTEGER NOT NULL, ' +
            'PRIMARY KEY (collection, id)' +
            ')'
        ),
      ]);
      this._tablesInitialized = true;
    } catch (err) {
      console.error('[DatabaseService] Failed to initialize database tables:', err);
    }
  }

  public collection<T = Record<string, unknown>>(name: string): Collection<T> {
    const key = name.toLowerCase();
    if (this._collections.has(key)) {
      return this._collections.get(key) as Collection<T>;
    }

    let memMap = this._memoryCollections.get(key);
    if (!memMap) {
      memMap = new Map();
      this._memoryCollections.set(key, memMap);
    }

    const coll = new Collection<T>(key, this._d1, memMap);
    this._collections.set(key, coll);
    return coll;
  }

  public async getSetting(key: string, defaultValue?: string): Promise<string | null> {
    if (this._settingsCache.has(key)) {
      return this._settingsCache.get(key)!;
    }

    if (!this._d1) {
      return defaultValue ?? null;
    }

    try {
      const row = await this._d1
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind(key)
        .first<{ value: string }>();

      if (row?.value !== undefined && row?.value !== null) {
        this._settingsCache.set(key, row.value);
        return row.value;
      }
    } catch (err) {
      console.warn(`[DatabaseService] Failed to get setting "${key}":`, err);
    }

    return defaultValue ?? null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    const now = Date.now();
    this._settingsCache.set(key, value);

    if (!this._d1) return;

    try {
      await this._d1
        .prepare(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
        )
        .bind(key, value, now)
        .run();
    } catch (err) {
      console.error(`[DatabaseService] Failed to set setting "${key}":`, err);
    }
  }

  public async deleteSetting(key: string): Promise<boolean> {
    this._settingsCache.delete(key);

    if (!this._d1) return true;

    try {
      const res = await this._d1.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
      return (res.meta?.changes ?? 1) > 0;
    } catch (err) {
      console.error(`[DatabaseService] Failed to delete setting "${key}":`, err);
      return false;
    }
  }

  public get raw(): D1Database | undefined {
    return this._d1;
  }
}
