export function createDiagnosticsDomainView(deps) {
  const {
    accessLogRows,
    accessLogTable,
    activeProxyTag,
    aggregateLogDomains,
    burstObservatoryConfig,
    burstObservatorySelectors,
    byteRate,
    byteSize,
    checkForTag,
    checkLabel,
    configInbounds,
    deviceRules,
    domainDiagnosticRows,
    domainMonitorDevicesText,
    domainMonitorDomainQuality,
    domainMonitorFilterCounts,
    domainMonitorHost,
    domainMonitorMatchesDevice,
    domainMonitorMatchesFilter,
    domainMonitorProtocols,
    domainMonitorRows,
    escapeHtml,
    isIpLiteral,
    logsPanel,
    monitorSourceLabel,
    monitoredDevices,
    monitoredDomains,
    monitoredEvents,
    observatoryConfig,
    observatoryMatchedOutbounds,
    observatoryRequiredBalancers,
    observatorySelectors,
    outboundAddress,
    outboundMatchesSelectors,
    proxyOutbounds,
    sniPanel,
    selectedDomainMonitorDevice,
    stat,
    state,
    strategyObserverType,
    trafficMonitor,
    xrayActiveStats,
    xrayStatsPanel,
    xrayStatsTotals,
  } = deps;

function domainMonitorStatusItems() {
  const monitor = state.domainMonitor || {};
  const sourcePath = String(monitor.sourcePath || '');
  const quality = domainMonitorDomainQuality();
  const transparent = configInbounds().find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy);
  const sniffing = transparent?.sniffing || {};
  const destOverride = Array.isArray(sniffing.destOverride) ? sniffing.destOverride : [];
  const snifferOk = Boolean(sniffing.enabled && (destOverride.includes('tls') || destOverride.includes('http') || destOverride.includes('quic')));
  const accessPath = state.loggingAccessPath || state.config?.log?.access || '';
  const accessConfigured = Boolean(state.loggingAccessLog || state.config?.log?.access);
  const sourceSeesAccess = Boolean((accessPath && sourcePath.includes(accessPath)) || sourcePath.includes('access') || monitor.source === 'b4sni');
  const dnsLog = Boolean(state.loggingDnsLog || state.config?.log?.dnsLog);
  const lanDns = state.lanDnsStatus || {};
  const lanDnsXray = Boolean(lanDns.mode === 'xray' && lanDns.readiness?.ready);
  const hasEvents = Number(monitor.stats?.total || 0) > 0 || quality.total > 0;
  const hasDomains = quality.hasDomains || Number(monitor.stats?.uniqueDomains || 0) > 0;
  const cards = [
    {
      tone: monitor.running ? 'ok' : 'bad',
      title: 'Монитор',
      value: monitor.running ? 'запущен' : 'остановлен',
      detail: monitor.running ? 'RuOpenRay читает access/DNS-логи Xray и b4sni-совместимые файлы.' : 'Нажмите «Запустить», чтобы начать читать события.'
    },
    {
      tone: accessConfigured && sourceSeesAccess ? 'ok' : accessConfigured ? 'warn' : 'bad',
      title: 'Источник',
      value: monitorSourceLabel(),
      detail: sourcePath ? sourcePath : 'Пока нет доступного access-log. Включите access-логирование Xray.'
    },
    {
      tone: lanDnsXray ? 'ok' : 'warn',
      title: 'DNS LAN',
      value: lanDnsXray ? 'через Xray' : lanDns.mode || 'system',
      detail: lanDnsXray ? 'dnsmasq отправляет запросы LAN в 127.0.0.1#5353.' : 'Если оставить системный DNS, Xray часто увидит только IP.'
    },
    {
      tone: dnsLog ? 'ok' : 'warn',
      title: 'DNS-лог',
      value: dnsLog ? 'включен' : 'выключен',
      detail: dnsLog ? 'DNS-запросы дают домены даже когда соединение идет к IP.' : 'Для доменов включите DNS logging в настройках логирования.'
    },
    {
      tone: snifferOk ? 'ok' : 'warn',
      title: 'Сниффер',
      value: snifferOk ? destOverride.join(' + ') : 'не помогает',
      detail: snifferOk ? 'TLS/HTTP SNI может дать домен без DNS-запроса.' : 'Включите HTTP + TLS в перехвате, чтобы ловить SNI.'
    },
    {
      tone: hasDomains ? 'ok' : hasEvents ? 'warn' : 'bad',
      title: 'Домены',
      value: hasDomains ? `${quality.domains || monitor.stats?.uniqueDomains || 0} найдено` : hasEvents ? 'только IP' : 'нет событий',
      detail: hasDomains ? `${quality.domainShare || 0}% live-событий сейчас с доменными именами, ${quality.ips || 0} событий только с IP.` : hasEvents ? 'Трафик есть, но клиент/приложение ходит по IP или DNS обходит Xray.' : 'Откройте сайт на LAN/Wi-Fi устройстве и обновите монитор.'
    }
  ];
  const tips = [];
  if (!monitor.running) tips.push('Запустите монитор кнопкой сверху.');
  if (!accessConfigured || !sourceSeesAccess) tips.push('Включите access-log Xray и убедитесь, что путь логов совпадает с активным config.');
  if (!lanDnsXray) tips.push('В DNS → LAN DNS направьте dnsmasq на Xray: 127.0.0.1#5353.');
  if (!dnsLog) tips.push('В настройках логирования включите DNS-лог, иначе DNS-запросы не попадут в монитор.');
  if (!snifferOk) tips.push('В перехвате включите сниффер HTTP + TLS, чтобы видеть SNI из HTTPS-соединений.');
  if (hasEvents && !hasDomains) tips.push('После изменения DNS на телефоне иногда нужно переподключить Wi-Fi или открыть новый домен без кэша.');
  if (!tips.length) {
    tips.push('Откройте новый сайт на Wi-Fi/LAN клиенте, затем смотрите вкладки «Домены», «Устройства» или «Live».');
    tips.push('Если видны только IP, приложение могло взять адрес из кэша, Private DNS/DoH или готового IP-соединения.');
    tips.push('Для чистой проверки переподключите Wi-Fi на клиенте или закройте приложение и откройте новый домен.');
  }
  return { cards, tips, quality };
}

function domainMonitorStatusPanel() {
  const { cards, tips } = domainMonitorStatusItems();
  return `
    <div class="domain-monitor-health">
      <div class="domain-monitor-health-grid">
        ${cards.map((item) => `<article class="${item.tone}">
          <span>${escapeHtml(item.title)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </article>`).join('')}
      </div>
      <div class="domain-monitor-help">
        <strong>Как увидеть домены</strong>
        <ol>
          ${tips.slice(0, 5).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
        </ol>
      </div>
    </div>
  `;
}

function diagnosticsDomainView() {
  const logRows = aggregateLogDomains();
  const accessRows = accessLogRows(state.logs).slice(0, 30);
  const rows = domainDiagnosticRows();
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>По доменам</h2><span>Агрегация из live-логов: частые домены, устройства, протоколы и направления.</span></div>
        <button class="btn secondary" data-tab-jump="routing">Открыть маршруты</button>
      </div>
      ${accessLogTable(accessRows)}
      <div class="diagnostic-list">
        ${logRows.length ? logRows.map((item) => `<article class="diagnostic-row">
          <div>
            <strong>${escapeHtml(item.host)}</strong>
            <span>${item.devices.size || 'нет'} устройств · ${[...item.protocols].join('/') || 'protocol ?'} · ${[...item.outbound].join(', ') || 'направление ?'}</span>
          </div>
          <em>${item.hits} событий</em>
          <button class="btn secondary" data-domain-to-route="${escapeHtml(item.host)}">В правило</button>
        </article>`).join('') : rows.map(({ info, index }) => `<article class="diagnostic-row">
          <div>
            <strong>${escapeHtml(info.value)}</strong>
            <span>${escapeHtml(info.detail || 'domain rule')}</span>
          </div>
          <em>${escapeHtml(info.outbound)}</em>
          <button class="btn secondary" data-route-focus="${index}">Найти</button>
        </article>`).join('') || '<p class="muted">В логах и маршрутизации пока нет доменов. Включите access-логи или добавьте доменное правило.</p>'}
      </div>
    </section>
  `;
}

function domainMonitorFilterBar() {
  const counts = domainMonitorFilterCounts();
  const filters = [
    ['domains', 'Домены', counts.domains],
    ['ip', 'IP', counts.ip],
    ['dns', 'DNS', counts.dns],
    ['tcp', 'TCP', counts.tcp],
    ['udp', 'UDP', counts.udp],
    ['all', 'Все', counts.all]
  ];
  return `
    <div class="domain-monitor-filters" role="group" aria-label="Фильтр событий монитора">
      ${filters.map(([value, label, count]) => `<button type="button" class="${state.domainMonitorFilter === value ? 'active' : ''}" data-domain-filter="${value}">
        <span>${label}</span>
        <strong>${Number(count || 0).toLocaleString('ru-RU')}</strong>
      </button>`).join('')}
    </div>
  `;
}

function domainMonitorKind(host) {
  if (!host) return { label: 'EVENT', tone: 'muted' };
  if (isIpLiteral(host)) return { label: 'IP', tone: 'ip' };
  if (String(host).includes('dns') || String(host).includes('doh')) return { label: 'DNS', tone: 'dns' };
  return { label: 'DOMAIN', tone: 'domain' };
}

function domainMonitorMetaChips(item = {}) {
  const chips = [];
  const protocols = domainMonitorProtocols(item);
  if (protocols.length) chips.push(...protocols.slice(0, 3));
  const outbounds = Array.isArray(item.outbounds) ? item.outbounds : [item.outbound].filter(Boolean);
  if (outbounds.length) chips.push(...outbounds.slice(0, 2));
  if (item.destinationPort) chips.push(`:${item.destinationPort}`);
  return chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
}

function domainMonitorDeviceLine(item = {}) {
  const text = domainMonitorDevicesText(item);
  const samples = Array.isArray(item.samples) ? item.samples : [];
  const sample = samples[0] || item;
  const endpoint = [sample.sourceIp, sample.destinationIp ? `→ ${sample.destinationIp}${sample.destinationPort ? `:${sample.destinationPort}` : ''}` : '']
    .filter(Boolean)
    .join(' ');
  return [text, endpoint].filter(Boolean).join(' · ');
}

function domainProbeLine(part = {}, label) {
  if (part.skipped) {
    return `<span>${escapeHtml(label)}: пропущено</span>`;
  }
  const ok = part.ok === true;
  const latency = Number(part.latencyMs || 0);
  const suffix = latency ? ` · ${latency} мс` : '';
  const status = part.status ? ` HTTP ${part.status}` : '';
  return `<span class="${ok ? 'ok' : 'bad'}">${escapeHtml(label)}: ${ok ? 'да' : 'нет'}${escapeHtml(status + suffix)}</span>`;
}

function domainProbeStatusHtml(host) {
  const checking = state.domainProbeChecking === host;
  const result = state.domainProbeResults[host];
  if (checking) {
    return `<div class="domain-probe pending"><span>проверяю...</span></div>`;
  }
  if (!result) {
    return `<button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Проверить</button>`;
  }
  if (result.ok === false) {
    return `<div class="domain-probe bad">
      <strong>ошибка</strong>
      <span>${escapeHtml(result.stderr || result.error || 'не удалось проверить')}</span>
      <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
    </div>`;
  }
  const code = result.verdict?.code || '';
  const checks = result.checks || {};
  return `<div class="domain-probe ${escapeHtml(code)}">
    <strong>${escapeHtml(result.verdict?.label || 'проверено')}</strong>
    ${domainProbeLine(checks.ping, 'ping с роутера')}
    ${domainProbeLine(checks.tcpDirect, 'tcp напрямую')}
    ${domainProbeLine(checks.tcpProxy, `tcp через ${result.tag || 'proxy'}`)}
    ${domainProbeLine(checks.httpDirect || result.direct, 'http напрямую')}
    ${domainProbeLine(checks.httpProxy || result.proxy, `http через ${result.tag || 'proxy'}`)}
    <small>${escapeHtml(result.verdict?.detail || '')}</small>
    <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
  </div>`;
}

function domainMonitorItemHtml(item, { event = false } = {}) {
  const host = domainMonitorHost(item) || 'unknown';
  const kind = domainMonitorKind(host);
  const hits = event ? 1 : Number(item.hits || 0);
  const time = event ? item.time : item.lastSeen;
  return `<article class="domain-monitor-item ${kind.tone}">
    <div class="domain-monitor-kind">${kind.label}</div>
    <div class="domain-monitor-main">
      <strong>${escapeHtml(host)}</strong>
      <small>${escapeHtml(domainMonitorDeviceLine(item))}</small>
    </div>
    <div class="domain-monitor-chips">${domainMonitorMetaChips(item)}</div>
    <div class="domain-monitor-count">
      <strong>${hits.toLocaleString('ru-RU')}</strong>
      <small>${escapeHtml(time || '')}</small>
    </div>
    ${domainProbeStatusHtml(host)}
    <button class="btn secondary" data-domain-to-route="${escapeHtml(host)}">В правило</button>
  </article>`;
}

function domainMonitorRowsHtml(monitored, fallbackRows, rows) {
  if (state.domainMonitorMode === 'devices') {
    const selected = selectedDomainMonitorDevice();
    const devices = monitoredDevices();
    return devices.slice(0, 80).map((item) => {
      const deviceKey = item.ip || 'router';
      return `<article class="domain-monitor-device ${selected?.ip === deviceKey ? 'active' : ''}">
      <div class="domain-monitor-kind">LAN</div>
      <div class="domain-monitor-main">
        <strong>${escapeHtml(item.name || item.ip || 'router')}</strong>
        <small>${escapeHtml(item.ip || '')}</small>
      </div>
      <div class="domain-monitor-device-domains">${(item.topDomains || []).slice(0, 4).map((domain) => `<span>${escapeHtml(domain.host)} <b>${domain.hits}</b></span>`).join('')}</div>
      <div class="domain-monitor-count"><strong>${Number(item.hits || 0).toLocaleString('ru-RU')}</strong><small>событий</small></div>
      <button class="btn secondary" data-domain-device-events="${escapeHtml(deviceKey)}">${selected?.ip === deviceKey ? 'Выбрано' : 'События устройства'}</button>
    </article>`;
    }).join('') || '<p class="muted">Устройства пока не определены. Нужны access-логи или b4sni-совместимый лог.</p>';
  }
  if (state.domainMonitorMode === 'events') {
    const events = monitoredEvents();
    return events.slice(0, 160).map((item) => domainMonitorItemHtml(item, { event: true })).join('') || '<p class="muted">Живых событий пока нет. Нажмите Start и проверьте, что access-логирование включено.</p>';
  }
  return monitored.length ? monitored.slice(0, 80).map((item) => domainMonitorItemHtml(item)).join('') : fallbackRows.length && state.domainMonitorFilter === 'all' ? fallbackRows.map((item) => `<article class="diagnostic-row">
    <div>
      <strong>${escapeHtml(item.host)}</strong>
      <span>${item.devices.size || 'нет'} устройств · ${[...item.protocols].join('/') || 'protocol ?'} · ${[...item.outbound].join(', ') || 'направление ?'}</span>
    </div>
    <em>${item.hits} событий</em>
    <button class="btn secondary" data-domain-to-route="${escapeHtml(item.host)}">В правило</button>
  </article>`).join('') : rows.map(({ info, index }) => `<article class="diagnostic-row">
    <div>
      <strong>${escapeHtml(info.value)}</strong>
      <span>${escapeHtml(info.detail || 'domain rule')}</span>
    </div>
    <em>${escapeHtml(info.outbound)}</em>
    <button class="btn secondary" data-route-focus="${index}">Найти</button>
  </article>`).join('') || '<p class="muted">Домены пока не пойманы. Включите access-логи Xray или подключите b4sni-совместимый лог.</p>';
}

function diagnosticsDomainMonitorView() {
  const monitor = state.domainMonitor;
  const monitored = monitoredDomains();
  const selectedDevice = selectedDomainMonitorDevice();
  const stats = monitor?.stats || {};
  const fallbackRows = aggregateLogDomains();
  const rows = domainDiagnosticRows();
  const sourcePath = monitor?.sourcePath ? ` · ${monitor.sourcePath}` : '';
  const running = monitor?.running;
  const filterCounts = domainMonitorFilterCounts();
  const topRealDomain = domainMonitorRows()
    .filter((item) => domainMonitorMatchesFilter(item, 'domains'))
    .sort((a, b) => (b.hits || 0) - (a.hits || 0))[0];
  const filterActive = Boolean(String(state.domainMonitorQuery || '').trim()) || state.domainMonitorFilter !== 'all' || Boolean(selectedDevice);
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Мониторинг доменов</h2><span>SNI/домены как в B4SNI: живой поток, группировка по устройствам и быстрое добавление в маршрутизацию.</span></div>
        <div class="split-actions">
          ${running
            ? `<button class="btn danger ${state.busyAction === 'stopDomainMonitor' ? 'is-busy' : ''}" data-action="stopDomainMonitor" ${state.busyAction === 'stopDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'stopDomainMonitor' ? 'Останавливаю...' : 'Остановить'}</button>`
            : `<button class="btn warning ${state.busyAction === 'startDomainMonitor' ? 'is-busy' : ''}" data-action="startDomainMonitor" ${state.busyAction === 'startDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'startDomainMonitor' ? 'Запускаю...' : 'Запустить'}</button>`}
          <button class="btn secondary ${state.busyAction === 'clearDomainMonitor' ? 'is-busy' : ''}" data-action="clearDomainMonitor" ${state.busyAction === 'clearDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'clearDomainMonitor' ? 'Очищаю...' : 'Очистить'}</button>
          <button class="btn secondary ${state.busyAction === 'refreshDomainMonitor' ? 'is-busy' : ''}" data-action="refreshDomainMonitor" ${state.busyAction === 'refreshDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'refreshDomainMonitor' ? 'Обновляю...' : 'Обновить'}</button>
          <button class="btn secondary" data-tab-jump="routing">Маршруты</button>
        </div>
      </div>
      <div class="domain-monitor-state ${running ? 'running' : 'stopped'}">
        <strong>${running ? 'SNI-монитор запущен' : 'SNI-монитор остановлен'}</strong>
        <span>${escapeHtml(monitor?.hint || 'Запуск включает сбор и чтение SNI/domain событий, остановка выключает мониторинг.')}</span>
      </div>
      ${domainMonitorStatusPanel()}
      <section class="stats route-stats domain-monitor-stats">
        ${stat('Источник', monitorSourceLabel(), `${monitor?.running ? 'монитор запущен' : 'лог-файл'}${sourcePath}`)}
        ${stat('События', stats.total || 0, `${stats.tcp || 0} TCP · ${stats.udp || 0} UDP`)}
        ${stat('Домены', filterCounts.domains || monitored.length || 0, topRealDomain ? `топ: ${topRealDomain.host} (${topRealDomain.hits})` : 'ожидаю доменные события')}
      </section>
      ${domainMonitorFilterBar()}
      ${selectedDevice ? `<div class="domain-monitor-device-filter">
        <div>
          <span>События выбранного устройства</span>
          <strong>${escapeHtml(selectedDevice.name || selectedDevice.ip)}</strong>
          <small>${escapeHtml(selectedDevice.ip)} · ${Number(monitoredEvents().length || 0).toLocaleString('ru-RU')} событий в текущем фильтре</small>
        </div>
        <button class="btn secondary compact" data-domain-clear-device>Показать все устройства</button>
      </div>` : ''}
      <div class="domain-monitor-toolbar">
        <input id="domainMonitorQuery" value="${escapeHtml(state.domainMonitorQuery)}" placeholder="Найти домен, устройство или протокол" />
        <button class="btn secondary compact" data-domain-clear-filter ${filterActive ? '' : 'disabled'}>Очистить фильтр</button>
        <div class="segmented compact">
          ${[
            ['hits', 'По частоте'],
            ['last', 'По времени'],
            ['name', 'A-Z']
          ].map(([value, label]) => `<button type="button" class="${state.domainMonitorSort === value ? 'active' : ''}" data-domain-sort="${value}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="domain-monitor-mode segmented compact">
        ${[
          ['domains', 'Домены'],
          ['devices', 'Устройства'],
          ['events', 'События']
        ].map(([value, label]) => `<button type="button" class="${state.domainMonitorMode === value ? 'active' : ''}" data-domain-mode="${value}">${value === 'events' ? 'Live' : label}</button>`).join('')}
      </div>
      <div class="diagnostic-list domain-monitor-list">
        ${domainMonitorRowsHtml(monitored, fallbackRows, rows)}
      </div>
    </section>
  `;
}



  return {
    diagnosticsDomainView,
    diagnosticsDomainMonitorView,
  };
}
