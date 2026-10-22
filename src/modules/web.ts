import { InlineKeyboard } from 'grammy';
import { BaseModule, PrefixService, type CommandContext } from '../core';
import { escapeHtml } from '../html';
import { extractTargetUrl } from '../utils';

interface MicrolinkResponse {
  status?: string;
  data?: {
    screenshot?: {
      url?: string;
    };
  };
}

/**
 * Resolves a high-quality direct screenshot image URL via Microlink with Thum.io fallback
 */
async function resolveScreenshotUrl(targetUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&screenshot=true&meta=false`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json<MicrolinkResponse>();
      if (data?.status === 'success' && data.data?.screenshot?.url) {
        return data.data.screenshot.url;
      }
    }
  } catch (err) {
    console.warn('[WebModule] Microlink API screenshot resolution failed:', err);
  }

  // Resilient fallback: Thum.io directly renders any public URL without API key
  return `https://image.thum.io/get/width/1280/crop/800/${targetUrl}`;
}

/**
 * WebModule provides website screenshot capabilities:
 * - Supports direct arguments or replying to any message containing a link
 * - Dynamic D1 prefixes (e.g. /ss, !ss, @bot !ss, @bot ss)
 */
export class WebModule extends BaseModule {
  readonly id = 'web';
  readonly name = 'Web';
  readonly description = 'Captures and sends website screenshots';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['ss', 'web'],
      async (ctx: CommandContext) => {
        const isGuest = Boolean(ctx.guest || ctx.isGuest);
        const footer = isGuest
          ? '\n\n<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>'
          : '';

        const parsed = extractTargetUrl(ctx.input, ctx.replyMsg, ctx.prefix, ctx.msg?.entities);
        if (!parsed) {
          const usageMsg =
            `<b>Web Screenshot</b>\n\n` +
            `<blockquote expandable>` +
            `<b>Usage:</b>\n` +
            `• <code>${ctx.prefix}ss &lt;url&gt;</code>\n` +
            `• <code>@${ctx.me?.username || 'deltaxapp'} ${ctx.prefix}ss &lt;url&gt;</code>\n` +
            `• Or reply to any message containing a link with <code>${ctx.prefix}ss</code>\n\n` +
            `<b>Example:</b>\n` +
            `<code>${ctx.prefix}ss google.com</code>` +
            `</blockquote>${footer}`;

          await ctx.respond(usageMsg);
          return;
        }

        const { url: targetUrl, domain } = parsed;
        const screenshotUrl = await resolveScreenshotUrl(targetUrl);

        const caption =
          `<b>Web Screenshot</b>\n\n` +
          `<blockquote expandable>` +
          `<b>Domain:</b> <code>${escapeHtml(domain)}</code>\n` +
          `<b>URL:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>` +
          `</blockquote>${footer}`;

        const keyboard = new InlineKeyboard().url('Open Link', targetUrl);

        if (ctx.guest || ctx.isGuest) {
          await ctx
            .answerGuestQuery({
              type: 'photo',
              id: `guest_web_${Date.now()}`,
              photo_url: screenshotUrl,
              thumbnail_url: screenshotUrl,
              title: `Screenshot: ${domain}`,
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard,
            })
            .catch(async () => {
              const fallbackUrl = `https://image.thum.io/get/width/1280/crop/800/${targetUrl}`;
              await ctx
                .answerGuestQuery({
                  type: 'photo',
                  id: `guest_web_fallback_${Date.now()}`,
                  photo_url: fallbackUrl,
                  thumbnail_url: fallbackUrl,
                  title: `Screenshot: ${domain}`,
                  caption,
                  parse_mode: 'HTML',
                  reply_markup: keyboard,
                })
                .catch(() => {});
            });
          return;
        }

        const chatId = ctx.chat?.id || ctx.msg?.chat?.id;
        if (!chatId) return;

        await ctx.replyWithChatAction('upload_photo').catch(() => {});

        try {
          await ctx.api.sendPhoto(chatId, screenshotUrl, {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
            reply_parameters: ctx.msg?.message_id ? { message_id: ctx.msg.message_id } : undefined,
          });
        } catch (err) {
          console.warn('[WebModule] Primary sendPhoto failed, trying Thum.io fallback:', err);
          try {
            const fallbackUrl = `https://image.thum.io/get/width/1280/crop/800/${targetUrl}`;
            await ctx.api.sendPhoto(chatId, fallbackUrl, {
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard,
              reply_parameters: ctx.msg?.message_id
                ? { message_id: ctx.msg.message_id }
                : undefined,
            });
          } catch (fallbackErr) {
            console.error('[WebModule] All screenshot delivery attempts failed:', fallbackErr);
            const errorMsg =
              `❌ <b>Screenshot Failed</b>\n\n` +
              `<blockquote expandable>` +
              `Could not capture screenshot for <code>${escapeHtml(targetUrl)}</code>.\n` +
              `Please ensure the website is online and accessible.` +
              `</blockquote>`;

            await ctx.respond(errorMsg);
          }
        }
      },
      {
        description: 'Capture and send a screenshot of a website',
        usage: '<url>',
      }
    );

    this.command(
      ['setprefix'],
      async (ctx: CommandContext) => {
        const footer = ctx.isGuest
          ? '\n\n<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>'
          : '';
        const newPrefix = ctx.args[0];
        if (!newPrefix) {
          await ctx.respond(
            `<b>Command Prefix</b>\n\n` +
              `Current prefix: <code>${escapeHtml(ctx.prefix)}</code>\n\n` +
              `To change: <code>${escapeHtml(ctx.prefix)}setprefix !</code>${footer}`
          );
          return;
        }

        if (newPrefix.length > 5) {
          await ctx.respond(`⚠️ Prefix must be between 1 and 5 characters.${footer}`);
          return;
        }

        await PrefixService.setBotPrefix(ctx.env, newPrefix);
        await PrefixService.setGuestPrefix(ctx.env, newPrefix);

        await ctx.respond(
          `✅ <b>Prefix updated to <code>${escapeHtml(newPrefix)}</code>!</b>\n\n` +
            `• <b>Direct/Group:</b> <code>${escapeHtml(newPrefix)}ss &lt;link&gt;</code>\n` +
            `• <b>Group Mention:</b> <code>@${ctx.me?.username || 'deltaxapp'} ${escapeHtml(newPrefix)}ss &lt;link&gt;</code>${footer}`
        );
      },
      {
        description: 'Set dynamic command prefix in D1 (Owner Only)',
        usage: '<prefix>',
        ownerOnly: true,
      }
    );
  }
}
