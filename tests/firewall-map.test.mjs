import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { firewallMapBases, firewallMapChains, firewallMapSelection, firewallMapCounter, firewallMapRuleText } from '../cmd/ruopenray-ui/web/firewall-map-model.js';
import { firewallMapPanel } from '../cmd/ruopenray-ui/web/firewall-map-view.js';
import { createFirewallMapController } from '../cmd/ruopenray-ui/web/firewall-map-actions.js';

const chain = (id, family, table, name, hook = '', priority = null, rules = []) => ({ id, family, table, name, hook, priority, rules });
function fixture() {
  const child = chain('child', 'inet', 'fw4', 'child');
  const rules = [{ handle: '42', expr: [{ match: { left: { meta: { key: 'iifname' } }, op: '==', right: 'br-lan' } }, { jump: { target: 'child' } }], packets: '9007199254740993', bytes: '0', targets: [{ id: 'child', name: 'child', kind: 'jump', exists: true }] }];
  return { token: 'fixture', firewallMapFamily: 'ip', firewallMapHook: 'prerouting', firewallMapScenario: 'forward',
    firewallMap: { ok: true, capturedAt: '2026-11-07T10:00:00Z', tables: 3, ruleCount: 1, flowtables: 1, chains: [
      chain('mangle', 'inet', 'fw4', 'mangle', 'prerouting', -150, rules), child,
      chain('proxy', 'inet', 'ruopenray', 'prerouting', 'prerouting', -155),
      chain('raw', 'ip', 'raw', 'entry', 'prerouting', -300),
      chain('v6', 'ip6', 'raw', 'entry', 'prerouting', -300),
      chain('arp', 'arp', 'filter', 'input', 'input', 0),
    ] } };
}

test('firewall map filters families without hiding inet and sorts hooks by actual numeric priority', () => {
  const state = fixture();
  const v4 = firewallMapChains(state.firewallMap, 'ip');
  assert.deepEqual(firewallMapBases(v4, 'prerouting').map(c => c.id), ['raw','proxy','mangle']);
  assert.deepEqual(firewallMapBases(firewallMapChains(state.firewallMap,'ip6'),'prerouting').map(c => c.id), ['v6','proxy','mangle']);
  assert.equal(firewallMapChains(state.firewallMap,'all').length, 6);
  assert.equal(firewallMapSelection(state).selected.id, 'proxy');
  state.firewallMapChain = 'child';
  assert.equal(firewallMapSelection(state).selected.id, 'child');
});

test('firewall map distinguishes snapshot topology from packet tracing and offloaded counters', () => {
  const html = firewallMapPanel(fixture(), escapeHtml);
  assert.match(html,/не трассу конкретного пакета/);
  assert.match(html,/ускоренный трафик/);
  assert.match(html,/порядок между цепочками не гарантирован/);
  assert.match(html,/data-firewall-map-hook="prerouting"/);
  assert.match(html,/Содержимое именованных наборов не загружается/);
  assert.doesNotMatch(html,/data-action="applyFirewall"/);
  assert.equal(firewallMapCounter('9007199254740993').replace(/\s/g,''),'9007199254740993');
  assert.equal(firewallMapCounter(undefined),'—');
});

test('selected chain rules preserve order, links and safe rendering of external names and JSON', () => {
  const state = fixture(); state.firewallMapChain='mangle';
  state.firewallMap.chains[0].name='<script>bad()</script>';
  state.firewallMap.chains[0].rules[0].comment='<img src=x onerror=bad()>';
  state.firewallMap.chains[0].rules.push({handle:'3',expr:[{return:null}],targets:[{id:'missing',name:'<missing>',kind:'goto',exists:false}]});
  const before=structuredClone(state.firewallMap), html=firewallMapPanel(state,escapeHtml);
  assert.ok(html.indexOf('handle 42')<html.indexOf('handle 3'));
  assert.match(html,/data-firewall-map-chain="child" data-firewall-map-from="mangle"/);
  assert.match(html,/нет в снимке/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>|<img src=x/);
  assert.deepEqual(state.firewallMap,before);
});

test('long chains expose more rules rather than silently dropping their tail', () => {
  const state=fixture();state.firewallMapChain='child';
  state.firewallMap.chains[1].rules=Array.from({length:201},(_,i)=>({handle:String(i),expr:[{accept:null}],targets:[]}));
  assert.match(firewallMapPanel(state,escapeHtml),/показано 200 из 201/);
  assert.match(firewallMapPanel(state,escapeHtml),/data-firewall-map-more/);
  state.firewallMapRuleLimit=400;
  assert.match(firewallMapPanel(state,escapeHtml),/показано 201 из 201/);
  assert.doesNotMatch(firewallMapPanel(state,escapeHtml),/data-firewall-map-more/);
});

test('unknown nft expressions remain visible while known conditions and effects are readable', () => {
  const text=firewallMapRuleText({expr:[{match:{left:{payload:{protocol:'tcp',field:'dport'}},op:'==',right:443}},{tproxy:{port:12345}},{future_expr:{flag:true}}]});
  assert.match(text.conditions.join(' '),/Порт назначения == 443/);
  assert.match(text.actions.join(' '),/TPROXY.*12345/);
  assert.match(text.conditions.join(' '),/future_expr/);
});

test('a log prefix is not mistaken for an IP prefix and verdict maps keep their selector readable', () => {
  const text=firewallMapRuleText({expr:[{log:{prefix:'fixture-log',level:'warn'}},{vmap:{key:{ct:{key:'state'}},data:{set:[['established',{accept:null}]]}}}]});
  assert.match(text.actions.join(' '),/Записать в журнал · fixture-log/);
  assert.match(text.actions.join(' '),/VMAP · Состояние соединения/);
  assert.doesNotMatch(text.actions.join(' '),/undefined/);
});

test('map load coalesces reads, never sends a mutation, and preserves a previous snapshot on failure', async () => {
  const state={token:'a'};let resolve;const calls=[];
  const controller=createFirewallMapController({state,render(){},request:(...args)=>{calls.push(args);return new Promise(r=>{resolve=r;});}});
  const first=controller.load();await controller.load({force:true});
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/firewall/map');assert.equal(calls[0][1].method,undefined);
  resolve(fixture().firewallMap);await first;assert.equal(state.firewallMapLoading,false);
  const before=state.firewallMap;await controller.load();assert.equal(calls.length,1);
  const failure=controller.load({force:true});resolve({ok:false,error:'nft unavailable'});await failure;
  assert.equal(state.firewallMap,before);assert.match(state.firewallMapError,/nft unavailable/);
  assert.match(firewallMapPanel(state,escapeHtml),/предыдущий снимок/);
});

test('late snapshot from an old session cannot replace current-session data', async () => {
  const state={token:'a'}, reads=[];
  const controller=createFirewallMapController({state,render(){},request:()=>new Promise(resolve=>reads.push(resolve))});
  const old=controller.load();state.token='b';const fresh=controller.load();
  reads[1]({...fixture().firewallMap,capturedAt:'new'});await fresh;
  reads[0]({...fixture().firewallMap,capturedAt:'old'});await old;
  assert.equal(state.firewallMap.capturedAt,'new');assert.equal(state.firewallMapLoading,false);
});

test('unavailable snapshot shows its error without an invented diagram', () => {
  const html=firewallMapPanel({firewallMapError:'nft unavailable'},escapeHtml);
  assert.match(html,/nft unavailable/);assert.doesNotMatch(html,/<svg/);
});
