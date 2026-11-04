import assert from 'node:assert/strict';
import test from 'node:test';
import { createDashboardView } from '../cmd/ruopenray-ui/web/dashboard-view.js';
import { createDiagnosticsDomainView } from '../cmd/ruopenray-ui/web/diagnostics-domain-view.js';
import { createDiagnosticsTrafficView } from '../cmd/ruopenray-ui/web/diagnostics-traffic-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const tag = 'vpn_region_provider_primary_long_internal_identifier';
const address = '203.0.113.8';
const outbound = { tag, protocol: 'vless', settings: { vnext: [{ address, port: 443 }] } };
const endpoint = (item) => item?.settings?.vnext?.[0]?.address ? `${item.settings.vnext[0].address}:443` : '';
const bytes = (value) => `bytes:${Number(value || 0)}`;
const rate = (value) => `rate:${Number(value || 0)}`;

function trafficFixture(label) {
  const stats = {
    enabled: true,
    ok: true,
    outbounds: [
      { tag, kind: 'proxy', downlink: 123456, uplink: 4567, downRate: 890, upRate: 12 },
      { tag: 'direct', kind: 'direct', downlink: 111, uplink: 22, downRate: 33, upRate: 4 },
      { tag: 'unknown-counter', kind: 'proxy', downlink: 55, uplink: 6, downRate: 7, upRate: 8 },
    ],
    groups: { proxy: { downlink: 123511, uplink: 4573, downRate: 897, upRate: 20 } },
  };
  const state = {
    activeServerTag: tag,
    config: { outbounds: [outbound, { tag: 'direct', protocol: 'freedom' }] },
    serverMeta: label ? { [tag]: { label } } : {},
    status: { xrayStats: stats, system: {} },
    xrayTrafficHistory: [{ tag, downRate: 890, upRate: 12 }],
  };
  const dashboard = createDashboardView({
    state, escapeHtml, configOutbounds: () => state.config.outbounds,
    activeProxyTag: () => state.activeServerTag, outboundAddress: endpoint,
    byteSize: bytes, byteRate: rate, numberValue: (value) => Number(value || 0),
  });
  return { state, stats, dashboard };
}

for (const [label, expected] of [[undefined, `${address}:443`], ['Личный VPN <основной>', 'Личный VPN &lt;основной&gt;']]) {
  test(`filled Xray counters use ${label ? 'the configured label' : 'the endpoint fallback'} without changing counter identities`, () => {
    const { state, stats, dashboard } = trafficFixture(label);
    const before = structuredClone(state);
    const html = dashboard.xrayStatsPanel(stats);
    assert.ok(html.includes(expected));
    assert.ok(!html.includes(tag));
    assert.match(html, /bytes:123456/);
    assert.match(html, /rate:890/);
    assert.match(html, />direct<\/strong>/);
    assert.match(html, />unknown-counter<\/strong>/);
    assert.equal(dashboard.xrayActiveStats(stats).tag, tag);
    assert.equal(dashboard.xrayStatsOutbound(tag, stats).downlink, 123456);
    assert.deepEqual(state, before);
  });
}

test('enabled traffic statistics with no counters describe waiting rather than disabled statistics', () => {
  const state = { status: { xrayStats: { enabled: true }, system: {} }, serverMeta: {} };
  const view = createDiagnosticsTrafficView({
    state, escapeHtml, byteRate: rate, byteSize: bytes,
    proxyOutbounds: () => [], xrayStatsTotals: () => ({}), xrayActiveStats: () => null,
    xrayStatsPanel: () => '', trafficMonitor: () => '',
  });
  const before = structuredClone(state);
  const html = view.diagnosticsTrafficView();
  assert.match(html, /ожидаем данные/);
  assert.ok(!html.includes('включите статистику Xray'));
  assert.deepEqual(state, before);
});

test('compact domain filters retain raw filter keys, counts, selection and sort controls', () => {
  const counts = { domains: 7, ip: 3, dns: 4, tcp: 10, udp: 4, all: 14 };
  const state = {
    config: {}, serverMeta: {}, domainMonitor: {}, logs: '',
    domainMonitorFilter: 'ip', domainMonitorMode: 'domains', domainMonitorSort: 'hits',
    domainMonitorQuery: '', domainMonitorListWindow: 'medium',
  };
  const view = createDiagnosticsDomainView({
    state, escapeHtml, byteSize: bytes, byteRate: rate, stat: () => '',
    currentDomainMonitor: () => state.domainMonitor, configInbounds: () => [],
    monitorSourceLabel: () => 'fixture', domainMonitorDomainQuality: () => ({}),
    domainMonitorFilterCounts: () => counts, domainMonitorRows: () => [],
    monitoredDomains: () => [], monitoredDevices: () => [], monitoredEvents: () => [],
    selectedDomainMonitorDevice: () => null, aggregateLogDomains: () => [],
    domainDiagnosticRows: () => [], proxyOutbounds: () => [], activeProxyTag: () => '',
  });
  const before = structuredClone({ state, counts });
  const html = view.diagnosticsDomainMonitorView();
  const keys = [...html.matchAll(/data-domain-filter="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ['domains', 'ip', 'dns', 'tcp', 'udp', 'all']);
  const selected = html.match(/<button[^>]*data-domain-filter="ip"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(selected);
  assert.match(selected, /class="active"/);
  assert.match(selected, /aria-pressed="true"/);
  assert.match(selected, /class="domain-monitor-filter-count">3<\/strong>/);
  for (const sort of ['hits', 'last', 'name']) assert.ok(html.includes(`data-domain-sort="${sort}"`));
  assert.deepEqual({ state, counts }, before);
});
