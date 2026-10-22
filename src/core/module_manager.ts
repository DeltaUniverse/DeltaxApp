/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { Bot } from 'grammy';
import type { BaseModule } from './base_module';
import type { CommandDispatcher } from './command_dispatcher';
import type { BotContext, CommandMeta, Env, ModuleConstructor } from '../types';

export type { ModuleConstructor };

export class ModuleManager {
  private readonly _modules: Map<string, BaseModule> = new Map();
  private readonly _bot: Bot<BotContext>;
  private _dispatcher?: CommandDispatcher;

  constructor(bot: Bot<BotContext>, dispatcher?: CommandDispatcher) {
    this._bot = bot;
    this._dispatcher = dispatcher;
  }

  public setDispatcher(dispatcher: CommandDispatcher): void {
    this._dispatcher = dispatcher;
    for (const mod of this._modules.values()) {
      mod.setDispatcher(dispatcher);
    }
  }

  public register(moduleOrClass: BaseModule | ModuleConstructor): this {
    let module: BaseModule;

    try {
      module = typeof moduleOrClass === 'function' ? new moduleOrClass() : moduleOrClass;
    } catch (err) {
      console.error('[ModuleManager] Failed to instantiate module class:', err);
      return this;
    }

    if (!module || typeof module.id !== 'string' || !module.id.trim()) {
      console.error(
        '[ModuleManager] Invalid module ignored: Missing or empty string `id` property.'
      );
      return this;
    }

    if (!module.enabled) {
      console.log(`[ModuleManager] Module ${module.id} is disabled, skipping.`);
      return this;
    }

    if (this._modules.has(module.id)) {
      console.warn(
        `[ModuleManager] Module "${module.id}" already registered. Overwriting with latest instance.`
      );
    }

    if (this._dispatcher) {
      module.setDispatcher(this._dispatcher);
    }

    try {
      const setupResult = module.setup();
      if (setupResult instanceof Promise) {
        setupResult.catch((err) => {
          console.error(`[ModuleManager] Async error during setup of module "${module.id}":`, err);
        });
      }
    } catch (err) {
      console.error(
        `[ModuleManager] Synchronous error during setup of module "${module.id}":`,
        err
      );
    }

    try {
      this._bot.use(module.getComposer());
      this._modules.set(module.id, module);
      console.log(
        `[ModuleManager] Loaded module: ${module.name || module.id} (${module.id}) v${module.version || '1.0.0'}`
      );
    } catch (err) {
      console.error(`[ModuleManager] Failed to mount composer for module "${module.id}":`, err);
    }

    return this;
  }

  public registerAll(modules: (BaseModule | ModuleConstructor)[]): this {
    for (const mod of modules) {
      this.register(mod);
    }
    return this;
  }

  public async initAll(env: Env): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [id, module] of this._modules.entries()) {
      initPromises.push(
        (async () => {
          try {
            await module.init(env);
          } catch (err) {
            console.error(`[ModuleManager] Error initializing module "${id}":`, err);
          }
        })()
      );
    }

    await Promise.allSettled(initPromises);
  }

  public getModules(): BaseModule[] {
    return Array.from(this._modules.values());
  }

  public getModule(id: string): BaseModule | undefined {
    return this._modules.get(id);
  }

  public async syncCommands(token: string): Promise<boolean> {
    const commandsToSync: { command: string; description: string }[] = [];

    for (const module of this._modules.values()) {
      for (const cmd of module.getCommands()) {
        commandsToSync.push({
          command: cmd.command.toLowerCase(),
          description: cmd.description.slice(0, 256),
        });
      }
    }

    if (commandsToSync.length === 0) return true;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: commandsToSync }),
      });
      const data = (await response.json()) as { ok: boolean };
      return Boolean(data?.ok);
    } catch (err) {
      console.error('[ModuleManager] Failed to sync commands with Telegram API:', err);
      return false;
    }
  }
}
