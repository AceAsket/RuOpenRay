import test from 'node:test';
import assert from 'node:assert/strict';
import { balancerMonitorForm, buildBalancerDraft, isFailoverBalancer } from '../cmd/ruopenray-ui/web/balancer-policy.js';
import { createRouteBalancerActions } from '../cmd/ruopenray-ui/web/route-balancer-actions.js';
import { createObservatoryActions } from '../cmd/ruopenray-ui/web/observatory-actions.js';
import { createRoutingDialogsView } from '../cmd/ruopenray-ui/web/routing-dialogs-view.js';

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
