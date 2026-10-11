// UI 工具：图标、转义、格式化、Toast

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M5 20v-7M12 20V5M19 20v-11"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.4 4c2 0 3.5 1.1 4.6 2.7C13.1 5.1 14.6 4 16.6 4c3.5 0 5.8 3.6 4.6 7.1-1.7 4.8-9.2 9.4-9.2 9.4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18 5.5v13a1 1 0 0 1-1.6.8L8 13a1.2 1.2 0 0 1 0-2l8.4-6.3a1 1 0 0 1 1.6.8z" fill="currentColor" stroke="none"/><path d="M5.5 5v14"/>',
  next: '<path d="M6 5.5v13a1 1 0 0 0 1.6.8L16 13a1.2 1.2 0 0 0 0-2L7.6 4.7A1 1 0 0 0 6 5.5z" fill="currentColor" stroke="none"/><path d="M18.5 5v14"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  'repeat-one': '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/><path d="M11 10.5l1.5-1v5.5"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  lyric: '<path d="M4 6h16M4 12h9M4 18h6"/><circle cx="17" cy="17.5" r="2.5"/><path d="M19.5 17.5V10l2 1"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  queue: '<path d="M3 6h14M3 12h14M3 18h8"/><path d="M16 15v6l5-3z" fill="currentColor"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  link: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  loader: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  'desk-lyric': '<rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M6.5 9h8M9.5 12.5h8M9 20.5h6M12 17v3.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};

export const svg = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

export const icon = (name) => `<i data-icon="${name}">${svg(name)}</i>`;

/** 给静态 HTML 中的 <i data-icon> 填充 SVG */
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    if (el.dataset.rendered !== el.dataset.icon) {
      el.innerHTML = svg(el.dataset.icon);
      el.dataset.rendered = el.dataset.icon;
    }
  });
}

export function setIcon(el, name) {
  const i = el.matches('i[data-icon]') ? el : el.querySelector('i[data-icon]');
  if (!i) return;
  i.dataset.icon = name;
  i.innerHTML = svg(name);
  i.dataset.rendered = name;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtCount(n) {
  if (!n) return '';
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}万`;
  return String(n);
}

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export const artistNames = (song) => (song.artists || []).map((a) => a.name).join(' / ') || '未知歌手';

export const SOURCE_NAME = { netease: '网易云', kugou: '酷狗', kuwo: '酷我', bilibili: 'B站', douyin: '抖音', qishui: '汽水音乐' };

let toastBox;
export function toast(message, ms = 2600) {
  toastBox ||= document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, ms);
}

/** 其它平台的搜索直达链接 */
export function platformLinks(keyword) {
  const q = encodeURIComponent(keyword);
  return [
    ['网易云音乐', `https://music.163.com/#/search/m/?s=${q}&type=1`],
    ['QQ音乐', `https://y.qq.com/n/ryqq/search?w=${q}&t=song`],
    ['酷狗音乐', `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${q}`],
    ['酷我音乐', `https://www.kuwo.cn/search/list?key=${q}`],
    ['抖音', `https://www.douyin.com/search/${q}`],
    ['汽水音乐 · 客户端入口', 'https://www.qishui.com/'],
    ['Spotify', `https://open.spotify.com/search/${q}`],
    ['YouTube Music', `https://music.youtube.com/search?q=${q}`],
    ['哔哩哔哩', `https://search.bilibili.com/all?keyword=${q}`],
  ];
}
