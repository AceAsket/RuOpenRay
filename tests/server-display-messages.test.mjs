import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { createImportActions } from '../cmd/ruopenray-ui/web/import-actions.js';
import { createImportDialogView } from '../cmd/ruopenray-ui/web/import-dialog-view.js';
import { createServerActions } from '../cmd/ruopenray-ui/web/server-actions.js';
import { createServersView } from '../cmd/ruopenray-ui/web/servers-view.js';
import { createServerModeView } from '../cmd/ruopenray-ui/web/server-mode-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { proxyDisplayName, proxyDisplayText, proxyOptionLabel } from '../cmd/ruopenray-ui/web/proxy-label.js';
import { noticeView } from '../cmd/ruopenray-ui/web/notice-view.js';

const rawTag = '????de_example_vpn';
const poolTag = '????example_pool';
const candidateTag = '????fi_example_backup';
const visibleText = (html) => html.replace(/<[^>]*>/g, '');

function actionFixture({ label, request: requestOverride } = {}) {
  const state = {
    config: { outbounds: [{ tag: rawTag, protocol: 'vless' }, { tag: 'backup', protocol: 'vless' }], routing: { rules: [{ type: 'field', outboundTag: 'proxy' }, { type: 'field', outboundTag: 'backup', domain: ['domain:example.org'] }] } },
    serverMeta: label ? { [rawTag]: { label, country: 'DE' } } : {},
    activeServerTag: 'backup', activeConfigRevision: 'example-revision', message: '',
    subscriptionCandidateChecks: {}, subscriptionFallbackTick: 0,
  };
  state.jsonDraft = JSON.stringify(state.config);
  const messages = [];
  const calls = [];
  const request = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, body });
    return requestOverride ? requestOverride(path, options, body) : { ok: true };
  };
  const render = () => messages.push(state.message);
  const activeProxyTag = () => state.activeServerTag;
  const keepOperationVisible = async () => {};
  const refresh = async () => {};
  const importActions = createImportActions({ state, request, render, refresh, activeProxyTag,
    routeRules: () => state.config.routing.rules,
    setRoutingDraft: (rules) => { state.config.routing.rules = rules; state.jsonDraft = JSON.stringify(state.config); },
    setActiveServerTag: (tag) => { state.activeServerTag = tag; },
  });
  const configActions = createConfigActions({ state, request, render, refresh, keepOperationVisible, activeProxyTag });
  const actions = createServerActions({ state, request, render, refresh, keepOperationVisible,
    configOutbounds: () => state.config.outbounds, proxyOutbounds: () => state.config.outbounds,
    proxyRuleStrategyStats: () => ({ primary: 1, pinned: 1 }),
    setActiveProxyDraft: importActions.setActiveProxyDraft,
    applyConfig: configActions.applyConfig,
  });
  return { state, actions, messages, calls };
}

test('display labels prefer configured names and repair only the prefix without mutating identifiers', () => {
  const outbound = { tag: rawTag };
  const meta = { label: '????Рабочий VPN', country: 'DE' };
  const before = structuredClone({ outbound, meta });
  assert.equal(proxyDisplayName(rawTag), 'de_example_vpn');
  assert.equal(proxyDisplayName(rawTag, meta), 'Рабочий VPN');
  assert.equal(proxyOptionLabel(outbound, meta), 'DE · Рабочий VPN');
  assert.equal(proxyDisplayName('VPN? backup??'), 'VPN? backup??');
  assert.deepEqual([rawTag, candidateTag].map(proxyDisplayName), ['de_example_vpn', 'fi_example_backup']);
  assert.deepEqual({ outbound, meta }, before);
});

for (const label of [undefined, '????Рабочий VPN']) {
  test(`connecting repairs progress and success labels while applying exact routing identifiers (${label ? 'configured label' : 'tag fallback'})`, async () => {
    const { state, actions, calls, messages } = actionFixture({ label });
    const outbounds = structuredClone(state.config.outbounds);
    const meta = structuredClone(state.serverMeta);
    await actions.routeAllToOutbound(rawTag);
    const applied = calls.find((call) => call.path === '/api/config/apply');
    assert.ok(applied, 'the real config action sends the apply request');
    assert.equal(applied.body.config.routing.rules[0].outboundTag, rawTag);
    assert.equal(applied.body.config.routing.rules[1].outboundTag, 'backup');
    assert.equal(applied.body.expectedConfigRevision, 'example-revision');
    assert.deepEqual(applied.body.config.outbounds, outbounds);
    assert.equal(state.activeServerTag, rawTag);
    assert.deepEqual(state.serverMeta, meta);
    assert.match(state.message, new RegExp(`^Подключен ${label ? 'Рабочий VPN' : 'de_example_vpn'}\\.`));
    assert.ok(messages.some((message) => message.startsWith('Подключаю ')));
    for (const message of messages) assert.doesNotMatch(message, /\?{4}/);
    assert.equal(state.pendingServerTag, '');
  });
}

test('subscription selection, checks and deletion clean visible names while keeping exact API keys and result tags', async (t) => {
  const originalConfirm = globalThis.confirm;
  const prompts = [];
  globalThis.confirm = (prompt) => { prompts.push(prompt); return true; };
  t.after(() => { if (originalConfirm === undefined) delete globalThis.confirm; else globalThis.confirm = originalConfirm; });
  const { state, actions, calls } = actionFixture({ request: async (path) => {
    if (path.endsWith('/select')) return { ok: true, selected: { tag: candidateTag } };
    if (path.endsWith('/check-candidate')) return { ok: true, result: { tag: candidateTag, index: 2, ok: false } };
    return { ok: true };
  } });
  await actions.selectSubscriptionCandidate(poolTag, 2);
  assert.equal(state.message, 'Подписка example_pool: выбран fi_example_backup');
  state.serverCheckTimeout = '900';
  state.serverCheckAttempts = '4';
  state.serverCheckMode = 'http';
  await actions.checkSubscriptionCandidate(poolTag, 2);
  assert.equal(state.message, 'fi_example_backup · туннель не подтверждён');
  assert.equal(state.subscriptionCandidateChecks[poolTag][2].tag, candidateTag);
  assert.equal(calls[1].body.timeoutMs, 900);
  assert.equal(calls[1].body.attempts, 4);
  await actions.deleteSubscriptionPool(poolTag);
  assert.match(prompts[0], /^Удалить подписку example_pool\?/);
  assert.doesNotMatch(state.message, /\?{4}/);
  assert.deepEqual(calls.map((call) => call.body.tag), [poolTag, poolTag, poolTag]);
  assert.deepEqual(calls.slice(0, 2).map((call) => call.body.index), [2, 2]);
});

test('subscription rows distinguish a reachable TCP port from a failed tunnel and ignore another candidate’s result', () => {
  const candidate = { tag: candidateTag, address: '203.0.113.9', port: 443, protocol: 'vless', network: 'tcp', security: 'tls' };
  const check = { ...candidate, method: 'http', ok: false, endpointOk: true, errorCode: 'timeout' };
  const state = { subscriptionCandidateChecks: { [poolTag]: { 0: check } } };
  const view = createServersView({ state, escapeHtml });
  const pool = { tag: poolTag, active: 0, candidates: [candidate] };
  const checked = visibleText(view.subscriptionPoolCard(pool));
  assert.match(checked, /Таймаут туннеля/);
  assert.match(checked, /TCP открыт/);
  pool.candidates = [{ ...candidate, tag: 'different-candidate' }];
  const replaced = visibleText(view.subscriptionPoolCard(pool));
  assert.match(replaced, /не проверен/);
  assert.doesNotMatch(replaced, /Таймаут туннеля|TCP открыт/);
});

test('subscription fallback progress cleans a server name without rewriting progress or selection identifiers', async (t) => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let tick;
  globalThis.setInterval = (callback) => { tick = callback; return 1; };
  globalThis.clearInterval = () => {};
  t.after(() => { globalThis.setInterval = originalSetInterval; globalThis.clearInterval = originalClearInterval; });
  let finish;
  const response = new Promise((resolve) => { finish = resolve; });
  const { state, actions, calls, messages } = actionFixture({ request: async (path) => {
    if (path.startsWith('/api/subscriptions/fallback-progress')) return { active: true, checked: 1, total: 2, currentTag: candidateTag, currentAddress: '203.0.113.9', currentPort: 443 };
    if (path === '/api/subscriptions/fallback') return response;
    return { ok: true };
  } });
  state.subscriptionPools = [{ tag: poolTag, count: 2 }];
  const loading = actions.fallbackSubscriptionPool(poolTag);
  tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(state.subscriptionFallbackTag, poolTag);
  assert.equal(state.subscriptionFallbackCurrent, 'fi_example_backup 203.0.113.9 :443');
  assert.ok(calls.some((call) => call.path === `/api/subscriptions/fallback-progress?tag=${encodeURIComponent(poolTag)}`));
  finish({ ok: true, selected: { tag: candidateTag }, results: [{ index: 0, tag: candidateTag, ok: true }] });
  await loading;
  assert.equal(calls.find((call) => call.path === '/api/subscriptions/fallback').body.tag, poolTag);
  assert.equal(state.subscriptionCandidateChecks[poolTag][0].tag, candidateTag);
  assert.equal(state.message, 'Подписка example_pool: выбран fi_example_backup');
  for (const message of messages) assert.doesNotMatch(message, /\?{4}/);
});

test('subscription cards and import previews clean visible labels while preserving action and editor values', () => {
  const pool = { tag: poolTag, active: 0, count: 1, activeCandidate: { tag: candidateTag, address: '203.0.113.9', port: 443 }, candidates: [{ tag: candidateTag, displayTag: candidateTag, address: '203.0.113.9', port: 443 }] };
  const state = { serverMeta: { [poolTag]: { label: '????Моя подписка' } }, importOutboundTag: rawTag, importLink: 'example import draft', profileName: '', importCountry: '', importCountrySearch: '', subscriptionCandidateChecks: {} };
  const before = structuredClone({ pool, state });
  const html = createServersView({ state, escapeHtml }).subscriptionPoolCard(pool);
  assert.doesNotMatch(visibleText(html), /\?{4}/);
  assert.match(visibleText(html), /Моя подписка/);
  assert.match(visibleText(html), /fi_example_backup/);
  assert.ok(html.includes(`data-subscription-select="${poolTag}"`) || html.includes(`data-subscription-check="${poolTag}"`));
  const dialog = createImportDialogView({ state, escapeHtml, serverImportPreviewItem: () => ({ tag: rawTag, protocol: 'vless', address: '203.0.113.8', port: 443 }) }).importDialog('server');
  assert.doesNotMatch(visibleText(dialog), /\?{4}/);
  assert.ok(dialog.includes(`id="importOutboundTag" placeholder="Пусто = имя из ссылки" value="${rawTag}"`));
  assert.deepEqual({ pool, state }, before);
});

test('server-mode outbound choices show configured clean labels and retain exact selected egress identifiers', () => {
  const state = { config: { outbounds: [{ tag: rawTag }] }, serverMeta: { [rawTag]: { label: '????Рабочий VPN' } }, serverMode: {}, serverModeDraft: { enabled: true, xray: [{ id: 'example', name: 'Example', clients: [{ id: 'example-client', name: 'Телефон', egressTag: rawTag }] }], awg: [] } };
  const before = structuredClone(state);
  const html = createServerModeView({ state, escapeHtml }).serverModePanel();
  assert.ok(html.includes(`value="${rawTag}" selected>Рабочий VPN</option>`));
  assert.doesNotMatch(visibleText(html), /\?{4}/);
  assert.deepEqual(state, before);
});

test('embedded backend validation messages repair only known display names without changing the error or draft', () => {
  const response = { ok: false, error: `outbound "${rawTag}": unknown transport <example>` };
  const state = { config: { outbounds: [{ tag: rawTag }] }, serverMeta: {}, message: response.error,
    messageDetails: { forMessage: response.error, title: 'Проверка не пройдена', body: response.error, technical: response.error },
    jsonDraft: JSON.stringify({ outbounds: [{ tag: rawTag }] }),
  };
  const before = structuredClone({ state, response });
  const html = noticeView(state, escapeHtml);
  assert.match(visibleText(html), /outbound &quot;de_example_vpn&quot;: unknown transport &lt;example&gt;/);
  assert.doesNotMatch(visibleText(html), /\?{4}/);
  assert.equal(proxyDisplayText(`VPN? backup??; unknown ????unrelated; ${rawTag}-other`, state), `VPN? backup??; unknown ????unrelated; ${rawTag}-other`);
  assert.deepEqual({ state, response }, before);
});

test('message rendering tolerates an invalid config and obtains known names from its unchanged editor draft', () => {
  const state = { config: { outbounds: {}, routing: { rules: {}, balancers: {} } }, subscriptionPools: {},
    jsonDraft: JSON.stringify({ outbounds: [{ tag: rawTag }], routing: { balancers: [{ tag: poolTag, selector: candidateTag }] } }),
    message: `outbound "${rawTag}": invalid field`,
  };
  const before = structuredClone(state);
  assert.match(visibleText(noticeView(state, escapeHtml)), /outbound &quot;de_example_vpn&quot;: invalid field/);
  assert.deepEqual(state, before);
});
