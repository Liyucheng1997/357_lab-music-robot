// 后端 API 封装
import { isPages, getBackendBase, backendUrl, rewriteStreamUrls } from './backend.js';

async function call(path, opts) {
  if (isPages() && !getBackendBase()) throw new Error('请在页面上方连接音乐服务后使用此功能');
  let res;
  try {
    res = await fetch(backendUrl(path), opts);
  } catch {
    throw new Error('网络连接失败，请检查服务是否启动');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return rewriteStreamUrls(data);
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();

export const api = {
  search: (q, page = 1, source) => isPages() && !getBackendBase()
    ? Promise.resolve({ keyword: q, page, results: {
      douyin: { ok: true, songs: [], status: 'external', message: '在抖音官方搜索音乐与视频', link: `https://www.douyin.com/search/${encodeURIComponent(q)}` },
      qishui: { ok: true, songs: [], status: 'external', message: '请在汽水音乐客户端搜索与收听', link: 'https://www.qishui.com/' },
    } })
    : call(`/api/search?${qs({ q, page, source })}`),
  play: (song) =>
    call(`/api/play?${qs({ source: song.source, id: song.id, name: song.name, artist: song.artists?.[0]?.name, duration: song.duration })}`),
  availability: (songs, refresh = false) =>
    call('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh,
        songs: songs.map((s) => ({ source: s.source, id: s.id, name: s.name, artist: s.artists?.[0]?.name, duration: s.duration })),
      }),
    }),
  lyric: (params) => call(`/api/lyric?${qs(params)}`),
  toplists: () => call('/api/toplists'),
  playlist: (id) => call(`/api/playlist?${qs({ id })}`),
  discover: () => call('/api/discover'),
  recommend: (body) =>
    call('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
};
