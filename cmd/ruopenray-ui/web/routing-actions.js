import { routePresetIconView } from './route-visuals.js';

export function createRoutingActions({
  state,
  render,
  escapeHtml,
  routeKinds,
  routePresets,
  routeBundles,
  hiddenBuiltinRoutePresetKeys,
  customRoutePresetsStorageKey,
  parseRoutingDsl,
  isDslDefaultRule,
  dslPreviewStats,
  dslPreviewView,
  routeRules,
  setRoutingDraft,
  activeProxyTag,
  balancerOptions,
  splitRouteValues,
  routeTarget,
  routeRuleKey,
  readableRouteTag,
  encodedRouteTarget,
  isRuOpenRayManagedRoute,
  routeRuleName,
  setRouteRuleName,
  copyRouteRuleName,
  describeRouteRule,
  routeSectionDefinitions,
  routeCategoryForRule,
  routeRuleSource,
  routeTargetOptions,
  saveRouteNames,
  saveDisabledRouteRules
}) {
  function previewRoutingDsl() {
    state.routeDslPreview = parseRoutingDsl(state.routeDsl);
    const parsed = state.routeDslPreview;
    state.message = `Распознано правил: ${parsed.rules.length}${parsed.warnings.length ? `, предупреждений: ${parsed.warnings.length}` : ''}`;
    render();
  }

  function configAnalysisView() {
    const analysis = state.configAnalysis;
    if (!analysis) return '';
    const counts = analysis.counts || {};
    const lines = [
      ...(analysis.errors || []).map((text) => ['error', text]),
      ...(analysis.warnings || []).map((text) => ['warn', text]),
      ...(analysis.info || []).map((text) => ['info', text])
    ];
    return `
      <div class="config-analysis ${analysis.ok ? 'ok' : 'bad'}">
        <div class="analysis-head">
          <strong>${analysis.ok ? 'Правила выглядят согласованно' : 'Есть ошибки в правилах'}</strong>
          <span>${counts.total || 0} правил · proxy ${counts.proxy || 0} · direct ${counts.direct || 0} · block ${counts.block || 0} · другое ${counts.other || 0}</span>
        </div>
        ${lines.length ? `<ul>${lines.slice(0, 8).map(([kind, text]) => `<li class="${kind}">${escapeHtml(text)}</li>`).join('')}${lines.length > 8 ? `<li class="info">Еще ${lines.length - 8} сообщений...</li>` : ''}</ul>` : '<p class="muted">Отсутствующие geo-файлы и несуществующие outboundTag не найдены.</p>'}
      </div>
    `;
  }

  function applyRoutingDsl(mode, closeDialog = false) {
    const parsed = parseRoutingDsl(state.routeDsl);
    state.routeDslPreview = parsed;
    if (!parsed.rules.length) {
      state.message = 'Не нашёл правил для импорта';
      render();
      return;
    }
    const nextRules = mode === 'append' ? [...routeRules(), ...parsed.rules] : parsed.rules;
    setRoutingDraft(nextRules);
    const listName = state.routeDslName.trim();
    if (listName) {
      parsed.rules
        .filter((rule) => !isDslDefaultRule(rule, parsed))
        .forEach((rule) => setRouteRuleName(rule, listName));
    }
    state.message = mode === 'append'
      ? `Добавлено правил: ${parsed.rules.length}${listName ? ` · список «${listName}»` : ''}. Проверьте конфигурацию и примените изменения.`
      : `Черновик маршрутизации заменен: ${parsed.rules.length}${listName ? ` · список «${listName}»` : ''}. Проверьте конфигурацию и примените изменения.`;
    if (closeDialog) {
      state.routeRuleDialog = false;
      state.routeRuleMode = 'single';
    }
    render();
  }

  function addRoutingRule() {
    const values = splitRouteValues(state.routeValue);
    if (state.routeKind !== 'default' && !values.length) {
      state.message = 'Укажите сайт, IP, устройство или порт для правила';
      render();
      return;
    }
    const rule = { type: 'field' };
    if (state.routeTargetType === 'balancer') {
      if (!state.routeBalancer) {
        state.message = 'Выберите балансировщик или создайте его в маршрутизации';
        render();
        return;
      }
      rule.balancerTag = state.routeBalancer;
    } else {
      rule.outboundTag = state.routeOutbound;
    }
    if (state.routeKind === 'default') {
      setRoutingDraft([...routeRules(), rule]);
      state.routeName = '';
      state.routeValue = '';
      state.routeRuleDialog = false;
      state.message = 'Default-правило добавлено в конец черновика. Оно сработает только если правила выше не совпали.';
      render();
      return;
    }
    if (state.routeKind === 'port') {
      rule.port = values.join(',');
    } else {
      rule[state.routeKind] = values;
    }
    setRouteRuleName(rule, state.routeName);
    setRoutingDraft([rule, ...routeRules()]);
    state.routeName = '';
    state.routeValue = '';
    state.routeRuleDialog = false;
    state.message = 'Правило добавлено в черновик маршрутизации. Проверьте конфигурацию и примените изменения.';
    render();
  }

  function resetRouteRuleForm() {
    state.routeName = '';
    state.routeKind = 'domain';
    state.routeValue = '';
    state.routeOutbound = activeProxyTag() || 'proxy';
    state.routeTargetType = 'outbound';
    state.routeBalancer = balancerOptions()[0] || '';
    state.routeRuleMode = 'single';
    state.routeRuleEditingIndex = -1;
  }

  function routeRuleFromForm(baseRule = {}) {
    const values = splitRouteValues(state.routeValue);
    if (state.routeKind !== 'default' && !values.length) return null;
    const rule = { ...baseRule, type: baseRule.type || 'field' };
    delete rule.domain;
    delete rule.ip;
    delete rule.source;
    delete rule.port;
    delete rule.inboundTag;
    delete rule.outboundTag;
    delete rule.balancerTag;
    if (state.routeTargetType === 'balancer') {
      if (!state.routeBalancer) return null;
      rule.balancerTag = state.routeBalancer;
    } else {
      rule.outboundTag = state.routeOutbound || 'proxy';
    }
    if (state.routeKind === 'default') return rule;
    if (state.routeKind === 'port') rule.port = values.join(',');
    else rule[state.routeKind] = values;
    return rule;
  }

  function openRoutingRuleEditor(index) {
    const rule = routeRules()[index];
    if (!rule) return;
    if (isRuOpenRayManagedRoute(rule)) {
      state.message = 'Это служебное правило RuOpenRay. Меняйте его через раздел DNS, Перехват, Защита от утечек или Статистика Xray, чтобы не сломать системную часть конфигурации.';
      render();
      return;
    }
    const target = routeTarget(rule);
    if (!routeKinds[target.kind]) {
      state.message = 'Это особое правило пока нельзя редактировать в форме. Его можно изменить в активной конфигурации.';
      render();
      return;
    }
    const info = describeRouteRule(rule);
    state.routeRuleEditingIndex = index;
    state.routeRuleDialog = true;
    state.routeRuleMode = 'single';
    state.routeName = routeRuleName(rule, info);
    state.routeKind = target.kind;
    state.routeValue = target.values.join(', ');
    state.routeTargetType = rule.balancerTag ? 'balancer' : 'outbound';
    state.routeBalancer = rule.balancerTag || balancerOptions()[0] || '';
    state.routeOutbound = rule.outboundTag || 'proxy';
    state.message = '';
    render();
  }

  function saveRoutingRuleEdit() {
    const index = state.routeRuleEditingIndex;
    const current = routeRules();
    const oldRule = current[index];
    if (!oldRule) {
      resetRouteRuleForm();
      state.routeRuleDialog = false;
      render();
      return;
    }
    const nextRule = routeRuleFromForm(oldRule);
    if (!nextRule) {
      state.message = state.routeKind === 'default'
        ? 'Выберите, куда отправлять остальной трафик'
        : state.routeTargetType === 'balancer' && !state.routeBalancer
        ? 'Выберите балансировщик или переключите цель на сервер'
        : 'Укажите значение правила';
      render();
      return;
    }
    const nextRules = current.map((rule, ruleIndex) => (ruleIndex === index ? nextRule : rule));
    delete state.routeNames[routeRuleKey(oldRule)];
    setRouteRuleName(nextRule, state.routeName);
    setRoutingDraft(nextRules);
    resetRouteRuleForm();
    state.routeRuleDialog = false;
    state.message = 'Правило обновлено в черновике маршрутизации. Проверьте конфигурацию и примените изменения.';
    render();
  }

  function addRoutingPreset(name) {
    const rules = routePresetRules(name);
    if (!rules.length) return;
    setRoutingDraft([...rules.map(normalizePresetRule), ...routeRules()]);
    state.message = `Подборка добавлена: ${routePresetTitle(name)}`;
    render();
  }

  function normalizePresetRule(rule) {
    const next = JSON.parse(JSON.stringify(rule));
    if (next.outboundTag === 'proxy') next.outboundTag = activeProxyTag() || 'proxy';
    return next;
  }

  function normalizedRouteTarget(tag) {
    const value = String(tag || '').trim();
    if (!value) return '';
    const active = activeProxyTag();
    if (value === 'proxy' || (active && value === active)) return 'proxy';
    return value;
  }

  function canonicalRouteRule(rule) {
    const target = rule?.balancerTag
      ? `balancer:${rule.balancerTag}`
      : `outbound:${normalizedRouteTarget(rule?.outboundTag || '')}`;
    const sorted = (values) => Array.isArray(values) ? [...values].map(String).sort() : [];
    const port = String(rule?.port || '').trim();
    const hasConditions = Boolean(
      sorted(rule?.domain).length ||
      sorted(rule?.ip).length ||
      sorted(rule?.source).length ||
      sorted(rule?.inboundTag).length ||
      rule?.network ||
      (port && port !== '0-65535')
    );
    return JSON.stringify({
      target,
      network: String(rule?.network || ''),
      domain: sorted(rule?.domain),
      ip: sorted(rule?.ip),
      source: sorted(rule?.source),
      inboundTag: sorted(rule?.inboundTag),
      port: hasConditions ? port : ''
    });
  }

  function routePresetRuleMatches(rule, presetRule) {
    return canonicalRouteRule(rule) === canonicalRouteRule(presetRule);
  }

  function allRoutePresetEntries() {
    return [
      ...builtinRoutePresetEntries({ includeHidden: true }),
      ...customRoutePresetEntries()
    ];
  }

  function routeRulePresetMatches(rule) {
    return allRoutePresetEntries()
      .filter(([key]) => routePresetRules(key).some((presetRule) => routePresetRuleMatches(rule, normalizePresetRule(presetRule))))
      .map(([key]) => ({ key, title: routePresetTitle(key) }));
  }

  function routePresetSequenceAt(rules, startIndex) {
    const entries = allRoutePresetEntries()
      .map(([key, preset]) => ({
        key,
        preset,
        title: routePresetTitle(key),
        rules: routePresetRules(key).map(normalizePresetRule)
      }))
      .filter((entry) => entry.rules.length > 1)
      .sort((left, right) => right.rules.length - left.rules.length);
    for (const entry of entries) {
      if (startIndex + entry.rules.length > rules.length) continue;
      const matched = entry.rules.every((presetRule, offset) => routePresetRuleMatches(rules[startIndex + offset], presetRule));
      if (matched) return entry;
    }
    return null;
  }

  function routeRuleSourceWithPresets(rule) {
    if (isRuOpenRayManagedRoute(rule)) return routeRuleSource(rule);
    const matches = routeRulePresetMatches(rule);
    if (matches.length) {
      const titles = matches.map((item) => item.title);
      return `Подборка: ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2}` : ''}`;
    }
    return routeRuleSource(rule);
  }

  function routePresetInstallSummary(key) {
    const presetRules = routePresetRules(key).map(normalizePresetRule);
    const currentRules = routeRules();
    const matched = presetRules.filter((presetRule) => currentRules.some((rule) => routePresetRuleMatches(rule, presetRule))).length;
    return {
      matched,
      total: presetRules.length,
      installed: Boolean(presetRules.length && matched === presetRules.length),
      partial: Boolean(matched && matched < presetRules.length)
    };
  }

  function routePresetInstallLabel(key) {
    const summary = routePresetInstallSummary(key);
    if (!summary.total) return '';
    if (summary.installed) return 'установлено';
    if (summary.partial) return `добавлено ${summary.matched}/${summary.total}`;
    return '';
  }

  function applySelectedRoutingPresets() {
    const selectedPresets = state.selectedRoutePresets.filter((key) => routePresets[key] || routeBundles[key]);
    const selectedCustom = state.selectedRoutePresets.filter((key) => customRoutePreset(key));
    const selected = [...selectedPresets, ...selectedCustom];
    if (!selected.length) {
      state.message = 'Отметьте хотя бы одну подборку';
      render();
      return;
    }
    const rules = [
      ...selectedPresets.flatMap((key) => routePresetRules(key).map(normalizePresetRule)),
      ...selectedCustom.flatMap((key) => routePresetRules(key).map(normalizePresetRule))
    ];
    setRoutingDraft([...rules, ...routeRules()]);
    state.routePresetDialog = false;
    state.routeRuleDialog = false;
    state.routeRuleMode = 'single';
    state.selectedRoutePresets = [];
    state.message = `Добавлено подборок: ${selected.length}, правил: ${rules.length}`;
    render();
  }

  function routePresetRules(key) {
    const custom = customRoutePreset(key);
    if (custom) return custom.rules || [];
    if (routeBundles[key]) return routeBundles[key].rules;
    if (routePresets[key]) return [routePresets[key].rule];
    return [];
  }

  function routePresetTitle(key) {
    const custom = customRoutePreset(key);
    if (custom) return custom.title || key;
    return routeBundles[key]?.title || routePresets[key]?.title || key;
  }

  function routePresetDetail(key) {
    const custom = customRoutePreset(key);
    if (custom) return custom.detail || ruleCountLabel((custom.rules || []).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0));
    const preset = routeBundles[key] || routePresets[key];
    if (!preset) return '';
    if (preset.detail) return preset.detail;
    if (preset.rule) return describeRouteRule(preset.rule).fullValue;
    return '';
  }

  function routeRuleConditionCount(rule) {
    if (!rule) return 0;
    let count = 0;
    for (const key of ['domain', 'ip', 'source', 'inboundTag']) {
      if (Array.isArray(rule[key])) count += rule[key].length;
      else if (rule[key]) count += 1;
    }
    if (rule.port) count += 1;
    if (!count && rule.network) count += 1;
    return Math.max(1, count);
  }

  function routePresetConditionCount(key) {
    return routePresetRules(key).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0);
  }

  function builtinRoutePresetEntries({ includeHidden = false } = {}) {
    return [
      ...Object.entries(routeBundles),
      ...Object.entries(routePresets)
    ].filter(([key]) => includeHidden || !hiddenBuiltinRoutePresetKeys.has(key));
  }

  function ruleCountLabel(count) {
    const n = Math.abs(Number(count || 0));
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'правило'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'правила'
        : 'правил';
    return `${count || 0} ${word}`;
  }

  function customRoutePreset(key) {
    const id = String(key || '').startsWith('custom:') ? String(key).slice(7) : '';
    return id ? state.customRoutePresets[id] : null;
  }

  function customRoutePresetEntries() {
    return Object.entries(state.customRoutePresets)
      .sort(([, left], [, right]) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
      .map(([id, preset]) => [`custom:${id}`, preset]);
  }

  function saveCustomRoutePresets() {
    localStorage.setItem(customRoutePresetsStorageKey, JSON.stringify(state.customRoutePresets));
  }

  function scenarioIdFromTitle(title) {
    const base = String(title || 'scenario')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'scenario';
    let id = base;
    let counter = 2;
    while (state.customRoutePresets[id]) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    return id;
  }

  function routeRuleToDslLines(rule) {
    const outbound = rule.balancerTag ? `balancer:${rule.balancerTag}` : (rule.outboundTag || 'proxy');
    const prefix = rule.network ? [`network(${rule.network})`] : [];
    const lines = [];
    const addMany = (kind, values) => {
      for (const value of values || []) {
        lines.push([...prefix, `${kind}(${value})`].join(' && ') + ` -> ${outbound}`);
      }
    };
    addMany('domain', rule.domain);
    addMany('ip', rule.ip);
    addMany('source', rule.source);
    addMany('inboundTag', rule.inboundTag);
    if (rule.port) lines.push([...prefix, `port(${rule.port})`].join(' && ') + ` -> ${outbound}`);
    if (!lines.length && prefix.length) lines.push(`${prefix.join(' && ')} -> ${outbound}`);
    return lines;
  }

  function clearRoutePresetEditor() {
    state.routePresetEditor = '';
    state.routePresetEditTitle = '';
    state.routePresetEditDetail = '';
    state.routePresetEditIcon = '';
    state.routePresetEditDsl = '';
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
  }

  function newRoutingPreset() {
    state.routeRuleDialog = false;
    state.routePresetDialog = true;
    state.routePresetEditor = 'custom:new';
    state.routePresetEditTitle = '';
    state.routePresetEditDetail = '';
    state.routePresetEditIcon = '';
    state.routePresetEditDsl = '';
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
    state.message = '';
    render();
  }

  function editRoutingPreset(key) {
    const rules = routePresetRules(key);
    if (!rules.length) return;
    const title = routePresetTitle(key);
    state.routeRuleDialog = false;
    state.routePresetDialog = true;
    state.routePresetEditor = key;
    state.routePresetEditTitle = title;
    state.routePresetEditDetail = routePresetDetail(key);
    state.routePresetEditIcon = customRoutePreset(key)?.icon || '';
    state.routePresetEditDsl = [`# ${title}`, ...rules.flatMap(routeRuleToDslLines)].join('\n');
    state.routePresetEditPreview = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditChecked = false;
    state.message = '';
    render();
  }

  function previewRoutePresetEdit() {
    state.routePresetEditPreview = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditChecked = true;
    state.message = '';
    render();
  }

  function routePresetCheckResultView(preview) {
    const stats = dslPreviewStats(preview);
    const tone = stats.total ? 'ok' : 'bad';
    const text = stats.total
      ? `Распознано правил: ${stats.total}. Через proxy: ${stats.proxy}, напрямую: ${stats.direct}, блокировка: ${stats.block}, другое: ${stats.other}.`
      : 'Правила пока не распознаны. Вставьте строки маршрутизации и нажмите “Проверить” еще раз.';
    return `
      <div class="preset-check-result ${tone}">
        <strong>Результат проверки</strong>
        <span>${escapeHtml(text)}</span>
        ${(preview.warnings || []).length ? `<ul>${preview.warnings.slice(0, 6).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
      </div>
      ${dslPreviewView(preview)}
    `;
  }

  function applyRoutePresetEdit() {
    const parsed = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditPreview = parsed;
    state.routePresetEditChecked = true;
    if (!parsed.rules.length) {
      state.message = 'Не нашёл правил в изменённом сценарии';
      render();
      return;
    }
    const rules = parsed.rules.map(normalizePresetRule);
    setRoutingDraft([...rules, ...routeRules()]);
    const title = state.routePresetEditTitle.trim() || routePresetTitle(state.routePresetEditor);
    clearRoutePresetEditor();
    state.routePresetDialog = false;
    state.selectedRoutePresets = [];
    state.message = `Добавлена подборка после правки: ${title}. Правил: ${rules.length}`;
    render();
  }

  function saveRoutePresetEdit() {
    const parsed = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditPreview = parsed;
    state.routePresetEditChecked = true;
    if (!parsed.rules.length) {
      state.message = 'Не нашёл правил в сценарии';
      render();
      return;
    }
    const title = state.routePresetEditTitle.trim() || 'Новая подборка';
    const key = state.routePresetEditor || 'custom:new';
    const existingId = key.startsWith('custom:') && key !== 'custom:new' ? key.slice(7) : '';
    const id = existingId || scenarioIdFromTitle(title);
    state.customRoutePresets[id] = {
      title,
      detail: state.routePresetEditDetail.trim(),
      icon: state.routePresetEditIcon.trim(),
      rules: parsed.rules.map((rule) => JSON.parse(JSON.stringify(rule))),
      updatedAt: new Date().toISOString()
    };
    saveCustomRoutePresets();
    state.routePresetEditor = '';
    state.routePresetDialog = false;
    state.selectedRoutePresets = [`custom:${id}`];
    state.message = `Подборка сохранена: ${title}`;
    render();
  }

  function deleteCustomRoutePreset(key) {
    const id = String(key || '').startsWith('custom:') ? String(key).slice(7) : '';
    if (!id || !state.customRoutePresets[id]) return;
    const title = state.customRoutePresets[id].title || id;
    delete state.customRoutePresets[id];
    state.selectedRoutePresets = state.selectedRoutePresets.filter((item) => item !== key);
    saveCustomRoutePresets();
    state.message = `Подборка удалена: ${title}`;
    render();
  }

  function removeRoutingRule(index) {
    const current = routeRules();
    if (current[index]) {
      delete state.routeNames[routeRuleKey(current[index])];
      saveRouteNames();
    }
    const rules = current.filter((_, ruleIndex) => ruleIndex !== index);
    setRoutingDraft(rules);
    state.message = 'Правило удалено из черновика';
    render();
  }

  function disableRoutingRule(index) {
    const current = routeRules();
    const rule = current[index];
    if (!rule) return;
    const info = describeRouteRule(rule);
    const name = routeRuleName(rule, info);
    state.disabledRouteRules = [
      { id: `disabled-${Date.now()}-${index}`, rule: JSON.parse(JSON.stringify(rule)), name, disabledAt: new Date().toISOString() },
      ...state.disabledRouteRules
    ].slice(0, 120);
    saveDisabledRouteRules();
    setRoutingDraft(current.filter((_, ruleIndex) => ruleIndex !== index));
    state.message = `Правило отключено без удаления: ${name}`;
    render();
  }

  function restoreDisabledRouteRule(id) {
    const item = state.disabledRouteRules.find((entry) => entry.id === id);
    if (!item?.rule) return;
    state.disabledRouteRules = state.disabledRouteRules.filter((entry) => entry.id !== id);
    saveDisabledRouteRules();
    setRoutingDraft([item.rule, ...routeRules()]);
    if (item.name) setRouteRuleName(item.rule, item.name);
    state.message = `Правило возвращено наверх списка: ${item.name || 'без названия'}`;
    render();
  }

  function deleteDisabledRouteRule(id) {
    state.disabledRouteRules = state.disabledRouteRules.filter((entry) => entry.id !== id);
    saveDisabledRouteRules();
    state.message = 'Отключенное правило удалено из панели';
    render();
  }

  function routeRuleListItem(rule, index) {
    const info = describeRouteRule(rule);
    return { kind: 'rule', rule, index, info, name: routeRuleName(rule, info), source: routeRuleSourceWithPresets(rule), presets: routeRulePresetMatches(rule) };
  }

  function routeItemMatchesSearch(item, search) {
    if (!search) return true;
    if (item.kind === 'presetGroup') {
      const childText = item.items
        .map(({ info, name, source }) => `${name} ${source} ${info.kind} ${info.value} ${info.outbound} ${info.detail}`)
        .join(' ');
      return `${item.title} ${routePresetDetail(item.key)} ${childText}`.toLowerCase().includes(search);
    }
    const { info, name, source } = item;
    return `${name} ${source} ${info.kind} ${info.value} ${info.outbound} ${info.detail}`.toLowerCase().includes(search);
  }

  function visibleRoutingRuleItems(limit = 80) {
    const search = state.routeSearch.trim().toLowerCase();
    const rules = routeRules();
    const items = [];
    for (let index = 0; index < rules.length;) {
      const sequence = routePresetSequenceAt(rules, index);
      if (sequence) {
        const group = {
          kind: 'presetGroup',
          key: sequence.key,
          preset: sequence.preset,
          title: sequence.title,
          index,
          items: sequence.rules.map((_, offset) => routeRuleListItem(rules[index + offset], index + offset))
        };
        if (routeItemMatchesSearch(group, search)) items.push(group);
        index += sequence.rules.length;
        continue;
      }
      const item = routeRuleListItem(rules[index], index);
      if (routeItemMatchesSearch(item, search)) items.push(item);
      index += 1;
    }
    return items.slice(0, limit);
  }

  function routeRowHtml(item, options, rulesLength) {
    const { index, info, name, source, presets = [] } = item;
    const selectedTarget = encodedRouteTarget(item.rule);
    const category = routeCategoryForRule(item.rule);
    const managed = isRuOpenRayManagedRoute(item.rule);
    const targetOptions = options.some((option) => option.value === selectedTarget)
      ? options
      : [{ value: selectedTarget, label: item.rule.balancerTag ? `Балансировщик · ${item.rule.balancerTag}` : readableRouteTag(item.rule.outboundTag || 'не задано') }, ...options];
    const section = routeSectionDefinitions().find((entry) => entry.id === category) || routeSectionDefinitions().find((entry) => entry.id === 'other');
    return `<article class="route-row route-row-${escapeHtml(category)} ${managed ? 'route-row-managed' : ''}" draggable="${managed ? 'false' : 'true'}" data-route-index="${index}">
      <div class="route-order">
        <button class="route-drag-handle" type="button" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило управляется настройками RuOpenRay' : 'Перетащить правило'}" aria-label="${managed ? 'Служебное правило управляется настройками RuOpenRay' : 'Перетащить правило'}">${managed ? '•' : '⋮⋮'}</button>
        <span>${index + 1}</span>
      </div>
      <div class="route-kind-stack">
        <span class="route-category route-category-${escapeHtml(category)}">${escapeHtml(section?.title || 'Другое')}</span>
        <span class="route-kind">${escapeHtml(info.kind)}</span>
      </div>
      <div class="route-title">
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <span>${escapeHtml(source)} · выше = раньше</span>
        ${presets.length ? `<div class="route-preset-tags">${presets.slice(0, 3).map((preset) => `<em>${escapeHtml(preset.title)}</em>`).join('')}${presets.length > 3 ? `<em>+${presets.length - 3}</em>` : ''}</div>` : ''}
      </div>
      <div class="route-main">
        <strong title="${escapeHtml(info.fullValue)}">${escapeHtml(info.value)}</strong>
        <span>${escapeHtml(info.detail)}</span>
      </div>
      <select class="route-outbound" data-route-target="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило меняется через профильный раздел' : ''}">
        ${targetOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${selectedTarget === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
      <div class="route-actions">
        <button class="icon-btn route-action-btn move-up" type="button" data-route-move="${index}" data-direction="-1" ${index === 0 || managed ? 'disabled' : ''} title="Поднять выше" aria-label="Поднять правило выше">↑</button>
        <button class="icon-btn route-action-btn move-down" type="button" data-route-move="${index}" data-direction="1" ${index === rulesLength - 1 || managed ? 'disabled' : ''} title="Опустить ниже" aria-label="Опустить правило ниже">↓</button>
        <button class="icon-btn route-action-btn edit" type="button" data-route-edit="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило меняется через DNS, Перехват, Защиту от утечек или Статистику Xray' : 'Править'}" aria-label="Править правило">✎</button>
        <button class="icon-btn route-action-btn disable" type="button" data-route-disable="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило нельзя поставить на паузу из общего списка' : 'Отключить без удаления'}" aria-label="Отключить правило без удаления">⏸</button>
        <button class="icon-btn route-action-btn danger" type="button" data-route-delete="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило удаляется отключением соответствующей функции' : 'Удалить'}" aria-label="Удалить правило">×</button>
      </div>
    </article>`;
  }

  function routePresetGroupRowHtml(item, options, rulesLength) {
    const start = item.index + 1;
    const end = item.index + item.items.length;
    const icon = routePresetIconView(escapeHtml, item.key, item.preset || {}, 'compact');
    const detail = routePresetDetail(item.key);
    const targets = [...new Set(item.items.map(({ rule }) => rule.balancerTag ? `balancer:${rule.balancerTag}` : readableRouteTag(rule.outboundTag || '')))]
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');
    return `<details class="route-preset-group-row" data-route-preset-group="${escapeHtml(item.key)}">
      <summary>
        <div class="route-preset-group-order">${start === end ? start : `${start}–${end}`}</div>
        ${icon}
        <div class="route-preset-group-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(detail || 'Подборка правил')} · ${ruleCountLabel(item.items.length)}${targets ? ` · ${escapeHtml(targets)}` : ''}</span>
        </div>
        <span class="route-preset-group-toggle">Состав</span>
      </summary>
      <div class="route-preset-group-children">
        ${item.items.map((child) => routeRowHtml(child, options, rulesLength)).join('')}
      </div>
    </details>`;
  }

  function orderedRouteList(items, options, rulesLength) {
    if (!items.length) {
      return `<p class="muted route-empty-state">${state.routeSearch.trim() ? 'Правил по этому поиску нет.' : 'Правил пока нет. Добавьте правило или выберите подборку.'}</p>`;
    }
    return `<section class="route-ordered-list">
      <header class="route-order-head">
        <strong>Порядок выполнения Xray</strong>
        <span>Сверху вниз: правило №1 проверяется первым. Перетаскивание меняет реальный порядок в конфигурации.</span>
      </header>
      <div class="route-section-list">
        ${items.map((item) => item.kind === 'presetGroup' ? routePresetGroupRowHtml(item, options, rulesLength) : routeRowHtml(item, options, rulesLength)).join('')}
      </div>
    </section>`;
  }

  function disableVisibleRoutingRules() {
    const visible = visibleRoutingRuleItems(80);
    if (!visible.length) return;
    const current = routeRules();
    const visibleRules = visible.flatMap((item) => item.kind === 'presetGroup' ? item.items : [item]);
    const disabledIndexes = new Set(visibleRules.map((item) => item.index));
    const disabled = visibleRules.map(({ rule, name, index }) => ({
      id: `disabled-${Date.now()}-${index}`,
      rule: JSON.parse(JSON.stringify(rule)),
      name,
      disabledAt: new Date().toISOString()
    }));
    state.disabledRouteRules = [...disabled, ...state.disabledRouteRules].slice(0, 160);
    saveDisabledRouteRules();
    setRoutingDraft(current.filter((_, index) => !disabledIndexes.has(index)));
    state.message = `Отключено правил: ${disabled.length}. Их можно вернуть из списка ниже.`;
    render();
  }

  function restoreAllDisabledRouteRules() {
    if (!state.disabledRouteRules.length) return;
    const restored = state.disabledRouteRules.map((item) => item.rule).filter(Boolean);
    for (const item of state.disabledRouteRules) {
      if (item.rule && item.name) setRouteRuleName(item.rule, item.name);
    }
    state.disabledRouteRules = [];
    saveDisabledRouteRules();
    setRoutingDraft([...restored, ...routeRules()]);
    state.message = `Возвращено правил: ${restored.length}. Они добавлены в начало списка.`;
    render();
  }

  function updateRoutingTarget(index, targetValue) {
    const rules = routeRules().map((rule, ruleIndex) => {
      if (ruleIndex !== index) return rule;
      const [kind, ...rest] = String(targetValue || '').split(':');
      const tag = rest.join(':') || 'proxy';
      const next = { ...rule };
      delete next.outboundTag;
      delete next.balancerTag;
      if (kind === 'balancer') next.balancerTag = tag;
      else next.outboundTag = tag;
      copyRouteRuleName(rule, next);
      return next;
    });
    setRoutingDraft(rules);
    state.message = 'Цель правила изменена в черновике';
    render();
  }

  function moveRoutingRule(index, direction) {
    reorderRoutingRule(index, direction > 0 ? index + 2 : index - 1);
  }

  function reorderRoutingRule(fromIndex, toIndex) {
    const rules = [...routeRules()];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= rules.length || toIndex > rules.length || fromIndex === toIndex) return;
    const [rule] = rules.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex -= 1;
    if (toIndex === fromIndex) return;
    rules.splice(toIndex, 0, rule);
    setRoutingDraft(rules);
    state.message = 'Порядок правил изменен. Xray читает правила сверху вниз.';
    render();
  }

  function renameRoutingRule(index) {
    const rule = routeRules()[index];
    if (!rule) return;
    const info = describeRouteRule(rule);
    const nextName = prompt('Название правила', routeRuleName(rule, info));
    if (nextName === null) return;
    setRouteRuleName(rule, nextName);
    state.message = nextName.trim() ? 'Название правила сохранено' : 'Название сброшено, будет показано автоматически';
    render();
  }


  return {
    previewRoutingDsl,
    configAnalysisView,
    applyRoutingDsl,
    addRoutingRule,
    resetRouteRuleForm,
    routeRuleFromForm,
    openRoutingRuleEditor,
    saveRoutingRuleEdit,
    addRoutingPreset,
    normalizePresetRule,
    applySelectedRoutingPresets,
    routePresetRules,
    routePresetTitle,
    routePresetDetail,
    routeRuleConditionCount,
    routePresetConditionCount,
    routePresetInstallSummary,
    routePresetInstallLabel,
    builtinRoutePresetEntries,
    ruleCountLabel,
    customRoutePreset,
    customRoutePresetEntries,
    saveCustomRoutePresets,
    scenarioIdFromTitle,
    routeRuleToDslLines,
    clearRoutePresetEditor,
    newRoutingPreset,
    editRoutingPreset,
    previewRoutePresetEdit,
    routePresetCheckResultView,
    applyRoutePresetEdit,
    saveRoutePresetEdit,
    deleteCustomRoutePreset,
    removeRoutingRule,
    disableRoutingRule,
    restoreDisabledRouteRule,
    deleteDisabledRouteRule,
    visibleRoutingRuleItems,
    routeRowHtml,
    orderedRouteList,
    disableVisibleRoutingRules,
    restoreAllDisabledRouteRules,
    updateRoutingTarget,
    moveRoutingRule,
    reorderRoutingRule,
    renameRoutingRule
  };
}
