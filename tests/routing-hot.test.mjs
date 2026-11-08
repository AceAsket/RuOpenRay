import assert from 'node:assert/strict';
import test from 'node:test';
import { routingRulesOnly, hotRoutingChangeLabel, hotRoutingPanel } from '../cmd/ruopenray-ui/web/routing-hot.js';
import { createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { configApplyProgressStages } from '../cmd/ruopenray-ui/web/config-apply-progress.js';

const config = (tag) => ({ api: { services: ['RoutingService'], listen: '127.0.0.1:10086' }, outbounds: [{ tag:'direct', protocol:'freedom' },{ tag:'block',protocol:'blackhole' }], routing: { domainStrategy: 'AsIs', rules: [{ domain: ['example.test'], outboundTag:tag }] } });
test('only changed routing rules qualify, including their order and deletion',()=>{
  const old=config('direct'), next=config('block');
  assert.equal(routingRulesOnly(old,next),true);assert.equal(routingRulesOnly(old,old),false);
  next.routing.balancers=[];
  assert.equal(routingRulesOnly(old,next),true);
  for(const key of ['outbounds','inbounds','dns','api','policy','log']) assert.equal(routingRulesOnly(old,{...next,[key]:{changed:true}}),false,key);
  assert.equal(routingRulesOnly(old,{...next,routing:{...next.routing,domainStrategy:'IPOnDemand'}}),false);
  assert.match(hotRoutingChangeLabel(old,next),/горячая замена/);
  old.routing.balancers=[{tag:'vpn'}];next.routing.balancers=[{tag:'vpn'}];
  assert.match(hotRoutingChangeLabel(old,next),/перезапуск сервиса/);
});
test('routing API preparation, pending activation and unsupported profiles have explicit UI states',()=>{
  const state={appliedConfigText:'{}',jsonDraft:'{}'};
  assert.match(hotRoutingPanel(state,escapeHtml),/data-action="enableHotRouting"/);
  state.jsonDraft=JSON.stringify(config('direct'));
  assert.match(hotRoutingPanel(state,escapeHtml),/один раз с перезапуском/);
  state.appliedConfigText=state.jsonDraft;
  assert.match(hotRoutingPanel(state,escapeHtml),/Уже открытые соединения/);
  state.appliedConfigText=JSON.stringify({...config('direct'),routing:{balancers:[{tag:'vpn'}]}});
  assert.match(hotRoutingPanel(state,escapeHtml),/требуют обычного применения/);
});
test('preparing local API changes and saves only the draft, without applying or restarting',async()=>{
  const state={token:'fixture',jsonDraft:'{}'}, calls=[], saved=[];
  const actions=createConfigActions({state,request:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,config:config('direct')};},render(){},scheduleServerDraftSave:cfg=>saved.push(cfg)});
  await actions.enableHotRouting();
  assert.deepEqual(calls,[['/api/config/routing-api',{config:{}}]]);
  assert.equal(saved.length,1);assert.match(state.jsonDraft,/RoutingService/);
  assert.equal(state.config.api.services[0],'RoutingService');
  assert.match(state.message,/черновике/);
});
test('API preparation cannot replace a concurrently edited draft',async()=>{
  const state={token:'fixture',jsonDraft:'{}'};
  const actions=createConfigActions({state,render(){},request:async()=>{state.jsonDraft='{"remark":"newer"}';return {ok:true,config:config('direct')};}});
  await assert.rejects(actions.enableHotRouting(),/Черновик изменился/);
  assert.equal(state.jsonDraft,'{"remark":"newer"}');
});
test('real hot-routing progress does not claim a restart',()=>{
  const stages=configApplyProgressStages({stage:'hot-routing',stages:[{id:'validation',status:'done'},{id:'hot-routing',status:'running'}]});
  assert.match(stages[1].label,/без перезапуска/);
});
