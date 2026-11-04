import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../cmd/ruopenray-ui/web/api-client.js';

for (const method of ['request', 'text', 'upload']) {
  test(`${method}: an expired response from the previous login does not log out the new session`, async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let token = 'old-session', unauthorized = 0, respond;
    let sentAuthorization;
    globalThis.fetch = (_path, options) => {
      sentAuthorization = options.headers.authorization;
      return new Promise((resolve) => { respond = resolve; });
    };
    const api = createApiClient({ getToken: () => token, onUnauthorized: () => { unauthorized++; token = ''; } });
    const pending = method === 'upload' ? api.upload('/upload', new FormData()) : api[method]('/status');
    const rejected = assert.rejects(pending, /авторизац/i);
    assert.equal(sentAuthorization, 'Bearer old-session');
    token = 'new-session';
    respond(new Response(JSON.stringify({ error: 'Требуется авторизация' }), { status: 401, headers: { 'content-type': 'application/json' } }));
    await rejected;
    assert.equal(token, 'new-session');
    assert.equal(unauthorized, 0);
  });

  test(`${method}: authentication failure for the current session still requests login`, async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let unauthorized = 0;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Требуется авторизация' }), { status: 401, headers: { 'content-type': 'application/json' } });
    const api = createApiClient({ getToken: () => 'current-session', onUnauthorized: () => unauthorized++ });
    await assert.rejects(method === 'upload' ? api.upload('/upload', new FormData()) : api[method]('/status'), /авторизац/i);
    assert.equal(unauthorized, 1);
  });
}

test('API errors retain HTTP status so an unstarted operation can be distinguished from lost transport', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Выполняется другая операция' }), { status: 409, headers: { 'content-type': 'application/json' } });
  const api = createApiClient();
  await assert.rejects(api.request('/api/app/update', { method: 'POST' }), (error) => error.status === 409 && /другая операция/.test(error.message));
});
