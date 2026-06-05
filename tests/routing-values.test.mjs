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
