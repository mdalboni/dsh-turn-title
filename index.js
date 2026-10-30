/**
 * dsh-turn-title: Auto-title after turn 1 (first message + response)
 * and provide an endpoint for chat-area title updates.
 */

export const name = 'dsh-turn-title';
export const inject = ['sessionTitle', 'llm', 'sessions', 'webServer', 'agents'];

export const LANGUAGE_NAMES = {
  en: 'English',
  zh: 'Chinese (中文)',
  'zh-CN': 'Simplified Chinese (简体中文)',
  'zh-TW': 'Traditional Chinese (繁體中文)',
  pt: 'Portuguese (Português)',
  'pt-BR': 'Portuguese (Português do Brasil)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  ru: 'Russian (Русский)',
  it: 'Italian (Italiano)',
};

/** Resolve human-readable language name from a locale tag. */
export function resolveLanguageName(code) {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (LANGUAGE_NAMES[trimmed]) return LANGUAGE_NAMES[trimmed];
  const prefix = trimmed.split('-')[0].toLowerCase();
  return LANGUAGE_NAMES[prefix] || trimmed;
}

/** Retrieve stored locale preference from DSH settings or environment if available. */
export function getStoredLocale(ctx) {
  try {
    const descriptors = ctx?.get?.('settings')?.describe?.();
    const loc = descriptors?.find((d) => d && (d.ns === 'locale' || d.ns === 'include:locale'));
    if (loc?.value && typeof loc.value === 'object' && loc.value.preference) {
      return loc.value.preference;
    }
  } catch {}
  return undefined;
}

/** Build system and user prompt for title generation with language constraint. */
export function buildTitlePrompt(textInput, locale) {
  const langName = resolveLanguageName(locale);
  const langRule = langName
    ? `The title MUST be written in ${langName}.`
    : `Use the primary language of the conversation.`;

  return {
    system: `You are a session title generator. Output ONLY a concise plain text title (3-6 words) on a single line. ${langRule}`,
    userPrompt: `Create a concise, descriptive title (3 to 6 words) for the following exchange.\n${langRule}\nReturn ONLY the plain text title on one line, without quotes, explanations, markdown, or ending punctuation:\n\n${textInput}`,
  };
}

/** Find a live session by ID. */
export function findSession(ctx, sessionId) {
  let session = ctx.sessions?.get?.(sessionId);
  if (!session && ctx.agents?.get) {
    session = ctx.agents.get(sessionId)?.session;
  }
  if (!session && ctx.sessions?.list) {
    session = ctx.sessions.list().find((s) => s && s.id === sessionId);
  }
  if (!session && ctx.agents?.list) {
    session = ctx.agents.list().map((a) => a.session).find((s) => s && s.id === sessionId);
  }
  return session;
}

/** Extract text content from message content blocks. */
function messageText(msg) {
  if (!msg || !Array.isArray(msg.content)) return '';
  return msg.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

/** Extract the first user message and first assistant response. */
export function extractFirstExchange(messages) {
  if (!Array.isArray(messages)) return null;
  const userMsg = messages.find((m) => m && m.role === 'user');
  const assistantMsg = messages.find((m) => m && m.role === 'assistant');
  if (!userMsg || !assistantMsg) return null;

  const userText = messageText(userMsg).slice(0, 1000);
  const assistantText = messageText(assistantMsg).slice(0, 1000);
  if (!userText && !assistantText) return null;
  return { userText, assistantText };
}

/** Extract conversation summary for manual/re-triggered title update. */
export function extractConversationSummary(messages) {
  if (!Array.isArray(messages)) return null;
  const userMessages = messages.filter((m) => m && m.role === 'user');
  const assistantMessages = messages.filter((m) => m && m.role === 'assistant');
  if (userMessages.length === 0) return null;

  const firstUser = messageText(userMessages[0]).slice(0, 800);
  const lastUser = messageText(userMessages[userMessages.length - 1]).slice(0, 800);
  const lastAssistant =
    assistantMessages.length > 0
      ? messageText(assistantMessages[assistantMessages.length - 1]).slice(0, 800)
      : '';

  if (userMessages.length <= 1) {
    return `User: ${firstUser}\nAssistant: ${lastAssistant}`;
  }
  return `Initial User Request: ${firstUser}\nLatest User Request: ${lastUser}\nLatest Assistant Response: ${lastAssistant}`;
}

/** Clean raw LLM response into a short, normalized title. */
export function cleanTitle(raw) {
  if (typeof raw !== 'string') return '';
  const firstLine =
    raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0) || '';
  // Strip Markdown markers, surrounding quotes/brackets, and trailing periods
  return firstLine
    .replace(/^<[^>]+>/g, '')
    .replace(/<[^>]+>$/g, '')
    .replace(/^[\s"'`*#\-:]+/u, '')
    .replace(/[\s"'`*.]+$/u, '')
    .trim();
}

/** Resolve the LLM route for title generation. */
export function resolveRoute(ctx, session) {
  const header = session?.requestHeader?.();
  if (header?.config?.provider && header?.config?.model) {
    return {
      provider: header.config.provider,
      model: header.config.model,
      reasoningEffort: header.config.reasoningEffort,
    };
  }
  const defaultModel = ctx?.get?.('agentDefaultModel')?.currentSelection?.();
  if (defaultModel?.provider && defaultModel?.model) {
    return defaultModel;
  }
  // ponytail: fallback route when neither session header nor default model specifies one
  return { provider: 'nine-router', model: 'ag/gemini-3.8-flash' };
}

/** Generate title via LLM stream and commit to session title service. */
export async function generateTitle(ctx, session, textInput, locale) {
  const route = resolveRoute(ctx, session);
  const prompt = buildTitlePrompt(textInput, locale);
  const stream = ctx.llm.stream({
    provider: route.provider,
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt.userPrompt,
          },
        ],
      },
    ],
    system: prompt.system,
    maxTokens: 50,
    temperature: 0.3,
    sessionId: session.id,
    purpose: 'session-title',
  });

  let raw = '';
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      raw += chunk.text;
    }
  }

  const title = cleanTitle(raw);
  if (title) {
    ctx.sessionTitle.rename(session, title);
    return title;
  }
  return null;
}

export function apply(ctx) {
  // 1. Auto-title after turn 1 completion (first message + response)
  ctx.on('session/event', async (session, event) => {
    if (
      event.type === 'turn/end' &&
      event.data?.turn === 1 &&
      event.data?.reason?.kind === 'completed'
    ) {
      const current = ctx.sessionTitle.get(session);
      // Only auto-generate if no title or title is still deterministic fallback
      if (!current || current.source?.kind === 'fallback') {
        const messages = session.deriveMessages?.() || [];
        const exchange = extractFirstExchange(messages);
        if (exchange) {
          try {
            const locale = getStoredLocale(ctx);
            await generateTitle(
              ctx,
              session,
              `User: ${exchange.userText}\nAssistant: ${exchange.assistantText}`,
              locale
            );
          } catch (err) {
            ctx.logger?.warn?.('[dsh-turn-title] Auto-title error:', err);
          }
        }
      }
    }
  });

  // 2. HTTP endpoint for chat-area button updates
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/api/session-title/update',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }

          try {
            const data = JSON.parse(body || '{}');
            const sessionId = data.sessionId;
            if (!sessionId) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'sessionId required' }));
              return;
            }

            const session = findSession(ctx, sessionId);
            if (!session) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Session not found' }));
              return;
            }

            const locale = data.locale || getStoredLocale(ctx);
            let title = data.title;
            if (typeof title === 'string' && title.trim()) {
              title = cleanTitle(title);
              ctx.sessionTitle.rename(session, title);
            } else {
              const messages = session.deriveMessages?.() || [];
              const textInput = extractConversationSummary(messages);
              if (!textInput) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({ error: 'No conversation messages to summarize' })
                );
                return;
              }
              title = await generateTitle(ctx, session, textInput, locale);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, title }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || String(err) }));
          }
        },
      }),
    'dsh-turn-title: POST /api/session-title/update'
  );
}
