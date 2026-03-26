/**
 * Returns a stable per-browser UUID stored in localStorage.
 * Used as X-Session-ID to scope watchlists/portfolios/alerts per visitor.
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const KEY = 'batesstocks_session_id';

export function getSessionId() {
  let sid = localStorage.getItem(KEY);
  if (!sid || !/^[0-9a-f-]{36}$/.test(sid)) {
    sid = generateUUID();
    localStorage.setItem(KEY, sid);
  }
  return sid;
}

/** Fetch wrapper that injects X-Session-ID on every request. */
export function sessionFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), 'X-Session-ID': getSessionId() };
  return fetch(url, { ...options, headers });
}
