import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfigStateHelpers } from '../cmd/ruopenray-ui/web/config-state.js';
import { bindConfigControls } from '../cmd/ruopenray-ui/web/config-bindings.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { createServersView } from '../cmd/ruopenray-ui/web/servers-view.js';
import { createDashboardView } from '../cmd/ruopenray-ui/web/dashboard-view.js';
import { humanServerValidationReason, recordServerValidation, serverValidationIssue } from '../cmd/ruopenray-ui/web/server-validation-state.js';

const outbound = (tag = 'bad') => ({ tag, protocol: 'vless', settings: { endpoint: `${tag}.example.test` }, streamSettings: { network: 'grpc' } });
const failure = (tags = ['bad'], complete = true) => ({
  ok: false,
  outboundErrorsComplete: complete,
  outboundErrors: tags.map((tag) => ({ tag, message: `Xray отверг транспорт ${tag}`, source: 'xray' })),
});

function fixture() {
  const config = { outbounds: [outbound('bad'), outbound('good')] };
  return { config, jsonDraft: JSON.stringify(config), status: { core: { version: 'Xray 26.10.31 a4a3dff' } }, serverChecks: {}, serverCheckingTags: [], serverCheckHistory: [] };
}

function viewFor(state) {
  return createServersView({
    state, escapeHtml,
    activeProxyTag: () => 'good',
    configOutbounds: () => state.config.outbounds,
    proxyOutbounds: () => state.config.outbounds,
    isSystemOutbound: () => false,
    checkForTag: (tag) => state.serverChecks[tag] || null,
    outboundAddress: (item) => item.settings.endpoint,
    outboundUsage: () => 0,
    serverLocationChip: () => '',
    serverMetaChips: (_outbound, _usage, check) => `<div class="server-meta">${check?.ok ? '<span class="server-chip ok">Туннель доступен</span>' : '<span>Не проверен в сети</span>'}</div>`,
    serverTrafficView: () => '',
    serverStats: () => ({ used: 1 }),
    operationProgressView: () => '',
  });
}

test('only exact tagged errors from real Xray validation produce a server rejection', () => {
  const state = fixture();
  const result = failure();
  result.outboundErrors.push({ tag: 'good', message: 'timeout', source: 'network' }, { tag: 'missing', message: 'unknown outbound', source: 'xray' });
  const before = structuredClone({ config: state.config, result });
  recordServerValidation(state, result, state.config);
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]).message, 'Xray отверг транспорт bad');
  assert.equal(serverValidationIssue(state, state.config.outbounds[1]), null);
  assert.deepEqual({ config: state.config, result }, before);
});

test('an unrelated failed network/API response cannot infer a core rejection', () => {
  const state = fixture();
  recordServerValidation(state, { ok: false, error: 'gRPC timeout', errorCode: 'core' }, state.config);
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]), null);
  assert.equal(serverValidationIssue(state, state.config.outbounds[1]), null);
});

test('failed incomplete validation keeps earlier confirmed errors for unchanged outbounds', () => {
  const state = fixture();
  recordServerValidation(state, failure(['bad', 'good']), state.config);
  recordServerValidation(state, failure(['bad'], false), state.config);
  assert.ok(serverValidationIssue(state, state.config.outbounds[1]));
  recordServerValidation(state, failure(['bad'], true), state.config);
  assert.equal(serverValidationIssue(state, state.config.outbounds[1]), null);
  assert.ok(serverValidationIssue(state, state.config.outbounds[0]));
});

test('successful core validation clears rejections without changing network observations', () => {
  const state = fixture();
  state.serverChecks.bad = { ok: false, error: 'timeout' };
  recordServerValidation(state, failure(), state.config);
  recordServerValidation(state, { ok: true }, state.config);
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]), null);
  assert.deepEqual(state.serverChecks.bad, { ok: false, error: 'timeout' });
});

test('late validation of an older outbound cannot mark an edited server red', () => {
  const state = fixture();
  const submitted = structuredClone(state.config);
  state.config.outbounds[0].streamSettings.network = 'tcp';
  recordServerValidation(state, failure(), submitted);
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]), null);
});

test('rejections survive key ordering changes but not a changed core version', () => {
  const state = fixture();
  recordServerValidation(state, failure(), state.config);
  const item = state.config.outbounds[0];
  const reordered = { streamSettings: item.streamSettings, settings: item.settings, protocol: item.protocol, tag: item.tag };
  assert.ok(serverValidationIssue(state, reordered));
  state.status.core.version = 'Xray 26.11.1 another-build';
  assert.equal(serverValidationIssue(state, reordered), null);
});

for (const staleResult of [{ ok: true }, failure()]) {
  test(`a late ${staleResult.ok ? 'successful' : 'failed'} validation from the previous core cannot replace fresh results`, async () => {
    const state = fixture();
    const checkedCoreVersion = state.status.core.version;
    let resolve;
    const pending = new Promise((done) => { resolve = done; }).then((result) => {
      recordServerValidation(state, result, state.config, checkedCoreVersion);
    });
    state.status.core.version = 'Xray 26.11.1 new-core';
    const currentResult = failure();
    currentResult.outboundErrors[0].message = 'Confirmed by the new core';
    recordServerValidation(state, currentResult, state.config, state.status.core.version);
    const before = structuredClone(state.serverValidation);
    resolve(staleResult);
    await pending;
    assert.deepEqual(state.serverValidation, before);
    assert.equal(serverValidationIssue(state, state.config.outbounds[0]).message, 'Confirmed by the new core');
  });
}

test('only the confirmed core plaintext prohibition receives a Russian explanation', () => {
  const raw = 'infra/conf: vless without TLS or other encryption is prohibited for public servers';
  const human = 'VLESS без TLS или другого шифрования запрещён для публичного сервера. Нужны корректные параметры провайдера.';
  assert.equal(humanServerValidationReason(raw), human);
  assert.equal(humanServerValidationReason('invalid fragment delay'), 'invalid fragment delay');
  assert.equal(humanServerValidationReason('gRPC network timeout'), 'gRPC network timeout');
  const state = fixture();
  const result = failure();
  result.outboundErrors[0].message = raw;
  recordServerValidation(state, result, state.config);
  const html = viewFor(state).serverCard(state.config.outbounds[0], 0, 'good');
  assert.ok(html.includes(human));
  assert.ok(html.includes(`title="${raw}"`));
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]).message, raw);
});

test('config synchronization prunes edited and deleted snapshots so readding cannot revive red badges', () => {
  const state = fixture();
  const removed = structuredClone(state.config.outbounds[0]);
  recordServerValidation(state, failure(), state.config);
  const helpers = createConfigStateHelpers(state);
  helpers.syncConfig({ outbounds: [state.config.outbounds[1]] });
  assert.equal(serverValidationIssue(state, removed), null);
  helpers.syncConfig({ outbounds: [removed] });
  assert.equal(serverValidationIssue(state, removed), null);
  recordServerValidation(state, failure(), state.config);
  helpers.syncConfig({ outbounds: [{ ...removed, protocol: 'trojan' }] });
  helpers.syncConfig({ outbounds: [removed] });
  assert.equal(serverValidationIssue(state, removed), null);
});

test('duplicate or untagged outbounds are never assigned an ambiguous core error', () => {
  const state = fixture();
  state.config.outbounds.push(outbound('bad'), { protocol: 'vless' });
  recordServerValidation(state, failure(), state.config);
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]), null);
});

test('raw JSON editing prunes deleted observations before the same server can be readded', (t) => {
  const state = fixture();
  const original = structuredClone(state.config);
  recordServerValidation(state, failure(), state.config);
  const listeners = {};
  const previousDocument = globalThis.document;
  globalThis.document = { querySelector: () => ({ addEventListener(type, callback) { listeners[type] = callback; } }) };
  t.after(() => { globalThis.document = previousDocument; });
  bindConfigControls({ state });
  listeners.input({ target: { value: JSON.stringify({ outbounds: [] }), scrollTop: 0 } });
  listeners.input({ target: { value: JSON.stringify(original), scrollTop: 0 } });
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]), null);
});

test('special object property names remain ordinary outbound tags', () => {
  const state = fixture();
  state.config.outbounds = [outbound('__proto__')];
  recordServerValidation(state, failure(['__proto__']), state.config);
  assert.equal(serverValidationIssue(state, state.config.outbounds[0]).tag, '__proto__');
  assert.equal({}.source, undefined);
});

test('server cards show actual Xray rejection separately from successful network availability', () => {
  const state = fixture();
  state.serverChecks.bad = { ok: true };
  const result = failure();
  result.outboundErrors[0].message = 'unknown transport <grpc> & bad option';
  recordServerValidation(state, result, state.config);
  const before = structuredClone(state);
  const html = viewFor(state).serverCard(state.config.outbounds[0], 0, 'good');
  assert.match(html, /has-xray-error/);
  assert.match(html, /Xray не принимает/);
  assert.match(html, /unknown transport &lt;grpc&gt; &amp; bad option/);
  assert.match(html, /Туннель доступен/);
  assert.doesNotMatch(html, /<grpc>/);
  assert.deepEqual(state, before);
  assert.doesNotMatch(viewFor(state).serverCard(state.config.outbounds[1], 1, 'good'), /Xray не принимает/);
});

test('server page exposes explicit read-only core validation, separately from network checking', () => {
  const state = fixture();
  let html = viewFor(state).serversPanel();
  assert.match(html, /data-action="test"[^>]*>Проверить конфигурацию серверов/);
  assert.match(html, /без применения изменений/);
  assert.match(html, /data-action="checkServers"/);
  state.configTesting = true;
  html = viewFor(state).serversPanel();
  assert.match(html, /data-action="test" disabled>Проверяю Xray/);
});

test('dashboard server picker shares confirmed rejection and keeps network health and connect controls', () => {
  const state = fixture();
  state.serverChecks.bad = { ok: true, httpOk: true, endpointOk: true, latencyMs: 12 };
  const result = failure();
  const rawReason = 'infra/conf: vless without TLS or other encryption is prohibited <fixture>';
  result.outboundErrors[0].message = rawReason;
  recordServerValidation(state, result, state.config);
  const view = createDashboardView({
    state, escapeHtml, activeProxyTag: () => 'good',
    proxyDirectionSummary: () => ({ outbounds: new Map([['good', { rules: 1 }]]), balancers: new Map() }),
    proxyDirectionDetail: () => '1 направление',
    checkForTag: (tag) => state.serverChecks[tag],
    outboundAddress: (item) => item.settings.endpoint,
    outboundTransport: (item) => item.streamSettings.network,
  });
  const before = structuredClone(state);
  const html = view.dashboardServerSwitch(state.config.outbounds);
  assert.match(html, /dashboard-server-option[^"\n]*has-xray-error/);
  assert.match(html, /Xray не принимает/);
  assert.match(html, /VLESS без TLS или другого шифрования запрещён/);
  assert.ok(html.includes(`title="${escapeHtml(rawReason)}"`));
  assert.match(html, /HTTP 12 мс/);
  assert.match(html, /data-dashboard-connect="bad"/);
  assert.match(html, /data-dashboard-select="bad"/);
  assert.equal((html.match(/Xray не принимает/g) || []).length, 1);
  assert.deepEqual(state, before);
  state.config.outbounds[0].streamSettings.network = 'tcp';
  assert.doesNotMatch(view.dashboardServerSwitch(state.config.outbounds), /Xray не принимает/);
});
