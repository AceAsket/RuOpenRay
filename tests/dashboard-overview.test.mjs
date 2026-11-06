import assert from 'node:assert/strict';
import test from 'node:test';
import { createDashboardView } from '../cmd/ruopenray-ui/web/dashboard-view.js';
import { byteSize, escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';

function dashboardFixture({ tag = '????fin_example_vpn-primary', label } = {}) {
  const state = {
    activeServerTag: tag,
    config: {
      outbounds: [
        { tag, protocol: 'vless', settings: { vnext: [{ address: '203.0.113.8', port: 443 }] } },
        { tag: 'backup', protocol: 'vless', settings: { vnext: [{ address: '203.0.113.9', port: 443 }] } },
        { tag: 'direct', protocol: 'freedom' },
      ],
      routing: { rules: [{ outboundTag: tag, domain: ['domain:example.com'] }] },
      dns: { servers: ['https://dns.google/dns-query'] },
    },
    serverMeta: label === undefined ? {} : { [tag]: { label } },
    status: {
      service: { running: true },
      core: { available: true, version: 'Xray test' },
      config: { outbounds: 3, routingRules: 1, path: '/etc/xray/config.json' },
    },
    firewallStatus: { active: true, routerMode: 'tproxy', ipRule: true, ipRoute: true },
    leases: [],
    serverCheckMode: 'http',
    serverChecks: {},
    serverCheckingTags: [],
    dashboardSelectedServerTag: '',
  };
  const view = createDashboardView({
    state,
    labels: { available: 'Доступно', missing: 'Не найден' },
    escapeHtml,
    routeStats: () => ({ proxy: 1, direct: 0, block: 0, other: 0 }),
    deviceStats: () => ({ proxy: 0 }),
    dnsStats: () => ({ servers: 1, doh: 1 }),
    coreUpdateInfo: () => ({}),
    proxyOutbounds: () => state.config.outbounds.filter((outbound) => outbound.protocol === 'vless'),
    deviceRules: () => [{ source: ['192.168.1.10'] }],
    outboundAddress: (outbound) => outbound?.settings?.vnext?.[0]?.address || '',
    logsPanel: () => '',
    byteSize,
    fmtUptime: () => '',
    byteRate: (value) => `${Number(value || 0)} B/s`,
    numberValue: (value) => Number(value || 0),
    activeProxyTag: () => state.activeServerTag,
    configOutbounds: () => state.config.outbounds,
    releaseDate: () => '',
    coreReleaseBadge: () => '',
    outboundTransport: () => 'tcp',
    proxyDirectionSummary: () => ({ outbounds: new Map([[state.activeServerTag, { rules: 1 }]]), balancers: new Map(), total: 1 }),
    proxyDirectionDetail: () => '1 направление',
    checkForTag: () => null,
    checkLabel: () => '',
    checkMethodLabel: () => '',
    serverLocationChip: () => '',
    configHasUnappliedChanges: () => false,
  });
  return { state, view };
}

function overview(html) {
  const match = html.match(/<section class="panel connection-overview"[\s\S]*?<\/section>/);
  assert.ok(match, 'dashboard contains the connection overview');
  return match[0];
}

function visibleText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

for (const [kind, label, expectedName] of [
  ['routing tag', undefined, 'fin_example_vpn-primary'],
  ['configured label', '????Финляндия <основной>', 'Финляндия &lt;основной&gt;'],
]) {
  test(`dashboard repairs the damaged prefix in the ${kind} while preserving routing identifiers`, () => {
    const { state, view } = dashboardFixture({ label });
    const beforeConfig = structuredClone(state.config);
    const beforeMeta = structuredClone(state.serverMeta);
    const tag = state.activeServerTag;
    const html = view.dashboard();
    assert.ok(visibleText(overview(html)).includes(expectedName), 'VPN node shows the repaired display name');
    const cardNames = [...html.matchAll(/<span class="server-option-main">\s*<strong>([\s\S]*?)<\/strong>/g)].map((match) => visibleText(match[1]));
    assert.ok(cardNames.includes(expectedName), 'server cards show the repaired display name');
    assert.doesNotMatch(visibleText(html), /\?{4,}/);
    assert.ok(html.includes(`data-server-check="${tag}"`), 'server checks retain the exact routing identifier');

    state.activeServerTag = 'backup';
    const withInactiveServer = view.dashboard();
    assert.ok(withInactiveServer.includes(`data-dashboard-select="${tag}"`));
    assert.ok(withInactiveServer.includes(`data-dashboard-connect="${tag}"`), 'switching servers retains the exact routing identifier');
    assert.deepEqual(state.config, beforeConfig);
    assert.deepEqual(state.serverMeta, beforeMeta);
  });
}

test('dashboard repairs a stale selected tag when the selected server is absent from the current list', () => {
  const { state, view } = dashboardFixture();
  state.config.outbounds = state.config.outbounds.filter((outbound) => outbound.tag !== state.activeServerTag);
  const beforeConfig = structuredClone(state.config);
  const html = overview(view.dashboard());
  assert.match(visibleText(html), /fin_example_vpn-primary/);
  assert.doesNotMatch(visibleText(html), /\?{4,}/);
  assert.deepEqual(state.config, beforeConfig);
});

test('dashboard does not claim enabled TPROXY interception when policy routing is incomplete', () => {
  const { state, view } = dashboardFixture();
  for (const [ipRule, ipRoute] of [[false, false], [false, true], [true, false]]) {
    state.firewallStatus = { active: true, routerMode: 'tproxy', ipRule, ipRoute };
    const html = overview(view.dashboard());
    assert.match(html, /Перехват трафика <strong>Требует проверки<\/strong>/);
    assert.doesNotMatch(html, /Перехват трафика <strong>Включён<\/strong>/);
    assert.doesNotMatch(html, /class="connection-link online"/);
  }
  state.firewallStatus = { active: true, routerMode: 'tproxy', ipRule: true, ipRoute: true };
  assert.match(overview(view.dashboard()), /Перехват трафика <strong>Включён<\/strong>/);
});

test('dashboard does not count configured device rules as DHCP devices', () => {
  const { view } = dashboardFixture();
  const html = overview(view.dashboard());
  assert.match(html, /Нет данных DHCP/);
  assert.doesNotMatch(html, /1 в списке DHCP|1 в локальной сети/);
});

function addDashboardServers(state, count = 8) {
  state.config.outbounds = [
    ...Array.from({ length: count }, (_, index) => ({ tag: `server-${index + 1}`, protocol: 'vless',
      settings: { vnext: [{ address: `server-${index + 1}.example.test`, port: 443 }] } })),
    { tag: 'direct', protocol: 'freedom' },
  ];
}

function cardTags(html) {
  return [...html.matchAll(/data-server-check="([^"]+)"/g)].map((match) => match[1]);
}

test('dashboard pagination exposes all eight connections without duplicate or missing cards', () => {
  const { state, view } = dashboardFixture();
  addDashboardServers(state);
  const before = structuredClone(state.config);
  const first = view.dashboard();
  assert.deepEqual(cardTags(first), ['server-1', 'server-2', 'server-3', 'server-4', 'server-5']);
  assert.match(first, /8 подключений/);
  assert.match(first, /Показано 1–5 из 8/);
  assert.match(first, /Страница 1 из 2/);
  assert.match(first, /aria-label="Предыдущая страница серверов" disabled/);

  state.dashboardServerPage = 2;
  const last = view.dashboard();
  assert.deepEqual(cardTags(last), ['server-6', 'server-7', 'server-8']);
  assert.match(last, /Показано 6–8 из 8/);
  assert.match(last, /Страница 2 из 2/);
  assert.match(last, /aria-label="Следующая страница серверов" disabled/);
  assert.equal(new Set([...cardTags(first), ...cardTags(last)]).size, 8);
  assert.deepEqual(state.config, before, 'paging never changes routing or server configuration');
});

test('dashboard refresh keeps the current page and the tail server selection and controls', () => {
  const { state, view } = dashboardFixture();
  addDashboardServers(state);
  state.dashboardServerPage = 2;
  state.dashboardSelectedServerTag = 'server-8';
  view.dashboard();
  state.status.service.uptime = 123;
  const refreshed = view.dashboard();
  assert.equal(state.dashboardServerPage, 2);
  assert.deepEqual(cardTags(refreshed), ['server-6', 'server-7', 'server-8']);
  assert.match(refreshed, /dashboard-server-option\s+selected/);
  assert.match(refreshed, /data-dashboard-select="server-8"/);
  assert.match(refreshed, /data-dashboard-connect="server-8"/);
  assert.match(refreshed, /data-server-check="server-8"/);
});

test('dashboard clamps a stale page when connections are removed and hides unnecessary pagination', () => {
  const { state, view } = dashboardFixture();
  addDashboardServers(state);
  state.dashboardServerPage = 2;
  view.dashboard();
  addDashboardServers(state, 5);
  const fewer = view.dashboard();
  assert.equal(state.dashboardServerPage, 1);
  assert.equal(cardTags(fewer).length, 5);
  assert.doesNotMatch(fewer, /aria-label="Страницы серверов"/);
  addDashboardServers(state, 0);
  assert.match(view.dashboard(), /Серверы пока не добавлены/);
  assert.equal(state.dashboardServerPage, 1);
});

test('dashboard handles invalid and out-of-range page state without showing an empty page', () => {
  const { state, view } = dashboardFixture();
  addDashboardServers(state);
  for (const [requested, expected] of [[undefined, 1], ['invalid', 1], [Infinity, 1], [1.5, 1], [-1, 1], [99, 2]]) {
    state.dashboardServerPage = requested;
    const html = view.dashboard();
    assert.equal(state.dashboardServerPage, expected);
    assert.ok(cardTags(html).length > 0);
  }
});

test('dashboard page navigation binds clicks, preserves configuration and restores keyboard focus', () => {
  const { state, view } = dashboardFixture();
  addDashboardServers(state);
  view.dashboard();
  const before = structuredClone(state.config);
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const listeners = new Map();
  const buttons = ['2', '0', 'invalid'].map((page) => ({ dataset: { dashboardServerPage: page, dashboardPageDirection: 'next' },
    disabled: page === '0', addEventListener: (_event, handler) => listeners.set(page, handler) }));
  let renders = 0, focusOptions;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelectorAll: (selector) => selector === '[data-dashboard-server-page]' ? buttons : [],
    querySelector: () => ({ querySelector: (selector) => selector.includes('direction') ? null : { focus: (options) => { focusOptions = options; } } }),
  } });
  try {
    bindNavigationControls({ state, render: () => { renders += 1; view.dashboard(); } });
    listeners.get('2')();
    assert.equal(state.dashboardServerPage, 2);
    assert.equal(renders, 1);
    assert.deepEqual(focusOptions, { preventScroll: true });
    listeners.get('2')();
    listeners.get('0')();
    listeners.get('invalid')();
    assert.equal(renders, 1, 'disabled, current and invalid pages do not trigger navigation');
    assert.deepEqual(state.config, before);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
});
