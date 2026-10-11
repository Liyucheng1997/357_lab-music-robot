// 轻量 HTTP 工具：带超时的 fetch、JSON 解析、内存缓存（同 key 并发请求合并）

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function request(url, { method = 'GET', headers = {}, body, timeout = 8000, redirect = 'follow' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, {
      method,
      body,
      redirect,
      headers: { 'User-Agent': UA, ...headers },
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`请求超时: ${new URL(url).host}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getText(url, opts) {
  const res = await request(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${new URL(url).host}`);
  return res.text();
}

export async function getJSON(url, opts) {
  const text = await getText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`返回内容不是 JSON: ${new URL(url).host}`);
  }
}

const store = new Map();
const MAX_ENTRIES = 800;

export function invalidate(key) { store.delete(key); }

/** 缓存一个异步结果；失败不缓存。并发的同 key 调用共享同一个 Promise。 */
export function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = Promise.resolve().then(fn);
  store.set(key, { promise, exp: Date.now() + ttlMs });
  promise.catch(() => store.delete(key));
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
  return promise;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s = '') {
  return String(s).replace(/&(#?\w+);/g, (m, k) => {
    if (k in ENTITIES) return ENTITIES[k];
    if (k[0] === '#') {
      const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

/** 用于跨平台比较歌名/歌手：去括号备注、空白、大小写 */
export function normalize(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[\s·・,，.。'"!！?？&、/]/g, '');
}
