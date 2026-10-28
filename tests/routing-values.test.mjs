import assert from 'node:assert/strict';
import test from 'node:test';

import { createRoutingDsl } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import {
  displayRouteDomainValues,
  normalizeRouteDomainValues
} from '../cmd/ruopenray-ui/web/routing-values.js';

test('plain domains are stored as Xray domain rules', () => {
  assert.deepEqual(
    normalizeRouteDomainValues(['push-apple.com.akadns.net', 'domain:ru.ot.io.mi.com', 'geosite:intel']),
    ['domain:push-apple.com.akadns.net', 'domain:ru.ot.io.mi.com', 'geosite:intel']
  );
});

test('route editor shows regular domain rules without noisy prefix', () => {
  assert.deepEqual(
    displayRouteDomainValues(['domain:push-apple.com.akadns.net', 'full:example.com', 'geosite:intel']),
    ['push-apple.com.akadns.net', 'full:example.com', 'geosite:intel']
  );
});

test('routing DSL accepts short domain lines and explicit domain prefixes', () => {
  const dsl = createRoutingDsl({
    state: { routeDslName: '' },
    escapeHtml: (value) => String(value),
    resolveRoutingAlias: (value) => value === 'proxy' ? 'server-de' : value,
    routeStatsFor: () => ({})
  });

  const parsed = dsl.parseRoutingDsl(`
push-apple.com.akadns.net -> direct
domain:ru.ot.io.mi.com -> direct
domain(domain:aliexpress.ru) -> direct
`);

  assert.equal(parsed.warnings.length, 0);
  assert.deepEqual(parsed.rules.map((rule) => rule.domain?.[0]), [
    'domain:push-apple.com.akadns.net',
    'domain:ru.ot.io.mi.com',
    'domain:aliexpress.ru'
  ]);
  assert.deepEqual(parsed.rules.map((rule) => rule.outboundTag), ['direct', 'direct', 'direct']);
});

function listDsl() {
  return createRoutingDsl({
    state: { routeDslName: '' },
    escapeHtml: String,
    resolveRoutingAlias: (tag) => tag === 'proxy' ? 'server-de' : tag,
  });
}

test('mixed plain lists use the chosen server without creating a catch-all', () => {
  const parsed = listDsl().parseRoutingDsl([
    '# services', 'example.com', 'domain:example.org', 'full:cdn.example.com',
    '192.0.2.1', '198.51.100.0/24', '2001:db8::1', '2001:db8::/32',
    '::ffff:192.0.2.1', 'geoip:private', 'geosite:youtube',
    'source(192.168.1.10)', 'network(udp) && ip(203.0.113.0/24)',
  ].join('\r\n'), 'outbound:server-fr');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rules.length, 12);
  assert.ok(parsed.rules.every((rule) => rule.outboundTag === 'server-fr' && !rule.balancerTag));
  assert.deepEqual(parsed.rules[0].domain, ['domain:example.com']);
  assert.deepEqual(parsed.rules[3].ip, ['192.0.2.1']);
  assert.deepEqual(parsed.rules[5].ip, ['2001:db8::1']);
  assert.deepEqual(parsed.rules[10].source, ['192.168.1.10']);
  assert.equal(parsed.rules[11].network, 'udp');
  assert.equal(parsed.defaultOutbound, '');
});

test('list selection supports direct, block, proxy aliases, server tags and balancers', () => {
  for (const [selected, expected] of [
    ['outbound:direct', { outboundTag: 'direct' }],
    ['outbound:block', { outboundTag: 'block' }],
    ['outbound:proxy', { outboundTag: 'server-de' }],
    ['outbound:Europe server:1', { outboundTag: 'Europe server:1' }],
    ['balancer:Europe pool', { balancerTag: 'Europe pool' }],
  ]) {
    const parsed = listDsl().parseRoutingDsl('example.com', selected);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.rules, [{ type: 'field', ...expected, domain: ['domain:example.com'] }]);
  }
});

test('explicit destinations override the selection and preserve legacy default behavior', () => {
  const parsed = listDsl().parseRoutingDsl('example.com\nexample.org -> direct\n192.0.2.1 -> balancer:pool\ndefault: block', 'outbound:server-fr');
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rules.map((rule) => rule.outboundTag || rule.balancerTag), ['server-fr', 'direct', 'pool', 'block']);
  assert.equal(parsed.rules[3].network, 'tcp,udp');
});

test('missing destination and malformed addresses or conditions report errors', () => {
  assert.equal(listDsl().parseRoutingDsl('example.com').rules.length, 0);
  assert.equal(listDsl().parseRoutingDsl('example.com').errors.length, 1);
  for (const line of ['999.0.0.1', '192.0.2.1/33', '2001:db8::/129', 'bad input', 'example.com ->', 'ip(192.0.2.1) && typo(value)']) {
    const parsed = listDsl().parseRoutingDsl(line, 'outbound:direct');
    assert.equal(parsed.rules.length, 0, line);
    assert.ok(parsed.errors.length, line);
  }
});
