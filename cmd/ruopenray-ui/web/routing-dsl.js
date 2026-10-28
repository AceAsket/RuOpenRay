import { isExplicitRouteDomainValue, isRouteIpValue, looksLikePlainDomain, normalizeRouteDomainValue } from './routing-values.js';
import { routeDestination } from './routing-insights.js';

// Direct AWG policies are managed outside Xray routing.rules.
export function routingListTargetOptions(options) {
  return options.filter((option) => !/^outbound:ruopenray-amnezia-direct(?::|$)/.test(option.value));
}

export function routingListTargetPicker(state, options, escapeHtml) {
  return routingDestinationPicker(state.routeDslTarget, options, escapeHtml);
}

export function routingDestinationPicker(value, options, escapeHtml, attribute = 'data-route-dsl-target', label = 'Назначение списка правил') {
  return `<div class="form-row wide">
    <span>Куда отправляем</span>
    <select class="route-outbound" ${attribute} data-route-visual-picker aria-label="${escapeHtml(label)}">
      <option value="" ${!value ? 'selected' : ''}>Выберите назначение</option>
      ${routingListTargetOptions(options).map((option) => `<option value="${escapeHtml(option.value)}" ${value === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
    </select>
    <small>Для строк без назначения. Если в строке есть →, используется назначение из строки.</small>
  </div>`;
}

export function createRoutingDsl({ state, escapeHtml, resolveRoutingAlias, routeStatsFor }) {
  function stripDslComment(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return '';
    return line.replace(/\s+#.*$/, '').trim();
  }

  function addDslTarget(rule, key, value) {
    const target = value.trim().replace(/^([A-Za-z0-9_-]+):"(.*)"$/, '$1:$2');
    if (!target) return false;
    if (key === 'network') {
      rule.network = target;
      return true;
    }
    if (key === 'port') {
      rule.port = target;
      return true;
    }
    if (['domain', 'ip', 'source', 'inboundTag'].includes(key)) {
      let values = [target];
      if (target.startsWith('[')) {
        try { values = JSON.parse(target); } catch { return false; }
        if (!Array.isArray(values) || !values.length || values.some((item) => typeof item !== 'string' || !item.trim())) return false;
      }
      if (!Array.isArray(rule[key])) rule[key] = [];
      rule[key].push(...values.map((item) => key === 'domain' ? normalizeRouteDomainValue(item) : item.trim()));
      return true;
    }
    return false;
  }

  function parseRoutingDsl(text, listTarget = '') {
    const rules = [];
    const lineNumbers = [];
    const warnings = [];
    const errors = [];
    const error = (message) => { errors.push(message); warnings.push(message); };
    let defaultOutbound = '';

    String(text || '')
      .split(/\r?\n/)
      .forEach((rawLine, index) => {
        const lineNo = index + 1;
        const line = stripDslComment(rawLine);
        if (!line) return;

        const defaultMatch = line.match(/^default\s*:\s*([A-Za-z0-9_.:-]+)\s*$/i);
        if (defaultMatch) {
          defaultOutbound = resolveRoutingAlias(defaultMatch[1]);
          return;
        }

        const match = line.match(/^(.+?)\s*->\s*([A-Za-z0-9_.:-]+)\s*$/);
        if (!match && (!listTarget || line.includes('->'))) {
          error(`Строка ${lineNo}: ${line.includes('->') ? 'не понял формат назначения' : 'выберите назначение списка или укажите его через ->'}`);
          return;
        }

        const destination = match ? match[2] : listTarget.replace(/^outbound:/, '');
        const target = destination.startsWith('balancer:') ? destination.slice('balancer:'.length) : '';
        const rule = target
          ? { type: 'field', balancerTag: target }
          : { type: 'field', outboundTag: resolveRoutingAlias(destination) };
        let targets = 0;
        let invalid = false;
        const parts = (match ? match[1] : line).split(/\s*&&\s*/).map((part) => part.trim()).filter(Boolean);
        for (const part of parts) {
          const condition = part.match(/^([A-Za-z][A-Za-z0-9_]*)\((.*)\)$/);
          if (!condition) {
            if (isRouteIpValue(part) && addDslTarget(rule, 'ip', part)) {
              targets += 1;
              continue;
            }
            if (parts.length === 1 && (looksLikePlainDomain(part) || isExplicitRouteDomainValue(part)) && addDslTarget(rule, 'domain', part)) {
              targets += 1;
              continue;
            }
            error(`Строка ${lineNo}: не понял условие "${part}"`);
            invalid = true;
            continue;
          }
          if (addDslTarget(rule, condition[1], condition[2])) {
            if (condition[1] !== 'network') targets += 1;
            const normalized = condition[2].trim().replace(/^([A-Za-z0-9_-]+):"(.*)"$/, '$1:$2');
            if (condition[1] === 'domain' && normalized.startsWith('ext:')) {
              warnings.push(`Строка ${lineNo}: ext-списку нужен .dat файл на роутере`);
            }
          } else {
            error(`Строка ${lineNo}: условие "${condition[1]}" пока не поддержано`);
            invalid = true;
          }
        }

        if (!targets && !rule.port && !rule.network) {
          error(`Строка ${lineNo}: нет домена, IP, источника или порта`);
          return;
        }
        if (invalid) return;
        rules.push(rule);
        lineNumbers.push(lineNo);
      });

    if (defaultOutbound) {
      rules.push(
        defaultOutbound.startsWith('balancer:')
          ? { type: 'field', balancerTag: defaultOutbound.slice('balancer:'.length), network: 'tcp,udp' }
          : { type: 'field', outboundTag: defaultOutbound, network: 'tcp,udp' }
      );
    }

    return {
      rules,
      lineNumbers,
      warnings,
      errors,
      listTarget,
      defaultOutbound,
      proxyAlias: resolveRoutingAlias('proxy')
    };
  }

  function isDslDefaultRule(rule, preview) {
    const matchesTarget = rule.outboundTag === preview.defaultOutbound ||
      (preview.defaultOutbound?.startsWith('balancer:') && rule.balancerTag === preview.defaultOutbound.slice('balancer:'.length));
    const network = String(rule.network || '').replace(/\s+/g, '').toLowerCase();
    const noConditions = !rule.domain && !rule.ip && !rule.source && !rule.inboundTag && (!rule.network || network === 'tcp,udp' || network === 'udp,tcp');
    return Boolean(
      preview.defaultOutbound &&
        matchesTarget &&
        noConditions &&
        (!rule.port || rule.port === '0-65535')
    );
  }

  function dslPreviewStats(preview) {
    const explicitRules = preview.rules.filter((rule) => !isDslDefaultRule(rule, preview));
    const count = (tag) => explicitRules.filter((rule) => rule.outboundTag === tag).length;
    const proxy = count(preview.proxyAlias);
    const direct = count('direct');
    const block = count('block');
    const known = new Set([preview.proxyAlias, 'direct', 'block']);
    const other = explicitRules.filter((rule) => !known.has(rule.outboundTag)).length;
    return { explicit: explicitRules.length, proxy, direct, block, other, total: preview.rules.length };
  }

  function dslPreviewView(preview) {
    const listName = String(preview.name ?? state.routeDslName ?? '').trim();
    const excluded = new Set(preview.excluded || []);
    const kept = preview.rules.filter((_, index) => !excluded.has(index));
    const stats = dslPreviewStats({ ...preview, rules: kept });
    const members = kept.filter((rule) => !isDslDefaultRule(rule, preview));
    const targets = [...new Set(members.map(routeDestination))];
    const targetLabel = (target) => preview.targetLabels?.[target] || target.replace(/^outbound:/, '').replace(/^balancer:/, 'Балансировщик · ');
    const ruleLabel = (rule) => Object.entries(rule).filter(([key]) => !['type', 'outboundTag', 'balancerTag', 'ruleTag'].includes(key))
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ') + ` → ${targetLabel(routeDestination(rule))}`;
    return `
      <div class="dsl-preview">
        <div class="dsl-preview-head">
          <strong>${preview.rules.length} правил распознано</strong>
          <span>${preview.listTarget ? `Назначение списка: ${escapeHtml(preview.listTarget.replace(/^outbound:/, ''))}` : `proxy → ${escapeHtml(preview.proxyAlias)}`}</span>
        </div>
        <p><strong>${preview.errors?.length ? 'Исправьте ошибки перед добавлением.' : listName && members.length ? `Будет создана группа: ${escapeHtml(listName)}` : 'Будут добавлены отдельные правила.'}</strong></p>
        <small>К добавлению: ${kept.length}; в группе: ${listName ? members.length : 0}; исключено: ${excluded.size}. Назначение: ${escapeHtml(targets.map(targetLabel).join(', ') || 'не задано')}.</small>
        ${preview.mode === 'replace' ? '<p class="warn">Весь черновик правил будет заменён этим списком.</p>' : ''}
        <div class="dsl-preview-stats">
          <div><strong>${stats.proxy}</strong><span>proxy</span></div>
          <div><strong>${stats.direct}</strong><span>direct</span></div>
          <div><strong>${stats.block}</strong><span>block</span></div>
          <div><strong>${stats.other}</strong><span>другое</span></div>
          <div class="default"><strong>${escapeHtml(preview.defaultOutbound || 'не задан')}</strong><span>default</span></div>
        </div>
        <small>${preview.defaultOutbound ? `Default добавит catch-all правило в ${escapeHtml(preview.defaultOutbound)}.` : 'Default не задан: Xray применит свое поведение после последнего правила.'}</small>
        ${preview.warnings.length ? `<small class="warn">${escapeHtml(preview.warnings.slice(0, 4).join(' · '))}${preview.warnings.length > 4 ? ' · ...' : ''}</small>` : '<small>Ошибок формата не найдено</small>'}
        ${preview.analysis ? `<div class="route-import-analysis"><p>Дубликатов: ${preview.analysis.filter((r) => r.kind === 'duplicate').length}; полностью перекрытых: ${preview.analysis.filter((r) => r.kind === 'shadow').length}. Ничего не исключается автоматически.</p>
          <small>Проверяются доказуемые перекрытия: домены, подсети, порты и одинаковые условия. Содержимое geo-списков и сложные regexp не раскрываются.</small>
          ${preview.analysis.map((row) => `<label class="route-import-row"><input type="checkbox" data-route-dsl-exclude="${row.index}" ${excluded.has(row.index) ? 'checked' : ''} /><span>Исключить №${row.index + 1}${preview.lineNumbers?.[row.index] ? ` (строка ${preview.lineNumbers[row.index]})` : ''}: ${escapeHtml(ruleLabel(preview.rules[row.index]))}<br />${row.kind ? `${row.kind === 'duplicate' ? 'Дубликат' : 'Полностью перехватывается'}: ${escapeHtml(row.earlier)}` : 'Доказанных перекрытий не найдено'}</span></label>`).join('')}
        </div>` : ''}
      </div>
    `;
  }

  return {
    stripDslComment,
    addDslTarget,
    parseRoutingDsl,
    isDslDefaultRule,
    dslPreviewStats,
    dslPreviewView
  };
}
