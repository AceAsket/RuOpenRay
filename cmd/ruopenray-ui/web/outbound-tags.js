export const fragmentOutboundTagPrefix = 'ruopenray-fragment-';

export function isFragmentOutboundTag(tag) {
  return String(tag || '').startsWith(fragmentOutboundTagPrefix);
}

export function isBuiltinOutboundTag(tag) {
  return ['direct', 'block', 'dns-out', 'ruopenray-api'].includes(String(tag || '')) || isFragmentOutboundTag(tag);
}

export function isServiceOutbound(outbound) {
  const tag = String(outbound?.tag || '');
  if (isBuiltinOutboundTag(tag)) return true;
  return ['freedom', 'blackhole', 'dns'].includes(String(outbound?.protocol || ''));
}
