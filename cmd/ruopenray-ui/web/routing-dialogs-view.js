export function createRoutingDialogsView({
  state,
  escapeHtml,
  routeKinds,
  routePlaceholders,
  customRoutePresetEntries,
  builtinRoutePresetEntries,
  ruleCountLabel,
  routePresetConditionCount,
  routeTargetOptions,
  balancerOptions,
  outboundOptions,
  routeLeasePicker,
  dslPreviewView,
  routeBalancers,
  balancerTargetOptions,
  splitRouteValues,
  balancerSelectorMatches,
  strategyObserverType,
  observerLabel,
  routeRules,
  balancerStrategyLabel,
  routePresetCheckResultView,
}) {
function routeRuleDialog() {
  if (!state.routeRuleDialog) return '';
  const options = outboundOptions();
  const balancers = balancerOptions();
  const editing = state.routeRuleEditingIndex >= 0;
  const listMode = !editing && state.routeRuleMode === 'list';
  const presetsMode = !editing && state.routeRuleMode === 'presets';
  const selected = new Set(state.selectedRoutePresets);
  const customEntries = customRoutePresetEntries();
  return `
    <div class="modal-backdrop" data-action="closeRouteRuleDialog">
      <section class="modal route-rule-dialog" role="dialog" aria-modal="true" aria-labelledby="routeRuleTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeRuleTitle">${editing ? 'Редактирование правила' : presetsMode ? 'Добавить подборки' : 'Новое правило'}</h2>
            <span>${editing ? 'Измените условие, цель или название правила. Порядок в списке останется прежним.' : presetsMode ? 'Выберите одну или несколько подборок правил и добавьте их в черновик маршрутизации.' : listMode ? 'Вставьте несколько правил списком и добавьте их в черновик маршрутизации.' : 'Добавьте один сайт, IP, LAN-устройство, порт или inbound в черновик маршрутизации.'}</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteRuleDialog" aria-label="Закрыть">×</button>
        </div>
        ${editing ? '' : `
        <div class="segmented route-dialog-mode" aria-label="Режим добавления правил">
          <button type="button" class="${!listMode && !presetsMode ? 'active' : ''}" data-route-rule-mode="single">Одно правило</button>
          <button type="button" class="${listMode ? 'active' : ''}" data-route-rule-mode="list">Список правил</button>
          <button type="button" class="${presetsMode ? 'active' : ''}" data-route-rule-mode="presets">Подборки</button>
        </div>
        `}
        ${presetsMode ? `
        <div class="preset-check-list route-dialog-presets">
          <button class="preset-create" type="button" data-action="newRoutePreset">Добавить свою подборку</button>
          ${customEntries.length ? `
            <div class="preset-group-title">Мои подборки</div>
            ${customEntries.map(([key, preset]) => `
              <label class="preset-check custom ${selected.has(key) ? 'active' : ''}">
                <input type="checkbox" data-route-preset-check="${key}" ${selected.has(key) ? 'checked' : ''} />
                <span class="checkmark"></span>
                <span>
                  <strong>${escapeHtml(preset.title)}</strong>
                  <small>${escapeHtml(preset.detail ? `${preset.detail} · ${ruleCountLabel(routePresetConditionCount(key))}` : ruleCountLabel(routePresetConditionCount(key)))}</small>
                </span>
                <span class="preset-check-actions">
                  <button class="preset-edit" type="button" data-route-preset-edit="${key}">Править</button>
                  <button class="preset-delete" type="button" data-route-preset-delete="${key}">Удалить</button>
                </span>
              </label>
            `).join('')}
          ` : ''}
          <div class="preset-group-title">Подборки</div>
          ${builtinRoutePresetEntries().map(([key, preset]) => `
            <label class="preset-check ${selected.has(key) ? 'active' : ''}">
              <input type="checkbox" data-route-preset-check="${key}" ${selected.has(key) ? 'checked' : ''} />
              <span class="checkmark"></span>
              <span>
                <strong>${escapeHtml(preset.title)}</strong>
                <small>${escapeHtml(`${preset.detail || describeRouteRule(preset.rule || routePresetRules(key)[0]).fullValue} · ${ruleCountLabel(routePresetConditionCount(key))}`)}</small>
              </span>
              <button class="preset-edit" type="button" data-route-preset-edit="${key}">Править</button>
            </label>
          `).join('')}
        </div>
        ` : listMode ? `
        <div class="route-form route-form-dialog route-list-form">
          <div class="form-row wide">
            <label>Название списка</label>
            <input id="routeDslName" value="${escapeHtml(state.routeDslName)}" placeholder="Например: Discord, YouTube, Игровые сервисы" />
          </div>
          <div class="form-row wide">
            <label>Правила списком</label>
            <textarea id="routeDsl" class="dsl-editor route-dialog-dsl" spellcheck="false" placeholder="default: direct&#10;domain(domain:discord.com) -> proxy&#10;network(udp) &amp;&amp; ip(104.16.0.0/12) -> proxy&#10;source(192.168.50.157) -> direct">${escapeHtml(state.routeDsl)}</textarea>
            <small>Поддерживается формат строк маршрутизации: <code>domain(...)</code>, <code>ip(...)</code>, <code>source(...)</code>, <code>network(udp)</code> и назначение через <code>-> proxy/direct/block</code>.</small>
          </div>
          ${state.routeDslPreview ? dslPreviewView(state.routeDslPreview) : ''}
        </div>
        ` : `
        <div class="route-form route-form-dialog">
          <div class="form-row route-value">
            <label>Название</label>
            <input id="routeName" value="${escapeHtml(state.routeName)}" placeholder="Например: Discord, ТВ напрямую, ChatGPT" />
          </div>
          <div class="form-row">
            <label>Что направляем</label>
            <select id="routeKind">
              ${Object.entries(routeKinds)
                .map(([key, title]) => `<option value="${key}" ${state.routeKind === key ? 'selected' : ''}>${title}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-row route-value">
            <label>Значение</label>
            <input id="routeValue" value="${escapeHtml(state.routeValue)}" placeholder="${escapeHtml(routePlaceholders[state.routeKind])}" />
          </div>
          ${routeLeasePicker()}
          <div class="form-row">
            <label>Тип цели</label>
            <div class="segmented route-target-switch" aria-label="Тип цели правила">
              <button type="button" class="${state.routeTargetType !== 'balancer' ? 'active' : ''}" data-route-target-type="outbound">Сервер</button>
              <button type="button" class="${state.routeTargetType === 'balancer' ? 'active' : ''}" data-route-target-type="balancer" ${balancers.length ? '' : 'disabled'}>Балансировщик</button>
            </div>
          </div>
          <div class="form-row">
            <label>Куда отправляем</label>
            ${state.routeTargetType === 'balancer' ? `
              <select id="routeBalancer">
                ${balancers.map((tag) => `<option value="${escapeHtml(tag)}" ${state.routeBalancer === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
              </select>
            ` : `
              <select id="routeOutbound">
                ${options.map((tag) => `<option value="${escapeHtml(tag)}" ${state.routeOutbound === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
              </select>
            `}
          </div>
        </div>
        `}
        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteRuleDialog">Отмена</button>
          ${presetsMode ? `
            <div class="split-actions">
              <button class="btn secondary" type="button" data-action="selectAllRoutePresets">Отметить все</button>
              <button class="btn secondary" type="button" data-action="clearRoutePresets">Снять выбор</button>
            </div>
            <button class="btn warning" type="button" data-action="applyRoutePresets" ${state.selectedRoutePresets.length ? '' : 'disabled'}>Добавить подборки</button>
          ` : listMode ? `
            <button class="btn secondary" type="button" data-action="previewRouteDsl">Проверить список</button>
            <button class="btn warning" type="button" data-action="appendRouteDslFromDialog">Добавить список</button>
          ` : `<button class="btn warning" type="button" data-action="${editing ? 'saveRouteEdit' : 'addRoute'}">${editing ? 'Сохранить правило' : 'Добавить правило'}</button>`}
        </div>
      </section>
    </div>
  `;
}

function routeBalancerDialog() {
  if (!state.routeBalancerDialog) return '';
  const balancers = routeBalancers();
  const targets = balancerTargetOptions();
  const selectedSelectors = new Set(splitRouteValues(state.routeBalancerSelectors));
  const selectorOrder = splitRouteValues(state.routeBalancerSelectors);
  const isRoundRobin = state.routeBalancerStrategy === 'roundRobin';
  const knownTargetTags = new Set(targets.map((target) => target.tag));
  const legacySelectors = [...selectedSelectors].filter((selector) => !knownTargetTags.has(selector));
  const orderedTargets = [...targets].sort((a, b) => {
    const aIndex = selectorOrder.indexOf(a.tag);
    const bIndex = selectorOrder.indexOf(b.tag);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return 0;
  });
  const fallbackTargets = [...targets];
  if (state.routeBalancerFallback && !fallbackTargets.some((target) => target.tag === state.routeBalancerFallback)) {
    fallbackTargets.push({ tag: state.routeBalancerFallback, kind: 'custom', title: state.routeBalancerFallback, detail: 'текущий резерв из конфигурации' });
  }
  const matches = balancerSelectorMatches(state.routeBalancerSelectors);
  const strategies = [
    ['random', 'Случайно'],
    ['roundRobin', 'По очереди'],
    ['leastPing', 'Меньший ping'],
    ['leastLoad', 'Меньше нагрузка']
  ];
  const advancedObserver = strategyObserverType(state.routeBalancerStrategy);
  const advancedStrategy = Boolean(advancedObserver);
  const advancedHelp = advancedObserver === 'burstObservatory'
    ? 'Для этой стратегии Xray включает Burst Observatory: проверяет серверы сериями и выбирает менее нагруженный доступный участник. Это advanced-режим.'
    : 'Для этой стратегии Xray включает Observatory: проверяет серверы HTTP-запросом и выбирает участника с меньшей задержкой. Ручная проверка RuOpenRay тут только помогает увидеть результат в UI.';
  return `
    <div class="modal-backdrop" data-action="closeRouteBalancerDialog">
      <section class="modal route-balancer-dialog" role="dialog" aria-modal="true" aria-labelledby="routeBalancerTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeBalancerTitle">Группа серверов</h2>
            <span>Создайте одну цель из нескольких серверов и выбирайте ее в правилах маршрутизации вместо конкретного сервера.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteBalancerDialog" aria-label="Закрыть">×</button>
        </div>

        <div class="balancer-layout">
          <section class="balancer-form">
            <div class="form-row">
              <label>Имя группы</label>
              <input id="routeBalancerTag" value="${escapeHtml(state.routeBalancerTag)}" placeholder="auto-proxy" />
            </div>
            <div class="form-row">
              <label>Стратегия</label>
              <select id="routeBalancerStrategy">
                ${strategies.map(([value, label]) => `<option value="${value}" ${state.routeBalancerStrategy === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>
            <div class="form-row wide">
              <label>Участники</label>
              <div class="balancer-target-list">
                ${orderedTargets.length ? orderedTargets.map((target) => {
                  const selected = selectedSelectors.has(target.tag);
                  const orderIndex = selectorOrder.indexOf(target.tag);
                  return `
                  <div class="balancer-target ${selected ? 'active' : ''}">
                    <input type="checkbox" data-balancer-selector="${escapeHtml(target.tag)}" ${selectedSelectors.has(target.tag) ? 'checked' : ''} />
                    <span class="balancer-kind">${target.kind === 'subscription' ? 'pool' : 'server'}</span>
                    <span>
                      <strong>${escapeHtml(target.title)}</strong>
                      <em>${escapeHtml(target.detail)}</em>
                    </span>
                    ${isRoundRobin && selected ? `
                      <span class="balancer-order-controls" aria-label="Порядок для round-robin">
                        <button type="button" data-balancer-selector-move="${escapeHtml(target.tag)}" data-direction="-1" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" data-balancer-selector-move="${escapeHtml(target.tag)}" data-direction="1" ${orderIndex < 0 || orderIndex >= selectorOrder.length - 1 ? 'disabled' : ''}>↓</button>
                      </span>
                    ` : ''}
                  </div>
                `; }).join('') : '<p class="muted">Сначала добавьте хотя бы один сервер или подписку.</p>'}
                ${legacySelectors.map((selector) => {
                  const orderIndex = selectorOrder.indexOf(selector);
                  return `
                  <div class="balancer-target active legacy">
                    <input type="checkbox" data-balancer-selector="${escapeHtml(selector)}" checked />
                    <span class="balancer-kind">selector</span>
                    <span>
                      <strong>${escapeHtml(selector)}</strong>
                      <em>Сохраненный selector из текущей конфигурации.</em>
                    </span>
                    ${isRoundRobin ? `
                      <span class="balancer-order-controls" aria-label="Порядок для round-robin">
                        <button type="button" data-balancer-selector-move="${escapeHtml(selector)}" data-direction="-1" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" data-balancer-selector-move="${escapeHtml(selector)}" data-direction="1" ${orderIndex < 0 || orderIndex >= selectorOrder.length - 1 ? 'disabled' : ''}>↓</button>
                      </span>
                    ` : ''}
                  </div>
                `; }).join('')}
              </div>
            </div>
            <div class="form-row">
              <label>Fallback</label>
              <select id="routeBalancerFallback">
                <option value="">Без резервного сервера</option>
                ${fallbackTargets.map((target) => `<option value="${escapeHtml(target.tag)}" ${state.routeBalancerFallback === target.tag ? 'selected' : ''}>${escapeHtml(target.title)}${target.kind === 'subscription' ? ' · подписка' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="balancer-preview ${matches.length ? '' : 'empty'}">
              <strong>${matches.length ? `Подходит серверов: ${matches.length}` : 'Пока нет совпадений'}</strong>
              <span>${matches.length ? matches.join(', ') : 'Выберите серверы или подписки, которые уже есть в профиле.'}</span>
            </div>
            ${advancedStrategy ? `<p class="settings-warning compact"><strong>${escapeHtml(observerLabel(advancedObserver))}</strong><span>${escapeHtml(advancedHelp)}</span></p>` : ''}
          </section>

          <section class="balancer-list">
            ${balancers.length ? balancers.map((balancer, index) => {
              const selectors = Array.isArray(balancer.selector) ? balancer.selector.join(', ') : '';
              const strategy = balancer.strategy?.type || 'random';
              const used = routeRules().filter((rule) => rule.balancerTag === balancer.tag).length;
              return `<article class="balancer-row">
                <div>
                  <strong>${escapeHtml(balancer.tag || 'без имени')}</strong>
                  <span>${escapeHtml(balancerStrategyLabel(strategy))} · выбор: ${escapeHtml(selectors || 'не задан')} · правил: ${used}</span>
                </div>
                <button class="btn secondary" type="button" data-route-balancer-edit="${index}">Править</button>
                <button class="btn danger" type="button" data-route-balancer-delete="${index}" ${used ? 'disabled' : ''}>Удалить</button>
              </article>`;
            }).join('') : `<p class="muted">Групп пока нет. Создайте группу и затем выберите ее в правиле маршрутизации.</p>`}
          </section>
        </div>

        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteBalancerDialog">Отмена</button>
          <button class="btn warning" type="button" data-action="saveRouteBalancer">Сохранить</button>
        </div>
      </section>
    </div>
  `;
}

function routePresetDialog() {
  if (!state.routePresetDialog) return '';
  const editorOpen = Boolean(state.routePresetEditor);
  if (!editorOpen) return '';
  const editorPreview = state.routePresetEditPreview;
  const showCheckResult = state.routePresetEditChecked && editorPreview;
  return `
    <div class="modal-backdrop" data-action="closeRoutePresetDialog">
      <section class="modal preset-dialog" role="dialog" aria-modal="true" aria-labelledby="routePresetTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routePresetTitle">Редактор подборки</h2>
            <span>Поправьте название, описание и строки правил перед добавлением в маршрутизацию.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRoutePresetDialog" aria-label="Закрыть">×</button>
        </div>
          <div class="preset-editor">
            <div class="preset-editor-grid">
              <label>
                <span>Название</span>
                <input id="routePresetEditTitle" value="${escapeHtml(state.routePresetEditTitle)}" placeholder="Например, YouTube через proxy" />
              </label>
              <label>
                <span>Описание</span>
                <input id="routePresetEditDetail" value="${escapeHtml(state.routePresetEditDetail)}" placeholder="Коротко, что делает подборка" />
              </label>
            </div>
            <label>
              <span>Правила</span>
              <textarea id="routePresetEditDsl" class="dsl-editor preset-editor-dsl" spellcheck="false" placeholder="domain(domain:...) -> proxy&#10;ip(.../24) -> proxy&#10;network(udp) &amp;&amp; ip(.../16) -> proxy&#10;source(192.168.1.50) -> direct">${escapeHtml(state.routePresetEditDsl)}</textarea>
            </label>
            ${showCheckResult ? routePresetCheckResultView(editorPreview) : '<div class="preset-editor-hint">Проверка покажет, сколько правил распознано, куда они направлены и какие строки требуют внимания.</div>'}
          </div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-action="closeRoutePresetDialog">Отмена</button>
            <div class="split-actions">
              <button class="btn secondary" type="button" data-action="previewRoutePresetEdit">Проверить</button>
              <button class="btn secondary" type="button" data-action="saveRoutePresetEdit">Сохранить подборку</button>
              <button class="btn warning" type="button" data-action="applyRoutePresetEdit">Добавить в правила</button>
            </div>
          </div>
      </section>
    </div>
  `;
}


  return {
    routeRuleDialog,
    routeBalancerDialog,
    routePresetDialog,
  };
}
