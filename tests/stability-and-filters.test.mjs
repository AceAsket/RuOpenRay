import test from 'node:test';
import assert from 'node:assert/strict';
import { tlsStabilityView } from '../cmd/ruopenray-ui/web/tls-stability-view.js';
import { adguardFiltersSection } from '../cmd/ruopenray-ui/web/adguard-filters-view.js';
import { createDiagnosticsActions } from '../cmd/ruopenray-ui/web/diagnostics-actions.js';
import { createAdguardActions } from '../cmd/ruopenray-ui/web/adguard-actions.js';
import { bindDiagnosticsControls } from '../cmd/ruopenray-ui/web/diagnostics-bindings.js';
import { proxyDisplayName, proxyOptionLabel } from '../cmd/ruopenray-ui/web/proxy-label.js';

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

test('Diagnostic labels replace damaged flag prefixes without changing outbound identifiers', () => {
  const outbound = { tag: '????fin_play2go', protocol: 'vless' };
  const html = tlsStabilityView({}, escapeHtml, [outbound], outbound.tag);
  assert.match(html, /value="\?\?\?\?fin_play2go" selected>FI · fin_play2go<\/option>/);
  assert.match(html, /class="flag-svg"[^>]*aria-label="FI"/);
  assert.equal(outbound.tag, '????fin_play2go');
  assert.equal(proxyDisplayName('🇳🇱 Amsterdam'), 'Amsterdam');
  assert.equal(proxyDisplayName('�� vpn'), 'vpn');
  assert.equal(proxyDisplayName('VPN? backup??'), 'VPN? backup??');
  assert.equal(proxyDisplayName('?custom'), '?custom');
  assert.equal(proxyOptionLabel({ tag: '????final-server' }), 'final-server');
  assert.equal(proxyOptionLabel(outbound, { country: 'NL' }), 'NL · fin_play2go');
});

test('Diagnostic labels escape imported names and retain distinct exact option values', () => {
  const options = [{ tag: '????de_<img onerror="x">' }, { tag: '🇩🇪 de_<img onerror="x">' }];
  const html = tlsStabilityView({}, escapeHtml, options, options[0].tag);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /value="\?\?\?\?de_&lt;img/);
  assert.match(html, /value="🇩🇪 de_&lt;img/);
  assert.equal(options[0].tag, '????de_<img onerror="x">');
});

test('TLS report distinguishes partial series and escapes error details', () => {
  const html = tlsStabilityView({ tlsStabilityResult: { complete: false, healthy: false, host: '<img>', results: [{ variant: 'proxy', tls: 'TLS 1.3', passed: 2, total: 3, complete: false, samples: [{ ok: false, error: '<script>broken</script>' }] }] } }, escapeHtml, [{ tag: 'vpn' }], 'vpn');
  assert.match(html, /Проверка неполная/);
  assert.match(html, /2\/3/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /В этой серии ошибок не обнаружено/);
});

test('TLS action requests comparison without applying any configuration', async () => {
  const state = { tlsStabilityAttempts: 3 };
  const calls = [];
  const actions = createDiagnosticsActions({ state, render() {}, activeProxyTag: () => 'vpn', request: async (path, options) => { calls.push([path, JSON.parse(options.body)]); return { ok: true, healthy: false, complete: true, results: [] }; } });
  await actions.runTLSStability();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/diagnostics/tls-stability');
  assert.equal(calls[0][1].compareFragment, true);
  assert.equal(calls[0][1].attempts, 3);
  assert.equal(state.tlsStabilityRunning, false);
  assert.equal(state.tlsStabilityResult.healthy, false);
});

test('TLS report shows failure phases and milestone times without trusting imported values', () => {
  const html = tlsStabilityView({ tlsStabilityResult: { results: [{ samples: [
    { ok: false, phase: 'tls', latencyMs: 8000, timings: { connectDoneMs: 4, tlsStartMs: 5 } },
    { ok: false, phase: '<img>', timings: { tlsDoneMs: '<script>' } },
  ] }] } }, escapeHtml);
  assert.match(html, /Ошибка · TLS · всего 8000 мс/);
  assert.match(html, /TCP \/ прокси: 4 мс/);
  assert.match(html, /&lt;img&gt;/);
  assert.doesNotMatch(html, /<img>|<script>/);
  assert.match(html, /вышестоящего роутера/);
  assert.match(html, /не складываются/);
});

test('TLS inputs reach the request before blur or a background render', async () => {
  const originalDocument = globalThis.document;
  const listeners = new Map();
  const fields = new Set(['#tlsStabilityTarget', '#tlsStabilityTag', '#tlsStabilityAttempts']);
  const state = {};
  globalThis.document = {
    addEventListener() {}, querySelectorAll: () => [],
    querySelector: (selector) => fields.has(selector) ? { addEventListener: (type, fn) => listeners.set(`${selector}:${type}`, fn) } : null,
  };
  try {
    bindDiagnosticsControls({ state, render() {} });
    listeners.get('#tlsStabilityTarget:input')({ target: { value: 'https://example.org/' } });
    listeners.get('#tlsStabilityAttempts:input')({ target: { value: '3' } });
    listeners.get('#tlsStabilityTag:change')({ target: { value: 'vpn-2' } });
    let payload;
    await createDiagnosticsActions({ state, render() {}, activeProxyTag: () => 'vpn-1', request: async (_path, options) => { payload = JSON.parse(options.body); return { ok: true }; } }).runTLSStability();
    assert.equal(payload.target, 'https://example.org/');
    assert.equal(payload.tag, 'vpn-2');
    assert.equal(payload.attempts, 3);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('Filter view shows disabled lists, dates and blocks writes when status is unavailable', () => {
  const state = { adguardStatus: { configured: true, ok: true, filtersError: 'API unavailable', filterLists: [{ name: '<img>', url: 'https://example.org/"x', enabled: false, rules: 42, updatedAt: '2026-10-22T10:00:00Z' }] } };
  const html = adguardFiltersSection(state, escapeHtml);
  assert.match(html, /Выключен/);
  assert.match(html, /42/);
  assert.match(html, /&lt;img&gt;/);
  assert.match(html, /data-action="adguardFilterToggle"[^>]*disabled/);
  assert.doesNotMatch(html, /<img>/);
});

test('Ambiguous filter write failure refreshes state and retains the form for review', async () => {
  const state = { adguardFilterName: 'My filter', adguardFilterUrl: 'https://example.org/filter' };
  const calls = [];
  const actions = createAdguardActions({ state, render() {}, refreshDomainMonitor: async () => ({}), request: async (path, options) => { calls.push(path); if (options?.method === 'POST') throw new Error('Timeout; refresh status before retry'); return { configured: true, ok: true }; } });
  await assert.rejects(actions.adguardFilterAdd(), /Timeout/);
  assert.equal(state.adguardFilterName, 'My filter');
  assert.match(state.adguardFilterError, /Timeout/);
  assert.equal(calls.filter((path) => path === '/api/dns/adguard').length, 2);
});
