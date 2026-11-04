import assert from 'node:assert/strict';
import test from 'node:test';
import { anonymizeConfig } from '../cmd/ruopenray-ui/web/config-actions.js';
import { createDnsActions } from '../cmd/ruopenray-ui/web/dns-actions.js';
import { createDnsModel } from '../cmd/ruopenray-ui/web/dns-model.js';

test('the ordinary DoH Basic Auth form exports a URL without its username or password', async () => {
  const state = { config: {}, dnsAddress: 'https://dns.google/dns-query', dnsDomains: '',
    dnsAuthEnabled: true, dnsAuthUser: 'private-user', dnsAuthPassword: 'private-password' };
  const model = createDnsModel({ state });
  const actions = createDnsActions({ state, ...model, render() {}, syncConfig(config) { state.config = config; },
    splitRouteValues: () => [], request: () => { throw new Error('unexpected network request'); } });
  await actions.addDnsServer();
  const original = structuredClone(state.config);
  const exported = anonymizeConfig(state.config);
  assert.equal(new URL(exported.dns.servers[0]).username, '');
  assert.equal(new URL(exported.dns.servers[0]).password, '');
  assert.doesNotMatch(JSON.stringify(exported), /private-user|private-password/);
  assert.deepEqual(state.config, original, 'export never mutates the working configuration');
});

test('nested URL query credentials and case-insensitive sensitive headers are masked', () => {
  const exported = anonymizeConfig({ dns: { servers: [
    'https://user:p%40ss@dns.example/dns-query?access_token=token-value&key=key-value&type=A',
    { address: 'https://other:password@dns.example/dns-query', domains: ['domain:example.test'] },
    'https://broken[host/?token=broken-secret'
  ] }, outbounds: [{ tag: 'my-proxy', streamSettings: { wsSettings: { headers: {
    Authorization: 'Bearer header-secret', 'Proxy-Authorization': 'Basic header-secret',
    Cookie: 'session=header-secret', 'Set-Cookie': 'session=header-secret', 'X-API-Key': 'header-secret', Accept: 'application/json'
  } } } }] });
  const body = JSON.stringify(exported);
  assert.doesNotMatch(body, /token-value|key-value|header-secret|broken-secret|other:password|p%40ss/);
  const url = new URL(exported.dns.servers[0]);
  assert.equal(url.searchParams.get('type'), 'A');
  assert.equal(exported.outbounds[0].streamSettings.wsSettings.headers.Accept, 'application/json');
  assert.deepEqual(exported.dns.servers[1].domains, ['domain:example.test']);
});
