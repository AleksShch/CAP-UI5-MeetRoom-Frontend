sap.ui.define(['rsvroom/model/i18n'], function (I18n) {
  'use strict';
  const base = new URL(window.RSVROOM_CONFIG?.serviceUrl || '/odata/v4/booking/', location.origin);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  let csrf;
  async function request(path, method = 'GET', body, retried = false) {
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
      throw new Error('invalidServiceUrl');
    if (
      window.RSVROOM_CONFIG?.csrfToken !== false &&
      !['GET', 'HEAD'].includes(method) &&
      csrf === undefined
    ) {
      const response = await fetch(base, {
        method: 'HEAD',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': 'Fetch' }
      });
      csrf = response.headers.get('X-CSRF-Token') || '';
    }
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: 'application/json',
        'Accept-Language': I18n.language(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (
      response.status === 403 &&
      /required/i.test(response.headers.get('X-CSRF-Token') || '') &&
      !retried
    ) {
      csrf = undefined;
      return request(path, method, body, true);
    }
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error('unexpectedResponse');
    }
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'requestFailed');
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  }
  async function list(entity, params = {}) {
    let next = entity + '?' + new URLSearchParams(params),
      result = [];
    while (next) {
      const data = await request(next);
      result.push(...data.value);
      next = data['@odata.nextLink'];
    }
    return result;
  }
  return {
    list,
    request,
    auth: async (path, data) => {
      const response = await fetch('/auth/' + path, {
        method: data === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'Accept-Language': I18n.language() },
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        const error = new Error(result?.error?.message || 'requestFailed');
        error.status = response.status;
        throw error;
      }
      csrf = undefined;
      return path === 'profiles' && !Array.isArray(result) ? result.value : result;
    },
    create: (entity, data) => request(entity, 'POST', data),
    update: (entity, id, data) => request(`${entity}(${id})`, 'PATCH', data),
    remove: (entity, id) => request(`${entity}(${id})`, 'DELETE'),
    action: (name, data) =>
      request(name, 'POST', data).then(result =>
        result && Object.hasOwn(result, 'value') ? result.value : result
      ),
    batch: async operations => {
      const data = await request('$batch', 'POST', {
        requests: operations.map((operation, index) => {
          const { dependsOn, ...entry } = operation;
          return {
            id: String(index + 1),
            atomicityGroup: 'save',
            ...entry,
            ...(dependsOn && window.RSVROOM_CONFIG?.batchDependencies !== false
              ? { dependsOn }
              : {}),
            headers: { 'content-type': 'application/json', 'accept-language': I18n.language() }
          };
        })
      });
      const failed = data.responses.find(response => response.status >= 400);
      if (failed) {
        const error = new Error(failed.body?.error?.message || 'saveFailed');
        error.status = failed.status;
        error.code = failed.body?.error?.code;
        throw error;
      }
      return data.responses;
    }
  };
});
