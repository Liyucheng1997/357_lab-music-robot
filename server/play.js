// 汇总公开免费资源，不绕过平台付费校验。
import * as netease from './sources/netease.js';
import * as kugou from './sources/kugou.js';
import * as bilibili from './sources/bilibili.js';
import { cached, invalidate } from './lib/http.js';
import { normalizeQuality, compareQuality } from '../public/js/quality.js';

// 保留 Live、翻唱等版本备注，避免不同录音被当成同一首。
const comparable = (s = '') => String(s).toLowerCase().replace(/[\s·・,，.。'"!！?？&、/]/g, '');
export function sameSong(candidate, name, artist) {
  if (comparable(candidate.name) !== comparable(name)) return false;
  if (!artist) return true;
  return (candidate.artists || []).some((a) => comparable(a.name) === comparable(artist));
}

export function createResolver(providers) {
  return async ({ source, id, name = '', artist = '', duration = 0 }) => {
    const statuses = {};
    const checks = Object.entries(providers).map(async ([via, provider]) => {
      try {
        let info;
        let matched;
        if (source === via) info = await provider.songInfo(id);
        if (!info?.url && name && source !== 'bilibili') {
          if (via === 'bilibili') {
            info = await provider.match(name, artist, duration);
            matched = info?.matched;
          } else {
            const songs = await provider.search(`${name} ${artist}`.trim(), { limit: 10 });
            const candidates = songs.filter((s) => s.fee !== 'vip' && sameSong(s, name, artist)).slice(0, 3);
            let candidateError;
            for (const song of candidates) {
              const candidate = await provider.songInfo(song.id).catch((err) => { candidateError = err; return null; });
              if (candidate?.url && (!info?.url || compareQuality(candidate, info) < 0)) {
                info = candidate;
                matched = song;
              }
            }
            if (!info?.url && candidateError) throw candidateError;
          }
        }
        statuses[via] = info?.url ? 'available' : 'unavailable';
        if (!info?.url) return null;
        return {
          ...info, via, kind: info.kind || 'full', matched,
          quality: normalizeQuality(info.quality),
          ...(via === 'netease' ? { lyricId: matched?.id || id } : source === 'netease' ? { lyricId: id } : {}),
        };
      } catch {
        statuses[via] = 'error';
        return null;
      }
    });
    const resources = (await Promise.all(checks)).filter(Boolean);
    resources.sort((a, b) => compareQuality(a, b)
      || Number(a.via === 'bilibili') - Number(b.via === 'bilibili')
      || Number(b.via === source) - Number(a.via === source));
    return resources.length ? { ...resources[0], resources, statuses } : { url: null, kind: null, resources: [], statuses };
  };
}

const collect = createResolver({ netease, kugou, bilibili });
export function resolve(params, refresh = false) {
  const p = { name: '', artist: '', duration: 0, ...params };
  const key = `play:v3:${p.source}:${p.id}:${p.name}:${p.artist}:${p.duration}`;
  if (refresh) invalidate(key);
  return cached(key, 5 * 60e3, () => collect(p));
}

export async function availability(songs, concurrency = 4, refresh = false) {
  const out = {};
  let i = 0;
  const worker = async () => {
    while (i < songs.length) {
      const song = songs[i++];
      out[`${song.source}:${song.id}`] = await resolve(song, refresh).catch(() => ({ url: null, resources: [], statuses: {} }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, songs.length) }, worker));
  return out;
}

export async function findLyricId(name, artist) {
  const songs = await netease.search(`${name} ${artist}`.trim(), { limit: 8 });
  return songs.find((s) => sameSong(s, name, artist))?.id || null;
}
