import assert from 'node:assert/strict';
import test from 'node:test';
import { APIError, createApiClient } from '../cmd/ruopenray-ui/web/api-client.js';
import { createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { noticeView } from '../cmd/ruopenray-ui/web/notice-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { recordServerValidation } from '../cmd/ruopenray-ui/web/server-validation-state.js';
import { createServerActions } from '../cmd/ruopenray-ui/web/server-actions.js';
import { applyStageProgressView } from '../cmd/ruopenray-ui/web/apply-progress-view.js';

const validation = { ok: false, stdout: 'Xray 26.10.31', stderr: 'Failed to start: outbound "example-vpn": invalid <transport>', outboundErrors: [{ tag: 'example-vpn', message: 'invalid <transport>', source: 'xray' }], outboundErrorsComplete: true };
const config = () => ({ outbounds: [{ tag: 'example-vpn', protocol: 'vless', settings: { address: 'example.test' } }], routing: { rules: [] } });

function response(status, payload, statusText = '') {
  return { ok: status >= 200 && status < 300, status, statusText: statusText || ({ 200: 'OK', 409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error' }[status] || 'Error'),
    headers: { get: () => 'application/json' }, text: async () => JSON.stringify(payload) };
}

function fixture(t, fetchReply) {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return fetchReply(path, options);
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const draft = JSON.stringify(config(), null, 2);
  const state = { tab: 'servers', config: config(), jsonDraft: draft, appliedConfigText: '{"outbounds":[]}',
    activeConfigRevision: 'active-before', serverDraftRevision: 'draft-before', serverDraftExists: true,
    serverDraftSavedAt: 'before', serverDraftError: '', lastApplyBackup: 'previous-backup',
    configTestLog: { ok: false, stderr: 'previous-unrelated-error' },
    status: { core: { version: 'Xray 26.10.31' } }, message: '' };
  const api = createApiClient({ getToken: () => 'synthetic-session' });
  let refreshes = 0;
  const actions = createConfigActions({ state, request: api.request, render() {}, refresh: async () => { refreshes += 1; }, keepOperationVisible: async () => {}, activeProxyTag: () => 'example-vpn' });
  let click;
  const button = { dataset: { action: 'apply' }, textContent: 'Применить изменения', classList: { contains: () => false }, addEventListener(type, listener) { if (type === 'click') click = listener; } };
  bindActionControls({ state, render() {}, handlers: { apply: () => actions.applyConfig() }, buttons: [button] });
  const draftSnapshot = () => ({ config: state.config, jsonDraft: state.jsonDraft, appliedConfigText: state.appliedConfigText,
    activeConfigRevision: state.activeConfigRevision, serverDraftRevision: state.serverDraftRevision, serverDraftExists: state.serverDraftExists,
    serverDraftSavedAt: state.serverDraftSavedAt, serverDraftError: state.serverDraftError });
  const before = structuredClone(draftSnapshot());
  return { state, api, actions, calls, before, draftSnapshot, refreshes: () => refreshes,
    apply: () => click({ target: button }), notice: () => noticeView(state, escapeHtml) };
}

test('API errors retain the parsed validation response and HTTP status for request and upload', async (t) => {
  const payload = { ok: false, test: validation, analysis: { errors: ['Example analysis error'] } };
  const f = fixture(t, async () => response(422, payload));
  for (const operation of [() => f.api.request('/synthetic'), () => f.api.upload('/synthetic', new FormData())]) {
    await assert.rejects(operation, (error) => {
      assert.ok(error instanceof APIError);
      assert.equal(error.status, 422);
      assert.deepEqual(error.payload, payload);
      return true;
    });
  }
});

for (const status of [422, 200]) {
  test(`HTTP ${status} failed validation reaches the actual action and notice without losing stderr or the draft`, async (t) => {
    const payload = { ok: false, test: validation, analysis: { errors: ['Rejected <example> rule'], warnings: ['Inspect the selected outbound'] } };
    const f = fixture(t, async () => response(status, payload));
    await f.apply();
    assert.equal(f.state.configApplying, false);
    assert.equal(f.state.busyAction, '');
    assert.equal(f.state.messageDetails.forMessage, f.state.message);
    assert.equal(f.state.configTestLog.stderr, validation.stderr);
    assert.equal(f.state.serverValidation.issues[0].tag, 'example-vpn');
    assert.deepEqual(f.state.configAnalysis, payload.analysis);
    const html = f.notice();
    assert.match(html, /Показать причину/);
    assert.match(html, /invalid &lt;transport&gt;/);
    assert.match(html, /Rejected &lt;example&gt; rule/);
    assert.doesNotMatch(html, /<transport>|<example>|Unprocessable Entity|previous-unrelated-error/);
    assert.deepEqual(f.draftSnapshot(), f.before);
    assert.equal(f.refreshes(), 0);
    assert.deepEqual(f.calls.map((call) => call.path), ['/api/config/apply']);
    const submitted = JSON.parse(f.calls[0].options.body);
    assert.equal(submitted.expectedConfigRevision, 'active-before');
    assert.equal(submitted.expectedDraftRevision, 'draft-before');
  });
}

test('a failed restart shows its stderr and rollback result without presenting an old validation failure', async (t) => {
  const payload = { ok: false, test: { ok: true, stdout: 'Configuration OK', outboundErrorsComplete: true },
    restart: { ok: false, stderr: 'listen tcp 127.0.0.1:1080: bind: address already in use', rollback: { ok: true, stdout: 'Previous configuration restored' } }, backup: 'new-backup' };
  const f = fixture(t, async () => response(200, payload));
  await f.apply();
  const html = f.notice();
  assert.match(html, /Ошибка перезапуска Xray/);
  assert.match(html, /address already in use/);
  assert.match(html, /Previous configuration restored/);
  assert.doesNotMatch(html, /previous-unrelated-error/);
  assert.equal(f.state.configTestLog.ok, true);
  assert.equal(f.state.lastApplyBackup, 'new-backup');
  assert.equal(f.state.messageDetails.forMessage, f.state.message);
  assert.deepEqual(f.draftSnapshot(), f.before);
  assert.equal(f.refreshes(), 0);
});

for (const recovered of [true, false, undefined]) {
  test(`hot routing failure exposes the cause before technical details and reports rollback=${recovered}`, async (t) => {
    const reason = 'API Xray: <example> deadline exceeded';
    const restart = { mode: 'hot-routing', ok: false, stderr: reason,
      ...(recovered === undefined ? {} : { rollback: { ok: recovered, mode: 'restart', health: { checks: { example: { ok: true } } } } }) };
    const f = fixture(t, async () => response(200, { ok: false, test: { ok: true }, restart }));
    await f.apply();
    assert.match(f.state.message, /Не удалось применить правила без перезапуска Xray/);
    assert.doesNotMatch(f.state.message, /Не удалось перезапустить Xray/);
    const html = applyStageProgressView([{ id: 'apply-xray', status: 'error' }], escapeHtml, { failure: f.state.messageDetails });
    const visible = html.split('<details>')[0];
    assert.match(visible, /API Xray: &lt;example&gt; deadline exceeded/);
    assert.match(visible, /Черновик сохранён/);
    assert.doesNotMatch(visible, /<example>|"health"|"checks"/);
    if (recovered === true) assert.match(visible, /Предыдущая конфигурация восстановлена/);
    else if (recovered === false) assert.match(visible, /Не удалось подтвердить восстановление/);
    else assert.doesNotMatch(visible, /Предыдущая конфигурация восстановлена|Не удалось подтвердить восстановление/);
    assert.deepEqual(f.draftSnapshot(), f.before);
    assert.equal(f.calls.length, 1, 'a failed RPC is never retried by the client');
  });
}

test('a transport failure leaves the draft and revisions intact and never reuses old Xray errors', async (t) => {
  const f = fixture(t, async () => { throw new TypeError('Failed to fetch'); });
  recordServerValidation(f.state, validation, f.state.config);
  const previousValidation = structuredClone(f.state.serverValidation);
  await f.apply();
  const html = f.notice();
  assert.match(html, /Не получен результат применения/);
  assert.match(html, /Failed to fetch/);
  assert.match(html, /запрос мог выполниться на роутере/);
  assert.doesNotMatch(html, /previous-unrelated-error|Применение отменено|Конфигурация не прошла проверку/);
  assert.equal(f.state.configTestLog, null);
  assert.equal(f.state.messageDetails.forMessage, f.state.message);
  assert.deepEqual(f.state.serverValidation, previousValidation);
  assert.deepEqual(f.draftSnapshot(), f.before);
  assert.equal(f.refreshes(), 0);
});

test('HTTP conflicts preserve their own response and never masquerade as a previous validation error', async (t) => {
  const payload = { ok: false, conflict: true, error: 'Активная конфигурация изменилась' };
  const f = fixture(t, async () => response(409, payload));
  await f.apply();
  assert.equal(f.state.message, payload.error);
  assert.equal(f.state.activeConfigConflict, true);
  assert.match(f.notice(), /Активная конфигурация изменилась/);
  assert.doesNotMatch(f.notice(), /previous-unrelated-error/);
  assert.deepEqual(f.draftSnapshot(), f.before);
  assert.equal(f.calls.length, 1, 'a conflict neither rebases nor retries the apply request');
});

test('the common action boundary retains matching details after humanizing a bare system error', async (t) => {
  const f = fixture(t, async () => response(500, { ok: false, error: 'exit status 1' }));
  await f.apply();
  assert.notEqual(f.state.message, 'exit status 1');
  assert.equal(f.state.messageDetails.forMessage, f.state.message);
  assert.match(f.notice(), /Подробности применения/);
  assert.match(f.notice(), /exit status 1/);
  assert.deepEqual(f.draftSnapshot(), f.before);
});

test('a successful retry clears the matching failure and adopts only the confirmed draft revision', async (t) => {
  let failed = true;
  const f = fixture(t, async () => failed ? response(422, { ok: false, test: validation })
    : response(200, { ok: true, test: { ok: true, stdout: 'Configuration OK', outboundErrorsComplete: true }, draft: { exists: false, revision: 'draft-after' } }));
  await f.apply();
  assert.match(f.notice(), /Показать причину/);
  failed = false;
  await f.apply();
  assert.equal(f.state.messageDetails, null);
  assert.equal(f.state.configTestLog, null);
  assert.equal(f.state.serverDraftRevision, 'draft-after');
  assert.equal(f.state.serverDraftExists, false);
  assert.deepEqual(f.state.serverValidation.issues, []);
  assert.equal(f.refreshes(), 1);
  assert.doesNotMatch(f.notice(), /invalid &lt;transport&gt;|previous-unrelated-error/);
});

test('the standalone draft test records the same authoritative outbound rejection and reason details', async (t) => {
  const f = fixture(t, async (path) => response(200, path === '/api/config/test' ? validation : { errors: [] }));
  await f.actions.testConfig();
  assert.equal(f.state.serverValidation.issues[0].tag, 'example-vpn');
  assert.equal(f.state.messageDetails.forMessage, f.state.message);
  assert.match(f.notice(), /invalid &lt;transport&gt;/);
  assert.deepEqual(f.draftSnapshot(), f.before);
});

for (const operation of ['apply', 'test']) {
  test(`${operation} does not attach an old core rejection to the new core after an in-flight version change`, async (t) => {
    const f = fixture(t, async (path) => {
      f.state.status.core.version = 'Xray 26.11.4';
      return response(path === '/api/config/apply' ? 422 : 200,
        path === '/api/config/apply' ? { ok: false, test: validation } : path === '/api/config/test' ? validation : { errors: [] });
    });
    if (operation === 'apply') await f.apply();
    else await f.actions.testConfig();
    assert.equal(f.state.serverValidation, undefined);
    assert.equal(f.state.status.core.version, 'Xray 26.11.4');
    assert.deepEqual(f.draftSnapshot(), f.before);
  });
}

for (const operation of ['save', 'delete']) {
  test(`a server ${operation} after failed Apply never inherits the previous Xray reason`, async (t) => {
    const f = fixture(t, async (path) => path === '/api/config/apply'
      ? response(422, { ok: false, test: validation }) : response(200, { ok: true }));
    await f.apply();
    assert.match(f.notice(), /invalid &lt;transport&gt;/);
    const activeBefore = f.state.appliedConfigText;
    const revisionBefore = f.state.activeConfigRevision;
    const draftRevisionBefore = f.state.serverDraftRevision;
    const servers = createServerActions({ state: f.state, request: f.api.request, render() {},
      configOutbounds: () => f.state.config.outbounds,
      syncConfig(config) { f.state.config = config; f.state.jsonDraft = JSON.stringify(config, null, 2); } });
    if (operation === 'save') {
      servers.openServerEditor(0);
      servers.updateServerEditField('address', 'changed.example.test');
      await servers.saveServerEdit();
      assert.match(f.state.message, /обновлен в черновике/);
      assert.equal(f.state.config.outbounds[0].settings.vnext[0].address, 'changed.example.test');
    } else {
      servers.removeOutbound(0);
      assert.match(f.state.message, /удален из черновика/);
      assert.deepEqual(f.state.config.outbounds, []);
    }
    assert.doesNotMatch(f.notice(), /notice-details|invalid &lt;transport&gt;|Ошибка проверки Xray/);
    assert.equal(f.state.configTestLog.stderr, validation.stderr, 'the historical routing output is retained independently of the new result notice');
    assert.equal(f.state.appliedConfigText, activeBefore);
    assert.equal(f.state.activeConfigRevision, revisionBefore);
    assert.equal(f.state.serverDraftRevision, draftRevisionBefore);
    assert.equal(f.calls.filter((call) => call.path === '/api/config/apply').length, 1);
  });
}
