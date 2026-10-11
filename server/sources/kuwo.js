// 酷我音乐：公开搜索接口。该接口返回的是单引号的类 JSON 文本，不能直接 JSON.parse，
// 这里用正则逐条提取字段（不执行任何返回内容）。

import { getText, cached, decodeEntities } from '../lib/http.js';

/** 解析酷我搜索结果里的 abslist 数组 */
export function parseKuwo(text) {
  const start = text.indexOf("'abslist':[");
  if (start < 0) return [];
  const body = text.slice(start + "'abslist':[".length);
  // 每条记录形如 {'K':'V','K2':'V2'}，记录之间以 '},{' 分隔
  const chunks = body.split(/(?<=')\}\s*,\s*\{(?=')/);
  const items = [];
  for (let chunk of chunks) {
    const end = chunk.search(/'\}\s*\]/); // 到达数组末尾，截掉后面的顶层字段
    if (end >= 0) chunk = chunk.slice(0, end + 2);
    const obj = {};
    const re = /'([A-Za-z_0-9]+)':'([\s\S]*?)'(?=\s*,\s*'[A-Za-z_0-9]+':|\s*\}|$)/g;
    let m;
    while ((m = re.exec(chunk))) obj[m[1]] = m[2];
    if (obj.MUSICRID) items.push(obj);
    if (end >= 0) break;
  }
  return items;
}

export function search(keyword, { limit = 20, page = 1 } = {}) {
  const q = new URLSearchParams({
    all: keyword, ft: 'music', itemset: 'web_2013', client: 'kt',
    pn: String(page - 1), rn: String(limit), rformat: 'json', encoding: 'utf8',
  });
  return cached(`kw:search:${q}`, 5 * 60e3, async () => {
    const text = await getText(`https://search.kuwo.cn/r.s?${q}`);
    return parseKuwo(text).map((s) => {
      const rid = s.MUSICRID.replace(/^MUSIC_/, '');
      const pic = s.web_albumpic_short
        ? `https://img4.kuwo.cn/star/albumcover/${s.web_albumpic_short.replace(/^\d+\//, '300/')}`
        : '';
      return {
        id: rid,
        source: 'kuwo',
        name: decodeEntities(s.SONGNAME || s.NAME || ''),
        artists: decodeEntities(s.ARTIST || '').split('&').map((n) => n.trim()).filter(Boolean).map((name) => ({ id: s.ARTISTID || '', name })),
        album: decodeEntities(s.ALBUM || ''),
        cover: pic,
        duration: Number(s.DURATION || 0) * 1000,
        fee: s.PAY && s.PAY !== '0' ? 'vip' : 'unknown',
        link: `https://www.kuwo.cn/play_detail/${rid}`,
      };
    });
  });
}
