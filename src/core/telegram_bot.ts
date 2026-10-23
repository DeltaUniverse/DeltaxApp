/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { Composer } from 'grammy';
import { Bot, type MiddlewareFn } from 'grammy';
import type { Update } from 'grammy/types';
import { FormattedString } from '@grammyjs/parse-mode';
import { ModuleManager, type ModuleConstructor } from './module_manager';
import { CommandDispatcher } from './command_dispatcher';
import { DatabaseService } from './database';
import { PrefixService } from './prefix_service';
import { classifyGuestMessage } from './guest_router';
import { isGuestMode } from '../utils/telegram';
import type { BaseModule } from './base_module';
import type { BotContext, Env } from '../types';
import { ROUTES, BOT_CONFIG, HTTP_HEADERS } from '../config';
import { logger } from '../utils';

export const GUEST_FOOTER =
  '<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>';

export function injectGuestFooter(result: unknown): void {
  if (!result || typeof result !== 'object') return;
  const res = result as Record<string, unknown>;

  if (res.input_message_content && typeof res.input_message_content === 'object') {
    const imc = res.input_message_content as Record<string, unknown>;
    if (typeof imc.message_text === 'string' && imc.message_text.trim()) {
      if (!imc.message_text.includes('deltadiscuss')) {
        imc.message_text = `${imc.message_text.trimEnd()}\n\n${GUEST_FOOTER}`;
        imc.parse_mode = 'HTML';
      }
    }
    if (imc.rich_message && typeof imc.rich_message === 'object') {
      const rm = imc.rich_message as Record<string, unknown>;
      if (typeof rm.html === 'string' && rm.html.trim()) {
        if (!rm.html.includes('deltadiscuss')) {
          rm.html = `${rm.html.trimEnd()}\n\n${GUEST_FOOTER}`;
        }
      }
    }
  }

  if (typeof res.caption === 'string' && res.caption.trim()) {
    if (!res.caption.includes('deltadiscuss')) {
      res.caption = `${res.caption.trimEnd()}\n\n${GUEST_FOOTER}`;
      res.parse_mode = 'HTML';
    }
  }
}

/** Serverless Telegram Bot engine handling webhooks, dispatching, and lifecycle. */
export class TelegramBotServer {
  private readonly _bot: Bot<BotContext>;
  private readonly _commandDispatcher: CommandDispatcher;
  private readonly _moduleManager: ModuleManager;
  private _db?: DatabaseService;
  private _isInitialized: boolean = false;
  private readonly _startTime: number = Date.now();

  private _currentRequest?: Request;
  private _currentEnv?: Env;
  private _currentExecutionCtx?: ExecutionContext;
  private _isColdStart: boolean = true;
  private _currentIsColdStart: boolean = true;

  constructor(token: string) {
    this._bot = new Bot<BotContext>(token, {
      client: {
        canUseWebhookReply: () => false,
      },
    });

    this._bot.api.config.use(async (prev, method, payload, signal) => {
      if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;

        if (method === 'answerGuestQuery' && p.result) {
          injectGuestFooter(p.result);
        }

        if (method === 'editMessageText' && typeof p.inline_message_id === 'string') {
          if (typeof p.text === 'string' && p.text.trim() && !p.text.includes('deltadiscuss')) {
            p.text = `${p.text.trimEnd()}\n\n${GUEST_FOOTER}`;
            p.parse_mode = 'HTML';
          }
        }

        if (
          ('text' in p || 'caption' in p) &&
          !('parse_mode' in p) &&
          !('entities' in p) &&
          !('caption_entities' in p)
        ) {
          p.parse_mode = BOT_CONFIG.DEFAULT_PARSE_MODE;
        }
      }

      try {
        return await prev(method, payload, signal);
      } catch (err: unknown) {
        const errObj = err as { description?: string; message?: string } | null;
        const errMsg = String(errObj?.description || errObj?.message || '');
        if (errMsg.toLowerCase().includes("can't parse entities")) {
          if (payload && typeof payload === 'object') {
            const p = { ...(payload as Record<string, unknown>) };
            delete p.parse_mode;
            if (Array.isArray(p.media)) {
              p.media = (p.media as Array<Record<string, unknown>>).map((m) => {
                const item = { ...m };
                delete item.parse_mode;
                return item;
              });
            }
            return await prev(method, p as unknown as typeof payload, signal);
          }
        }
        throw err;
      }
    });

    this._commandDispatcher = new CommandDispatcher();
    this._moduleManager = new ModuleManager(this._bot, this._commandDispatcher);

    this._bot.use(async (ctx, next) => {
      if (this._currentEnv) {
        ctx.env = this._currentEnv;
      }
      ctx.db = this._db || new DatabaseService(this._currentEnv?.DB);
      if (this._currentRequest) {
        ctx.request = this._currentRequest;
        ctx.cf = (this._currentRequest as unknown as { cf?: Record<string, unknown> }).cf;
      }
      ctx.isColdStart = this._currentIsColdStart;
      ctx.modules = this._moduleManager.getModules().map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        version: m.version,
        commands: m.getCommands().map((c) => c.command),
        commandDetails: m.getCommands().map((c) => ({
          command: c.command,
          description: c.description,
        })),
      }));

      if (this._currentExecutionCtx) {
        ctx.executionCtx = this._currentExecutionCtx;
        ctx.waitUntil = (promise: Promise<unknown>) =>
          this._currentExecutionCtx!.waitUntil(promise);
      } else {
        ctx.waitUntil = (promise: Promise<unknown>) => {
          promise.catch((err) => logger.error({ err }, 'non-blocking task error'));
        };
      }

      const originalReply = ctx.reply.bind(ctx);
      ctx.reply = (textOrFmt: unknown, other?: Record<string, unknown>) => {
        if (textOrFmt instanceof FormattedString) {
          return originalReply(textOrFmt.text, {
            entities: textOrFmt.entities,
            ...other,
          });
        }
        return originalReply(textOrFmt as string, other);
      };

      if (typeof ctx.answerGuestQuery === 'function') {
        const originalAnswerGuestQuery = ctx.answerGuestQuery.bind(ctx);
        ctx.answerGuestQuery = (...args: Parameters<typeof originalAnswerGuestQuery>) => {
          injectGuestFooter(args[0]);
          return originalAnswerGuestQuery(...args);
        };
      }

      if (typeof ctx.api?.editMessageTextInline === 'function') {
        const originalEditInline = ctx.api.editMessageTextInline.bind(ctx.api);
        ctx.api.editMessageTextInline = (...args: Parameters<typeof originalEditInline>) => {
          const [inlineId, textOrRich, other, signal] = args;
          let finalText = textOrRich;
          let finalOther = other;
          if (
            typeof textOrRich === 'string' &&
            textOrRich.trim() &&
            !textOrRich.includes('deltadiscuss')
          ) {
            finalText = `${textOrRich.trimEnd()}\n\n${GUEST_FOOTER}`;
            finalOther = { ...other, parse_mode: 'HTML' };
          }
          return originalEditInline(inlineId, finalText, finalOther, signal);
        };
      }

      return next();
    });

    // Guest message classifier middleware: classifies guest message intent into ctx.guest
    this._bot.use(async (ctx, next) => {
      if (isGuestMode(ctx)) {
        const guestPrefix = await PrefixService.getGuestPrefix(ctx.env);
        const commandNames = this._commandDispatcher.getRegisteredCommandNames();
        classifyGuestMessage(ctx, commandNames, guestPrefix);
      }
      return next();
    });

    // Central command dispatcher interceptor: strictly parses prefix & handles command
    this._bot.use(async (ctx, next) => {
      if (ctx.msg?.text) {
        const handled = await this._commandDispatcher.dispatch(ctx);
        if (handled) {
          return;
        }
      }
      return next();
    });

    this.setupErrorHandling();
  }

  public get bot(): Bot<BotContext> {
    return this._bot;
  }

  /**
   * Registers concurrent middleware or returns a forked Composer branch
   * that runs in parallel alongside downstream handlers.
   */
  public fork(...middleware: MiddlewareFn<BotContext>[]): Composer<BotContext> {
    return this._bot.fork(...middleware);
  }

  public get moduleManager(): ModuleManager {
    return this._moduleManager;
  }

  public get commandDispatcher(): CommandDispatcher {
    return this._commandDispatcher;
  }

  public get db(): DatabaseService | undefined {
    return this._db;
  }

  public registerModules(modules: (BaseModule | ModuleConstructor)[]): this {
    this._moduleManager.registerAll(modules);
    return this;
  }

  public async initialize(env: Env, executionCtx?: ExecutionContext): Promise<void> {
    this._currentEnv = env;
    this._currentExecutionCtx = executionCtx;

    if (!this._isInitialized) {
      try {
        await this._bot.init();
      } catch {
        this._bot.botInfo = {
          id: 123456789,
          is_bot: true,
          first_name: 'Delta',
          username: 'deltaxapp',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: true,
          can_connect_to_business: false,
          has_main_web_app: false,
          has_topics_enabled: false,
          allows_users_to_create_topics: false,
          can_manage_bots: false,
          supports_join_request_queries: false,
        };
      }

      await this._moduleManager.initAll(env);
      this._isInitialized = true;
    }
  }

  private setupErrorHandling(): void {
    this._bot.catch((err) => {
      const ctx = err.ctx;
      logger.error({ err: err.error, updateId: ctx.update.update_id }, 'error handling update');
    });
  }

  public async handleRequest(
    request: Request,
    env: Env,
    executionCtx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    this._currentRequest = request;
    this._currentEnv = env;
    this._currentExecutionCtx = executionCtx;
    this._currentIsColdStart = this._isColdStart;
    this._isColdStart = false;

    if (!this._db || this._db.raw !== env.DB) {
      this._db = new DatabaseService(env.DB);
      if (executionCtx && typeof executionCtx.waitUntil === 'function') {
        executionCtx.waitUntil(this._db.init());
      }
    }

    await this.initialize(env, executionCtx);

    if (url.pathname === ROUTES.ROOT || url.pathname === ROUTES.HEALTH) {
      return this.handleHealthCheck(request, env);
    }

    if (url.pathname === ROUTES.SET_WEBHOOK) {
      return this.handleSetWebhook(request, env);
    }

    if (url.pathname === ROUTES.GET_WEBHOOK_INFO) {
      return this.handleGetWebhookInfo();
    }

    if (url.pathname === ROUTES.DELETE_WEBHOOK) {
      return this.handleDeleteWebhook();
    }

    if (request.method === 'POST') {
      if (env.WEBHOOK_SECRET) {
        const receivedToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (receivedToken !== env.WEBHOOK_SECRET) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: HTTP_HEADERS.JSON,
          });
        }
      }

      let update: Record<string, unknown>;
      try {
        update = await request.json<Record<string, unknown>>();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }), {
          status: 400,
          headers: HTTP_HEADERS.JSON,
        });
      }

      const handlePromise = this._bot.handleUpdate(update as unknown as Update);
      executionCtx.waitUntil(handlePromise);

      return new Response(JSON.stringify({ ok: true, update_id: update.update_id }), {
        status: 200,
        headers: HTTP_HEADERS.JSON,
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: HTTP_HEADERS.JSON,
    });
  }

  public handleHealthCheck(request: Request, env: Env): Response {
    const cf = (request as unknown as { cf?: Record<string, unknown> }).cf;
    const uptimeSeconds = Math.floor((Date.now() - this._startTime) / 1000);
    const botInfo = this._bot.isInited() ? this._bot.botInfo : undefined;

    const modules = this._moduleManager.getModules().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      version: m.version,
      commands: m.getCommands().map((c) => `/${c.command}`),
    }));

    const responseBody = {
      status: 'online',
      version: BOT_CONFIG.VERSION,
      bot: {
        id: botInfo?.id,
        username: botInfo?.username,
        firstName: botInfo?.first_name,
      },
      runtime: BOT_CONFIG.RUNTIME,
      environment: env.ENVIRONMENT || BOT_CONFIG.DEFAULT_ENVIRONMENT,
      uptime: `${uptimeSeconds}s`,
      isColdStart: this._currentIsColdStart,
      edge: {
        colo: cf?.colo || 'Local/Dev',
        country: cf?.country || 'Unknown',
        city: cf?.city || 'Unknown',
      },
      modulesCount: modules.length,
      modules,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(responseBody, null, 2), {
      status: 200,
      headers: HTTP_HEADERS.JSON,
    });
  }

  private async handleSetWebhook(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const webhookUrl = env.WEBHOOK_URL || `${url.origin}${ROUTES.WEBHOOK}`;
      const secretToken = env.WEBHOOK_SECRET;

      const result = await this._bot.api.setWebhook(webhookUrl, {
        secret_token: secretToken,
        drop_pending_updates: false,
      });

      await this._moduleManager.syncCommands(env.BOT_TOKEN);

      return new Response(
        JSON.stringify(
          { ok: true, message: 'Webhook registered successfully', result, webhookUrl },
          null,
          2
        ),
        { status: 200, headers: HTTP_HEADERS.JSON }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ ok: false, error: message }, null, 2), {
        status: 500,
        headers: HTTP_HEADERS.JSON,
      });
    }
  }

  private async handleGetWebhookInfo(): Promise<Response> {
    try {
      const info = await this._bot.api.getWebhookInfo();
      return new Response(JSON.stringify({ ok: true, webhook_info: info }, null, 2), {
        status: 200,
        headers: HTTP_HEADERS.JSON,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ ok: false, error: message }, null, 2), {
        status: 500,
        headers: HTTP_HEADERS.JSON,
      });
    }
  }

  private async handleDeleteWebhook(): Promise<Response> {
    try {
      const result = await this._bot.api.deleteWebhook();
      return new Response(
        JSON.stringify({ ok: true, message: 'Webhook deleted', result }, null, 2),
        { status: 200, headers: HTTP_HEADERS.JSON }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ ok: false, error: message }, null, 2), {
        status: 500,
        headers: HTTP_HEADERS.JSON,
      });
    }
  }
}
