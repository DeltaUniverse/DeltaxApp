import { InlineKeyboard, InputFile } from 'grammy';
import { BaseModule, PrefixService, type CommandContext } from '../core';
import { escapeHtml } from '../html';
import { extractTargetUrl } from '../utils';

/**
 * Fetches screenshot bytes via Linkdr (falling back to Thum.io/Microlink)
 */
async function fetchScreenshot(
  targetUrl: string,
  domain: string
): Promise<{ buffer: ArrayBuffer; url: string; ext: string }> {
  const providers = [
    {
      name: 'Linkdr',
      url: `https://linkdr.com/api/screenshot/${domain}`,
    },
    {
      name: 'Thum.io',
      url: `https://image.thum.io/get/width/1280/crop/800/${targetUrl}`,
    },
    {
      name: 'Microlink',
      url: `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&screenshot=true&meta=false&embed=screenshot.url`,
    },
  ];

  for (const provider of providers) {
    try {
      const res = await fetch(provider.url, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('image')) {
          const buffer = await res.arrayBuffer();
          if (buffer.byteLength > 1000) {
            const ext = contentType.includes('webp') ? 'webp' : 'png';
            return { buffer, url: res.url || provider.url, ext };
          }
        }
      }
    } catch (err) {
      console.warn(`[WebModule] ${provider.name} failed:`, err);
    }
  }

  throw new Error('All screenshot engines failed to render website');
}

/**
 * WebModule provides website screenshot capabilities via Linkdr:
 * - Supports direct arguments or replying to any message containing a link
 * - Dynamic D1 prefixes (e.g. /ss, !ss, @bot !ss, @bot ss)
 */
export class WebModule extends BaseModule {
  readonly id = 'web';
  readonly name = 'Web';
  readonly description = 'Captures and sends website screenshots via Linkdr';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['ss', 'web'],
      async (ctx: CommandContext) => {
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
            `</blockquote>\n\n` +
            `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

          await ctx.respond(usageMsg);
          return;
        }

        const { url: targetUrl, domain } = parsed;
        const screenshotUrl = `https://linkdr.com/api/screenshot/${domain}`;

        const caption =
          `<b>Web Screenshot</b>\n\n` +
          `<blockquote expandable>` +
          `<b>Domain:</b> <code>${escapeHtml(domain)}</code>\n` +
          `<b>URL:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>` +
          `</blockquote>\n\n` +
          `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

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
              const mediaTag = `<img src="${escapeHtml(screenshotUrl)}" />`;
              const mediaContainer = `<figure>${mediaTag}</figure>`;
              const buttonRow = `<tg-button-row align="center">\n  <tg-button type="url" style="primary" url="${escapeHtml(targetUrl)}">Open Link</tg-button>\n</tg-button-row>`;
              const richHtml = [mediaContainer, caption, buttonRow].join('\n\n');

              await ctx
                .answerGuestQuery({
                  type: 'article',
                  id: `guest_web_art_${Date.now()}`,
                  title: `Screenshot: ${domain}`,
                  thumbnail_url: screenshotUrl,
                  input_message_content: {
                    rich_message: {
                      html: richHtml,
                    },
                  },
                })
                .catch(() => {});
            });
          return;
        }

        const chatId = ctx.chat?.id || ctx.msg?.chat?.id;
        if (!chatId) return;

        await ctx.replyWithChatAction('upload_photo').catch(() => {});

        try {
          const result = await fetchScreenshot(targetUrl, domain);
          await ctx.api.sendPhoto(
            chatId,
            new InputFile(new Uint8Array(result.buffer), `${domain}.${result.ext}`),
            {
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard,
              reply_parameters: ctx.msg?.message_id
                ? { message_id: ctx.msg.message_id }
                : undefined,
            }
          );
        } catch (err) {
          console.error('[WebModule] Screenshot delivery failed:', err);
          const errorMsg =
            `❌ <b>Screenshot Failed</b>\n\n` +
            `<blockquote expandable>` +
            `Could not capture screenshot for <code>${escapeHtml(targetUrl)}</code>.\n` +
            `Please ensure the website is online and accessible.` +
            `</blockquote>\n\n` +
            `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

          await ctx.respond(errorMsg);
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
        const newPrefix = ctx.args[0];
        if (!newPrefix) {
          await ctx.respond(
            `<b>Command Prefix</b>\n\n` +
              `Current prefix: <code>${escapeHtml(ctx.prefix)}</code>\n\n` +
              `To change: <code>${escapeHtml(ctx.prefix)}setprefix !</code>\n\n` +
              `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`
          );
          return;
        }

        if (newPrefix.length > 5) {
          await ctx.respond('⚠️ Prefix must be between 1 and 5 characters.');
          return;
        }

        await PrefixService.setBotPrefix(ctx.env, newPrefix);
        await PrefixService.setGuestPrefix(ctx.env, newPrefix);

        await ctx.respond(
          `✅ <b>Prefix updated to <code>${escapeHtml(newPrefix)}</code>!</b>\n\n` +
            `• <b>Direct/Group:</b> <code>${escapeHtml(newPrefix)}ss &lt;link&gt;</code>\n` +
            `• <b>Group Mention:</b> <code>@${ctx.me?.username || 'deltaxapp'} ${escapeHtml(newPrefix)}ss &lt;link&gt;</code>\n\n` +
            `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`
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
