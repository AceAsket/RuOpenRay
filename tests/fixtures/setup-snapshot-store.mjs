// Authenticated snapshot API double. The browser holds no durable snapshot data.
export function createSetupSnapshotStore() {
  let snapshot = null;
  let revision = '';
  let sequence = 0;
  const calls = [];
  function request(call) {
    calls.push(structuredClone(call));
    if (call.method === 'GET') return { ok: true, exists: Boolean(snapshot), snapshot: structuredClone(snapshot), revision };
    if (call.body.expectedRevision !== revision) throw new Error('Точка отката изменилась в другой вкладке');
    if (call.method === 'DELETE') { snapshot = null; revision = ''; }
    else {
      snapshot = structuredClone(call.body.snapshot);
      snapshot.id ||= 'fixture-snapshot';
      revision = String(++sequence);
    }
    return { ok: true, exists: Boolean(snapshot), snapshot: structuredClone(snapshot), revision };
  }
  return { request, calls };
}
