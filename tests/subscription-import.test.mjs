import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShareLink } from '../tools/dev-server/share-link.js';

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
