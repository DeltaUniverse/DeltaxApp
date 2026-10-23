/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { Bot } from 'grammy';
import type { BaseModule } from './base_module';
import type { CommandDispatcher } from './command_dispatcher';
import type { BotContext, Env, ModuleConstructor } from '../types';
import { logger } from '../utils';

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
      logger.error({ err }, 'failed to instantiate module class');
      return this;
    }

    if (!module || typeof module.id !== 'string' || !module.id.trim()) {
      logger.error('invalid module ignored: missing or empty id');
      return this;
    }

    if (!module.enabled) {
      logger.info({ moduleId: module.id }, 'module is disabled, skipping');
      return this;
    }

    if (this._modules.has(module.id)) {
      logger.warn(
        { moduleId: module.id },
        'module already registered, overwriting with latest instance'
      );
    }

    if (this._dispatcher) {
      module.setDispatcher(this._dispatcher);
    }

    try {
      const setupResult = module.setup();
      if (setupResult instanceof Promise) {
        setupResult.catch((err) => {
          logger.error({ err, moduleId: module.id }, 'async error during module setup');
        });
      }
    } catch (err) {
      logger.error({ err, moduleId: module.id }, 'synchronous error during module setup');
    }

    try {
      this._bot.use(module.getComposer());
      this._modules.set(module.id, module);
      logger.info(
        {
          moduleId: module.id,
          name: module.name || module.id,
          version: module.version || '1.0.0',
        },
        'loaded module'
      );
    } catch (err) {
      logger.error({ err, moduleId: module.id }, 'failed to mount composer for module');
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
            logger.error({ err, moduleId: id }, 'error initializing module');
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
      const data = await response.json<{ ok: boolean }>();
      return Boolean(data?.ok);
    } catch (err) {
      logger.error({ err }, 'failed to sync commands with telegram api');
      return false;
    }
  }
}
