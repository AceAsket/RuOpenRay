import { firewallMapHooks, firewallMapScenarios, firewallMapSelection, firewallMapBases, firewallMapRuleText, firewallMapCounter } from './firewall-map-model.js';

const countLabel = (count, forms) => {
  const tail = count % 100;
  const index = tail >= 11 && tail <= 14 ? 2 : count % 10 === 1 ? 0 : count % 10 >= 2 && count % 10 <= 4 ? 1 : 2;
  return `${count} ${forms[index]}`;
};
const chainCount = (count) => countLabel(count, ['цепочка', 'цепочки', 'цепочек']);
const ruleCount = (count) => countLabel(count, ['правило', 'правила', 'правил']);

export function firewallMapPanel(state, escapeHtml) {
  const e = (value) => escapeHtml(String(value ?? ''));
  const snapshot = state.firewallMap;
  const heading = `<div class="panel-title"><div><h2>Карта firewall <span class="fm-preview-badge">Пробная версия</span></h2><span>Действующие цепочки и переходы nftables</span></div>
    <button type="button" class="btn secondary ${state.firewallMapLoading ? 'is-busy' : ''}" data-firewall-map-refresh ${state.firewallMapLoading ? 'disabled' : ''}>${state.firewallMapLoading ? 'Загружаю…' : 'Обновить карту'}</button></div>`;
  const error = state.firewallMapError ? `<div class="settings-warning compact" role="alert"><strong>Не удалось обновить карту</strong><span>${e(state.firewallMapError)}${snapshot?.ok ? ' Показан предыдущий снимок.' : ''}</span></div>` : '';
  if (!snapshot?.ok) return `<section class="panel firewall-map-panel">${heading}${error}<p class="muted" role="status">${state.firewallMapLoading ? 'Читаю цепочки, правила и счётчики с роутера…' : 'Загрузите снимок действующих правил кнопкой «Обновить карту».'}</p></section>`;
  const { family, hook, chains, bases, selected, scenario } = firewallMapSelection(state);
  const all = family === 'all' || state.firewallMapView === 'chains';
  const captured = new Date(snapshot.capturedAt);
  const time = Number.isNaN(captured.getTime()) ? '—' : captured.toLocaleTimeString('ru-RU');
  const choice = (attr, value, label, active) => `<button type="button" class="${active ? 'active' : ''}" ${attr}="${e(value)}" aria-pressed="${active}">${label}</button>`;
  return `<section class="panel firewall-map-panel">${heading}${error}
    <div class="fm-toolbar">
      <div class="segmented" aria-label="Представление карты">${choice('data-firewall-map-view', 'topology', 'Схема', !all)}${choice('data-firewall-map-view', 'chains', 'Все цепочки', all)}</div>
      <div class="segmented" aria-label="Семейство пакетов">${[['ip','IPv4'],['ip6','IPv6'],['all','Все семейства']].map(([key,label]) => choice('data-firewall-map-family',key,label,family===key)).join('')}</div>
      <span class="fm-snapshot-time">Снимок ${e(time)} · ${countLabel(Number(snapshot.tables) || 0, ['таблица', 'таблицы', 'таблиц'])} · ${chainCount(snapshot.chains.length)} · ${ruleCount(Number(snapshot.ruleCount) || 0)}</span>
    </div>
    <p class="fm-explanation">Подсветка показывает схему выбранного сценария, а не трассу конкретного пакета. Условия правил, NAT, метки и policy routing могут изменить или завершить его путь.</p>
    ${snapshot.flowtables ? '<p class="fm-counter-note">В ruleset есть flowtable: ускоренный трафик может проходить мимо счётчиков показанных правил.</p>' : ''}
    ${all ? '' : `<label class="fm-scenario"><span>Схема прохождения</span><select id="firewallMapScenario" aria-label="Схема прохождения">${Object.entries(firewallMapScenarios).map(([key,item])=>`<option value="${key}" ${scenario===item?'selected':''}>${item.label}</option>`).join('')}</select></label>
      ${firewallMapDiagram(chains, hook, scenario, e)}
      <div class="fm-hook-buttons" role="group" aria-label="Этапы Netfilter">${firewallMapHooks.map(([key,label])=>`<button type="button" class="btn secondary ${key===hook?'fm-hook-selected':''}" data-firewall-map-hook="${key}" aria-pressed="${key===hook}">${label} <small>${firewallMapBases(chains,key).length}</small></button>`).join('')}</div>`}
    <div class="fm-inspector-grid">
      <section class="fm-chain-browser" aria-label="Цепочки nftables">
        <div class="fm-section-head"><h3>${all ? 'Все цепочки' : `Цепочки ${e(hook.toUpperCase())}`}</h3><span>${all?chains.length:bases.length}</span></div>
        ${all ? `<input id="firewallMapSearch" type="search" aria-label="Поиск цепочек" placeholder="Таблица или цепочка" value="${e(state.firewallMapQuery || '')}">` : '<p class="muted">Меньший приоритет выполняется раньше. При одинаковом приоритете порядок между цепочками не гарантирован.</p>'}
        <div class="fm-chain-list">${(all?chains:bases).map((chain)=>{
          const search = `${chain.family} ${chain.table} ${chain.name}`.toLowerCase();
          const hidden = all && state.firewallMapQuery && !search.includes(state.firewallMapQuery.trim().toLowerCase());
          return `<button type="button" class="fm-chain-choice ${chain.id===selected?.id?'is-selected':''} ${chain.table==='ruopenray'?'is-managed':''}" data-firewall-map-chain="${e(chain.id)}" data-firewall-map-search-text="${e(search)}" aria-pressed="${chain.id===selected?.id}" ${hidden?'hidden':''}>
            <span class="fm-chain-title"><strong>${e(chain.name)}</strong>${chain.table==='ruopenray'?'<small class="fm-managed-badge">RuOpenRay</small>':''}</span>
            <span>${e(chain.family)} · ${e(chain.table)}${chain.hook?` · ${e(chain.hook)}`:''}</span>
            <small>${chain.priority===null||chain.priority===undefined?'':`Приоритет ${e(chain.priority)} · `}${ruleCount(chain.rules.length)}${chain.policy?` · policy ${e(chain.policy)}`:''}</small></button>`;
        }).join('') || '<p class="muted">На этом этапе нет базовых цепочек выбранного семейства.</p>'}</div>
      </section>
      ${firewallMapChainDetail(state, selected, e)}
    </div>
    <p class="fm-counter-note">Снимок только для чтения. Содержимое именованных наборов не загружается. Счётчики цепочек inet общие для IPv4 и IPv6; отсутствие счётчика обозначено «—».</p>
  </section>`;
}

function firewallMapDiagram(chains, hook, scenario, e) {
  const route = (d, active) => `<path class="fm-route ${active?'is-active':''}" d="${d}" marker-end="url(#fm-arrow-${active?'active':'muted'})"/>`;
  const lan = scenario !== firewallMapScenarios.output;
  const stage = (key,x,y) => {
    const rows = firewallMapBases(chains,key);
    const selected = hook===key, active = scenario.hooks.includes(key);
    const label = firewallMapHooks.find(([name])=>name===key)?.[1] || key;
    return `<g class="fm-stage ${selected?'is-selected':''} ${active?'is-active':''}" role="button" tabindex="0" data-firewall-map-hook="${key}" aria-pressed="${selected}" aria-label="${label}: ${chainCount(rows.length)}">
      <title>${e(label)}: открыть действующие цепочки</title><rect x="${x-86}" y="${y-38}" width="172" height="76" rx="12"/>
      <text x="${x}" y="${y-13}" class="fm-stage-code">${key.toUpperCase()}</text><text x="${x}" y="${y+6}">${label}</text><text x="${x}" y="${y+24}" class="fm-stage-count">${chainCount(rows.length)} · ${ruleCount(rows.reduce((sum,c)=>sum+c.rules.length,0))}</text></g>`;
  };
  return `<div class="fm-diagram-scroll" tabindex="0" role="region" aria-label="Схема Netfilter, прокручивается по горизонтали"><svg class="fm-diagram" viewBox="0 0 980 430" role="group" aria-label="Основные этапы обработки IP-пакета">
    <defs>${['active','muted'].map(kind=>`<marker id="fm-arrow-${kind}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="fm-arrow-${kind}" d="M0 0 6 3 0 6Z"/></marker>`).join('')}</defs>
    ${route('M94 88H174',lan)}${route('M346 88H449',lan)}${route('M492 88H564',scenario===firewallMapScenarios.input)}
    ${route('M736 88H840',scenario===firewallMapScenarios.input)}${route('M470 110V202',scenario===firewallMapScenarios.forward)}
    ${route('M556 240H604',scenario===firewallMapScenarios.forward)}${route('M776 240H850',scenario!==firewallMapScenarios.input)}
    ${route('M94 365H174',scenario===firewallMapScenarios.output)}${route('M346 365H555L690 280',scenario===firewallMapScenarios.output)}
    <path class="fm-routing-choice" d="M470 66 492 88 470 110 448 88Z"/><text x="470" y="138" class="fm-routing-label">Выбор маршрута</text>
    <g class="fm-endpoint"><circle cx="70" cy="88" r="24"/><text x="70" y="93">LAN</text><text x="866" y="93">Роутер</text><circle cx="866" cy="88" r="26"/><text x="885" y="244">Сеть</text><circle cx="885" cy="240" r="28"/><text x="70" y="370">Роутер</text><circle cx="70" cy="365" r="27"/></g>
    ${stage('prerouting',260,88)}${stage('input',650,88)}${stage('forward',470,240)}${stage('postrouting',690,240)}${stage('output',260,365)}
  </svg></div>`;
}

function firewallMapChainDetail(state, chain, e) {
  if (!chain) return '<section class="fm-chain-detail"><p class="muted">Выберите цепочку для просмотра правил.</p></section>';
  const limit = Number.isSafeInteger(state.firewallMapRuleLimit) && state.firewallMapRuleLimit>0 ? state.firewallMapRuleLimit : 200;
  const visible = chain.rules.slice(0,limit);
  return `<section class="fm-chain-detail" aria-label="Правила выбранной цепочки">
    <div class="fm-section-head"><div><h3>${e(chain.name)}</h3><span>${e(chain.family)} · ${e(chain.table)}${chain.hook?` · ${e(chain.hook)}`:''}${chain.policy?` · policy ${e(chain.policy)}`:''}</span></div>
      ${state.firewallMapTrail?.length?'<button type="button" class="btn secondary compact" data-firewall-map-back>Назад к цепочке</button>':''}</div>
    <p class="muted">Правила в порядке ядра · показано ${visible.length} из ${chain.rules.length}</p>
    <div class="fm-rules">${visible.map((rule,index)=>{
      const text = firewallMapRuleText(rule);
      return `<article class="fm-rule"><div class="fm-rule-heading"><span class="fm-rule-number">${index+1}</span><strong>${e(rule.comment || text.actions[0] || 'Правило')}</strong><small>handle ${e(rule.handle || '—')}</small></div>
        <div class="fm-rule-conditions">${text.conditions.length?text.conditions.map(item=>`<span>${e(item)}</span>`).join(''):'<span>Без дополнительных условий</span>'}</div>
        <div class="fm-rule-actions">${text.actions.map(item=>`<span>${e(item)}</span>`).join('') || '<span>Продолжить обработку</span>'}</div>
        <div class="fm-rule-footer"><span title="Счётчики этого правила">${e(firewallMapCounter(rule.packets))} пакетов · ${e(firewallMapCounter(rule.bytes))} байт</span>
          ${(rule.targets||[]).map(target=>`<button type="button" class="btn secondary compact" data-firewall-map-chain="${e(target.id)}" data-firewall-map-from="${e(chain.id)}" ${target.exists?'':'disabled'} title="${target.kind==='goto'?'Переход без возврата в текущую цепочку':'Вызов дочерней цепочки'}">${e(target.kind)} → ${e(target.name)}${target.exists?'':' · нет в снимке'}</button>`).join('')}</div>
        <details><summary>Выражения nftables</summary><pre>${e(JSON.stringify(rule.expr,null,2))}</pre></details></article>`;
    }).join('') || '<p class="muted">Цепочка пуста. Для базовой цепочки действует её policy; дочерняя возвращает управление вызывающей цепочке.</p>'}</div>
    ${visible.length<chain.rules.length?'<button type="button" class="btn secondary" data-firewall-map-more>Показать ещё правила</button>':''}
  </section>`;
}
