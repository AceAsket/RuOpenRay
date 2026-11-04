import test from 'node:test';
import assert from 'node:assert/strict';
import { balancerMonitorForm, buildBalancerDraft, isFailoverBalancer } from '../cmd/ruopenray-ui/web/balancer-policy.js';
import { createRouteBalancerActions } from '../cmd/ruopenray-ui/web/route-balancer-actions.js';
import { createObservatoryActions } from '../cmd/ruopenray-ui/web/observatory-actions.js';
import { createRoutingDialogsView } from '../cmd/ruopenray-ui/web/routing-dialogs-view.js';
import { createServerModel } from '../cmd/ruopenray-ui/web/server-model.js';

const config = () => ({ outbounds: [
  { tag: '????fin-vpn', protocol: 'vless' }, { tag: 'de-vpn', protocol: 'trojan' }, { tag: 'direct', protocol: 'freedom' },
], routing: { rules: [{ domain: ['domain:example.test'], outboundTag: 'de-vpn' }] } });
const targets = [{ tag: '????fin-vpn' }, { tag: 'de-vpn' }];
const form = (cfg = config()) => ({ ...balancerMonitorForm(cfg), routeBalancerTag: 'VPN', routeBalancerEditingIndex: -1,
  routeBalancerMode: 'failover', routeBalancerPrimary: '????fin-vpn', routeBalancerFallback: 'de-vpn' });

test('failover keeps raw tags, monitors both VPNs, preserves rules and never edits input', () => {
  const cfg = config(), before = structuredClone(cfg);
  const next = buildBalancerDraft(cfg, form(), targets);
  assert.deepEqual(cfg, before);
  assert.deepEqual(next.routing.rules, cfg.routing.rules);
  assert.deepEqual(next.routing.balancers[0], { tag: 'VPN', selector: ['????fin-vpn'], strategy: { type: 'leastPing' }, fallbackTag: 'de-vpn' });
  assert.deepEqual(next.observatory.subjectSelector, ['????fin-vpn', 'de-vpn']);
  assert.equal(next.observatory.enableConcurrency, true);
  assert.ok(isFailoverBalancer(next.routing.balancers[0], next));
});

test('failover rejects identical, missing and ambiguous prefix primary/backup', () => {
  for (const patch of [{ routeBalancerFallback: '' }, { routeBalancerFallback: '????fin-vpn' }, { routeBalancerPrimary: 'missing' }]) {
    assert.throws(() => buildBalancerDraft(config(), { ...form(), ...patch }, targets));
  }
  const cfg = config(); cfg.outbounds.push({ tag: '????fin-vpn-copy', protocol: 'vless' });
  assert.throws(() => buildBalancerDraft(cfg, form(), targets), /префиксом/);
});

test('all balancing strategies exclude dead members and block instead of default direct', () => {
  for (const strategy of ['random', 'roundRobin', 'leastPing', 'leastLoad']) {
    const next = buildBalancerDraft(config(), { ...form(), routeBalancerMode: 'balance', routeBalancerStrategy: strategy,
      routeBalancerSelectors: '????fin-vpn\nde-vpn', routeBalancerFallback: '' }, targets);
    const balancer = next.routing.balancers[0];
    assert.equal(balancer.strategy.type, strategy);
    assert.equal(next.outbounds.find((o) => o.tag === balancer.fallbackTag).protocol, 'blackhole');
    assert.deepEqual(next.observatory.subjectSelector, ['????fin-vpn', 'de-vpn']);
    assert.equal(isFailoverBalancer(balancer, next), false);
  }
});

test('round robin without health check remains explicitly unmonitored', () => {
  const next = buildBalancerDraft(config(), { ...form(), routeBalancerMode: 'balance', routeBalancerStrategy: 'roundRobin',
    routeBalancerSelectors: 'de-vpn', routeBalancerFallback: '', routeBalancerHealthCheck: false }, targets);
  assert.equal(next.observatory, undefined);
  assert.equal(next.routing.balancers[0].fallbackTag, undefined);
});

test('editing preserves leastLoad costs, baselines, thresholds, other fields and renames references', () => {
  const cfg = config();
  const settings = { expected: 2, maxRTT: '2s', tolerance: .05, costs: [{ match: 'de', value: .5 }], baselines: ['500ms'] };
  cfg.routing.balancers = [{ tag: 'old', selector: ['de-vpn'], strategy: { type: 'leastLoad', settings }, extension: true }];
  cfg.routing.rules.push({ network: 'tcp,udp', balancerTag: 'old' });
  const next = buildBalancerDraft(cfg, { ...form(cfg), routeBalancerEditingIndex: 0, routeBalancerMode: 'balance',
    routeBalancerStrategy: 'leastLoad', routeBalancerSelectors: 'de-vpn', routeBalancerExpected: '3', routeBalancerFallback: '' }, targets);
  assert.deepEqual(next.routing.balancers[0].strategy.settings, { ...settings, expected: 3 });
  assert.equal(next.routing.balancers[0].extension, true);
  assert.equal(next.routing.rules[1].balancerTag, 'VPN');
});

test('monitor migration preserves coverage of other groups, with only one observer feature', () => {
  const cfg = config();
  cfg.observatory = { subjectSelector: ['other-vpn'], probeURL: 'https://example.test/204', probeInterval: '30s' };
  const next = buildBalancerDraft(cfg, { ...form(cfg), routeBalancerMonitorType: 'burstObservatory', routeBalancerProbeSampling: '2' }, targets);
  assert.equal(next.observatory, undefined);
  assert.deepEqual(next.burstObservatory.subjectSelector, ['other-vpn', '????fin-vpn', 'de-vpn']);
  assert.equal(next.burstObservatory.pingConfig.destination, 'https://example.test/204');
  const regular = buildBalancerDraft(next, { ...form(next), routeBalancerTag: 'other', routeBalancerMonitorType: 'observatory' }, targets);
  assert.equal(regular.burstObservatory, undefined);
  assert.ok(regular.observatory.subjectSelector.includes('other-vpn'));
});

test('invalid settings leave draft untouched, and save is a single atomic config change', () => {
  const state = { ...form(), config: config() }, before = structuredClone(state.config);
  let saves = 0;
  const actions = createRouteBalancerActions({ state, render() {}, routeBalancers: () => state.config.routing.balancers || [],
    routeRules: () => state.config.routing.rules, splitRouteValues: () => [], balancerTargetOptions: () => targets,
    syncConfig: (cfg) => { saves++; state.config = cfg; } });
  state.routeBalancerProbeUrl = 'file:///etc/passwd';
  actions.saveRouteBalancer();
  assert.equal(saves, 0); assert.deepEqual(state.config, before);
  state.routeBalancerProbeUrl = 'https://example.test/204';
  actions.saveRouteBalancer(); assert.equal(saves, 1);
  actions.openRouteBalancerDialog(0);
  assert.equal(state.routeBalancerMode, 'failover');
  assert.equal(state.routeBalancerPrimary, '????fin-vpn');
  assert.equal(state.routeBalancerProbeUrl, 'https://example.test/204');
});

test('invalid probe durations, URLs, samples and node counts are rejected', () => {
  for (const patch of [{ routeBalancerProbeInterval: '0s' }, { routeBalancerProbeUrl: 'https://user:password@example.test' },
    { routeBalancerProbeInterval: '-5s' }, { routeBalancerMonitorType: 'burstObservatory', routeBalancerProbeInterval: '1s' },
    { routeBalancerMonitorType: 'burstObservatory', routeBalancerProbeSampling: '0' },
    { routeBalancerMonitorType: 'burstObservatory', routeBalancerProbeTimeout: 'nonsense' }]) {
    assert.throws(() => buildBalancerDraft(config(), { ...form(), ...patch }, targets));
  }
});

test('observer coverage uses prefixes and includes random/RR with fallback', () => {
  const state = { config: {} };
  const actions = createObservatoryActions({ state, routeBalancers: () => [
    { strategy: { type: 'random' }, fallbackTag: 'block' }, { strategy: { type: 'roundRobin' } }
  ] });
  assert.equal(actions.outboundMatchesSelectors({ tag: 'de-vpn' }, ['vpn']), false);
  assert.equal(actions.outboundMatchesSelectors({ tag: 'de-vpn' }, ['de']), true);
  assert.equal(actions.outboundMatchesSelectors({ tag: 'de-vpn' }, ['']), false);
  assert.equal(actions.observatoryRequiredBalancers().length, 1);
});

test('dialog exposes primary, backup and common probe settings, or four balancing strategies', () => {
  const state = { ...form(), config: config(), routeBalancerDialog: true, routeBalancerSelectors: 'de-vpn' };
  const escapeHtml = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const view = createRoutingDialogsView({ state, escapeHtml, routeBalancers: () => [],
    balancerTargetOptions: () => targets.map((target) => ({ ...target, title: target.tag, detail: '' })),
    splitRouteValues: (s) => String(s || '').split('\n').filter(Boolean),
    balancerSelectorMatches: () => ['<img src=x onerror=alert(1)>'], strategyObserverType: () => '', routeRules: () => [] });
  let html = view.routeBalancerDialog();
  assert.match(html, /Основной VPN-сервер/); assert.match(html, /Резервный VPN-сервер/);
  assert.match(html, /Автоматический возврат/); assert.match(html, /routeBalancerProbeInterval/);
  assert.doesNotMatch(html, /id="routeBalancerStrategy"/);
  assert.match(html, /class="flag-svg"[^>]*aria-label="FI"/);
  assert.match(html, /class="flag-svg"[^>]*aria-label="DE"/);
  assert.match(html, /value="\?\?\?\?fin-vpn" selected/);
  state.serverMeta = { 'de-vpn': { country: 'NL' } };
  html = view.routeBalancerDialog();
  assert.match(html, /class="flag-svg"[^>]*aria-label="NL"/);
  assert.doesNotMatch(html, /class="flag-svg"[^>]*aria-label="DE"/);
  state.routeBalancerPrimary = ''; state.routeBalancerFallback = '';
  assert.doesNotMatch(view.routeBalancerDialog(), /class="flag-svg"/);
  state.routeBalancerMode = 'balance'; state.routeBalancerStrategy = 'roundRobin';
  html = view.routeBalancerDialog();
  for (const strategy of ['random', 'roundRobin', 'leastPing', 'leastLoad']) assert.match(html, new RegExp(`value="${strategy}"`));
  assert.match(html, /Исключать недоступные серверы/);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
});

const splitValues = (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
const balanceForm = (cfg = config()) => ({ ...form(cfg), routeBalancerMode: 'balance', routeBalancerStrategy: 'random',
  routeBalancerSelectors: 'de-vpn', routeBalancerFallback: '', routeBalancerHealthCheck: false });

function actionsFixture(cfg = config()) {
  const state = { ...balanceForm(cfg), config: cfg, disabledRouteRules: [] };
  let saves = 0;
  const actions = createRouteBalancerActions({ state, render() {}, routeBalancers: () => state.config.routing.balancers || [],
    routeRules: () => state.config.routing.rules, splitRouteValues: splitValues,
    balancerTargetOptions: () => state.config.outbounds.filter((item) => ['vless', 'trojan'].includes(item.protocol)),
    syncConfig(next) { saves++; state.config = next; },
    setRouteBalancersDraft(next) { saves++; state.config.routing.balancers = next; } });
  return { state, actions, saves: () => saves };
}

test('balance rejects missing selectors, service prefixes and ambiguous unchecked prefix members', () => {
  const cfg = config();
  cfg.outbounds.push({ tag: 'de-vpn-copy', protocol: 'vless' }, { tag: 'de-system', protocol: 'freedom' });
  const eligible = [...targets, { tag: 'de-vpn-copy' }];
  for (const selector of ['missing', 'direct', 'de', 'de-vpn']) {
    assert.throws(() => buildBalancerDraft(cfg, { ...balanceForm(cfg), routeBalancerSelectors: selector }, eligible),
      /не найден|служебн|префикс/);
  }
  const next = buildBalancerDraft(cfg, { ...balanceForm(cfg), routeBalancerSelectors: 'de-vpn\nde-vpn-copy' }, eligible);
  assert.deepEqual(next.routing.balancers[0].selector, ['de-vpn', 'de-vpn-copy']);
  const legacy = buildBalancerDraft(config(), { ...balanceForm(), routeBalancerSelectors: 'de-' }, targets);
  assert.deepEqual(legacy.routing.balancers[0].selector, ['de-']);
});

test('failover rejects service or absent primary/backup even if a stale target option contains it', () => {
  for (const patch of [{ routeBalancerPrimary: 'direct' }, { routeBalancerFallback: 'direct' },
    { routeBalancerPrimary: 'orphan-pool' }, { routeBalancerFallback: 'orphan-pool' }]) {
    assert.throws(() => buildBalancerDraft(config(), { ...form(), ...patch }, [...targets, { tag: 'direct' }, { tag: 'orphan-pool' }]));
  }
});

test('rename and delete protect archived rule references without mutating either draft', () => {
  const cfg = config(); cfg.routing.balancers = [{ tag: 'old', selector: ['de-vpn'], strategy: { type: 'random' } }];
  const f = actionsFixture(cfg);
  f.state.disabledRouteRules = [{ id: 'archived', rule: { domain: ['domain:archived.test'], balancerTag: 'old' } }];
  const before = structuredClone(f.state.config), archived = structuredClone(f.state.disabledRouteRules);
  f.actions.openRouteBalancerDialog(0);
  f.state.routeBalancerTag = 'renamed';
  f.actions.saveRouteBalancer();
  assert.equal(f.saves(), 0); assert.match(f.state.message, /отключенн/);
  f.actions.removeRouteBalancer(0);
  assert.equal(f.saves(), 0); assert.match(f.state.message, /отключенн/);
  assert.deepEqual(f.state.config, before); assert.deepEqual(f.state.disabledRouteRules, archived);
  f.state.routeBalancerTag = 'old';
  f.actions.saveRouteBalancer();
  assert.equal(f.saves(), 1, 'editing settings with the same name remains possible');
});

test('deleting a preceding group keeps the edited group anchored and cancel/reentry discard form edits', () => {
  const cfg = config();
  cfg.routing.balancers = ['first', 'second', 'third'].map((tag) => ({ tag, selector: ['de-vpn'], strategy: { type: 'random' } }));
  const f = actionsFixture(cfg);
  f.actions.openRouteBalancerDialog(1);
  f.actions.removeRouteBalancer(0);
  assert.equal(f.state.routeBalancerEditingIndex, 0);
  f.state.routeBalancerTag = 'second-edited';
  f.actions.saveRouteBalancer();
  assert.deepEqual(f.state.config.routing.balancers.map((item) => item.tag), ['second-edited', 'third']);
  const before = structuredClone(f.state.config);
  f.actions.openRouteBalancerDialog(0); f.state.routeBalancerTag = 'unsaved'; f.actions.closeRouteBalancerDialog();
  assert.deepEqual(f.state.config, before);
  f.actions.openRouteBalancerDialog(0); assert.equal(f.state.routeBalancerTag, 'second-edited');
  f.actions.removeRouteBalancer(0); assert.equal(f.state.routeBalancerEditingIndex, -1); assert.equal(f.state.routeBalancerTag, '');
});

test('stale edit anchors and duplicate group names cannot overwrite another group', () => {
  const cfg = config();
  cfg.routing.balancers = ['first', 'second'].map((tag) => ({ tag, selector: ['de-vpn'], strategy: { type: 'random' } }));
  const f = actionsFixture(cfg);
  f.actions.openRouteBalancerDialog(1);
  f.state.config.routing.balancers.shift();
  f.actions.saveRouteBalancer(); assert.equal(f.saves(), 0); assert.match(f.state.message, /изменил|откройте/i);
  assert.throws(() => buildBalancerDraft(cfg, { ...balanceForm(cfg), routeBalancerTag: 'second' }, targets), /уже есть/);
  const namespace = buildBalancerDraft(config(), { ...balanceForm(), routeBalancerTag: 'direct' }, targets);
  assert.equal(namespace.routing.balancers[0].tag, 'direct', 'outbound and balancer tag namespaces stay separate');
});

test('balancer options exclude orphan subscription pools and selector preview includes service matches', () => {
  const cfg = config();
  const state = { config: cfg, subscriptionPools: [{ tag: 'orphan', count: 2 }, { tag: 'de-vpn', count: 3 }] };
  const model = createServerModel({ state, configOutbounds: () => cfg.outbounds, splitRouteValues: splitValues,
    outboundAddress: () => 'server.example.test', outboundTransport: () => 'tcp' });
  assert.deepEqual(model.balancerTargetOptions().map((item) => item.tag), ['????fin-vpn', 'de-vpn']);
  assert.equal(model.balancerTargetOptions()[1].kind, 'subscription');
  assert.deepEqual(model.balancerSelectorMatches('dir'), ['direct']);
});

test('prefix-expanded and service primaries are not presented as single-server failover', () => {
  const cfg = config();
  const balancer = { selector: ['de-vpn'], fallbackTag: '????fin-vpn', strategy: { type: 'leastPing' } };
  assert.equal(isFailoverBalancer(balancer, cfg), true);
  cfg.outbounds.push({ tag: 'de-vpn-other', protocol: 'vless' });
  assert.equal(isFailoverBalancer(balancer, cfg), false);
  assert.equal(isFailoverBalancer({ ...balancer, selector: ['direct'] }, cfg), false);
});

test('monitored prefixes cannot accidentally select the auto-created blocking fallback', () => {
  const cfg = config(); cfg.outbounds.push({ tag: 'ruopenray-vpn', protocol: 'vless' });
  const before = structuredClone(cfg);
  assert.throws(() => buildBalancerDraft(cfg, { ...balanceForm(cfg), routeBalancerSelectors: 'ruopenray-', routeBalancerHealthCheck: true }, targets), /служебн/);
  assert.deepEqual(cfg, before);
});

test('active rules protect deletion and stale anchors reject a different group at a still-valid index', () => {
  const cfg = config(); cfg.routing.balancers = ['first', 'second'].map((tag) => ({ tag, selector: ['de-vpn'], strategy: { type: 'random' } }));
  cfg.routing.rules.push({ domain: ['domain:group.test'], balancerTag: 'first' });
  const f = actionsFixture(cfg);
  f.actions.removeRouteBalancer(0); assert.equal(f.saves(), 0); assert.match(f.state.message, /используется/);
  f.actions.openRouteBalancerDialog(0);
  f.state.config.routing.balancers.reverse();
  f.actions.saveRouteBalancer(); assert.equal(f.saves(), 0); assert.match(f.state.message, /изменил|откройте/i);
});

test('direction usage follows outboundTag priority when a legacy rule contains both targets', () => {
  const cfg = config(); cfg.routing.rules = [{ domain: ['domain:both.test'], outboundTag: 'de-vpn', balancerTag: 'group' }];
  const model = createServerModel({ state: { config: cfg }, configOutbounds: () => cfg.outbounds, routeRules: () => cfg.routing.rules,
    routeTarget: (rule) => ({ kind: 'domain', values: rule.domain }) });
  const usage = model.proxyDirectionSummary();
  assert.equal(usage.outbounds.get('de-vpn').rules, 1);
  assert.equal(usage.balancers.size, 0);
});

test('dialog labels member checkboxes and explains archived references before disabled delete', () => {
  const cfg = config(); cfg.routing.balancers = [{ tag: 'old', selector: ['de-vpn'], strategy: { type: 'random' } }];
  const state = { ...balanceForm(cfg), config: cfg, routeBalancerDialog: true,
    disabledRouteRules: [{ id: 'disabled-rule', rule: { balancerTag: 'old' } }] };
  const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const view = createRoutingDialogsView({ state, escapeHtml, routeBalancers: () => cfg.routing.balancers,
    balancerTargetOptions: () => targets.map((item) => ({ ...item, title: item.tag, detail: '' })),
    splitRouteValues: splitValues, balancerSelectorMatches: () => ['de-vpn'], strategyObserverType: () => '',
    routeRules: () => [], balancerStrategyLabel: () => 'Случайно' });
  const html = view.routeBalancerDialog();
  assert.match(html, /<label class="balancer-target active">\s*<input type="checkbox" data-balancer-selector="de-vpn" checked/);
  assert.match(html, /отключено: 1/);
  assert.match(html, /data-route-balancer-delete="0" disabled/);
  assert.match(html, /Xray сопоставляет имена по префиксу/);
});
