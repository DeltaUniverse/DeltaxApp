/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import type { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';
import { PrefixService, isOwner, escapeRegex } from './prefix_service';
import { stripHtml } from '../html';
import { HTML_TAGS, hasHtmlTags, type MessageLike } from '../utils/telegram';
import { logger } from '../utils';

export { HTML_TAGS, hasHtmlTags };

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
  replyMsg?: MessageLike | null;
  isOwner: boolean;
  isGuest: boolean;
  respond: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<unknown> | void;

interface RegisteredCommand {
  names: string[];
  primaryName: string;
  handler: CommandHandler;
  options: CommandOptions;
}

/** Dispatches bot commands matching active prefix to registered handlers. */
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

  public getRegisteredCommandNames(): string[] {
    return Array.from(this._commands.keys());
  }

  public async dispatch(ctx: BotContext): Promise<boolean> {
    const rawText = ctx.msg?.text || '';
    if (!rawText.trim()) return false;

    const msg = ctx.msg as MessageLike | undefined;
    const isGuest = Boolean(msg?.guest_bot_caller_user || ctx.update?.guest_message);
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

    const usernames = new Set<string>();
    if (botUsername) usernames.add(botUsername.toLowerCase());
    usernames.add('deltaxapp');

    const replyMsg = msg?.reply_to_message;
    const isSenderOwner = isOwner(ctx);
    const args = input.trim()
      ? input
          .trim()
          .split(/\s+/)
          .filter((arg) => !usernames.has(arg.replace(/^@/, '').toLowerCase()))
      : [];

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
          const caller = msg?.guest_bot_caller_user || ctx.from;
          const title = caller?.first_name || 'Delta';
          return await ctx.answerGuestQuery({
            type: 'article',
            id: `guest_cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title,
            description: stripHtml(text).substring(0, 100),
            input_message_content: {
              message_text: text,
              parse_mode: parseMode,
            },
            reply_markup: options?.reply_markup as InlineKeyboard | undefined,
          });
        }

        const replyParameters = ctx.msg?.message_id
          ? { message_id: ctx.msg.message_id }
          : undefined;
        return await ctx.reply(text, {
          parse_mode: parseMode,
          reply_parameters: replyParameters,
          ...options,
        });
      },
    });

    if (regCmd.options.ownerOnly && !isSenderOwner) {
      await cmdCtx.respond(`⚠️ <b>Access Denied:</b> Only the bot owner can execute this command.`);
      return true;
    }

    try {
      const result = await regCmd.handler(cmdCtx);
      if (typeof result === 'string') {
        await cmdCtx.respond(result);
      }
      return true;
    } catch (error) {
      logger.error({ err: error, command: commandName }, 'command execution error');
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

    // Only the configured activePrefix is accepted.
    const p = activePrefix || '/';
    const escP = escapeRegex(p);

    const usernames = new Set<string>();
    if (botUsername) usernames.add(botUsername.toLowerCase());
    usernames.add('deltaxapp');

    const usernamePattern = Array.from(usernames).map(escapeRegex).join('|');

    const cleanInput = (rawInput: string): string => {
      let cleaned = rawInput;
      for (const u of usernames) {
        const r = new RegExp(`(^|\\s+)@${escapeRegex(u)}(?=\\s|$|[?#])`, 'gi');
        cleaned = cleaned.replace(r, ' ');
      }
      return cleaned.replace(/\s+/g, ' ').trim();
    };

    const directMatch = trimmed.match(
      new RegExp(`^${escP}([a-zA-Z0-9_]+)(?:@(?:${usernamePattern}))?(?:\\s+([\\s\\S]*)|$)`, 'i')
    );
    if (directMatch) {
      return {
        commandName: directMatch[1],
        input: cleanInput(directMatch[2] || ''),
        prefixUsed: p,
      };
    }

    const mentionMatch = trimmed.match(
      new RegExp(`^@(?:${usernamePattern})\\s+${escP}([a-zA-Z0-9_]+)(?:\\s+([\\s\\S]*)|$)`, 'i')
    );
    if (mentionMatch) {
      return {
        commandName: mentionMatch[1],
        input: cleanInput(mentionMatch[2] || ''),
        prefixUsed: p,
      };
    }

    return null;
  }
}
