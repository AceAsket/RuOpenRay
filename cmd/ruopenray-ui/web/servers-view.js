export function createServersView(deps) {
  const {
    activeProxyTag,
    checkForTag,
    configOutbounds,
    escapeHtml,
    isSystemOutbound,
    operationProgressView,
    outboundAddress,
    outboundTransport,
    outboundUsage,
    proxyOutbounds,
    proxyRuleStrategyStats,
    routingBalancersPanel,
    serverCheckButton,
    serverMetaChips,
    serverStats,
    serverTrafficView,
    state,
    stat,
  } = deps;

function serverCard(outbound, index, activeTag) {
  const tag = outbound?.tag || `outbound-${index + 1}`;
  const usage = outboundUsage(tag);
  const check = checkForTag(tag);
  const active = tag === activeTag;
  const meta = serverMetaChips(outbound, usage, check);
  return `<article class="server-row server-card ${active ? 'is-active' : ''}">
    <div class="server-identity">
      <span class="server-protocol">${escapeHtml(outbound?.protocol || 'unknown')}</span>
      <div class="server-main">
        <strong>${escapeHtml(tag)}</strong>
        <span>${escapeHtml(outboundAddress(outbound))}</span>
        ${meta}
      </div>
    </div>
    ${serverTrafficView(tag)}
    <div class="server-actions">
      ${serverCheckButton(tag)}
      ${active ? '<span class="tag active-tag">активный</span>' : `<button class="btn warning" data-route-all="${escapeHtml(tag)}">Подключиться</button>`}
      <button class="btn danger" data-outbound-delete="${index}">Удалить</button>
    </div>
  </article>`;
}

function subscriptionPoolCard(pool) {
  const active = pool?.activeCandidate || {};
  const tag = pool?.tag || '';
  return `<article class="server-row subscription-pool-row">
    <div class="server-identity">
      <span class="server-protocol">pool</span>
      <div class="server-main">
        <strong>${escapeHtml(tag || 'subscription')}</strong>
        <span>${escapeHtml(pool?.url || 'subscription URL')}</span>
      </div>
    </div>
    <div class="server-health">
      <span class="check-badge ok">${escapeHtml(`${pool?.count || 0} кандидатов`)}</span>
      <small>${escapeHtml(active?.tag ? `активен ${active.tag} · ${[active.address, active.port].filter(Boolean).join(':')}` : 'активный сервер не выбран')}</small>
    </div>
    <div class="server-actions">
      <button class="btn secondary" data-action="fallbackSubscription" data-subscription-fallback="${escapeHtml(tag)}">Найти доступный</button>
      <button class="btn warning" data-route-all="${escapeHtml(tag)}">Подключиться</button>
    </div>
  </article>`;
}

function serverAvailabilityPanel() {
  const activeTag = activeProxyTag();
  const proxyStats = proxyRuleStrategyStats(activeTag);
  return `
    <section class="panel server-check-panel">
      <div class="panel-title">
        <div><h2>Проверка прокси</h2><span>Разовая проверка перед ручным переключением сервера. Результаты сразу видны в списке ниже.</span></div>
        <button class="btn" data-action="checkServers" ${state.serverChecking ? 'disabled' : ''}>${state.serverChecking ? 'Проверяю...' : 'Проверить все'}</button>
      </div>
      <div class="availability-settings">
        <div class="form-row">
          <label>Таймаут, мс</label>
          <input id="serverCheckTimeout" type="number" min="300" max="15000" step="100" value="${escapeHtml(state.serverCheckTimeout)}" />
        </div>
        <div class="form-row">
          <label>Попыток</label>
          <input id="serverCheckAttempts" type="number" min="1" max="5" step="1" value="${escapeHtml(state.serverCheckAttempts)}" />
        </div>
        <div class="form-row method-row">
          <label>Метод</label>
          <select id="serverCheckMode">
            <option value="http" ${state.serverCheckMode === 'http' ? 'selected' : ''}>HTTP через proxy</option>
            <option value="endpoint" ${state.serverCheckMode === 'endpoint' ? 'selected' : ''}>TCP-порт</option>
          </select>
        </div>
        <div class="form-row check-url-row">
          <label>URL проверки</label>
          <input id="serverCheckUrl" value="${escapeHtml(state.serverCheckUrl)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <div class="availability-note">
          <strong>Активный сервер: ${escapeHtml(activeTag || 'не выбран')}</strong>
          <span>Подключение меняет основное proxy-направление: ${proxyStats.primary} правил. Правила, закрепленные на других серверах, не трогаются: ${proxyStats.pinned}.</span>
        </div>
      </div>
      ${state.serverCheckHistory.length ? `<div class="health-history">
        ${state.serverCheckHistory.slice(0, 5).map((item) => `<article>
          <strong>${new Date(item.at).toLocaleTimeString()} · ${item.alive}/${item.total}</strong>
          <span>${escapeHtml(item.results.filter((result) => result.ok).map((result) => `${result.tag} ${result.latencyMs || 0}мс`).join(' · ') || 'нет доступных')}</span>
        </article>`).join('')}
      </div>` : ''}
    </section>
  `;
}

function serversPanel() {
  const outbounds = configOutbounds();
  const outboundEntries = outbounds.map((outbound, index) => ({ outbound, index }));
  const serverEntries = outboundEntries.filter(({ outbound }) => !isSystemOutbound(outbound));
  const systemEntries = outboundEntries.filter(({ outbound }) => isSystemOutbound(outbound));
  const stats = serverStats();
  const activeTag = activeProxyTag();
  const proxyServers = proxyOutbounds();
  const alive = proxyServers.filter((outbound) => checkForTag(outbound?.tag || '')?.ok).length;
  const serverTabs = [
    ['list', 'Прокси'],
    ['balancers', 'Балансировка'],
    ['subscriptions', 'Подписки'],
    ['system', 'Служебные']
  ];
  const requestedView = state.serversView === 'check' ? 'balancers' : state.serversView;
  const view = serverTabs.some(([value]) => value === requestedView) ? requestedView : 'list';
  return `
    <section class="route-hero servers-hero">
      <div>
        <h2>Прокси и группы</h2>
        <p>Прокси-серверы, подписки и группы балансировки для правил маршрутизации. Служебные direct/block вынесены отдельно.</p>
      </div>
      <div class="route-score">
        <strong>${proxyServers.length}</strong>
        <span>прокси</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('Прокси', stats.proxy, 'Пользовательские подключения')}
      ${stat('Служебные', stats.system, 'direct, block, DNS')}
      ${stat('В правилах', stats.used, 'Используются маршрутизацией')}
      ${stat('Доступны', alive, `По последней проверке: ${state.serverCheckMode === 'http' ? 'HTTP через прокси' : 'TCP-порт'}`)}
    </section>

    <section class="servers-nav-panel">
      <div class="routing-subnav" role="tablist" aria-label="Подменю серверов">
        ${serverTabs.map(([value, label]) => `<button type="button" class="${view === value ? 'active' : ''}" data-servers-view="${value}">${label}</button>`).join('')}
      </div>
    </section>

    ${view === 'list' ? `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Прокси</h2><span>Адреса, транспорт${state.status?.xrayStats?.enabled ? ', трафик по outbound' : ''}, ручная проверка и выбор активного proxy-направления.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="checkServers" ${state.serverChecking ? 'disabled' : ''}>${state.serverChecking ? 'Проверяю...' : 'Проверить все'}</button>
          <button class="btn" data-import-dialog="choose">Добавить прокси</button>
        </div>
      </div>
      <div class="server-list">
        ${state.serverChecking ? operationProgressView() : ''}
        ${serverEntries
          .map(({ outbound, index }) => serverCard(outbound, index, activeTag))
          .join('') || '<p class="muted">В конфигурации пока нет proxy-серверов. Добавьте VLESS/VMess/Trojan ссылкой или подпиской.</p>'}
      </div>
      ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
    </section>
    ` : ''}

    ${view === 'balancers' ? routingBalancersPanel() : ''}

    ${view === 'subscriptions' ? `<section class="panel subscription-pools-panel">
      <div class="panel-title">
        <div><h2>Подписки и резерв</h2><span>Стабильный тег направления остается в правилах, а RuOpenRay переключает сервер внутри него.</span></div>
        <button class="btn secondary" data-import-dialog="subscription">Добавить подписку</button>
      </div>
      <div class="server-list">
        ${state.subscriptionPools.length ? state.subscriptionPools.map(subscriptionPoolCard).join('') : '<p class="muted">Подписок пока нет. Добавьте subscription URL через кнопку добавления сервера.</p>'}
      </div>
    </section>` : ''}

    ${view === 'system' ? `<section class="panel system-outbounds-panel">
      <div class="panel-title">
        <div><h2>Системные выходы</h2><span>Это технические outbounds Xray для прямого доступа, блокировки и DNS. Они не являются серверами.</span></div>
      </div>
      <div class="server-list">
        ${systemEntries.length ? systemEntries.map(({ outbound, index }) => {
          const tag = outbound?.tag || `outbound-${index + 1}`;
          const usage = outboundUsage(tag);
          return `<article class="server-row system-row">
            <div class="server-protocol">${escapeHtml(outbound?.protocol || 'unknown')}</div>
            <div class="server-main">
              <strong>${escapeHtml(tag)}</strong>
              <span>${escapeHtml(outboundAddress(outbound))}</span>
            </div>
            <div class="server-meta">
              <span>${escapeHtml(outboundTransport(outbound))}</span>
              <span>${usage} правил</span>
            </div>
            <div class="server-actions">
              <span class="tag">системный</span>
              <button class="btn secondary" data-outbound-delete="${index}" disabled>Удалить</button>
            </div>
          </article>`;
        }).join('') : '<p class="muted">Системные выходы не найдены.</p>'}
      </div>
    </section>` : ''}
  `;
}

  return {
    serverAvailabilityPanel,
    serverCard,
    serversPanel,
    subscriptionPoolCard,
  };
}
