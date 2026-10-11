// 网易云音乐：搜索、榜单、歌单、推荐、歌词、播放地址
// 只使用公开（无需登录、无加密）的接口；某个接口不可用时按顺序降级到下一个。
// 播放地址使用网易云官方外链 /song/media/outer/url，只有免费歌曲能拿到完整音频，VIP 歌曲会被重定向到 404。

import { request, getJSON, cached } from '../lib/http.js';

const BASE = 'https://music.163.com';
const HEADERS = { Referer: 'https://music.163.com/', Origin: 'https://music.163.com' };

export const TOPLISTS = [
  { id: '19723756', short: '飙升' },
  { id: '3779629', short: '新歌' },
  { id: '3778678', short: '热歌' },
  { id: '2884035', short: '原创' },
  { id: '991319590', short: '说唱' },
  { id: '71385702', short: 'ACG' },
  { id: '2809513713', short: '欧美' },
  { id: '745956260', short: '韩语' },
  { id: '5059644681', short: '日语' },
  { id: '1978921795', short: '电音' },
];

const https = (u) => (u ? String(u).replace(/^http:/, 'https:') : '');
export const coverOf = (u, size = 300) => (u ? `${https(u)}?param=${size}y${size}` : '');

function feeOf(fee) {
  if (fee === 1 || fee === 4) return 'vip';
  if (fee === 0 || fee === 8) return 'free';
  return 'unknown';
}

export function mapSong(s) {
  const al = s.album || s.al || {};
  const ar = s.artists || s.ar || [];
  return {
    id: String(s.id),
    source: 'netease',
    name: s.name,
    artists: ar.map((a) => ({ id: a.id ? String(a.id) : '', name: a.name })),
    album: al.name || '',
    cover: coverOf(al.picUrl || al.blurPicUrl),
    duration: s.duration ?? s.dt ?? 0,
    fee: feeOf(s.fee),
    link: `https://music.163.com/#/song?id=${s.id}`,
  };
}

const get = (path, opts = {}) => getJSON(BASE + path, { headers: HEADERS, ...opts });

/** 依次尝试多个请求，返回第一个 pick() 结果不为 undefined 的值 */
async function firstOk(attempts, pick) {
  const errors = [];
  for (const run of attempts) {
    try {
      const value = pick(await run());
      if (value !== undefined) return value;
      errors.push('响应格式不符');
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`网易云接口不可用（${errors.join('；')}）`);
}

// ---------- 搜索 ----------

export function search(keyword, { limit = 30, offset = 0 } = {}) {
  const q = new URLSearchParams({ s: keyword, type: '1', limit: String(limit), offset: String(offset) });
  return cached(`ne:search:${q}`, 5 * 60e3, async () => {
    const songs = await firstOk(
      [
        () => get(`/api/cloudsearch/pc?${q}`),
        () => get('/api/search/pc', {
          method: 'POST',
          headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: q.toString(),
        }),
        () => get(`/api/search/get?${q}`),
      ],
      // 部分接口会返回加密字符串形式的 result，此时视为失败
      (json) => {
        const r = json && json.result;
        if (!r || typeof r !== 'object') return undefined;
        return Array.isArray(r.songs) ? r.songs : r.songCount === 0 ? [] : undefined;
      },
    );
    return fillCovers(songs.map(mapSong));
  });
}

/** 旧版搜索接口不带封面，用歌曲详情补齐 */
async function fillCovers(songs) {
  const missing = songs.filter((s) => !s.cover);
  if (!missing.length) return songs;
  try {
    const details = await songDetail(missing.map((s) => s.id));
    const byId = new Map(details.map((d) => [d.id, d]));
    for (const s of missing) {
      const d = byId.get(s.id);
      if (d) {
        s.cover = d.cover;
        if (s.fee === 'unknown') s.fee = d.fee;
      }
    }
  } catch {
    /* 封面缺失不影响使用 */
  }
  return songs;
}

export function songDetail(ids) {
  const list = ids.map(String);
  return cached(`ne:detail:${list.join(',')}`, 60 * 60e3, () =>
    firstOk(
      [
        () => get(`/api/v3/song/detail?c=${encodeURIComponent(JSON.stringify(list.map((id) => ({ id }))))}`),
        () => get(`/api/song/detail?ids=${encodeURIComponent(`[${list.join(',')}]`)}`),
      ],
      (json) => (Array.isArray(json?.songs) ? json.songs.map(mapSong) : undefined),
    ),
  );
}

// ---------- 播放 & 歌词 ----------

/** 返回可直接播放的音频地址；VIP/无版权歌曲返回 null */
export function songUrl(id) {
  return cached(`ne:url:${id}`, 10 * 60e3, async () => {
    const res = await request(`${BASE}/song/media/outer/url?id=${encodeURIComponent(id)}.mp3`, {
      headers: HEADERS,
      redirect: 'manual',
    });
    const loc = res.headers.get('location');
    if (!loc || /\/404(\b|$)/.test(loc)) return null;
    return loc;
  });
}

export async function songInfo(id) {
  const url = await songUrl(id);
  return url ? { url, quality: { label: '音质未知', bitrate: null, codec: null } } : null;
}

export function lyric(id) {
  return cached(`ne:lyric:${id}`, 24 * 3600e3, async () => {
    const json = await get(`/api/song/lyric?id=${encodeURIComponent(id)}&lv=1&tv=-1`);
    return {
      lrc: json?.lrc?.lyric || '',
      tlyric: json?.tlyric?.lyric || '',
      pure: !!json?.nolyric || !!json?.pureMusic,
    };
  });
}

// ---------- 歌单 & 榜单 ----------

export function playlist(id) {
  return cached(`ne:playlist:${id}`, 15 * 60e3, async () => {
    const pl = await firstOk(
      [
        () => get(`/api/playlist/detail?id=${encodeURIComponent(id)}`),
        () => get(`/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=200`),
      ],
      (json) => {
        const p = json?.result || json?.playlist;
        return p && Array.isArray(p.tracks) ? p : undefined;
      },
    );
    return {
      id: String(pl.id),
      name: pl.name,
      cover: coverOf(pl.coverImgUrl, 400),
      description: pl.description || '',
      updateTime: pl.updateTime || 0,
      playCount: pl.playCount || 0,
      creator: pl.creator?.nickname || '',
      tracks: pl.tracks.map(mapSong),
    };
  });
}

/** 所有榜单概要（名称、封面、前三首），失败的榜单自动略过 */
export function toplists() {
  return cached('ne:toplists', 20 * 60e3, async () => {
    const results = await Promise.allSettled(TOPLISTS.map((t) => playlist(t.id)));
    const lists = results
      .map((r, i) => (r.status === 'fulfilled' ? { ...r.value, short: TOPLISTS[i].short } : null))
      .filter(Boolean)
      .map(({ tracks, ...meta }) => ({ ...meta, top: tracks.slice(0, 3), trackCount: tracks.length }));
    if (!lists.length) throw new Error('榜单暂时无法获取');
    return lists;
  });
}

// ---------- 网易云推荐 ----------

export function recommendPlaylists(limit = 12) {
  return cached(`ne:perso:${limit}`, 30 * 60e3, () =>
    firstOk(
      [
        () => get(`/api/personalized/playlist?limit=${limit}`),
        () => get(`/api/playlist/list?cat=${encodeURIComponent('全部')}&order=hot&limit=${limit}&offset=0`),
      ],
      (json) => {
        const arr = json?.result || json?.playlists;
        if (!Array.isArray(arr) || !arr.length) return undefined;
        return arr.slice(0, limit).map((p) => ({
          id: String(p.id),
          name: p.name,
          cover: coverOf(p.picUrl || p.coverImgUrl, 400),
          playCount: p.playCount || 0,
          copywriter: p.copywriter || '',
        }));
      },
    ),
  );
}

export function newSongs(limit = 12) {
  return cached(`ne:newsong:${limit}`, 30 * 60e3, async () => {
    try {
      return await firstOk(
        [() => get(`/api/personalized/newsong?limit=${limit}`)],
        (json) => (Array.isArray(json?.result) && json.result.length
          ? json.result.map((r) => mapSong(r.song || r)).slice(0, limit)
          : undefined),
      );
    } catch {
      // 降级：新歌榜
      const pl = await playlist('3779629');
      return pl.tracks.slice(0, limit);
    }
  });
}

// ---------- 推荐算法使用的相似度接口（可能需要登录，失败时由调用方忽略） ----------

export function simiSongs(id, limit = 10) {
  return cached(`ne:simi:${id}`, 6 * 3600e3, () =>
    firstOk(
      [() => get(`/api/v1/discovery/simiSong?songid=${encodeURIComponent(id)}&limit=${limit}&offset=0`)],
      (json) => (Array.isArray(json?.songs) ? json.songs.map(mapSong) : undefined),
    ),
  );
}

export function artistTopSongs(id) {
  return cached(`ne:artist:${id}`, 6 * 3600e3, () =>
    firstOk(
      [
        () => get(`/api/artist/top/song?id=${encodeURIComponent(id)}`),
        () => get(`/api/v1/artist/${encodeURIComponent(id)}`),
        () => get(`/api/artist/${encodeURIComponent(id)}`),
      ],
      (json) => {
        const arr = json?.songs || json?.hotSongs;
        return Array.isArray(arr) && arr.length ? arr.map(mapSong) : undefined;
      },
    ),
  );
}

export function simiArtists(id) {
  return cached(`ne:simiartist:${id}`, 6 * 3600e3, () =>
    firstOk(
      [() => get(`/api/discovery/simiArtist?artistid=${encodeURIComponent(id)}`)],
      (json) => (Array.isArray(json?.artists) && json.artists.length
        ? json.artists.map((a) => ({ id: String(a.id), name: a.name }))
        : undefined),
    ),
  );
}
