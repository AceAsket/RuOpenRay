export function createApiClient({ getToken = () => '', onUnauthorized = () => {} } = {}) {
  function authHeaders(extra = {}) {
    const token = getToken();
    return {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra
    };
  }

  async function parseResponse(response) {
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? await response.json() : await response.text();
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...authHeaders(options.headers || {})
      }
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      throw new Error(payload.error || payload.message || response.statusText);
    }
    return payload;
  }

  async function text(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: authHeaders(options.headers || {})
    });
    if (response.status === 401) {
      onUnauthorized();
      throw new Error('Требуется авторизация');
    }
    if (!response.ok) {
      throw new Error(response.statusText || `HTTP ${response.status}`);
    }
    return await response.text();
  }

  return { authHeaders, request, text };
}
