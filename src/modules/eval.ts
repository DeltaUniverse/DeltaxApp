/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { BaseModule, type CommandContext } from '../core';
import { escapeHtml } from '../html';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
  new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
};

/**
 * Serializes any JavaScript value into a clean string representation formatted for preview.
 * Handles circular references, BigInt, Errors, Sets, Maps, Uint8Arrays, Symbols, Functions,
 * strings, and null/undefined values safely without losing diagnostics.
 *
 * @param value - Value to serialize
 * @returns Serialized string representation
 */
export function serialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return value || '\u2060';
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(
      value,
      (_key: string, val: unknown) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);

          if (val instanceof Error) {
            return {
              name: val.name,
              message: val.message,
              stack: val.stack,
            };
          }

          if (val instanceof Set) return Array.from(val);
          if (val instanceof Map) return Object.fromEntries(val);
          if (val instanceof Uint8Array) return `[Uint8Array(${val.length})]`;
        }

        if (typeof val === 'bigint') return `${val}n`;
        if (typeof val === 'function') {
          return `[Function: ${val.name || 'anonymous'}]`;
        }
        if (typeof val === 'symbol') return val.toString();

        return val;
      },
      1
    );
  } catch (error) {
    return String(value ?? error);
  }
}

/**
 * Evaluates arbitrary asynchronous JavaScript code within a provided scope.
 *
 * @param code - JavaScript code string to execute
 * @param scope - Execution scope variables
 * @returns Evaluation result
 */
export async function evaluateCode(
  code: string,
  scope: Record<string, unknown>
): Promise<unknown> {
  const keys = Object.keys(scope);
  const values = Object.values(scope);
  let script = code.trim();

  // Strip code fences if present (e.g. ```js ... ```)
  if (script.startsWith('```')) {
    script = script.replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Attempt evaluation as an expression first (return value directly)
  try {
    const fn = new AsyncFunction(...keys, `return (${script})`);
    return await fn(...values);
  } catch {
    // Fall back to statement execution if expression wrapping fails syntax check
    const fn = new AsyncFunction(...keys, script);
    return await fn(...values);
  }
}

/**
 * EvalModule allows the bot owner to evaluate arbitrary JavaScript code in runtime.
 * Strictly restricted to bot owner only (ownerOnly: true).
 */
export class EvalModule extends BaseModule {
  readonly id = 'eval';
  readonly name = 'Eval';
  readonly description = 'Evaluates arbitrary asynchronous JavaScript code (Owner only)';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['eval', 'ev', 'js'],
      async (ctx: CommandContext) => {
        // Enforce owner authorization guard
        if (!ctx.isOwner) {
          await ctx.respond(
            '⚠️ <b>Access Denied:</b> Only the bot owner can execute this command.\n\n<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>'
          );
          return;
        }

        let code = ctx.input.trim();
        if (!code && ctx.replyMsg) {
          code = (ctx.replyMsg.text || ctx.replyMsg.caption || '').trim();
        }

        if (!code) {
          await ctx.respond(
            '⚠️ <b>Usage:</b> <code>/eval &lt;javascript code&gt;</code>\n\n' +
            '<blockquote>Executes asynchronous JavaScript code within worker runtime.</blockquote>'
          );
          return;
        }

        const scope: Record<string, unknown> = {
          ctx,
          api: ctx.api,
          bot: ctx.api,
          env: ctx.env,
          db: ctx.db,
          msg: ctx.msg,
          replyMsg: ctx.replyMsg,
          chat: ctx.chat,
          from: ctx.from,
          console,
        };

        const startTime = performance.now();
        let result: unknown;
        let isError = false;

        try {
          result = await evaluateCode(code, scope);
        } catch (error) {
          result = error;
          isError = true;
        }

        const duration = (performance.now() - startTime).toFixed(2);
        const serialized = serialize(result);

        const maxLen = 3500;
        const displayOutput =
          serialized.length > maxLen
            ? `${serialized.slice(0, maxLen)}\n... (truncated ${serialized.length - maxLen} chars)`
            : serialized;

        const statusIcon = isError ? '❌' : '✅';
        const statusTitle = isError ? 'Error' : 'Result';

        const responseText =
          `${statusIcon} <b>${statusTitle}</b> (⏱️ <code>${duration}ms</code>)\n\n` +
          `<blockquote expandable><pre><code class="language-javascript">${escapeHtml(displayOutput)}</code></pre></blockquote>\n\n` +
          `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

        await ctx.respond(responseText);
      },
      {
        description: 'Evaluates asynchronous JavaScript code (Owner only)',
        usage: '<code>',
        ownerOnly: true,
      }
    );
  }
}
