// 哔哩哔哩：搜索公开视频，播放其音频轨（DASH 音频流）。
// B 站音频 CDN 校验 Referer，浏览器无法直接播放，由 /api/stream/bilibili/:bvid 转发。

import { request, getJSON, cached, decodeEntities } from '../lib/http.js';

const REFERER = 'https://www.bilibili.com/';

/** 匿名访问需要 buvid3 cookie，否则搜索会被风控拦截 */
function cookie() {
  return cached('bili:buvid', 12 * 3600e3, async () => {
    const json = await getJSON('https://api.bilibili.com/x/frontend/finger/spi');
    const b3 = json?.data?.b_3;
    if (!b3) throw new Error('B站初始化失败');
    return `buvid3=${b3}; buvid4=${encodeURIComponent(json.data.b_4 || '')}`;
  });
}

async function api(url) {
  const json = await getJSON(url, { headers: { Referer: REFERER, Cookie: await cookie() } });
  if (json?.code !== 0) throw new Error(`B站接口错误：${json?.message || json?.code}`);
  return json.data;
}

const stripTags = (s = '') => decodeEntities(String(s).replace(/<[^>]+>/g, ''));

function parseDuration(s) {
  if (typeof s === 'number') return s;
  const parts = String(s || '').split(':').map(Number);
  return parts.reduce((acc, n) => acc * 60 + (n || 0), 0);
}

/** 从「【无损】周杰伦 - 晴天 MV」这类标题里尽量提取歌名 */
function guessName(title) {
  const t = title.replace(/【[^】]*】|\[[^\]]*\]|「|」|“|”/g, ' ').trim();
  const book = t.match(/《([^》]+)》/);
  if (book) return book[1].trim();
  const dash = t.split(/\s+[-—–]+\s+|——/);
  if (dash.length >= 2) return dash[1].replace(/\b(MV|官方|完整版|无损|高音质|Hi-?Res).*$/i, '').trim() || t;
  return t;
}

export function search(keyword, { limit = 20, page = 1 } = {}) {
  return cached(`bili:search:${keyword}:${page}`, 10 * 60e3, async () => {
    const q = new URLSearchParams({ search_type: 'video', keyword, page: String(page) });
    const data = await api(`https://api.bilibili.com/x/web-interface/search/type?${q}`);
    return (data?.result || [])
      .map((v) => ({ v, sec: parseDuration(v.duration) }))
      .filter(({ sec }) => sec >= 60 && sec <= 900) // 只要歌曲长度的视频
      .slice(0, limit)
      .map(({ v, sec }) => {
        const title = stripTags(v.title);
        return {
          id: v.bvid,
          source: 'bilibili',
          name: guessName(title),
          title,
          artists: [{ id: String(v.mid || ''), name: v.author || 'UP主' }],
          album: title,
          cover: v.pic ? `${v.pic.startsWith('//') ? 'https:' : ''}${v.pic}@200w_200h_1c.jpg` : '',
          duration: sec * 1000,
          fee: 'free',
          plays: v.play || 0,
          link: `https://www.bilibili.com/video/${v.bvid}`,
        };
      });
  });
}

/** 取视频音频流的真实地址（带时效，缓存 30 分钟） */
export function audioInfo(bvid) {
  return cached(`bili:audio:${bvid}`, 30 * 60e3, async () => {
    const pages = await api(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`);
    const cid = pages?.[0]?.cid;
    if (!cid) throw new Error('B站视频不存在');
    const data = await api(`https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&fnval=16&fourk=0`);
    const audios = data?.dash?.audio || [];
    if (!audios.length) return null;
    const best = audios.sort((a, b) => b.bandwidth - a.bandwidth)[0];
    const url = best.baseUrl || best.base_url;
    const bitrate = Number(best.bandwidth) > 0 ? Math.round(Number(best.bandwidth) / 1000) : null;
    const codec = best.codecs || null;
    return url ? { url, quality: { label: [bitrate ? `${bitrate} kbps` : '音质未知', codec].filter(Boolean).join(' · '), bitrate, codec } } : null;
  });
}

export async function audioUrl(bvid) {
  return (await audioInfo(bvid))?.url || null;
}

export async function songInfo(bvid) {
  const info = await audioInfo(bvid);
  return info ? { ...info, url: `/api/stream/bilibili/${encodeURIComponent(bvid)}`, media: 'video' } : null;
}

/** 播放地址：返回本服务的转发路径 */
export async function songUrl(bvid) {
  const url = await audioUrl(bvid);
  return url ? `/api/stream/bilibili/${encodeURIComponent(bvid)}` : null;
}

/** 转发音频流（支持 Range，便于拖动进度） */
export async function stream(bvid, req, res) {
  const url = await audioUrl(bvid);
  if (!url) throw Object.assign(new Error('没有音频流'), { status: 404 });
  const headers = { Referer: REFERER };
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await request(url, { headers, timeout: 15000 });
  if (!upstream.ok && upstream.status !== 206) {
    throw Object.assign(new Error(`B站音频获取失败（${upstream.status}）`), { status: 502 });
  }
  const out = { 'Content-Type': 'audio/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(upstream.status, out);
  if (req.method === 'HEAD' || !upstream.body) return res.end();
  const reader = upstream.body.getReader();
  req.on('close', () => reader.cancel().catch(() => {}));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) await new Promise((r) => res.once('drain', r));
    }
  } catch {
    /* 客户端中断 */
  }
  res.end();
}

/** 标题比较用：只去掉空白与标点，保留括号里的内容（歌名常写在《》里） */
const loose = (s = '') => String(s).toLowerCase().replace(/[\s·・,，.。'"!！?？&、/|｜《》【】\[\]()（）\-—–_:：~～]/g, '');

const BAD_WORDS = /翻唱|cover|伴奏|钢琴|吉他|教程|教学|dj|remix|串烧|合集|reaction|鬼畜|改编|练习|弹唱|口琴|古筝|笛子|乐谱|片段/i;

/** 在 B 站找与歌名、歌手一致的原唱视频 */
export async function match(name, artist, durationMs) {
  const list = await search(`${name} ${artist}`.trim(), { limit: 20 });
  const n = loose(name);
  const a = loose(artist);
  const wantBad = BAD_WORDS.test(name);
  const cands = list
    .filter((v) => {
      const t = loose(v.title);
      if (!t.includes(n)) return false;
      if (a && !t.includes(a) && !loose(v.artists[0].name).includes(a)) return false;
      if (!wantBad && BAD_WORDS.test(v.title)) return false;
      if (durationMs && Math.abs(v.duration - durationMs) > 25000) return false;
      return true;
    })
    .sort((x, y) => y.plays - x.plays);
  for (const v of cands.slice(0, 2)) {
    const info = await songInfo(v.id).catch(() => null);
    if (info) return { ...info, kind: 'full', via: 'bilibili', matched: v };
  }
  return null;
}
