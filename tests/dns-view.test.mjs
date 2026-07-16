import assert from 'node:assert/strict';
import test from 'node:test';

import { createDnsView } from '../cmd/ruopenray-ui/web/dns-view.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderDns(overrides = {}) {
  const state = {
    dnsView: 'servers',
    dnsAddress: 'https://dns.google:443/dns-query',
    dnsAuthEnabled: false,
    dnsAuthUser: '',
    dnsAuthPassword: '',
    dnsDomains: '',
    dnsCheckHost: 'example.com',
    dnsCheckResult: null,
    dnsBootstrapResult: null,
    dnsCustomAddOpen: false,
    dnsDiagnostics: null,
    lanDnsStatus: { mode: 'xray' },
    lanDnsMode: 'xray',
    configTesting: false,
    configApplying: false,
    busyAction: '',
    message: '',
    ...overrides,
  };
  const servers = [
    'https://dns.google:443/dns-query',
    'https://dns.adguard-dns.com/dns-query',
    '8.8.8.8',
  ];
  return createDnsView({
    activeProxyTag: () => 'proxy',
    configInbounds: () => [],
    currentDnsMode: () => 'normal',
    describeDnsServer: (server) => ({
      address: typeof server === 'string' ? server : server.address,
      domains: [],
      network: '',
      port: String(server).startsWith('https://') ? '' : '53',
    }),
    dnsAnswerText: () => '',
    dnsConfig: () => ({ servers, hosts: {} }),
    dnsStats: () => ({ servers: 3, doh: 2, tcp: 0, hosts: 0 }),
    escapeHtml,
    lanDnsModeLabel: (mode) => mode === 'xray' ? 'Через Xray' : mode,
    routeRules: () => [],
    state,
  }).dnsPanel();
}

test('DNS landing page shows current state without duplicate statistics', () => {
  const html = renderDns();
  assert.match(html, /Защищённый DNS настроен/);
  assert.match(html, /class="dns-overview"/);
  assert.doesNotMatch(html, /class="stats route-stats"/);
  assert.match(html, /class="panel dns-servers-panel"/);
  assert.match(html, /class="panel dns-add-panel"/);
});

test('DNS custom fields stay collapsed until requested', () => {
  const collapsed = renderDns();
  const expanded = renderDns({ dnsCustomAddOpen: true });
  assert.match(collapsed, /<details class="dns-custom-add" data-dns-custom-add >/);
  assert.match(expanded, /<details class="dns-custom-add" data-dns-custom-add open>/);
  assert.match(collapsed, /Свой DNS-сервер/);
  assert.match(collapsed, /Добавить в черновик/);
});

test('LAN DNS keeps the primary choice simple and technical fields collapsed', () => {
  const html = renderDns({
    dnsView: 'lan',
    lanDnsStatus: {
      available: true,
      mode: 'xray',
      servers: ['127.0.0.1#10535'],
      routerLan: '192.168.50.1',
      xrayTarget: '127.0.0.1#10535',
      readiness: { ready: true, inbound: true, outbound: true, rule: true, port: true },
      adguardHome: { available: false },
    },
    lanDnsMode: 'xray',
    lanDnsUpstream: '',
    dnsInboundPort: '10535',
    lanDnsRestart: true,
    lanDnsSaving: false,
    lanDnsPreview: null,
  });
  assert.match(html, /DNS домашних устройств/);
  assert.match(html, /Рекомендуется/);
  assert.match(html, /Проверить изменения/);
  assert.match(html, /data-details-key="lan-dns-technical"/);
  assert.match(html, /data-details-key="lan-dns-adguard"/);
  assert.ok(html.indexOf('Порт DNS inbound Xray') > html.indexOf('data-details-key="lan-dns-technical"'));
});

test('DNS protection keeps problems visible and technical checks collapsed', () => {
  const html = renderDns({ dnsView: 'guard' });
  assert.match(html, /class="dns-guard-overview bad"/);
  assert.match(html, /Что проверить/);
  assert.match(html, /data-details-key="dns-guard-quick-setup"/);
  assert.match(html, /data-details-key="dns-guard-full-checklist"/);
  assert.doesNotMatch(html, /data-details-key="dns-guard-diagnostics"/);
  assert.ok(html.indexOf('guard-item ok') > html.indexOf('data-details-key="dns-guard-full-checklist"'));
  assert.ok(html.indexOf('data-action="dnsWizardSecure"') > html.indexOf('data-details-key="dns-guard-quick-setup"'));
  assert.equal((html.match(/data-action="checkDnsDiagnostics"/g) || []).length, 1);
});

test('DNS router diagnostics appear only after a check has results', () => {
  const html = renderDns({
    dnsView: 'guard',
    dnsDiagnostics: {
      summary: 'Все DNS-пути отвечают',
      system: { ok: true, durationMs: 4, addresses: ['192.0.2.1'] },
      autoProbes: [{ server: '1.1.1.1', ok: true, durationMs: 6, addresses: ['192.0.2.1'] }],
      xrayDns: { ok: true, durationMs: 5, addresses: ['192.0.2.1'] },
      warnings: [],
    },
  });
  assert.match(html, /data-details-key="dns-guard-diagnostics"/);
  assert.match(html, /Результаты проверки роутера/);
  assert.match(html, /Все DNS-пути отвечают/);
  assert.doesNotMatch(html, /Технические данные/);
});
