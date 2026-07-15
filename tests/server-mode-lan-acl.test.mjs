import assert from 'node:assert/strict';
import test from 'node:test';

import { createServerModeView } from '../cmd/ruopenray-ui/web/server-mode-view.js';

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
  assert.match(html, /LAN ограничен/);
});
