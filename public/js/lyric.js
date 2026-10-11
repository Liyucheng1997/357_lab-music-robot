// LRC 歌词解析，支持一行多个时间标签与翻译合并

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(text = '') {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const times = [];
    let m;
    TAG.lastIndex = 0;
    let last = 0;
    while ((m = TAG.exec(raw))) {
      const ms = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + ms / 1000);
      last = TAG.lastIndex;
    }
    const content = raw.slice(last).trim();
    if (!times.length || !content) continue;
    for (const t of times) lines.push({ t, text: content });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/** 合并原文与翻译：相同时间点的翻译挂到 trans 上 */
export function mergeLyric(lrc, tlyric) {
  const main = parseLrc(lrc);
  if (!tlyric) return main;
  const trans = new Map(parseLrc(tlyric).map((l) => [l.t.toFixed(2), l.text]));
  return main.map((l) => ({ ...l, trans: trans.get(l.t.toFixed(2)) }));
}

/** 二分查找当前行 */
export function activeIndex(lines, time) {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time + 0.15) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
