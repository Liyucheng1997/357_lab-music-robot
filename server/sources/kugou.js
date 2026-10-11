// 酷狗音乐：公开搜索接口 + 官方播放信息接口。
// 播放接口会校验付费状态：付费歌曲返回「需要付费」且没有地址，这里只使用免费歌曲的地址。

import { getJSON, cached, decodeEntities } from '../lib/http.js';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function search(keyword, { limit = 20, page = 1 } = {}) {
  const q = new URLSearchParams({ keyword, page: String(page), pagesize: String(limit), format: 'json', showtype: '1' });
  return cached(`kg:search:${q}`, 5 * 60e3, async () => {
    const json = await getJSON(`http://mobilecdn.kugou.com/api/v3/search/song?${q}`);
    const list = json?.data?.info;
    if (!Array.isArray(list)) throw new Error('酷狗返回格式异常');
    return list.map((s) => {
      const singers = decodeEntities(s.singername || '').split(/[、,，&]/).map((n) => n.trim()).filter(Boolean);
      return {
        id: s.hash,
        source: 'kugou',
        name: decodeEntities(s.songname_original || s.songname || '').replace(/<\/?em>/g, ''),
        artists: singers.map((name) => ({ id: '', name })),
        album: decodeEntities(s.album_name || ''),
        cover: '',
        duration: (s.duration || 0) * 1000,
        fee: s.privilege === 10 ? 'vip' : 'free',
        link: `https://www.kugou.com/song/#hash=${s.hash}&album_id=${s.album_id || 0}`,
      };
    });
  });
}

/** 免费歌曲返回完整音频地址；付费歌曲返回 null */
export function songInfo(hash) {
  return cached(`kg:url:${hash}`, 10 * 60e3, async () => {
    const json = await getJSON(
      `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${encodeURIComponent(hash)}`,
      { headers: { 'User-Agent': MOBILE_UA } },
    );
    if (json?.status === 0 && /频繁|稍后|限制|验证|异常/.test(json.error || '')) throw new Error('酷狗暂时限制请求，请稍后重试');
    if (json?.privilege === 10 || !json?.url) return null;
    const raw = Number(json.bitRate ?? json.bitrate);
    const bitrate = Number.isFinite(raw) && raw > 0 ? (raw > 1000 ? Math.round(raw / 1000) : raw) : null;
    return { url: json.url, quality: { label: bitrate ? `${bitrate} kbps` : '音质未知', bitrate, codec: null } };
  });
}

export async function songUrl(hash) {
  return (await songInfo(hash))?.url || null;
}
