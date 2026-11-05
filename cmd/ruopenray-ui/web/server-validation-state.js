function outboundFingerprint(outbound) {
  if (!outbound || typeof outbound !== 'object' || Array.isArray(outbound)) return '';
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  };
  try { return JSON.stringify(canonical(outbound)); } catch { return ''; }
}

function coreVersion(state) {
  return String(state.status?.core?.version || '').trim();
}

function uniqueOutbounds(config) {
  const outbounds = Array.isArray(config?.outbounds) ? config.outbounds : [];
  const entries = new Map();
  for (const outbound of outbounds) {
    const tag = typeof outbound?.tag === 'string' ? outbound.tag : '';
    if (!tag) continue;
    entries.set(tag, entries.has(tag) ? null : { outbound, fingerprint: outboundFingerprint(outbound) });
  }
  return entries;
}

// These are local observations of an actual core validation, never a transport
// compatibility guess or a network availability result.
export function recordServerValidation(state, result, config, checkedCoreVersion) {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return;
  const version = coreVersion(state);
  if (checkedCoreVersion !== undefined && checkedCoreVersion !== version) return;
  const checked = uniqueOutbounds(config);
  const complete = result.ok === true || result.outboundErrorsComplete === true;
  const previous = state.serverValidation?.coreVersion === version && Array.isArray(state.serverValidation.issues)
    ? state.serverValidation.issues : [];
  const issues = new Map();
  if (result.ok !== true && !complete) {
    for (const issue of previous) {
      if (checked.get(issue.tag)?.fingerprint === issue.fingerprint) issues.set(issue.tag, issue);
    }
  }
  if (result.ok === false && Array.isArray(result.outboundErrors)) {
    for (const error of result.outboundErrors) {
      const entry = checked.get(error?.tag);
      const message = typeof error?.message === 'string' ? error.message.trim() : '';
      if (error?.source !== 'xray' || !entry?.fingerprint || !message) continue;
      issues.set(error.tag, { tag: error.tag, fingerprint: entry.fingerprint, message, source: 'xray' });
    }
  }
  state.serverValidation = { coreVersion: version, complete, issues: [...issues.values()] };
}

export function pruneServerValidation(state, config = state.config) {
  const validation = state.serverValidation;
  if (!validation) return;
  if (validation.coreVersion !== coreVersion(state)) {
    state.serverValidation = null;
    return;
  }
  const current = uniqueOutbounds(config);
  validation.issues = (Array.isArray(validation.issues) ? validation.issues : [])
    .filter((issue) => current.get(issue.tag)?.fingerprint === issue.fingerprint);
}

export function serverValidationIssue(state, outbound) {
  const validation = state.serverValidation;
  if (!validation || validation.coreVersion !== coreVersion(state)) return null;
  const issue = (Array.isArray(validation.issues) ? validation.issues : [])
    .find((item) => item.source === 'xray' && item.tag === outbound?.tag);
  if (!issue) return null;
  const fingerprint = outboundFingerprint(outbound);
  const current = (Array.isArray(state.config?.outbounds) ? state.config.outbounds : [])
    .filter((item) => item?.tag === outbound?.tag);
  if (!fingerprint || issue.fingerprint !== fingerprint || current.length !== 1 || outboundFingerprint(current[0]) !== fingerprint) return null;
  return issue;
}

export function humanServerValidationReason(raw) {
  const message = String(raw || '').trim();
  if (/vless without TLS or other encryption is prohibited/i.test(message)) {
    return 'VLESS без TLS или другого шифрования запрещён для публичного сервера. Нужны корректные параметры провайдера.';
  }
  return message;
}
