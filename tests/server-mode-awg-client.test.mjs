import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAWGClientConfig } from '../cmd/ruopenray-ui/web/server-mode-actions.js';

test('AWG client export contains ephemeral key, endpoint and obfuscation values', () => {
  const config = buildAWGClientConfig({
    publicHost: '2001:db8::10',
    publicKey: 'server-public-key',
    listenPort: 51999,
    mtu: 1360,
    advanced: { Jc: 4, Jmin: 40, H1: 123456789 }
  }, {
    allowedIps: '10.70.0.2/32, fd00::2/128',
    clientAllowedIps: '0.0.0.0/0, ::/0',
    clientDns: '1.1.1.1',
    persistentKeepalive: 25,
    presharedKey: 'shared-key'
  }, 'ephemeral-private-key');

  assert.match(config, /PrivateKey = ephemeral-private-key/);
  assert.match(config, /Address = 10\.70\.0\.2\/32/);
  assert.match(config, /Endpoint = \[2001:db8::10\]:51999/);
  assert.match(config, /AllowedIPs = 0\.0\.0\.0\/0, ::\/0/);
  assert.match(config, /Jc = 4/);
  assert.match(config, /H1 = 123456789/);
  assert.match(config, /PresharedKey = shared-key/);
});

test('AWG client export refuses missing public endpoint or ephemeral private key', () => {
  const peer = { allowedIps: '10.70.0.2/32' };
  assert.throws(() => buildAWGClientConfig({ publicKey: 'server' }, peer, 'private'), /публичный домен/i);
  assert.throws(() => buildAWGClientConfig({ publicHost: 'vpn.example.com', publicKey: 'server' }, peer, ''), /не хранится на сервере/i);
});
