const KEY = 'yinyu:backend';
export const DEFAULT_BACKEND = 'https://music.liyucheng.me';
export const isPages = () => typeof location !== 'undefined' && location.hostname.endsWith('.github.io');

export function getBackendBase() {
  if (!isPages()) return '';
  try { return localStorage.getItem(KEY) || DEFAULT_BACKEND; } catch { return DEFAULT_BACKEND; }
}

export function setBackendBase(value) {
  const input = value.trim();
  if (!input) { localStorage.removeItem(KEY); return; }
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('请填写不含账号、参数的 HTTPS 服务地址');
  }
  localStorage.setItem(KEY, url.href.replace(/\/$/, ''));
}

export function backendUrl(path) { return `${getBackendBase()}${path}`; }

export function rewriteStreamUrls(value) {
  if (Array.isArray(value)) return value.map(rewriteStreamUrls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'url' && typeof item === 'string' && item.startsWith('/api/stream/') ? backendUrl(item) : rewriteStreamUrls(item),
  ]));
}
