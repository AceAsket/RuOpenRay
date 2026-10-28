import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShareLink, decodeSubscriptionEntries } from '../tools/dev-server/share-link.js';

test('development importer preserves VLESS gRPC and TLS settings', () => {
  const outbound = parseShareLink('vless://00000000-0000-0000-0000-000000000000@192.0.2.1:443?type=grpc&security=tls&sni=front.example.com&fp=chrome&alpn=h2%2Chttp%2F1.1&serviceName=tunnel%2Fservice&mode=multi&authority=grpc.example.com');
  assert.deepEqual(outbound.streamSettings, {
    network: 'grpc', security: 'tls',
    tlsSettings: { serverName: 'front.example.com', fingerprint: 'chrome', alpn: ['h2', 'http/1.1'] },
    grpcSettings: { serviceName: 'tunnel/service', multiMode: true, authority: 'grpc.example.com' },
  });
});

test('development importer preserves Trojan TLS and URL-encoded passwords', () => {
  const outbound = parseShareLink('trojan://p%3Aa%40ss%2Bword@[2001:db8::1]:443?peer=front.example.com&fp=firefox');
  assert.deepEqual(outbound.settings.servers[0], { address: '2001:db8::1', port: 443, password: 'p:a@ss+word' });
  assert.deepEqual(outbound.streamSettings, { network: 'tcp', security: 'tls', tlsSettings: { serverName: 'front.example.com', fingerprint: 'firefox' } });
});

test('development importer preserves XHTTP path/mode and websocket Host', () => {
  const prefix = 'vless://00000000-0000-0000-0000-000000000000@example.com:443?';
  assert.deepEqual(parseShareLink(prefix + 'type=xhttp&path=%2Fxhttp&mode=stream-one').streamSettings.xhttpSettings, { path: '/xhttp', mode: 'stream-one' });
  assert.deepEqual(parseShareLink(prefix + 'type=ws&path=%2Fstream%2Fupdates&host=cdn.example.com').streamSettings.wsSettings, { path: '/stream/updates', headers: { Host: 'cdn.example.com' } });
});


test('development importer rejects removed TLS verification bypass and unsupported parameters', () => {
  for (const query of ['allowInsecure=true', 'insecure=1', 'allowInsecure=false&insecure=true', 'extra=%7B%7D', 'fm=2']) {
    assert.throws(() => parseShareLink(`trojan://secret@example.com:443?${query}`));
  }
});


test('empty import preview still renders reasons without exposing markup', async () => {
  const { createImportDialogView } = await import('../cmd/ruopenray-ui/web/import-dialog-view.js');
  const escapeHtml = (value) => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const state = { subscriptionPreview: { items: [], report: { total: 1, accepted: 0, skipped: 1, issues: [{ entry: 1, message: 'bad <script>' }] } } };
  const html = createImportDialogView({ state, escapeHtml }).importDialog('subscription');
  assert.match(html, /распознано: 0; пропущено: 1/);
  assert.match(html, /Запись 1: bad &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('background refresh preserves the selected update channel', async () => {
  const { loadAppSnapshot } = await import('../cmd/ruopenray-ui/web/refresh.js');
  const paths = [];
  await loadAppSnapshot({ request: async (path) => { paths.push(path); return {}; }, text: async () => '', logsUrl: () => '/logs', appChannel: 'test' });
  assert.ok(paths.includes('/api/app/releases?channel=test'));
});


test('subscription names retain spaces and do not create spurious rejected records', () => {
  const raw = '# provider comment\r\ntrojan://test@example.test:443#Demo server EU 1\r\nvless://id@example.test:443#Demo server EU 2';
  for (const body of [raw, Buffer.from(raw).toString('base64url')]) {
    const entries = decodeSubscriptionEntries(body);
    assert.equal(entries.length, 2);
    assert.equal(parseShareLink(entries[0]).tag, 'Demo server EU 1');
    assert.equal(parseShareLink(entries[1]).tag, 'Demo server EU 2');
  }
});
