import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { createConfigStateHelpers } from '../cmd/ruopenray-ui/web/config-state.js';
import { routePresetIconView } from '../cmd/ruopenray-ui/web/route-visuals.js';

const noop = () => {};
test('imported SVG renders in an isolated image rather than active document markup',()=>{
 const svg='<svg><a href="java&#x73;cript:void(0)"><text>link</text></a></svg>';
 const markup=routePresetIconView(String,'custom:a',{icon:{type:'svg',svg}});
 assert.match(markup,/<img src="data:image\/svg\+xml/);assert.ok(!markup.includes('<a '));assert.ok(!markup.includes('<svg>'));
});
test('failed apply preserves draft and reports activation/rollback failure', async () => {
 const draft=JSON.stringify({outbounds:[{tag:'direct',protocol:'freedom'}]});
 const state={jsonDraft:draft,appliedConfigText:'old',serverDraftExists:true};
 let refreshed=false;
 const actions=createConfigActions({state,request:async()=>({ok:false,restart:{ok:false,stderr:'restart failed',rollback:{ok:false}}}),render:noop,refresh:async()=>{refreshed=true},keepOperationVisible:async()=>{},activeProxyTag:()=>''});
 await assert.rejects(()=>actions.applyConfig(),/restart failed/);
 assert.equal(state.jsonDraft,draft);assert.equal(state.appliedConfigText,'old');assert.equal(state.serverDraftExists,true);
 assert.equal(state.configApplying,false);assert.match(state.message,/restart failed/);assert.equal(refreshed,false);
});
test('API or JSON errors during config test release busy state without losing edits',async()=>{
 for (const jsonDraft of ['{', '{}']) {
  const state={jsonDraft};
  const actions=createConfigActions({state,request:async()=>{throw new Error('API offline')},render:noop,keepOperationVisible:async()=>{},activeProxyTag:()=>''});
  await actions.testConfig();
  assert.equal(state.configTesting,false);assert.equal(state.jsonDraft,jsonDraft);assert.match(state.message,/не завершена/);
 }
});
test('background snapshot preserves local config and flags a changed server draft',()=>{
 const local={remark:'local edit'},state={config:local,jsonDraft:JSON.stringify(local),appliedConfigText:'old',serverDraftRevision:'old-revision',activeConfigRevision:'old-active'};
 const {syncConfig}=createConfigStateHelpers(state);
 syncConfig({remark:'another client'},{fromServer:true,activeConfig:{remark:'active'},serverDraft:{exists:true,revision:'new-revision',activeRevision:'active-revision'}});
 assert.equal(state.config,local);assert.equal(state.serverDraftRevision,'old-revision');assert.equal(state.serverDraftConflict,true);
 assert.equal(state.activeConfigRevision,'old-active');assert.equal(state.activeConfigConflict,true);
});
