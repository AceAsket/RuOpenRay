import assert from 'node:assert/strict';
import test from 'node:test';
import { adguardUpstreamsSection, dohUrlKey } from '../cmd/ruopenray-ui/web/adguard-upstreams-view.js';
import { createAdguardActions } from '../cmd/ruopenray-ui/web/adguard-actions.js';
import { bindDnsControls } from '../cmd/ruopenray-ui/web/dns-bindings.js';

const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const google = 'https://8.8.8.8/dns-query';
const cloudflare = 'https://1.1.1.1/dns-query';
const route = '[/vpn.example/]https://9.9.9.9/dns-query';
const configured = () => ({ configured: true, ok: true, upstreams: [google], upstreamSnapshot: [google, route] });

test('DoH view separates historical averages from successful measured samples and escapes API text', () => {
  const state = { adguardStatus: { ...configured(), statsPeriodHours: 24, upstreamStats: [{ url: 'https://8.8.8.8:443/dns-query', averageMs: 1099, responses: 100 }] },
    adguardUpstreamResult: { checkedAt: '2026-10-06T12:00:00Z', results: [{ url: google, ok: false, medianMs: 83.5, succeeded: 2, samples: [{ host: '<script>', type: 'A', ok: true, ms: 190 }, { host: 'example.org', type: 'AAAA', ok: false, error: '<img src=x>' }, { host: 'cloudflare.com', type: 'A', ok: true, ms: 83 }] }] } };
  const html = adguardUpstreamsSection(state, escapeHtml);
  assert.match(html, /последние 24 ч/);
  assert.match(html, /100 ответов/);
  assert.match(html, /2\/3 успешных/);
  assert.match(html, /первое соединение/);
  assert.match(html, /Есть ошибки/);
  assert.match(html, /Кэш AdGuard не участвует/);
  assert.match(html, /Медиана учитывает только успешные/);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.equal(dohUrlKey(google), dohUrlKey('https://8.8.8.8:443/dns-query'));
  const empty = adguardUpstreamsSection({ adguardStatus: configured() }, escapeHtml);
  assert.match(empty, /Нет статистики/);
  assert.doesNotMatch(empty, /0 мс/);
});

test('DoH save is disabled for unavailable API, external file or pending operation', () => {
  for (const state of [{}, { adguardStatus: { ...configured(), ok: false } }, { adguardStatus: { ...configured(), upstreamFile: '/etc/file' } }, { adguardStatus: configured(), busyAction: 'adguardUpstreamCheck' }]) {
    assert.match(adguardUpstreamsSection(state, escapeHtml), /data-action="adguardUpstreamSave" disabled/);
  }
  assert.doesNotMatch(adguardUpstreamsSection({ adguardStatus: configured() }, escapeHtml), /data-action="adguardUpstreamSave" disabled/);
});

test('Measurement only probes candidates, preserves current settings and drops results for an edited list', async () => {
  const state = { adguardStatus: configured(), adguardUpstreamDraft: cloudflare };
  const calls = [];
  const actions = createAdguardActions({ state, render() {}, request: async (path, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, results: [{ url: cloudflare, succeeded: 3 }] };
  } });
  await actions.adguardUpstreamCheck();
  assert.deepEqual(calls, [{ action: 'upstream-check', upstreams: [cloudflare] }]);
  assert.equal(state.adguardUpstreamDraft, cloudflare);
  assert.deepEqual(state.adguardStatus.upstreamSnapshot, [google, route]);
  assert.equal(state.adguardUpstreamResult.results[0].succeeded, 3);
  const changing = createAdguardActions({ state, render() {}, request: async () => {
    state.adguardUpstreamDraft = google;
    return { ok: true, results: [{ url: cloudflare }] };
  } });
  await changing.adguardUpstreamCheck();
  assert.equal(state.adguardUpstreamResult, null);
  assert.match(state.message, /изменён во время/);
});

test('Upstream save uses the form baseline, keeps edits on failure and refreshes confirmed state on success', async () => {
  const state = { adguardStatus: configured(), adguardUpstreamDraft: cloudflare, adguardUpstreamBase: [google, route] };
  const rejected = createAdguardActions({ state, render() {}, request: async (_, options) => {
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.baseUpstreams, [google, route]);
    throw new Error('stale configuration');
  } });
  await assert.rejects(rejected.adguardUpstreamSave(), /stale/);
  assert.equal(state.adguardUpstreamDraft, cloudflare);
  assert.equal(state.message, undefined);
  let synced = false;
  const calls = [];
  const accepted = createAdguardActions({ state, render() {}, syncLanDnsStatus() { synced = true; }, request: async (path, options) => {
    calls.push({ path, body: options?.body && JSON.parse(options.body) });
    return options ? { ok: true } : { ...configured(), upstreams: [cloudflare], upstreamSnapshot: [cloudflare, route] };
  } });
  await accepted.adguardUpstreamSave();
  assert.equal(state.adguardUpstreamDraft, null);
  assert.equal(state.adguardUpstreamBase, null);
  assert.equal(state.adguardStatus.upstreams[0], cloudflare);
  assert.equal(synced, true);
  assert.deepEqual(calls.map((call) => call.path), ['/api/dns/adguard', '/api/dns/adguard', '/api/dns/lan-upstream']);
});

test('Editing keeps the original baseline through background refresh, presets deduplicate default HTTPS port', () => {
  const state = { adguardStatus: configured() };
  const handlers = {};
  const input = { addEventListener(type, fn) { handlers.input = fn; } };
  const preset = { dataset: { adguardUpstreamPreset: google }, addEventListener(type, fn) { handlers.preset = fn; } };
  globalThis.document = { querySelector: (selector) => selector === '#adguardUpstreams' ? input : null,
    querySelectorAll: (selector) => selector === '[data-adguard-upstream-preset]' ? [preset] : [] };
  try {
    bindDnsControls({ state, render() {} });
    handlers.input({ target: { value: 'https://8.8.8.8:443/dns-query' } });
    assert.deepEqual(state.adguardUpstreamBase, [google, route]);
    state.adguardStatus = { ...configured(), upstreamSnapshot: [cloudflare, route] };
    handlers.preset();
    assert.equal(state.adguardUpstreamDraft, 'https://8.8.8.8:443/dns-query');
    handlers.input({ target: { value: cloudflare } });
    assert.deepEqual(state.adguardUpstreamBase, [google, route]);
    handlers.preset();
    assert.equal(state.adguardUpstreamDraft, `${cloudflare}\n${google}`);
    assert.deepEqual(state.adguardUpstreamBase, [google, route]);
  } finally { delete globalThis.document; }
});
