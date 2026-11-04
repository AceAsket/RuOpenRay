import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSetupActions } from '../cmd/ruopenray-ui/web/setup-actions.js';
import { createSetupModel } from '../cmd/ruopenray-ui/web/setup-model.js';
import { createSetupView, setupWizardStepIds } from '../cmd/ruopenray-ui/web/setup-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { createSetupNavigation } from '../cmd/ruopenray-ui/web/setup-navigation.js';
import { createConfigStateHelpers } from '../cmd/ruopenray-ui/web/config-state.js';

const selectedTag = '????de_example_selected';
const firstTag = 'example-first';
const sampleConfig = () => ({
  inbounds: [{ tag: 'local-socks', protocol: 'socks', listen: '127.0.0.1', port: 1080 }],
  outbounds: [
    { tag: firstTag, protocol: 'vless', settings: { vnext: [{ address: '192.0.2.10', port: 443 }] } },
    { tag: selectedTag, protocol: 'trojan', settings: { servers: [{ address: '192.0.2.11', port: 443 }] } },
    { tag: 'direct', protocol: 'freedom' },
  ],
  routing: { rules: [
    { type: 'field', domain: ['domain:example.test'], outboundTag: selectedTag },
    { type: 'field', domain: ['domain:pinned.example.test'], outboundTag: firstTag },
    { type: 'field', inboundTag: ['transparent_ipv4'], network: 'tcp,udp', outboundTag: selectedTag },
  ] },
  dns: { servers: ['9.9.9.9'] },
});

function fixture({ fallback = 'direct', requestHook, firewallResult, firewallHook, refreshHook } = {}) {
  const state = {
    tab: 'setup', setupStep: 'launch', setupFallbackMode: fallback, setupLanDnsMode: 'keep',
    setupRestartDnsmasq: true, setupApplying: false, setupResult: null, setupRollbackResult: null,
    config: sampleConfig(), status: { core: { available: true }, service: { running: true } },
    geoStatus: { geoip: { exists: true }, geosite: { exists: true } },
    lanDnsStatus: { mode: 'system', suggestedXrayPort: 10535, readiness: { ready: true } },
    firewallStatus: { routerMode: 'tproxy' }, firewallRouterMode: 'tproxy', dnsInboundPort: '10535',
    activeServerTag: selectedTag, selectedRoutePresets: ['example-scenario'], installPlan: {},
    activeConfigRevision: 'example-active-revision',
    serverDraftRevision: '', serverDraftConflict: false, activeConfigConflict: false,
  };
  state.jsonDraft = JSON.stringify(state.config, null, 2);
  const backendConfig = structuredClone(state.config);
  const calls = [];
  const syncs = [];
  let renders = 0;
  let refreshes = 0;
  const request = async (path, options = {}) => {
    const call = { path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    const override = requestHook?.(call);
    if (override !== undefined) return await override;
    if (path === '/api/config' && call.method === 'GET') return structuredClone(backendConfig);
    if (path === '/api/firewall/snapshot') return { ok: true, status: { active: false }, nftBody: '', hotplugBody: '' };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: call.body?.mode || 'system', readiness: { ready: true } };
    if (path === '/api/config/test') return { ok: true, stdout: 'synthetic config valid' };
    if (path === '/api/config/apply') return { ok: true, restart: { stdout: 'synthetic service restarted' }, draft: { activeRevision: 'example-applied-revision' } };
    if (path === '/api/firewall/restore') return { ok: true, status: { active: false, persistent: false, policyReady: false } };
    throw new Error(`Unexpected request: ${path}`);
  };
  const proxyOutbounds = () => state.config.outbounds.filter((item) => !['freedom', 'blackhole', 'dns'].includes(item.protocol));
  const firewallReadyStatus = (status) => Boolean(status.active && status.persistent && status.policyReady);
  const model = createSetupModel({ state, byteSize: String, proxyOutbounds, request, firewallReadyStatus,
    firewallInfo: () => ({ ready: false, transparent: [] }),
    syncConfig(next, options) { state.config = next; state.jsonDraft = JSON.stringify(next, null, 2); syncs.push(options); },
    ensureDnsServer(config, server) { if (!config.dns.servers.includes(server)) config.dns.servers.push(server); },
  });
  const actions = createSetupActions({ state, request, render() { renders++; },
    refresh: async (options) => { refreshes++; await refreshHook?.(options); }, syncLanDnsStatus: (status) => { state.lanDnsStatus = status; }, lanDnsModeLabel: String,
    ...model, firewallReadyStatus, applyFirewallWithRetry: async (attempts) => {
      calls.push({ path: 'firewall-with-retry', attempts });
      if (firewallHook) return await firewallHook();
      return firewallResult || { ok: true, status: { active: true, persistent: true, policyReady: true, routerMode: 'tproxy' } };
    },
  });
  const view = createSetupView({ state, escapeHtml, byteSize: String, shellQuote: String, ...model, firewallReadyStatus, firewallPorts: () => [80, 443] });
  return { state, model, actions, view, calls, syncs, backendConfig, proxyOutbounds, counters: () => ({ renders, refreshes }) };
}

const appSource = readFileSync(new URL('../cmd/ruopenray-ui/web/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const gateStart = appSource.indexOf('function setupStepGate(');
const gateSource = appSource.slice(gateStart, appSource.indexOf('\n}\n', gateStart) + 3);
const navigation = (f) => createSetupNavigation({ state: f.state, render() {}, stepIds: setupWizardStepIds,
  stepGate: new Function('state', 'setupReadiness', 'proxyOutbounds', `${gateSource}\nreturn setupStepGate;`)(f.state, f.model.setupReadiness, f.proxyOutbounds) });

test('three wizard steps, back and reentry preserve the exact config, draft, selected server and traffic choice', async () => {
  const f = fixture({ fallback: 'proxy' });
  f.state.setupStep = 'connection';
  const before = structuredClone({ config: f.state.config, draft: f.state.jsonDraft, selected: f.state.activeServerTag, presets: f.state.selectedRoutePresets });
  const nav = navigation(f);
  nav.setupStepNext(); assert.equal(f.state.setupStep, 'scenarios');
  nav.setupStepNext(); assert.equal(f.state.setupStep, 'launch');
  nav.setupStepBack(); assert.equal(f.state.setupStep, 'scenarios');
  nav.setupStepBack(); assert.equal(f.state.setupStep, 'connection');
  nav.setupStepBack(); assert.equal(f.state.setupStep, 'connection');
  f.state.setupStep = 'scenarios';
  await f.actions.openSetupWizard();
  assert.equal(f.state.setupStep, 'scenarios');
  assert.equal(f.state.setupFallbackMode, 'proxy');
  assert.deepEqual({ config: f.state.config, draft: f.state.jsonDraft, selected: f.state.activeServerTag, presets: f.state.selectedRoutePresets }, before);
  assert.equal(f.calls.length, 0);
});

test('missing prerequisites and direct mode without scenarios cannot write or apply settings', async () => {
  const f = fixture();
  f.state.status.core.available = false;
  f.state.setupStep = 'connection';
  navigation(f).setupStepNext();
  assert.equal(f.state.setupStep, 'connection');
  assert.match(f.state.setupStepNotice.title, /Xray/);
  await f.actions.runSetupWizard();
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.setupResult.ok, false);
  f.state.status.core.available = true;
  f.state.config.routing.rules = [];
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupStep, 'scenarios');
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.setupResult.ok, false);
});

test('all-traffic preparation retains the selected second proxy and pinned scenario destinations exactly', () => {
  const f = fixture({ fallback: 'proxy' });
  const outbounds = structuredClone(f.state.config.outbounds);
  const userRules = structuredClone(f.state.config.routing.rules.slice(0, 2));
  f.model.prepareSetupDraft({ message: false, persist: false });
  assert.equal(f.model.transparentCatchAllRoute(f.state.config).target, selectedTag);
  assert.deepEqual(f.state.config.routing.rules.filter((rule) => rule.domain?.some((domain) => domain.endsWith('example.test'))), userRules);
  assert.deepEqual(f.state.config.outbounds.filter((outbound) => outbound.protocol !== 'dns'), outbounds);
  assert.equal(f.state.activeServerTag, selectedTag);
  assert.equal(f.syncs[0].persist, false);
});

test('an in-flight launch never claims that RuOpenRay is already running or all steps are complete', async () => {
  let resolveConfig;
  const configWait = new Promise((resolve) => { resolveConfig = resolve; });
  const f = fixture({ requestHook: ({ path, method }) => path === '/api/config' && method === 'GET' ? configWait : undefined });
  const running = f.actions.runSetupWizard();
  try {
    assert.equal(f.state.setupApplying, true);
    const html = f.view.setupPage();
    assert.doesNotMatch(html, /<h3>RuOpenRay запущен<\/h3>|class="setup-result ok"|<em\b[^>]*>3\/3<\/em>/);
    assert.match(html, /Запускаю RuOpenRay/);
    assert.equal([...html.matchAll(/data-setup-step="[^"]+"[^>]*disabled/g)].length, 3);
    assert.equal(f.calls.some((call) => call.path === '/api/config/test'), false);
  } finally {
    resolveConfig(structuredClone(f.backendConfig));
    await running;
  }
  assert.equal(f.state.setupApplying, false);
  assert.equal(f.state.setupResult.ok, true);
});

test('failed validation retains the prepared draft and snapshot without applying Xray, DNS or firewall', async () => {
  const f = fixture({ requestHook: ({ path }) => path === '/api/config/test' ? { ok: false, stderr: 'synthetic validation failure <example>' } : undefined });
  const backendBefore = structuredClone(f.backendConfig);
  const outbounds = structuredClone(f.state.config.outbounds);
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupApplying, false);
  assert.equal(f.state.setupResult.ok, false);
  assert.match(f.state.message, /validation failure/);
  assert.deepEqual(f.backendConfig, backendBefore);
  assert.deepEqual(f.state.setupSnapshot.config, backendBefore);
  assert.deepEqual(f.state.config.outbounds.filter((outbound) => outbound.protocol !== 'dns'), outbounds);
  assert.deepEqual(JSON.parse(f.state.jsonDraft), f.state.config);
  assert.ok(f.state.config.inbounds.some((inbound) => inbound.tag === 'transparent_ipv4'));
  assert.equal(f.state.activeServerTag, selectedTag);
  assert.ok(f.syncs.every((options) => options.persist === false));
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(f.calls.some((call) => call.path === 'firewall-with-retry'), false);
  assert.doesNotMatch(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>/);
  assert.match(f.view.setupPage(), /synthetic validation failure &lt;example&gt;/);
});

test('successful launch validates before applying and reports firewall policy failure honestly', async () => {
  for (const [fallback, ready] of [['direct', true], ['direct', false], ['proxy', true], ['proxy', false]]) {
    const f = fixture({ fallback, firewallResult: { ok: true, status: { active: true, persistent: true, policyReady: ready } } });
    await f.actions.runSetupWizard();
    const posts = f.calls.filter((call) => call.method === 'POST');
    assert.deepEqual(posts.map((call) => call.path), ['/api/config/test', '/api/config/apply']);
    assert.deepEqual(posts[0].body.config, posts[1].body.config);
    assert.equal(posts[1].body.config.routing.rules.find((rule) => rule.domain?.includes('domain:example.test')).outboundTag, selectedTag);
    assert.equal(posts[1].body.config.routing.rules.find((rule) => rule.domain?.includes('domain:pinned.example.test')).outboundTag, firstTag);
    assert.equal(f.model.transparentCatchAllRoute(posts[1].body.config).target, fallback === 'proxy' ? selectedTag : 'direct');
    assert.equal(f.state.setupResult.ok, ready);
    assert.equal(f.state.setupApplying, false);
    assert.equal(f.state.firewallStatus.policyReady, ready);
    assert.equal(f.counters().refreshes, ready ? 1 : 0);
    assert.equal(f.calls.at(-1).path, 'firewall-with-retry');
    assert.equal(f.calls.at(-1).attempts, 3);
  }
});

test('a successful result becomes stale when config, selection, service or firewall readiness changes', async () => {
  for (const change of [
    (state) => { state.config.routing.rules.unshift({ type: 'field', domain: ['domain:new.example.test'], outboundTag: firstTag }); },
    (state) => { state.jsonDraft = '{invalid edited draft'; },
    (state) => { state.setupFallbackMode = 'proxy'; },
    (state) => { state.activeServerTag = firstTag; },
    (state) => { state.status.service.running = false; },
    (state) => { state.firewallStatus.policyReady = false; },
  ]) {
    const f = fixture();
    await f.actions.runSetupWizard();
    assert.match(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>/);
    change(f.state);
    assert.doesNotMatch(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>|<em\b[^>]*>3\/3<\/em>/);
    assert.equal(f.state.setupResult.ok, true, 'the recorded successful operation stays unchanged as history');
  }
});

test('rollback removes the previous launch success and does not claim completion while restoring', async () => {
  let rollbackCheck;
  let resolveCheck;
  const f = fixture({ requestHook: ({ path }) => path === '/api/config/test' ? rollbackCheck : undefined });
  await f.actions.runSetupWizard();
  rollbackCheck = new Promise((resolve) => { resolveCheck = resolve; });
  const restoring = f.actions.rollbackSetupWizard();
  assert.equal(f.state.setupRollbacking, true);
  assert.equal(f.state.setupRollbackResult.phase, 'running');
  assert.doesNotMatch(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>|class="setup-result ok"/);
  resolveCheck({ ok: true });
  await restoring;
  assert.equal(f.state.setupRollbackResult.ok, true);
  assert.equal(f.state.setupSnapshot, null);
  assert.doesNotMatch(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>|<em\b[^>]*>3\/3<\/em>/);
  assert.match(f.state.message, /Откат мастера выполнен/);
});

test('the scenarios gate cannot advertise launch readiness when Xray is missing', () => {
  const f = fixture();
  f.state.status.core.available = false;
  f.state.setupStep = 'scenarios';
  navigation(f).setupStepNext();
  assert.equal(f.state.setupStep, 'scenarios');
  assert.match(f.state.setupStepNotice.title, /Xray/);
  f.state.setupStep = 'launch';
  assert.match(f.view.setupPage(), /Сначала установите Xray/);
});

test('preparation reuses an existing custom transparent inbound without orphaning generated rule references', () => {
  const f = fixture({ fallback: 'proxy' });
  const tag = 'example-existing-transparent';
  f.state.config.inbounds.push({ tag, protocol: 'dokodemo-door', port: 52345, settings: { network: 'tcp,udp' }, streamSettings: { sockopt: { tproxy: 'tproxy' } } });
  f.state.config.routing.rules[2].inboundTag = [tag];
  const pinned = { type: 'field', inboundTag: [tag], domain: ['domain:pinned-custom.example.test'], outboundTag: firstTag };
  f.state.config.routing.rules.unshift(pinned);
  f.model.prepareSetupDraft({ message: false, persist: false });
  const inboundTags = new Set(f.state.config.inbounds.map((inbound) => inbound.tag));
  for (const rule of f.state.config.routing.rules) {
    for (const ruleTag of rule.inboundTag || []) assert.ok(inboundTags.has(ruleTag), `rule references existing inbound ${ruleTag}`);
  }
  assert.deepEqual(f.state.config.routing.rules.find((rule) => rule.domain?.includes('domain:pinned-custom.example.test')), pinned);
  assert.equal(f.state.config.inbounds.some((inbound) => inbound.tag === 'transparent_ipv4'), false);
  assert.equal(f.model.transparentCatchAllRoute(f.state.config).target, selectedTag);
  const once = structuredClone(f.state.config);
  f.model.prepareSetupDraft({ message: false, persist: false });
  assert.deepEqual(f.state.config, once, 'a second preparation is idempotent');
});

test('selection falls back only to a validated explicit proxy and then the first valid proxy', () => {
  for (const [current, selected, expected] of [[selectedTag, firstTag, selectedTag], ['direct', selectedTag, selectedTag], ['missing', 'missing', firstTag]]) {
    const f = fixture({ fallback: 'proxy' });
    f.state.config.routing.rules[2].outboundTag = current;
    f.state.activeServerTag = selected;
    f.model.prepareSetupDraft({ message: false, persist: false });
    assert.equal(f.model.transparentCatchAllRoute(f.state.config).target, expected);
  }
});

test('a successful snapshot step remains running while deferred validation is pending or fails', async () => {
  let resolveTest;
  const pendingTest = new Promise((resolve) => { resolveTest = resolve; });
  const f = fixture({ requestHook: ({ path }) => path === '/api/config/test' ? pendingTest : undefined });
  const running = f.actions.runSetupWizard();
  for (let turn = 0; turn < 10 && !f.calls.some((call) => call.path === '/api/config/test'); turn++) await Promise.resolve();
  try {
    assert.equal(f.state.setupResult.steps[0].ok, true);
    assert.equal(f.state.setupResult.phase, 'running');
    assert.doesNotMatch(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>|class="setup-result (ok|bad)"/);
  } finally {
    resolveTest({ ok: false, stderr: 'synthetic deferred validator failure' });
    await running;
  }
  assert.equal(f.state.setupResult.phase, 'error');
  assert.equal(f.state.setupResult.ok, false);
  assert.equal(f.calls.some((call) => call.path === '/api/config/apply'), false);
});

test('ordinary refresh formatting and object key order do not invalidate a matching successful configuration', async () => {
  const f = fixture();
  await f.actions.runSetupWizard();
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
  f.state.config = reorder(f.state.config);
  f.state.jsonDraft = JSON.stringify(f.state.config);
  f.state.status.service.uptime = 42;
  assert.match(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>/);
  assert.match(f.view.setupPage(), /Готово этапов: 3 из 3/);
});

test('reentry deduplicates pending installation plans and renders their result on the setup page', async () => {
  let resolvePlan;
  const pending = new Promise((resolve) => { resolvePlan = resolve; });
  const f = fixture({ requestHook: ({ path }) => path === '/api/install/plan' ? pending : undefined });
  f.state.installPlan = null;
  await f.actions.openSetupWizard();
  await f.actions.openSetupWizard();
  assert.equal(f.calls.filter((call) => call.path === '/api/install/plan').length, 1);
  const before = f.counters().renders;
  resolvePlan({ installable: true, disk: { free: 12345 } });
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  assert.equal(f.state.installPlan.disk.free, 12345);
  assert.ok(f.counters().renders > before);
});

test('concurrent run, rollback, draft preparation and reentry cannot replace the active operation', async () => {
  let resolveConfig;
  const pending = new Promise((resolve) => { resolveConfig = resolve; });
  const f = fixture({ requestHook: ({ path, method }) => path === '/api/config' && method === 'GET' ? pending : undefined });
  const running = f.actions.runSetupWizard();
  const result = f.state.setupResult;
  const draft = f.state.jsonDraft;
  const second = f.actions.runSetupWizard();
  await f.actions.rollbackSetupWizard();
  f.actions.setupPrepareDraft();
  await f.actions.openSetupWizard();
  assert.equal(f.state.setupResult, result);
  assert.equal(f.state.jsonDraft, draft);
  assert.equal(f.calls.filter((call) => call.path === '/api/config').length, 1);
  resolveConfig(structuredClone(f.backendConfig));
  await Promise.all([running, second]);
  assert.equal(f.calls.filter((call) => call.path === '/api/config/apply').length, 1);
});

test('incomplete recovery snapshots stop before any configuration, DNS or firewall write', async () => {
  for (const target of ['/api/config', '/api/firewall/snapshot', '/api/dns/lan-upstream']) {
    const f = fixture({ requestHook: ({ path, method }) => path === target && method === 'GET' ? null : undefined });
    await f.actions.runSetupWizard();
    assert.equal(f.state.setupResult.ok, false, target);
    assert.equal(f.calls.some((call) => call.method === 'POST' || call.path === 'firewall-with-retry'), false, target);
    assert.equal(f.state.setupSnapshot, undefined);
  }
});

test('retry after a partial apply retains the original recovery point instead of snapshotting changed settings', async () => {
  let current;
  let firewallAttempts = 0;
  const f = fixture({ requestHook: ({ path, method, body }) => {
    if (path === '/api/config' && method === 'GET') return structuredClone(current || sampleConfig());
    if (path === '/api/config/apply') { current = structuredClone(body.config); return { ok: true }; }
  }, firewallHook: async () => ({ ok: ++firewallAttempts > 1, error: 'synthetic firewall failure', status: { active: true, persistent: true, policyReady: firewallAttempts > 1 } }) });
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult.ok, false);
  const original = structuredClone(f.state.setupSnapshot.config);
  assert.notDeepEqual(current, original);
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult.ok, true);
  assert.deepEqual(f.state.setupSnapshot.config, original);
  assert.equal(f.calls.filter((call) => call.path === '/api/config').length, 1);
});

test('keeping LAN DNS means rollback never replaces an untouched multiple-upstream configuration', async () => {
  const dns = { ok: true, mode: 'upstream', servers: ['192.0.2.53', '192.0.2.54'], noresolv: true };
  const f = fixture({ requestHook: ({ path, method }) => path === '/api/dns/lan-upstream' && method === 'GET' ? dns : undefined });
  await f.actions.runSetupWizard();
  await f.actions.rollbackSetupWizard();
  assert.equal(f.state.setupRollbackResult.ok, true);
  assert.equal(f.calls.some((call) => call.path === '/api/dns/lan-upstream' && call.method === 'POST'), false);
});

test('a DNS configuration that cannot be restored is rejected before changing it', async () => {
  const f = fixture({ requestHook: ({ path, method }) => path === '/api/dns/lan-upstream' && method === 'GET'
    ? { ok: true, mode: 'upstream', servers: ['192.0.2.53', '192.0.2.54'] } : undefined });
  f.state.setupLanDnsMode = 'xray';
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult.ok, false);
  assert.equal(f.calls.some((call) => call.method === 'POST' || call.path === 'firewall-with-retry'), false);
});

test('apply uses captured active and draft revisions even if current UI revisions change during validation', async () => {
  const f = fixture({ requestHook: ({ path }) => {
    if (path === '/api/config/test') { f.state.activeConfigRevision = 'newer-example-revision'; f.state.serverDraftRevision = 'newer-example-draft'; return { ok: true }; }
  } });
  f.state.serverDraftRevision = 'known-example-draft';
  await f.actions.runSetupWizard();
  const payload = f.calls.find((call) => call.path === '/api/config/apply').body;
  assert.equal(payload.expectedConfigRevision, 'example-active-revision');
  assert.equal(payload.expectedDraftRevision, 'known-example-draft');
});

test('refresh failure cannot produce completion or discard the rollback recovery point', async () => {
  let fail = false;
  const f = fixture({ refreshHook: async (options) => { assert.equal(options.throwOnError, true); if (fail) throw new Error('synthetic refresh failure'); } });
  fail = true;
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult.phase, 'error');
  assert.match(f.state.message, /refresh failure/);
  const snapshot = f.state.setupSnapshot;
  await f.actions.rollbackSetupWizard();
  assert.equal(f.state.setupRollbackResult.phase, 'error');
  assert.equal(f.state.setupSnapshot, snapshot);
});

test('a selected balancer stays a balancer through inferred mode, preparation and summary display', () => {
  const f = fixture({ fallback: 'proxy' });
  const group = '????example_group';
  f.state.config.routing.balancers = [{ tag: group, selector: [selectedTag, firstTag], strategy: { type: 'random' } }];
  f.state.config.routing.rules[2] = { type: 'field', inboundTag: ['transparent_ipv4'], network: 'tcp,udp', balancerTag: group };
  f.state.serverMeta = { [group]: { label: 'Группа <пример>' } };
  assert.equal(f.model.setupFallbackModeFromConfig(), 'proxy');
  const pinned = structuredClone(f.state.config.routing.rules[0]);
  f.model.prepareSetupDraft({ message: false, persist: false });
  const target = f.model.transparentCatchAllRoute(f.state.config);
  assert.equal(target.rule.balancerTag, group);
  assert.equal(target.rule.outboundTag, undefined);
  assert.deepEqual(f.state.config.routing.rules.find((rule) => rule.domain?.includes('domain:example.test')), pinned);
  for (const step of setupWizardStepIds) {
    f.state.setupStep = step;
    assert.match(f.view.setupPage(), /Группа &lt;пример&gt;/);
  }
});

test('wizard reentry preserves an explicit uncommitted interception mode and clears only stale step notices', async () => {
  const f = fixture();
  f.state.firewallRouterMode = 'redirect';
  f.state.setupStepNotice = { step: 'launch', level: 'bad', title: 'obsolete gate failure' };
  await f.actions.openSetupWizard();
  assert.equal(f.state.firewallRouterMode, 'redirect');
  assert.equal(f.state.setupStepNotice, null);
});

test('short hex-looking server hostnames still get DNS bootstrap bypass rules', () => {
  const f = fixture();
  f.state.config.outbounds[0].settings.vnext[0].address = 'face';
  assert.equal(f.model.isIpLiteral('face'), false);
  assert.equal(f.model.isIpLiteral('2001:db8::1'), true);
  f.model.prepareSetupDraft({ message: false, persist: false });
  assert.ok(f.state.config.routing.rules.some((rule) => rule.outboundTag === 'direct' && rule.domain?.includes('domain:face')));
});

test('edits during validation abort before apply and edits after apply never change later DNS or firewall steps', async () => {
  for (const stage of ['/api/config/test', '/api/config/apply']) {
    const f = fixture({ requestHook: ({ path }) => {
      if (path === stage) { f.state.setupLanDnsMode = 'upstream'; f.state.setupLanDnsUpstream = '192.0.2.55'; return { ok: true }; }
    } });
    await f.actions.runSetupWizard();
    assert.equal(f.state.setupResult.phase, 'error');
    assert.match(f.state.message, /Настройки изменились/);
    assert.equal(f.calls.filter((call) => call.path === '/api/config/apply').length, stage === '/api/config/test' ? 0 : 1);
    assert.equal(f.calls.some((call) => call.path === '/api/dns/lan-upstream' && call.method === 'POST' || call.path === 'firewall-with-retry'), false);
    assert.equal(f.state.setupLanDnsUpstream, '192.0.2.55', 'the edited choice is kept for review');
  }
});

test('a changed login session stops a pending wizard before any mutating request', async () => {
  const f = fixture({ requestHook: ({ path }) => { if (path === '/api/config/test') { f.state.token = 'new-example-session'; return { ok: true }; } } });
  f.state.token = 'initial-example-session';
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult, null);
  assert.equal(f.state.setupApplying, false);
  assert.equal(f.calls.some((call) => call.path === '/api/config/apply' || call.path === 'firewall-with-retry'), false);
});

test('an explicit DNS restart failure stays failed even if a later read would match the chosen mode', async () => {
  let posted = false;
  const f = fixture({ requestHook: ({ path, method }) => {
    if (path !== '/api/dns/lan-upstream') return;
    if (method === 'POST') { posted = true; return { ok: false, mode: 'xray', readiness: { ready: true }, error: 'synthetic dnsmasq restart failed' }; }
    return { ok: true, mode: posted ? 'xray' : 'system', servers: [], readiness: { ready: true } };
  } });
  f.state.setupLanDnsMode = 'xray';
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult.phase, 'error');
  assert.match(f.state.message, /dnsmasq restart failed/);
  assert.equal(f.calls.some((call) => call.path === 'firewall-with-retry'), false);
  assert.equal(f.state.setupSnapshot.dnsMutationAttempted, true);
});

test('missing or malformed balancer references do not count as configured proxy scenarios', () => {
  const f = fixture();
  f.state.config.routing.balancers = [null, { tag: '' }];
  f.state.config.routing.rules = [{ type: 'field', domain: ['domain:example.test'], balancerTag: 'missing-example-group' }];
  assert.equal(f.model.setupReadiness().proxyRuleCount, 0);
});

test('own backend-normalized configuration is adopted after a matching revision refresh without losing concurrent edits', async () => {
  for (const mode of ['preserved-local', 'hydrated-active', 'concurrent-edit']) {
    let normalized;
    const f = fixture({ requestHook: ({ path, body }) => {
      if (path !== '/api/config/apply') return;
      normalized = structuredClone(body.config);
      normalized.inbounds.find((item) => item.tag === 'transparent_ipv4').sniffing.domainsExcluded = ['example.test'];
      return { ok: true, draft: { activeRevision: 'example-normalized-revision' } };
    }, refreshHook: async () => {
      createConfigStateHelpers(f.state).syncConfig(normalized, { activeConfig: normalized, fromServer: true, persist: false,
        forceDraft: mode === 'hydrated-active', serverDraft: { ok: true, exists: false, revision: '', activeRevision: 'example-normalized-revision' } });
      if (mode === 'concurrent-edit') {
        f.state.config.routing.rules.unshift({ domain: ['domain:concurrent.example.test'], outboundTag: firstTag });
        f.state.jsonDraft = JSON.stringify(f.state.config);
      }
    } });
    f.state.config.inbounds.push({ tag: 'transparent_ipv4', protocol: 'dokodemo-door', port: 52345,
      sniffing: { enabled: true, domainsExcluded: ['', 'example.test'] }, streamSettings: { sockopt: { tproxy: 'tproxy' } } });
    f.state.jsonDraft = JSON.stringify(f.state.config);
    await f.actions.runSetupWizard();
    if (mode === 'concurrent-edit') {
      assert.equal(f.state.setupResult.phase, 'error');
      assert.ok(f.state.config.routing.rules.some((rule) => rule.domain?.includes('domain:concurrent.example.test')));
    } else {
      assert.equal(f.state.setupResult.phase, 'complete', mode);
      assert.deepEqual(f.state.config.inbounds.find((item) => item.tag === 'transparent_ipv4').sniffing.domainsExcluded, ['example.test']);
      assert.equal(f.state.jsonDraft, f.state.appliedConfigText);
      assert.match(f.view.setupPage(), /<h3>RuOpenRay запущен<\/h3>/);
    }
  }
});

test('a rollback after an own successful apply uses the revision returned by that apply', async () => {
  let applies = 0;
  const f = fixture({ requestHook: ({ path, body }) => {
    if (path !== '/api/config/apply') return;
    if (++applies === 2) {
      assert.equal(body.expectedConfigRevision, 'example-own-apply-revision');
      assert.equal('expectedDraftRevision' in body, false, 'rollback does not authorize removal of a pending draft');
    }
    return { ok: true, draft: { activeRevision: applies === 1 ? 'example-own-apply-revision' : 'example-own-rollback-revision' } };
  }, firewallResult: { ok: false, status: { active: false } } });
  await f.actions.runSetupWizard();
  assert.equal(f.state.setupResult.phase, 'error');
  await f.actions.rollbackSetupWizard();
  assert.equal(f.state.setupRollbackResult.ok, true);
  assert.equal(applies, 2);
});
