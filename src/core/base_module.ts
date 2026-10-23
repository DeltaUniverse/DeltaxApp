/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { Composer, type MiddlewareFn, type FilterQuery } from 'grammy';
import type { BotContext, CommandMeta, Env } from '../types';
import type { CommandDispatcher, CommandHandler, CommandOptions } from './command_dispatcher';
import { logger } from '../utils';

/** Base class for modules with isolated routing and command registration. */
export abstract class BaseModule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  readonly version: string = '1.0.0';
  readonly enabled: boolean = true;
  readonly forked: boolean = false;

  private readonly _composer: Composer<BotContext> = new Composer<BotContext>();
  private readonly _commands: CommandMeta[] = [];
  private _dispatcher?: CommandDispatcher;
  private readonly _pendingCommands: Array<{
    name: string | string[];
    handler: CommandHandler;
    options: CommandOptions;
  }> = [];

  public setDispatcher(dispatcher: CommandDispatcher): void {
    this._dispatcher = dispatcher;
    for (const pending of this._pendingCommands) {
      this._dispatcher.register(pending.name, pending.handler, pending.options);
    }
    this._pendingCommands.length = 0;
  }

  public async init(_env: Env): Promise<void> {}

  public abstract setup(): Promise<void> | void;

  public getComposer(): Composer<BotContext> {
    return this._composer;
  }

  public getCommands(): ReadonlyArray<CommandMeta> {
    return this._commands;
  }

  /**
   * Registers one or more command triggers with an execution handler.
   *
   * @example
   * this.command(['ping', 'p'], async (ctx) => {
   *   await ctx.respond('Pong!');
   * }, { description: 'Check bot latency' });
   */
  protected command(
    name: string | string[],
    handler: CommandHandler,
    optionsOrDesc?: string | CommandOptions
  ): this {
    const options: CommandOptions =
      typeof optionsOrDesc === 'string' ? { description: optionsOrDesc } : optionsOrDesc || {};

    const names = Array.isArray(name) ? name : [name];
    for (const cmd of names) {
      this._commands.push({
        command: cmd.replace(/^\//, ''),
        description: options.description || 'No description provided',
        moduleId: this.id,
        moduleName: this.name,
      });
    }

    if (this._dispatcher) {
      this._dispatcher.register(names, handler, options);
    } else {
      this._pendingCommands.push({ name: names, handler, options });
    }

    return this;
  }

  protected registerCommand(
    name: string | string[],
    handler: CommandHandler,
    options: CommandOptions = {}
  ): this {
    return this.command(name, handler, options);
  }

  protected on(filter: FilterQuery, handler: (ctx: BotContext) => Promise<unknown> | void): this {
    this._composer.on(filter, async (ctx, next) => {
      try {
        await handler(ctx);
      } catch (error) {
        logger.error({ err: error, module: this.id, filter: String(filter) }, 'listener error');
      }
      return next();
    });
    return this;
  }

  protected hears(
    pattern: string | RegExp,
    handler: (ctx: BotContext) => Promise<unknown> | void
  ): this {
    this._composer.hears(pattern, async (ctx) => {
      try {
        await handler(ctx);
      } catch (error) {
        logger.error(
          { err: error, module: this.id, pattern: String(pattern) },
          'hears handler error'
        );
      }
    });
    return this;
  }

  protected callbackQuery(
    trigger: string | RegExp
  ): ReturnType<Composer<BotContext>['callbackQuery']>;
  protected callbackQuery(
    trigger: string | RegExp,
    handler: (ctx: BotContext) => Promise<unknown> | void
  ): this;
  protected callbackQuery(
    trigger: string | RegExp,
    handler?: (ctx: BotContext) => Promise<unknown> | void
  ): this | ReturnType<Composer<BotContext>['callbackQuery']> {
    if (!handler) {
      return this._composer.callbackQuery(trigger);
    }
    this._composer.callbackQuery(trigger, async (ctx) => {
      try {
        await handler(ctx);
      } catch (error) {
        logger.error(
          { err: error, module: this.id, trigger: String(trigger) },
          'callback query handler error'
        );
      }
    });
    return this;
  }

  protected use(...middleware: MiddlewareFn<BotContext>[]): this {
    this._composer.use(...middleware);
    return this;
  }

  /**
   * Creates a concurrent middleware branch that runs in parallel alongside downstream middleware.
   * Utilizes grammY Composer.prototype.fork (interleaved via Promise.all).
   */
  protected fork(...middleware: MiddlewareFn<BotContext>[]): Composer<BotContext> {
    return this._composer.fork(...middleware);
  }

  /**
   * Registers an event listener on a forked concurrent branch.
   * Runs in parallel with downstream middleware without blocking execution.
   */
  protected forkOn(
    filter: FilterQuery,
    handler: (ctx: BotContext) => Promise<unknown> | void
  ): Composer<BotContext> {
    const branch = this._composer.fork();
    branch.on(filter, async (ctx, next) => {
      try {
        await handler(ctx);
      } catch (error) {
        logger.error(
          { err: error, module: this.id, filter: String(filter) },
          'forked listener error'
        );
      }
      return next();
    });
    return branch;
  }

  /**
   * Registers a text pattern matcher on a forked concurrent branch.
   */
  protected forkHears(
    pattern: string | RegExp,
    handler: (ctx: BotContext) => Promise<unknown> | void
  ): Composer<BotContext> {
    const branch = this._composer.fork();
    branch.hears(pattern, async (ctx, next) => {
      try {
        await handler(ctx);
      } catch (error) {
        logger.error(
          { err: error, module: this.id, pattern: String(pattern) },
          'forked hears handler error'
        );
      }
      return next();
    });
    return branch;
  }

  /**
   * Registers a callback query listener on a forked concurrent branch.
   */
  protected forkCallbackQuery(
    trigger: string | RegExp,
    handler: (ctx: BotContext) => Promise<unknown> | void
  ): Composer<BotContext> {
    const branch = this._composer.fork();
    branch.callbackQuery(trigger, async (ctx, next) => {
      try {
        await handler(ctx);
      } catch (error) {
        logger.error(
          { err: error, module: this.id, trigger: String(trigger) },
          'forked callback query error'
        );
      }
      return next();
    });
    return branch;
  }
}
