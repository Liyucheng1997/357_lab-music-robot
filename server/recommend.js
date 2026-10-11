// 个性化推荐：基于用户本地的听歌记录 / 收藏 / 不感兴趣，构建"音乐画像"，
// 从「相似歌曲」「常听歌手热门曲」「相似歌手」「热门榜单」四路召回候选，打分 + 去重 + 歌手打散后输出。

import * as netease from './sources/netease.js';
import { normalize } from './lib/http.js';

const DAY = 864e5;
const songKey = (s) => `${normalize(s.name)}|${normalize(s.artists?.[0]?.name || '')}`;
const artistKey = (name) => normalize(name);

function buildProfile({ history = [], likes = [], dislikes = [] }, now = Date.now()) {
  const songs = new Map(); // key -> { song, w }
  const artists = new Map(); // key -> { name, id, w }

  const addSong = (song, w) => {
    if (!song?.name || !w) return;
    const k = songKey(song);
    const cur = songs.get(k) || { song, w: 0 };
    cur.w += w;
    if (song.source === 'netease') cur.song = song;
    songs.set(k, cur);
    for (const a of song.artists || []) {
      if (!a.name) continue;
      const ak = artistKey(a.name);
      const ca = artists.get(ak) || { name: a.name, id: '', w: 0 };
      ca.w += w / Math.max(1, song.artists.length * 0.7);
      if (song.source === 'netease' && a.id && !ca.id) ca.id = a.id;
      artists.set(ak, ca);
    }
  };

  for (const h of history.slice(0, 300)) {
    const age = Math.max(0, (now - (h.lastPlayed || now)) / DAY);
    const recency = Math.exp(-age / 21); // 约三周半衰
    const affinity = Math.log2(1 + (h.plays || 0)) - 0.6 * Math.log2(1 + (h.skips || 0));
    addSong(h.song, Math.max(-1, affinity) * (0.3 + 0.7 * recency));
  }
  for (const s of likes.slice(0, 300)) addSong(s, 3);
  for (const s of dislikes.slice(0, 300)) addSong(s, -2);

  const topSongs = [...songs.values()].filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  const topArtists = [...artists.values()].filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  const maxA = topArtists[0]?.w || 1;
  for (const a of topArtists) a.score = a.w / maxA;

  return {
    topSongs,
    topArtists,
    artistScore: new Map(topArtists.map((a) => [artistKey(a.name), a.score])),
    excluded: new Set([
      ...history.map((h) => songKey(h.song)),
      ...likes.map(songKey),
      ...dislikes.map(songKey),
    ]),
    dislikedArtists: new Set(
      [...artists.entries()].filter(([, a]) => a.w < 0).map(([k]) => k),
    ),
  };
}

async function settle(tasks) {
  const results = await Promise.allSettled(tasks);
  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

export async function recommend(input = {}, { limit = 40 } = {}) {
  const profile = buildProfile(input);
  const pool = new Map(); // songKey -> { song, score, reason }

  const add = (song, score, reason) => {
    if (!song?.name) return;
    const k = songKey(song);
    if (profile.excluded.has(k)) return;
    if (song.artists?.some((a) => profile.dislikedArtists.has(artistKey(a.name)))) return;
    const cur = pool.get(k);
    if (cur) {
      cur.score += score * 0.6; // 被多路召回，说明更可能喜欢
      if (score > cur.best) Object.assign(cur, { reason, best: score });
    } else {
      pool.set(k, { song, score, best: score, reason });
    }
  };

  const seeds = profile.topSongs.filter((x) => x.song.source === 'netease').slice(0, 5);
  const favArtists = profile.topArtists.slice(0, 5);
  const coldStart = !seeds.length && !favArtists.length;

  const jobs = [];

  // 1. 相似歌曲
  for (const { song, w } of seeds) {
    jobs.push(
      netease.simiSongs(song.id).then((list) =>
        list.forEach((s, i) => add(s, (1.2 - i * 0.05) * Math.min(2, 0.6 + w / 3), `与《${song.name}》风格相似`)),
      ),
    );
  }

  // 2. 常听歌手的热门作品（没有网易云歌手 ID 时用搜索代替）
  for (const a of favArtists) {
    const fetchSongs = a.id
      ? netease.artistTopSongs(a.id).catch(() => netease.search(a.name, { limit: 30 }))
      : netease.search(a.name, { limit: 30 });
    jobs.push(
      fetchSongs.then((list) =>
        list
          .filter((s) => s.artists.some((x) => artistKey(x.name) === artistKey(a.name)))
          .slice(0, 15)
          .forEach((s, i) => add(s, (0.9 - i * 0.03) * a.score + 0.2, `因为你常听 ${a.name}`)),
      ),
    );
  }

  // 3. 相似歌手
  for (const a of favArtists.slice(0, 2).filter((x) => x.id)) {
    jobs.push(
      netease.simiArtists(a.id).then((simis) =>
        settle(
          simis.slice(0, 3).map((sa) =>
            netease.artistTopSongs(sa.id).then((list) =>
              list.slice(0, 6).forEach((s, i) => add(s, (0.55 - i * 0.04) * a.score + 0.1, `喜欢 ${a.name} 的人也在听 ${sa.name}`)),
            ),
          ),
        ),
      ),
    );
  }

  // 4. 热门榜单：冷启动兜底；有画像时，榜单里与画像歌手重合的歌曲加权
  for (const [id, label] of [['3778678', '热歌榜'], ['19723756', '飙升榜'], ['3779629', '新歌榜']]) {
    jobs.push(
      netease.playlist(id).then((pl) =>
        pl.tracks.slice(0, 60).forEach((s, i) => {
          const match = Math.max(0, ...s.artists.map((x) => profile.artistScore.get(artistKey(x.name)) || 0));
          const base = coldStart ? 0.6 - i * 0.006 : 0.12 - i * 0.001;
          add(s, base + match * 0.8, match > 0 ? `${label}上的 ${s.artists[0]?.name} 新动态` : `${label}热门`);
        }),
      ),
    );
  }

  await settle(jobs);

  // 打分排序 + 同一歌手最多 3 首，避免推荐列表被单一歌手刷屏
  const ranked = [...pool.values()].sort((a, b) => b.score - a.score);
  const perArtist = new Map();
  const picked = [];
  for (const item of ranked) {
    const ak = artistKey(item.song.artists?.[0]?.name || '');
    const n = perArtist.get(ak) || 0;
    if (n >= 3) continue;
    perArtist.set(ak, n + 1);
    picked.push({ ...item.song, reason: item.reason });
    if (picked.length >= limit) break;
  }

  return {
    coldStart,
    profile: {
      artists: profile.topArtists.slice(0, 8).map((a) => ({ name: a.name, score: Math.round(a.score * 100) / 100 })),
      songCount: profile.topSongs.length,
    },
    songs: picked,
  };
}
