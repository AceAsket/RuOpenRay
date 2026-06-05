const explicitDomainPrefixes = /^(domain|full|regexp|keyword|geosite|ext):/i;
const ipLikeValue = /^(geoip:|(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$|\[[0-9a-f:]+\]?$|[0-9a-f:]{2,}\/\d{1,3}$)/i;

export function normalizeRouteDomainValue(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (explicitDomainPrefixes.test(clean) || ipLikeValue.test(clean)) return clean;
  return `domain:${clean}`;
}

export function normalizeRouteDomainValues(values = []) {
  return (values || []).map(normalizeRouteDomainValue).filter(Boolean);
}

export function displayRouteDomainValue(value) {
  const clean = String(value || '').trim();
  if (/^domain:/i.test(clean)) return clean.replace(/^domain:/i, '');
  return clean;
}

export function displayRouteDomainValues(values = []) {
  return (values || []).map(displayRouteDomainValue).filter(Boolean);
}

export function isExplicitRouteDomainValue(value) {
  return explicitDomainPrefixes.test(String(value || '').trim());
}

export function looksLikePlainDomain(value) {
  const clean = String(value || '').trim();
  if (!clean || clean.includes('(') || clean.includes(')') || /\s/.test(clean)) return false;
  if (explicitDomainPrefixes.test(clean) || ipLikeValue.test(clean)) return false;
  return clean.includes('.') || clean.startsWith('.');
}
