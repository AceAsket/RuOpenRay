export function createServerModeView({ state, escapeHtml }) {
  const array = (value) => Array.isArray(value) ? value : [];
  const byteSize = (value = 0) => {
    const bytes = Number(value || 0);
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${Math.max(0, Math.round(bytes))} B`;
  };
  const byteRate = (value = 0) => `${byteSize(value)}/s`;

  function draft() {
    return state.serverModeDraft || state.serverMode?.config || { enabled: false, xray: [], awg: [] };
  }

  function outbounds() {
    const fromReport = array(state.serverMode?.outbounds).map((item) => item?.tag).filter(Boolean);
    const fromConfig = array(state.config?.outbounds).map((item) => item?.tag).filter(Boolean);
    return [...new Set(['direct', 'block', ...fromReport, ...fromConfig])]
      .filter((tag) => tag && !String(tag).startsWith('ruopenray-server-'));
  }

  function outboundSelect(path, value = 'direct') {
    const options = outbounds().map((tag) => `<option value="${escapeHtml(tag)}" ${tag === value ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('');
    return `<select class="input" data-server-mode-field="${escapeHtml(path)}">${options}</select>`;
  }

  function textInput(path, value = '', attrs = '') {
    return `<input class="input" data-server-mode-field="${escapeHtml(path)}" value="${escapeHtml(value || '')}" ${attrs}>`;
  }

  function numberInput(path, value = 0, attrs = '') {
    return `<input class="input" type="number" data-server-mode-number="1" data-server-mode-field="${escapeHtml(path)}" value="${escapeHtml(value || 0)}" ${attrs}>`;
  }

  function checkbox(path, checked = false, label = '') {
    return `<label class="settings-check server-mode-check">
      <input type="checkbox" data-server-mode-field="${escapeHtml(path)}" ${checked ? 'checked' : ''}>
      <span><strong>${escapeHtml(label)}</strong></span>
    </label>`;
  }

  function issueList(preflight = {}) {
    const errors = array(preflight.errors);
    const warnings = array(preflight.warnings);
    const items = [...errors, ...warnings];
    if (!items.length) {
      return `<div class="notice ok"><strong>Проверка чистая</strong><span>Критичных проблем server-mode пока не найдено.</span></div>`;
    }
    return `<div class="server-mode-issues">
      ${items.map((issue) => `<article class="${escapeHtml(issue.severity || 'warning')}">
        <strong>${escapeHtml(issue.title || 'Проверка')}</strong>
        <span>${escapeHtml(issue.detail || '')}</span>
        ${issue.source ? `<code>${escapeHtml(issue.source)}</code>` : ''}
      </article>`).join('')}
    </div>`;
  }

  function clientCard(inbound, inboundIndex, client, clientIndex) {
    const base = `xray.${inboundIndex}.clients.${clientIndex}`;
    return `<article class="server-mode-client">
      <div class="server-mode-client-head">
        ${checkbox(`${base}.enabled`, client.enabled, client.name || `Клиент ${clientIndex + 1}`)}
        <div class="server-mode-row-actions">
          <button class="btn secondary compact" type="button" data-action="exportServerModeClient" data-server-mode-inbound="${inboundIndex}" data-server-mode-client="${clientIndex}">Ссылка</button>
          <button class="icon-btn danger" type="button" data-action="deleteServerModeClient" data-server-mode-inbound="${inboundIndex}" data-server-mode-client="${clientIndex}" title="Удалить клиента">×</button>
        </div>
      </div>
      <div class="server-mode-grid">
        <label><span>Имя</span>${textInput(`${base}.name`, client.name)}</label>
        <label><span>UUID</span>${textInput(`${base}.uuid`, client.uuid, 'spellcheck="false"')}</label>
        <label><span>User / email</span>${textInput(`${base}.email`, client.email, 'spellcheck="false"')}</label>
        <label><span>Куда отправлять</span>${outboundSelect(`${base}.egressTag`, client.egressTag || 'direct')}</label>
        <label><span>Flow</span>${textInput(`${base}.flow`, client.flow || 'xtls-rprx-vision', 'spellcheck="false"')}</label>
        <label><span>Level</span>${numberInput(`${base}.level`, client.level || 0, 'min="0" max="255"')}</label>
      </div>
      <div class="server-mode-policy-row">
        ${checkbox(`${base}.allowLan`, client.allowLan, 'Разрешить LAN')}
        ${checkbox(`${base}.allowDns`, client.allowDns, 'Разрешить DNS/53')}
        ${checkbox(`${base}.allowRouter`, client.allowRouter, 'Разрешить роутер')}
      </div>
    </article>`;
  }

  function inboundCard(inbound, index) {
    const base = `xray.${index}`;
    const clients = array(inbound.clients);
    return `<article class="server-mode-inbound">
      <div class="server-mode-inbound-head">
        <div>
          <span class="eyebrow">XRAY SERVER</span>
          <h3>${escapeHtml(inbound.name || `Вход ${index + 1}`)}</h3>
          <p>${escapeHtml(`${inbound.listen || '0.0.0.0'}:${inbound.port || 443} · ${inbound.protocol || 'vless'} · ${inbound.security || 'reality'}`)}</p>
        </div>
        <div class="server-mode-row-actions">
          <button class="btn secondary compact" type="button" data-action="generateServerModeRealityKey" data-server-mode-inbound="${index}">Ключ Reality</button>
          <button class="btn secondary compact" type="button" data-action="addServerModeClient" data-server-mode-inbound="${index}">Добавить клиента</button>
          <button class="icon-btn danger" type="button" data-action="deleteServerModeInbound" data-server-mode-inbound="${index}" title="Удалить вход">×</button>
        </div>
      </div>
      ${checkbox(`${base}.enabled`, inbound.enabled, 'Вход включен')}
      <div class="server-mode-grid">
        <label><span>Название</span>${textInput(`${base}.name`, inbound.name)}</label>
        <label><span>Listen</span>${textInput(`${base}.listen`, inbound.listen || '0.0.0.0', 'spellcheck="false"')}</label>
        <label><span>Публичный адрес</span>${textInput(`${base}.publicHost`, inbound.publicHost || '', 'placeholder="vpn.example.com" spellcheck="false"')}</label>
        <label><span>Порт</span>${numberInput(`${base}.port`, inbound.port || 443, 'min="1" max="65535"')}</label>
        <label><span>Security</span>
          <select class="input" data-server-mode-field="${base}.security">
            ${['reality', 'tls', 'none'].map((value) => `<option value="${value}" ${value === inbound.security ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="server-mode-grid">
        <label><span>Reality dest</span>${textInput(`${base}.reality.dest`, inbound.reality?.dest || 'www.microsoft.com:443', 'spellcheck="false"')}</label>
        <label><span>Server names</span>${textInput(`${base}.reality.serverNames`, array(inbound.reality?.serverNames).join(', '), 'data-server-mode-list="1" spellcheck="false"')}</label>
        <label><span>Private key</span>${textInput(`${base}.reality.privateKey`, inbound.reality?.privateKey || '', 'spellcheck="false"')}</label>
        <label><span>Public key</span>${textInput(`${base}.reality.publicKey`, inbound.reality?.publicKey || '', 'spellcheck="false"')}</label>
        <label><span>Short IDs</span>${textInput(`${base}.reality.shortIds`, array(inbound.reality?.shortIds).join(', '), 'data-server-mode-list="1" spellcheck="false"')}</label>
      </div>
      <div class="server-mode-policy-row">
        ${checkbox(`${base}.sniffing`, inbound.sniffing, 'Sniffing routeOnly')}
        ${checkbox(`${base}.openFirewall`, inbound.openFirewall, 'Планировать WAN firewall')}
      </div>
      <div class="server-mode-clients">
        ${clients.length ? clients.map((client, clientIndex) => clientCard(inbound, index, client, clientIndex)).join('') : '<div class="empty-state">Клиентов пока нет.</div>'}
      </div>
    </article>`;
  }

  function awgPeerCard(serverIndex, peer, peerIndex) {
    const base = `awg.${serverIndex}.peers.${peerIndex}`;
    return `<article class="server-mode-client">
      <div class="server-mode-client-head">
        ${checkbox(`${base}.enabled`, peer.enabled, peer.name || `Peer ${peerIndex + 1}`)}
        <button class="icon-btn danger" type="button" data-action="deleteServerModeAWGPeer" data-server-mode-awg="${serverIndex}" data-server-mode-peer="${peerIndex}" title="Удалить peer">×</button>
      </div>
      <div class="server-mode-grid">
        <label><span>Имя</span>${textInput(`${base}.name`, peer.name)}</label>
        <label><span>Public key</span>${textInput(`${base}.publicKey`, peer.publicKey, 'spellcheck="false"')}</label>
        <label><span>Allowed IPs</span>${textInput(`${base}.allowedIps`, peer.allowedIps || '10.70.0.2/32', 'spellcheck="false"')}</label>
        <label><span>Preshared key</span>${textInput(`${base}.presharedKey`, peer.presharedKey || '', 'spellcheck="false"')}</label>
      </div>
    </article>`;
  }

  function awgCard(server, index) {
    const base = `awg.${index}`;
    const peers = array(server.peers);
    return `<article class="server-mode-inbound server-mode-awg">
      <div class="server-mode-inbound-head">
        <div>
          <span class="eyebrow">AMNEZIAWG SERVER</span>
          <h3>${escapeHtml(server.name || `AWG вход ${index + 1}`)}</h3>
          <p>${escapeHtml(`${server.interface || 'awg-server0'} · udp/${server.listenPort || 51820} · ${server.addressCidr || '10.70.0.1/24'}`)}</p>
        </div>
        <div class="server-mode-row-actions">
          <button class="btn secondary compact" type="button" data-action="addServerModeAWGPeer" data-server-mode-awg="${index}">Добавить peer</button>
          <button class="icon-btn danger" type="button" data-action="deleteServerModeAWGServer" data-server-mode-awg="${index}" title="Удалить AWG сервер">×</button>
        </div>
      </div>
      ${checkbox(`${base}.enabled`, server.enabled, 'AWG сервер включен в плане')}
      <div class="notice warn compact"><strong>Пока без применения интерфейса</strong><span>RuOpenRay сохранит и проверит схему AWG, но не будет поднимать интерфейс и открывать WAN-порт до отдельного безопасного шага.</span></div>
      <div class="server-mode-grid">
        <label><span>Название</span>${textInput(`${base}.name`, server.name)}</label>
        <label><span>Interface</span>${textInput(`${base}.interface`, server.interface || 'awg-server0', 'spellcheck="false"')}</label>
        <label><span>UDP порт</span>${numberInput(`${base}.listenPort`, server.listenPort || 51820, 'min="1" max="65535"')}</label>
        <label><span>Адрес интерфейса</span>${textInput(`${base}.addressCidr`, server.addressCidr || '10.70.0.1/24', 'spellcheck="false"')}</label>
        <label><span>MTU</span>${numberInput(`${base}.mtu`, server.mtu || 1420, 'min="576" max="9000"')}</label>
        <label><span>Куда отправлять</span>${outboundSelect(`${base}.egressTag`, server.egressTag || 'direct')}</label>
        <label><span>Private key</span>${textInput(`${base}.privateKey`, server.privateKey || '', 'spellcheck="false"')}</label>
        <label><span>Public key</span>${textInput(`${base}.publicKey`, server.publicKey || '', 'spellcheck="false"')}</label>
      </div>
      <div class="server-mode-policy-row">
        ${checkbox(`${base}.allowLan`, server.allowLan, 'Разрешить LAN для peers')}
        ${checkbox(`${base}.openFirewall`, server.openFirewall, 'Планировать WAN firewall')}
      </div>
      <div class="server-mode-clients">
        ${peers.length ? peers.map((peer, peerIndex) => awgPeerCard(index, peer, peerIndex)).join('') : '<div class="empty-state">Peers пока нет.</div>'}
      </div>
    </article>`;
  }

  function awgPlanPanel() {
    const plan = state.serverModePreview?.awgPlan || state.serverMode?.awgPlan || {};
    const servers = array(plan.servers);
    if (!servers.length) return '';
    const globalIssues = [...array(plan.errors), ...array(plan.warnings)];
    return `<section class="server-mode-awg-plan">
      <div class="server-mode-awg-plan-head">
        <div>
          <h3>План AmneziaWG server</h3>
          <p>RuOpenRay пока только готовит конфиг интерфейса и команды. Маршрутизация трафика peer-ов в выбранный outbound будет отдельным безопасным шагом.</p>
        </div>
        <span class="pill ${plan.ok ? 'ok' : 'warn'}">${plan.ok ? 'готов' : 'нужна правка'}</span>
      </div>
      ${globalIssues.length ? `<div class="server-mode-awg-plan-issues">
        ${globalIssues.map((issue) => `<span class="${escapeHtml(issue.severity || 'warning')}">${escapeHtml(issue.title || 'AWG')}${issue.source ? ` · ${escapeHtml(issue.source)}` : ''}</span>`).join('')}
      </div>` : ''}
      <div class="server-mode-awg-plan-list">
        ${servers.map((server) => {
          const commands = array(server.commands).join('\n');
          const serverIssues = [...array(server.errors), ...array(server.warnings)];
          return `<article>
            <div class="server-mode-awg-plan-title">
              <div>
                <strong>${escapeHtml(server.name || server.id || 'AWG')}</strong>
                <span>${escapeHtml(`${server.interface || 'awg-server'} · udp/${server.listenPort || '-'} · ${server.addressCidr || '-'}`)}</span>
              </div>
              <span class="pill ${server.ok ? 'ok' : 'warn'}">${escapeHtml(`${server.peerCount || 0} peers`)}</span>
            </div>
            ${serverIssues.length ? `<div class="server-mode-awg-plan-issues compact">
              ${serverIssues.map((issue) => `<span class="${escapeHtml(issue.severity || 'warning')}">${escapeHtml(issue.title || 'AWG')}</span>`).join('')}
            </div>` : ''}
            <label class="server-mode-export-field"><span>Config path</span><input class="input" readonly value="${escapeHtml(server.configPath || '')}"></label>
            <label class="server-mode-export-field"><span>AWG config preview</span><textarea class="input" readonly rows="8">${escapeHtml(server.configRedacted || server.config || '')}</textarea></label>
            <label class="server-mode-export-field"><span>Команды запуска</span><textarea class="input" readonly rows="7">${escapeHtml(commands)}</textarea></label>
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }

  function managedStats() {
    const managed = state.serverMode?.managed || state.serverModePreview?.summary || {};
    return `<div class="grid four">
      <article class="stat"><span>Входы</span><strong>${escapeHtml(managed.inbounds ?? 0)}</strong><small>managed Xray</small></article>
      <article class="stat"><span>Клиенты</span><strong>${escapeHtml(managed.clients ?? 0)}</strong><small>VLESS users</small></article>
      <article class="stat"><span>Маршруты</span><strong>${escapeHtml(managed.routingRules ?? 0)}</strong><small>user-policy rules</small></article>
      <article class="stat"><span>Outbounds</span><strong>${escapeHtml(managed.outbounds ?? 0)}</strong><small>служебные deny</small></article>
    </div>`;
  }

  function policyChip(label, value, tone = '') {
    return `<span class="server-mode-policy-chip ${escapeHtml(tone || value || '')}">${escapeHtml(label)}</span>`;
  }

  function clientSecurityRows(model) {
    const rows = [];
    array(model.xray).forEach((inbound) => {
      array(inbound.clients).forEach((client) => {
        const enabled = inbound.enabled !== false && client.enabled !== false;
        const lan = client.allowLan ? 'allowed' : 'blocked';
        const router = client.allowLan || client.allowRouter ? 'allowed' : 'blocked';
        const dns = client.allowDns ? 'allowed' : 'blocked';
        const risk = client.allowLan ? 'high' : ((client.allowRouter || client.allowDns) ? 'medium' : 'low');
        let rules = enabled ? 1 : 0;
        if (enabled && !client.allowDns) rules += 1;
        if (enabled && !client.allowLan) rules += 1;
        if (enabled && client.allowRouter && !client.allowLan) rules += 1;
        rows.push({
          kind: 'Xray',
          name: client.name || client.email || client.id || 'Клиент',
          parent: inbound.name || inbound.id || 'Вход',
          enabled,
          egress: client.egressTag || 'direct',
          lan,
          router,
          dns,
          risk,
          rules
        });
      });
    });
    array(model.awg).forEach((server) => {
      array(server.peers).forEach((peer) => {
        const enabled = server.enabled === true && peer.enabled !== false;
        rows.push({
          kind: 'AWG',
          name: peer.name || peer.id || 'Peer',
          parent: server.name || server.id || 'AWG',
          enabled,
          egress: server.egressTag || 'direct',
          lan: server.allowLan ? 'allowed' : 'blocked',
          router: server.allowLan ? 'allowed' : 'blocked',
          dns: 'client',
          risk: server.allowLan ? 'high' : 'low',
          rules: 0
        });
      });
    });
    return rows;
  }

  function securityPanel(model) {
    const rows = clientSecurityRows(model);
    const enabledRows = rows.filter((row) => row.enabled);
    const lanOpen = enabledRows.filter((row) => row.lan === 'allowed').length;
    const dnsOpen = enabledRows.filter((row) => row.dns === 'allowed').length;
    const highRisk = enabledRows.filter((row) => row.risk === 'high').length;
    const managedRules = enabledRows.reduce((sum, row) => sum + Number(row.rules || 0), 0);
    return `<section class="server-mode-security">
      <div class="server-mode-security-head">
        <div>
          <h3>Политики клиентов</h3>
          <p>По умолчанию внешний клиент не получает LAN и DNS router. Разрешения ниже превращаются в managed routing rules.</p>
        </div>
        <div class="server-mode-security-summary">
          ${policyChip(`${enabledRows.length} активных`, 'neutral')}
          ${policyChip(`${managedRules} правил`, 'neutral')}
          ${policyChip(`${lanOpen} LAN`, lanOpen ? 'danger' : 'ok')}
          ${policyChip(`${dnsOpen} DNS`, dnsOpen ? 'warn' : 'ok')}
        </div>
      </div>
      ${highRisk ? `<div class="notice warn compact"><strong>Есть клиенты с LAN-доступом</strong><span>Оставляйте это только для доверенных клиентов: они смогут обращаться к приватным адресам через router.</span></div>` : ''}
      ${rows.length ? `<div class="server-mode-security-list">
        ${rows.map((row) => `<article class="${row.enabled ? '' : 'disabled'}">
          <div>
            <strong>${escapeHtml(row.name)}</strong>
            <span>${escapeHtml(`${row.kind} · ${row.parent} · ${row.egress}`)}</span>
          </div>
          <div class="server-mode-policy-chips">
            ${policyChip(row.enabled ? 'включен' : 'выключен', row.enabled ? 'ok' : 'muted')}
            ${policyChip(row.lan === 'allowed' ? 'LAN открыт' : 'LAN закрыт', row.lan === 'allowed' ? 'danger' : 'ok')}
            ${policyChip(row.router === 'allowed' ? 'router открыт' : 'router закрыт', row.router === 'allowed' ? 'warn' : 'ok')}
            ${policyChip(row.dns === 'allowed' ? 'DNS открыт' : (row.dns === 'client' ? 'DNS клиента' : 'DNS закрыт'), row.dns === 'allowed' ? 'warn' : 'ok')}
            ${policyChip(row.risk === 'high' ? 'высокий риск' : (row.risk === 'medium' ? 'средний риск' : 'низкий риск'), row.risk === 'high' ? 'danger' : (row.risk === 'medium' ? 'warn' : 'ok'))}
          </div>
        </article>`).join('')}
      </div>` : '<div class="empty-state compact">Добавьте Xray-клиента или AWG peer, чтобы увидеть политики доступа.</div>'}
    </section>`;
  }

  function firewallPanel() {
    const status = state.serverMode?.firewall || {};
    const preview = state.serverModeFirewallPreview;
    const statusRules = array(status.rules);
    const previewRules = array(preview?.rules);
    const rows = previewRules.length ? previewRules : statusRules;
    const activeText = status.available === false
      ? 'UCI firewall недоступен'
      : (status.active ? `${status.count || statusRules.length} WAN правил открыто` : 'WAN правила не открыты');
    const resultClass = preview?.ok ? 'ok' : 'warn';
    return `<section class="server-mode-firewall">
      <div class="server-mode-firewall-head">
        <div>
          <h3>WAN firewall</h3>
          <p>Открывает только выбранные входящие порты server-mode через UCI firewall. Отключение удаляет только правила RuOpenRay.</p>
        </div>
        <span class="pill ${status.active ? 'ok' : 'muted'}">${escapeHtml(activeText)}</span>
      </div>
      <div class="server-mode-row-actions">
        <button class="btn secondary compact" type="button" data-action="previewServerModeFirewall">Проверить WAN</button>
        <button class="btn warning compact" type="button" data-action="applyServerModeFirewall">Открыть WAN</button>
        <button class="btn secondary compact" type="button" data-action="disableServerModeFirewall">Закрыть WAN</button>
      </div>
      ${rows.length ? `<div class="server-mode-firewall-rules">
        ${rows.map((rule) => `<article>
          <strong>${escapeHtml(rule.name || rule.section || 'server-mode')}</strong>
          <span>${escapeHtml(`${rule.source || 'wan'} · ${rule.protocol || 'tcp'} · ${rule.port || '-'}`)}</span>
        </article>`).join('')}
      </div>` : '<div class="empty-state compact">Включите “Планировать WAN firewall” у нужного входа и нажмите проверку.</div>'}
      ${preview ? `<div class="notice ${resultClass} compact"><strong>${preview.ok ? 'План WAN готов' : 'WAN требует внимания'}</strong><span>${escapeHtml(preview.error || preview.message || 'Команды firewall построены без применения.')}</span></div>` : ''}
    </section>`;
  }

  function clientTrafficPanel() {
    const clients = array(state.serverMode?.clients);
    const stats = state.serverMode?.xrayStats || {};
    if (!clients.length) return '';
    return `<section class="server-mode-traffic">
      <div class="server-mode-traffic-head">
        <div>
          <h3>Мониторинг клиентов</h3>
          <p>${stats.enabled === true ? 'Xray user stats включены: клиенты считаются по email/user.' : 'Статистика клиентов появится после применения server-mode и перезапуска Xray.'}</p>
        </div>
        <span class="pill ${stats.enabled === true ? 'ok' : 'muted'}">${stats.enabled === true ? 'stats включены' : 'stats выключены'}</span>
      </div>
      <div class="server-mode-traffic-list">
        ${clients.map((client) => `<article>
          <div>
            <strong>${escapeHtml(client.name || client.email || 'Клиент')}</strong>
            <span>${escapeHtml(`${client.inboundName || client.inboundId || 'вход'} → ${client.egressTag || 'direct'}`)}</span>
          </div>
          <div>
            <strong>${escapeHtml(client.status || 'ждем трафик')}</strong>
            <span>${escapeHtml(`${byteSize(client.downlink)} принято · ${byteSize(client.uplink)} отправлено`)}</span>
          </div>
          <div>
            <strong>${escapeHtml(`${byteRate(client.downRate)} прием`)}</strong>
            <span>${escapeHtml(`${byteRate(client.upRate)} отдача`)}</span>
          </div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function clientExportPanel() {
    const data = state.serverModeClientExport;
    if (!data) return '';
    const warnings = array(data.warnings);
    const outboundJson = JSON.stringify(data.outbound || {}, null, 2);
    return `<section class="server-mode-export">
      <div class="server-mode-export-head">
        <div>
          <h3>Экспорт клиента</h3>
          <p>${data.ok === false ? escapeHtml(data.error || 'Не удалось собрать профиль клиента.') : 'VLESS ссылка скопирована в буфер, JSON можно скачать для ручной настройки Xray.'}</p>
        </div>
        <button class="btn secondary compact" type="button" data-action="downloadServerModeClientExport" ${data.outbound ? '' : 'disabled'}>Скачать JSON</button>
      </div>
      ${warnings.length ? `<div class="server-mode-export-warnings">${warnings.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
      ${data.uri ? `<label class="server-mode-export-field"><span>VLESS URI</span><textarea class="input" readonly rows="3">${escapeHtml(data.uri)}</textarea></label>` : ''}
      ${data.outbound ? `<label class="server-mode-export-field"><span>Xray outbound JSON</span><textarea class="input" readonly rows="8">${escapeHtml(outboundJson)}</textarea></label>` : ''}
    </section>`;
  }

  function serverModePanel() {
    const model = draft();
    const preflight = state.serverModePreflight || state.serverMode?.preflight || {};
    const xray = array(model.xray);
    const awg = array(model.awg);
    const hasEntries = xray.length + awg.length > 0;
    const preview = state.serverModePreview;
    return `<section class="panel server-mode-panel">
      <div class="section-head">
        <div>
          <h2>Входящие подключения</h2>
          ${hasEntries ? '<p>RuOpenRay может принимать внешних клиентов Xray, выдавать каждому свою политику доступа и отправлять их трафик в выбранный outbound.</p>' : ''}
        </div>
        <div class="actions">
          ${hasEntries ? `
            <button class="btn secondary" type="button" data-action="refreshServerMode">Обновить</button>
            <button class="btn secondary" type="button" data-action="previewServerMode">Проверить</button>
            <button class="btn warning" type="button" data-action="saveServerMode">Сохранить</button>
            <button class="btn" type="button" data-action="applyServerMode">Записать в Xray</button>
          ` : ''}
        </div>
      </div>
      ${hasEntries ? `
        <div class="server-mode-hero">
          ${checkbox('enabled', model.enabled, 'Серверный режим включен')}
          ${checkbox('monitorClients', model.monitorClients !== false, 'Мониторить клиентов')}
          <p>По умолчанию внешний клиент не получает доступ к LAN и DNS-порту роутера. Доступ открывается только явными галочками на клиенте.</p>
        </div>
        ${managedStats()}
        ${securityPanel(model)}
        ${clientTrafficPanel()}
        ${clientExportPanel()}
        ${issueList(preflight)}
        ${awgPlanPanel()}
        ${firewallPanel()}
        <div class="server-mode-toolbar">
          <button class="btn secondary" type="button" data-action="addServerModeXrayInbound">Добавить Xray вход</button>
          <button class="btn secondary" type="button" data-action="addServerModeAWGServer">Добавить AWG сервер</button>
        </div>
        <div class="server-mode-list">
          ${xray.map((inbound, index) => inboundCard(inbound, index)).join('')}
          ${awg.map((server, index) => awgCard(server, index)).join('')}
        </div>
        ${preview ? `<div class="notice ${preview.ok ? 'ok' : 'warn'}"><strong>${preview.ok ? 'Проверка готова' : 'Проверка требует внимания'}</strong><span>${escapeHtml(preview.error || preview.restart?.message || 'Xray config был проверен без перезапуска сервиса.')}</span></div>` : ''}
      ` : `
        <section class="server-mode-empty-start">
          <div>
            <span class="eyebrow">первый шаг</span>
            <h3>Добавьте подключение</h3>
            <p>Reality подходит для Xray-клиентов; AWG создаёт отдельный туннель с управляемыми peer.</p>
          </div>
          <div class="server-mode-empty-actions">
            <button class="btn" type="button" data-action="addServerModeXrayInbound">Добавить Xray вход</button>
            <button class="btn secondary" type="button" data-action="addServerModeAWGServer">Добавить AWG сервер</button>
          </div>
        </section>
      `}
    </section>`;
  }

  return { serverModePanel };
}
