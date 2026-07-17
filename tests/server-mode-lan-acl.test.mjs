import assert from 'node:assert/strict';
import test from 'node:test';

import { createServerModeView } from '../cmd/ruopenray-ui/web/server-mode-view.js';
import { applyServerModeAccessPreset } from '../cmd/ruopenray-ui/web/server-mode-actions.js';

test('server mode renders limited LAN controls for Xray and AWG peers', () => {
  const state = {
    config: { outbounds: [{ tag: 'direct' }, { tag: 'proxy' }] },
    serverMode: { awgRuntime: { healthy: true }, managed: {}, firewall: {} },
    serverModeDraft: {
      enabled: true,
      monitorClients: true,
      xray: [{
        id: 'public', name: 'Public', enabled: true, listen: '0.0.0.0', port: 443,
        protocol: 'vless', security: 'reality', reality: {},
        clients: [{ id: 'alice', name: 'Alice', enabled: true, egressTag: 'proxy', lanAllowedIps: '192.168.50.20/32', lanAllowedPorts: '22', lanProtocol: 'tcp' }]
      }],
      awg: [{
        id: 'awg', name: 'AWG', enabled: true, interface: 'awg-server0', listenPort: 51820, addressCidr: '10.70.0.1/24', advanced: {},
        peers: [{ id: 'phone', name: 'Phone', enabled: true, allowedIps: '10.70.0.2/32', lanAllowedIps: '192.168.50.30/32', lanAllowedPorts: '443', lanProtocol: 'tcp' }]
      }]
    }
  };
  const html = createServerModeView({ state, escapeHtml: (value) => String(value ?? '') }).serverModePanel();
  for (const field of [
    'xray.0.clients.0.lanAllowedIps',
    'xray.0.clients.0.lanAllowedPorts',
    'awg.0.peers.0.lanAllowedIps',
    'awg.0.peers.0.allowRouter',
    'awg.0.peers.0.allowDns'
  ]) {
    assert.match(html, new RegExp(`data-server-mode-field="${field.replaceAll('.', '\\.')}`));
  }
  assert.match(html, /data-server-mode-access-base="xray\.0\.clients\.0"/);
  assert.match(html, /data-server-mode-access-base="awg\.0\.peers\.0"/);
  assert.match(html, /Интернет \+ выбранные устройства LAN/);
  assert.match(html, /Технические настройки клиента/);
  assert.match(html, /LAN ограничен/);
});

test('server mode access presets keep LAN permissions explicit', () => {
  const target = {
    allowLan: true,
    allowRouter: true,
    allowDns: true,
    lanAllowedIps: '192.168.50.20/32',
    lanAllowedPorts: '443',
    lanProtocol: 'tcp'
  };

  applyServerModeAccessPreset(target, 'internet');
  assert.deepEqual(target, {
    allowLan: false,
    allowRouter: false,
    allowDns: false,
    lanAllowedIps: '',
    lanAllowedPorts: '',
    lanProtocol: 'any'
  });

  target.lanAllowedIps = '192.168.50.30/32';
  applyServerModeAccessPreset(target, 'limited');
  assert.equal(target.allowLan, false);
  assert.equal(target.lanAllowedIps, '192.168.50.30/32');

  target.allowDns = true;
  applyServerModeAccessPreset(target, 'full');
  assert.equal(target.allowLan, true);
  assert.equal(target.allowDns, true);
  assert.equal(target.lanAllowedIps, '');
});
