/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { Bot, GrammyError, HttpError } from 'grammy';
import { FormattedString } from '@grammyjs/parse-mode';
import { ModuleManager, type ModuleConstructor } from './module_manager';
import { CommandDispatcher } from './command_dispatcher';
import { DatabaseService } from './database';
import type { BaseModule } from './base_module';
import type { BotContext, Env } from '../types';
import { ROUTES, BOT_CONFIG, HTTP_HEADERS } from '../config';

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
      } catch (err: any) {
        const errMsg = String(err?.description || err?.message || '');
        if (errMsg.toLowerCase().includes("can't parse entities")) {
          if (payload && typeof payload === 'object') {
            const p = { ...(payload as Record<string, unknown>) };
            delete p.parse_mode;
            if (Array.isArray(p.media)) {
              p.media = p.media.map((m: any) => {
                const item = { ...m };
                delete item.parse_mode;
                return item;
              });
            }
            return await prev(method, p as any, signal);
          }
        }
        throw err;
      }
    });

    this._commandDispatcher = new CommandDispatcher();
    this._moduleManager = new ModuleManager(this._bot, this._commandDispatcher);

    // Root context enrichment
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
      }));

      if (this._currentExecutionCtx) {
        ctx.executionCtx = this._currentExecutionCtx;
        ctx.waitUntil = (promise: Promise<unknown>) =>
          this._currentExecutionCtx!.waitUntil(promise);
      } else {
        ctx.waitUntil = (promise: Promise<unknown>) => {
          promise.catch((err) => console.error('[NonBlocking Task Error]:', err));
        };
      }

      const originalReply = ctx.reply.bind(ctx);
      ctx.reply = ((textOrFmt: unknown, other?: Record<string, unknown>) => {
        if (textOrFmt instanceof FormattedString) {
          return originalReply(textOrFmt.text, {
            entities: textOrFmt.entities,
            ...other,
          });
        }
        return originalReply(textOrFmt as string, other);
      }) as typeof ctx.reply;

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
      } catch (err) {
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
      console.error(`[TelegramBotServer] Error on update ${ctx.update.update_id}:`, err.error);
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
        update = (await request.json()) as Record<string, unknown>;
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }), {
          status: 400,
          headers: HTTP_HEADERS.JSON,
        });
      }

      const handlePromise = this._bot.handleUpdate(update as any);
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
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
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
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
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
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
        status: 500,
        headers: HTTP_HEADERS.JSON,
      });
    }
  }
}
