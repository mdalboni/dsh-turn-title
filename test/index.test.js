import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFirstExchange,
  extractConversationSummary,
  cleanTitle,
  resolveRoute,
  resolveLanguageName,
  buildTitlePrompt,
  getStoredLocale,
  generateTitle,
  apply,
} from '../index.js';

test('extractFirstExchange', () => {
  assert.equal(extractFirstExchange([]), null);
  assert.equal(extractFirstExchange([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]), null);

  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'How do I install DSH?' }] },
    {
      role: 'assistant',
      content: [
        { type: 'tool-call', name: 'bash', id: '1' },
        { type: 'text', text: 'You can install DSH with npm install -g dsh.' },
      ],
    },
  ];
  const exchange = extractFirstExchange(messages);
  assert.deepEqual(exchange, {
    userText: 'How do I install DSH?',
    assistantText: 'You can install DSH with npm install -g dsh.',
  });
});

test('extractConversationSummary', () => {
  assert.equal(extractConversationSummary([]), null);

  const singleTurn = [
    { role: 'user', content: [{ type: 'text', text: 'First user prompt' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'First assistant reply' }] },
  ];
  assert.equal(
    extractConversationSummary(singleTurn),
    'User: First user prompt\nAssistant: First assistant reply'
  );

  const multiTurn = [
    { role: 'user', content: [{ type: 'text', text: 'First prompt' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'First reply' }] },
    { role: 'user', content: [{ type: 'text', text: 'Second prompt' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Second reply' }] },
  ];
  assert.equal(
    extractConversationSummary(multiTurn),
    'Initial User Request: First prompt\nLatest User Request: Second prompt\nLatest Assistant Response: Second reply'
  );
});

test('cleanTitle', () => {
  assert.equal(cleanTitle('**Setup DSH Plugin**'), 'Setup DSH Plugin');
  assert.equal(cleanTitle('"Fixing Docker Compose."'), 'Fixing Docker Compose');
  assert.equal(cleanTitle('`Refactor API Routing`'), 'Refactor API Routing');
  assert.equal(cleanTitle('Line 1\nLine 2'), 'Line 1');
  assert.equal(cleanTitle(''), '');
});

test('resolveLanguageName', () => {
  assert.equal(resolveLanguageName('en'), 'English');
  assert.equal(resolveLanguageName('pt-BR'), 'Portuguese (Português do Brasil)');
  assert.equal(resolveLanguageName('pt'), 'Portuguese (Português)');
  assert.equal(resolveLanguageName('zh-CN'), 'Simplified Chinese (简体中文)');
  assert.equal(resolveLanguageName('zh'), 'Chinese (中文)');
  assert.equal(resolveLanguageName('es'), 'Spanish (Español)');
  assert.equal(resolveLanguageName('unknown-lang'), 'unknown-lang');
  assert.equal(resolveLanguageName(null), null);
  assert.equal(resolveLanguageName(''), null);
});

test('buildTitlePrompt with and without locale', () => {
  const withLocale = buildTitlePrompt('Exchange text', 'pt-BR');
  assert.match(withLocale.system, /Portuguese \(Português do Brasil\)/);
  assert.match(withLocale.userPrompt, /Portuguese \(Português do Brasil\)/);

  const withoutLocale = buildTitlePrompt('Exchange text', null);
  assert.match(withoutLocale.system, /primary language of the conversation/);
  assert.match(withoutLocale.userPrompt, /primary language of the conversation/);
});

test('getStoredLocale', () => {
  const mockCtxWithLocale = {
    get: (service) =>
      service === 'settings'
        ? {
            describe: () => [
              { ns: 'theme', value: { preference: 'dark' } },
              { ns: 'include:locale', value: { preference: 'pt-BR' } },
            ],
          }
        : undefined,
  };
  assert.equal(getStoredLocale(mockCtxWithLocale), 'pt-BR');

  const mockCtxWithout = { get: () => ({ describe: () => [] }) };
  assert.equal(getStoredLocale(mockCtxWithout), undefined);
});

test('resolveRoute', () => {
  // 1. Session request header route
  const sessionWithHeader = {
    requestHeader: () => ({
      config: { provider: 'test-p', model: 'test-m', reasoningEffort: 'low' },
    }),
  };
  assert.deepEqual(resolveRoute({}, sessionWithHeader), {
    provider: 'test-p',
    model: 'test-m',
    reasoningEffort: 'low',
  });

  // 2. Default model fallback
  const mockCtx = {
    get: (name) =>
      name === 'agentDefaultModel'
        ? { currentSelection: () => ({ provider: 'default-p', model: 'default-m' }) }
        : undefined,
  };
  assert.deepEqual(resolveRoute(mockCtx, {}), {
    provider: 'default-p',
    model: 'default-m',
  });

  // 3. Fallback when neither provided
  assert.deepEqual(resolveRoute({}, {}), {
    provider: 'nine-router',
    model: 'ag/gemini-3.8-flash',
  });
});

test('generateTitle calls LLM with localized prompt and renames session', async () => {
  let renamedWith = null;
  let capturedOptions = null;
  const mockSession = {
    id: 's-123',
    requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
  };
  const mockCtx = {
    llm: {
      stream: async function* (options) {
        capturedOptions = options;
        yield { type: 'text-delta', text: 'Configuração ' };
        yield { type: 'text-delta', text: 'do Plugin DSH' };
      },
    },
    sessionTitle: {
      rename: (session, title) => {
        renamedWith = { session, title };
      },
    },
  };

  const title = await generateTitle(mockCtx, mockSession, 'User: oi\nAssistant: ola', 'pt-BR');
  assert.equal(title, 'Configuração do Plugin DSH');
  assert.equal(renamedWith.title, 'Configuração do Plugin DSH');
  assert.equal(renamedWith.session.id, 's-123');
  assert.match(capturedOptions.system, /Portuguese \(Português do Brasil\)/);
});

test('apply auto-title event listener', async () => {
  let eventHandler = null;
  let serverRoute = null;

  const mockCtx = {
    on: (name, handler) => {
      if (name === 'session/event') eventHandler = handler;
    },
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        serverRoute = route;
      },
    },
    sessionTitle: {
      get: () => ({ source: { kind: 'fallback' } }),
      rename: (session, title) => {
        session.title = title;
      },
    },
    llm: {
      stream: async function* () {
        yield { type: 'text-delta', text: 'Auto Titled Turn 1' };
      },
    },
    sessions: new Map(),
  };

  apply(mockCtx);

  assert.ok(typeof eventHandler === 'function');
  assert.ok(serverRoute && serverRoute.path === '/api/session-title/update');

  const session = {
    id: 's-1',
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'world' }] },
    ],
  };

  // Turn 2 does not trigger auto-title
  await eventHandler(session, {
    type: 'turn/end',
    data: { turn: 2, reason: { kind: 'completed' } },
  });
  assert.equal(session.title, undefined);

  // Turn 1 completed triggers auto-title
  await eventHandler(session, {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  });
  assert.equal(session.title, 'Auto Titled Turn 1');
});

test('apply webServer HTTP update endpoint with localization', async () => {
  let serverRoute = null;
  let capturedPrompt = null;
  const sessions = new Map();
  const session = {
    id: 's-test',
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: 'what is node?' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Node is a JS runtime.' }] },
    ],
  };
  sessions.set('s-test', session);

  const mockCtx = {
    on: () => {},
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        serverRoute = route;
      },
    },
    sessionTitle: {
      rename: (s, title) => {
        s.title = title;
      },
    },
    llm: {
      stream: async function* (options) {
        capturedPrompt = options.system;
        yield { type: 'text-delta', text: 'Node Runtime Basics' };
      },
    },
    sessions,
  };

  apply(mockCtx);

  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: '',
      writeHead(code, h) {
        this.statusCode = code;
        this.headers = h;
      },
      end(data) {
        this.body = data;
      },
    };
  }

  // 1. Non-POST returns 405
  {
    const res = createMockRes();
    await serverRoute.handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 405);
  }

  // 2. Unknown session returns 404
  {
    const res = createMockRes();
    const req = {
      method: 'POST',
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ sessionId: 'unknown' });
      },
    };
    await serverRoute.handler(req, res);
    assert.equal(res.statusCode, 404);
  }

  // 3. POST with manual title renames session
  {
    const res = createMockRes();
    const req = {
      method: 'POST',
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ sessionId: 's-test', title: 'Manual Title Override' });
      },
    };
    await serverRoute.handler(req, res);
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.ok, true);
    assert.equal(session.title, 'Manual Title Override');
  }

  // 4. POST without title triggers LLM generation with client locale
  {
    const res = createMockRes();
    const req = {
      method: 'POST',
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ sessionId: 's-test', locale: 'pt-BR' });
      },
    };
    await serverRoute.handler(req, res);
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.ok, true);
    assert.equal(session.title, 'Node Runtime Basics');
    assert.match(capturedPrompt, /Portuguese \(Português do Brasil\)/);
  }
});
