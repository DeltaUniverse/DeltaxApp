/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { BotContext } from '../types';
import { PrefixService, isOwner, escapeRegex } from './prefix_service';

export const HTML_TAGS = [
  '<blockquote',
  '<b>',
  '<code>',
  '<pre',
  '<i>',
  '<spoiler',
  '<u>',
  '<s>',
  '<a ',
];

export function hasHtmlTags(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return HTML_TAGS.some((tag) => lower.includes(tag));
}

export interface CommandOptions {
  description?: string;
  usage?: string;
  aliases?: string[];
  ownerOnly?: boolean;
}

export interface CommandContext extends BotContext {
  command: string;
  prefix: string;
  input: string;
  args: string[];
  replyMsg?: any;
  isOwner: boolean;
  isGuest: boolean;
  respond: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<unknown> | unknown;

interface RegisteredCommand {
  names: string[];
  primaryName: string;
  handler: CommandHandler;
  options: CommandOptions;
}

export class CommandDispatcher {
  private readonly _commands: Map<string, RegisteredCommand> = new Map();
  private readonly _commandList: RegisteredCommand[] = [];

  public register(
    names: string | string[],
    handler: CommandHandler,
    options: CommandOptions = {}
  ): void {
    const rawNames = Array.isArray(names) ? names : [names];
    const allNames = [
      ...rawNames.map((n) => n.toLowerCase().trim()),
      ...(options.aliases || []).map((a) => a.toLowerCase().trim()),
    ];
    const primaryName = allNames[0];

    const regCmd: RegisteredCommand = {
      names: allNames,
      primaryName,
      handler,
      options,
    };

    for (const name of allNames) {
      this._commands.set(name, regCmd);
    }
    this._commandList.push(regCmd);
  }

  public getCommands(): Array<{ command: string; description: string; usage?: string }> {
    return this._commandList.map((c) => ({
      command: c.primaryName,
      description: c.options.description || 'No description provided',
      usage: c.options.usage,
    }));
  }

  public async dispatch(ctx: BotContext): Promise<boolean> {
    const rawText = ctx.msg?.text || '';
    if (!rawText.trim()) return false;

    const isGuest = Boolean((ctx.msg as any)?.guest_bot_caller_user || ctx.update?.guest_message);
    const botUsername = ctx.me?.username || 'deltaxapp';
    const activePrefix = isGuest
      ? await PrefixService.getGuestPrefix(ctx.env)
      : await PrefixService.getBotPrefix(ctx.env);

    const parsed = this.parseCommand(rawText, botUsername, activePrefix);
    if (!parsed) {
      return false;
    }

    const { commandName, input, prefixUsed } = parsed;
    const regCmd = this._commands.get(commandName.toLowerCase());
    if (!regCmd) {
      return false;
    }

    const replyMsg = (ctx.msg as any)?.reply_to_message;
    const isSenderOwner = isOwner(ctx);
    const args = input.trim() ? input.trim().split(/\s+/) : [];

    const cmdCtx: CommandContext = Object.assign(ctx, {
      command: commandName,
      prefix: prefixUsed,
      input,
      args,
      replyMsg,
      isOwner: isSenderOwner,
      isGuest,
      respond: async (text: string, options?: Record<string, unknown>) => {
        const isHtml = hasHtmlTags(text);
        const parseMode = isHtml ? 'HTML' : undefined;

        if (isGuest) {
          const caller = (ctx.msg as any)?.guest_bot_caller_user || ctx.from;
          const title = caller?.first_name || 'Delta';
          return await ctx.answerGuestQuery({
            type: 'article',
            id: `guest_cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title,
            description: text.replace(/<[^>]*>/g, '').substring(0, 100),
            input_message_content: {
              message_text: text,
              parse_mode: parseMode,
            },
            reply_markup: options?.reply_markup as any,
          });
        }

        const replyParameters = ctx.msg?.message_id ? { message_id: ctx.msg.message_id } : undefined;
        return await ctx.reply(text, {
          parse_mode: parseMode,
          reply_parameters: replyParameters,
          ...options,
        });
      },
    });

    if (regCmd.options.ownerOnly && !isSenderOwner) {
      await cmdCtx.respond(
        '⚠️ <b>Access Denied:</b> Only the bot owner can execute this command.\n\n<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>'
      );
      return true;
    }

    try {
      const result = await regCmd.handler(cmdCtx);
      if (typeof result === 'string') {
        await cmdCtx.respond(result);
      }
      return true;
    } catch (error) {
      console.error(`[CommandDispatcher] Error executing command "${commandName}":`, error);
      await cmdCtx.respond('⚠️ An error occurred while executing this command.');
      return true;
    }
  }

  public parseCommand(
    text: string,
    botUsername: string,
    activePrefix: string
  ): { commandName: string; input: string; prefixUsed: string } | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Strict prefix enforcement:
    // When activePrefix is custom (e.g. '!'), ONLY that prefix is accepted.
    // Fallback '/' is only permitted for the built-in Telegram UI /start button.
    const prefixes = [activePrefix];
    const isTelegramStartButton =
      activePrefix !== '/' &&
      (/^\/start(?:@\w+)?(?:\s+|$)/i.test(trimmed) ||
        new RegExp(`^@${botUsername}\\s+/start(?:\\s+|$)`, 'i').test(trimmed));

    if (isTelegramStartButton) {
      prefixes.push('/');
    }

    for (const p of prefixes) {
      const escP = escapeRegex(p);

      const directMatch = trimmed.match(
        new RegExp(`^${escP}([a-zA-Z0-9_]+)(?:@${botUsername})?(?:\\s+([\\s\\S]*)|$)`, 'i')
      );
      if (directMatch) {
        const cmdName = directMatch[1].toLowerCase();
        if (p === '/' && activePrefix !== '/' && cmdName !== 'start') {
          continue;
        }
        return {
          commandName: directMatch[1],
          input: (directMatch[2] || '').trim(),
          prefixUsed: p,
        };
      }

      const mentionMatch = trimmed.match(
        new RegExp(`^@${botUsername}\\s+${escP}([a-zA-Z0-9_]+)(?:\\s+([\\s\\S]*)|$)`, 'i')
      );
      if (mentionMatch) {
        const cmdName = mentionMatch[1].toLowerCase();
        if (p === '/' && activePrefix !== '/' && cmdName !== 'start') {
          continue;
        }
        return {
          commandName: mentionMatch[1],
          input: (mentionMatch[2] || '').trim(),
          prefixUsed: p,
        };
      }
    }

    return null;
  }
}
