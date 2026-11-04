import assert from 'node:assert/strict';
import test from 'node:test';
import { createFirewallActions } from '../cmd/ruopenray-ui/web/firewall-actions.js';

test('a changed wizard selection stops a firewall retry before sending another payload', async () => {
  const state = {};
  const requests = [];
  let selection = 'original';
  const actions = createFirewallActions({
    state, render() {}, firewallPayload: () => ({ selection }), firewallReadyStatus: () => false,
    delay: async () => { selection = 'edited while waiting'; },
    request: async (path, options) => { requests.push({ path, payload: options?.body && JSON.parse(options.body) }); return { ok: false, status: { active: false } }; },
  });
  await assert.rejects(actions.applyFirewallWithRetry(3, { beforeAttempt: () => { if (selection !== 'original') throw new Error('Selection changed'); } }), /Selection changed/);
  assert.deepEqual(requests.filter((item) => item.path === '/api/firewall/apply'), [{ path: '/api/firewall/apply', payload: { selection: 'original' } }]);
});

test('normal firewall calls without a wizard guard retain retries and their selected payload', async () => {
  const state = {};
  let applies = 0;
  const actions = createFirewallActions({
    state, render() {}, delay: async () => {}, firewallPayload: () => ({ selectedDevices: ['192.0.2.20'] }), firewallReadyStatus: (status) => Boolean(status.ready),
    request: async (path, options) => {
      if (path !== '/api/firewall/apply') return { ready: false };
      applies++;
      assert.deepEqual(JSON.parse(options.body), { selectedDevices: ['192.0.2.20'], compatConfirmed: true });
      return { ok: applies > 1, status: { ready: applies > 1 } };
    },
  });
  const result = await actions.applyFirewallWithRetry(3, { compatConfirmed: true });
  assert.equal(result.ok, true);
  assert.equal(applies, 2);
});
