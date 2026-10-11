// 入口：路由、事件委托、播放栏、歌词页、播放队列、主题

import { api } from './api.js';
import { store, songKey } from './store.js';
import { player, restoreQueue } from './player.js';
import { mergeLyric, activeIndex } from './lyric.js';
import { hydrateIcons, setIcon, esc, fmtTime, artistNames, toast, SOURCE_NAME, platformLinks, icon } from './ui.js';
import * as V from './views.js';
import { desktopLyric } from './desktop-lyric.js';
import './avail.js';
import { qualityLabel } from './quality.js';
import './deployment.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const main = $('main');

// ================= 路由 =================

const routes = [
  [/^\/?$/, 'home', (el, alive) => V.homeView(el, alive)],
  [/^\/charts$/, 'charts', (el, alive) => V.chartsView(el, alive)],
  [/^\/playlist\/(\d+)$/, 'charts', (el, alive, id) => V.playlistView(el, alive, id)],
  [/^\/search\/(.*)$/, 'search', (el, alive, q) => V.searchView(el, alive, decodeURIComponent(q))],
  [/^\/search$/, 'search', (el, alive) => V.searchView(el, alive, '')],
  [/^\/foryou$/, 'foryou', (el, alive) => V.forYouView(el, alive)],
  [/^\/likes$/, 'likes', (el) => V.likesView(el)],
  [/^\/history$/, 'history', (el) => V.historyView(el)],
];

let renderId = 0;
let currentNav = '';

function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  const id = ++renderId;
  const alive = () => id === renderId;
  for (const [re, nav, render] of routes) {
    const m = path.match(re);
    if (!m) continue;
    currentNav = nav;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav || (nav === 'history' && a.dataset.nav === 'likes' && a.closest('.tabbar'))));
    view.style.animation = 'none';
    void view.offsetWidth;
    view.style.animation = '';
    main.scrollTop = 0;
    render(view, alive, ...m.slice(1));
    return;
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

// 数据变化时刷新依赖本地数据的页面
store.subscribe((what) => {
  if ((what === 'likes' && currentNav === 'likes') || (what === 'history' && currentNav === 'history')) {
    const y = main.scrollTop;
    route();
    main.scrollTop = y;
  }
});

// ================= 搜索框 =================

const searchInput = $('searchInput');
$('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
  searchInput.blur();
});

// ================= 事件委托：歌曲列表与按钮 =================

document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  const row = e.target.closest('.song[data-list]');

  if (act) {
    const a = act.dataset.act;
    if (a === 'play-playlist') {
      e.preventDefault();
      e.stopPropagation();
      return V.playPlaylist(act.dataset.id);
    }
    if (a === 'play-all') {
      const songs = V.getList(act.dataset.list);
      if (songs?.length) player.playList(songs, 0);
      return;
    }
    if (a === 'clear-history') {
      if (confirm('确定清空所有播放记录吗？推荐将重新开始学习你的喜好。')) {
        store.clearHistory();
        V.invalidateRecommend();
      }
      return;
    }
    if (row) {
      const song = V.getList(row.dataset.list)?.[row.dataset.i];
      if (!song) return;
      if (a === 'play') return playFromRow(row);
      if (a === 'like') return toggleLike(song, act);
      if (a === 'next') return player.playNext(song);
      if (a === 'dislike') {
        store.dislike(song);
        V.invalidateRecommend();
        row.style.transition = 'opacity .3s, transform .3s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(20px)';
        setTimeout(() => row.remove(), 300);
        toast('好的，将减少此类推荐');
        return;
      }
    }
  }

  // 点击行的空白处直接播放（链接与按钮除外）
  if (row && !e.target.closest('a, button')) playFromRow(row);
});

function playFromRow(row) {
  const songs = V.getList(row.dataset.list);
  const i = Number(row.dataset.i);
  if (!songs) return;
  const cur = player.current && songKey(player.current);
  if (cur === songKey(songs[i])) return player.toggle();
  player.playList(songs, i);
}

function toggleLike(song, btn) {
  const liked = store.toggleLike(song);
  V.invalidateRecommend();
  if (btn) btn.classList.toggle('on', liked);
  syncLikeButtons();
  toast(liked ? '已添加到我喜欢' : '已取消喜欢');
}

function syncLikeButtons() {
  const cur = player.current;
  $('pLike').classList.toggle('on', !!cur && store.isLiked(cur));
  document.querySelectorAll('.song[data-key]').forEach((row) => {
    const s = V.getList(row.dataset.list)?.[row.dataset.i];
    const b = row.querySelector('[data-act="like"]');
    if (s && b) b.classList.toggle('on', store.isLiked(s));
  });
}

// ================= 播放栏 =================

const pPlay = $('pPlay');
const pSeek = $('pSeek');
const pVol = $('pVol');
let seeking = false;

const setRange = (el, ratio) => el.style.setProperty('--p', `${Math.max(0, Math.min(1, ratio)) * 100}%`);

function markPlaying() {
  const k = player.current ? songKey(player.current) : '';
  document.querySelectorAll('.song[data-key]').forEach((el) => el.classList.toggle('playing', el.dataset.key === k));
}

player.on('song', (s) => {
  $('player').dataset.empty = s ? 'false' : 'true';
  $('pTitle').textContent = s ? s.name : '还没有播放的歌曲';
  $('pSub').textContent = s ? artistNames(s) : '搜索或从榜单中挑一首吧';
  const cover = $('pCover');
  if (s?.cover) cover.src = s.cover;
  else cover.removeAttribute('src');
  $('pKind').hidden = true;
  $('pCur').textContent = '0:00';
  $('pDur').textContent = s?.duration ? fmtTime(s.duration / 1000) : '0:00';
  pSeek.value = 0;
  setRange(pSeek, 0);
  document.title = s ? `${s.name} - ${artistNames(s)} · 音隅` : '音隅 · 聚合音乐';
  if (!s || songKey(s) !== lyricFor) {
    lyricFor = '';
    lyricLines = [];
    lyricActive = -1;
    $('lyricsInner').innerHTML = `<p class="lyric-empty">${s ? '歌词加载中…' : ''}</p>`;
    desktopLyric.setLyric([], s ? '歌词加载中…' : '');
  }
  syncLikeButtons();
  markPlaying();
  renderQueue();
  updateNowPlaying();
});

player.on('info', (info) => {
  const kind = $('pKind');
  kind.hidden = false;
  if (info.kind === 'preview') {
    kind.className = 'badge preview';
    kind.textContent = `试听 · ${SOURCE_NAME[info.via] || info.via}`;
  } else {
    kind.className = 'badge full';
    kind.textContent = `${SOURCE_NAME[info.via] || info.via} · ${info.media === 'video' ? '视频音轨 · ' : ''}音质${qualityLabel(info.quality)}`;
  }
  kind.title = info.matched ? `匹配到：${info.matched.name} - ${artistNames(info.matched)}` : '';
  loadLyric(player.current, info);
});

player.on('state', () => {
  const playing = player.playing;
  document.body.classList.toggle('is-playing', playing);
  setIcon(pPlay, playing ? 'pause' : 'play');
  pPlay.title = playing ? '暂停' : '播放';
});

player.on('loading', (v) => {
  pPlay.classList.toggle('loading', v);
  if (v) setIcon(pPlay, 'loader');
  else setIcon(pPlay, player.playing ? 'pause' : 'play');
});

player.on('time', () => {
  const t = player.time;
  const d = player.duration;
  if (!seeking) {
    pSeek.value = d ? (t / d) * 1000 : 0;
    setRange(pSeek, d ? t / d : 0);
    $('pCur').textContent = fmtTime(t);
  }
  $('pDur').textContent = fmtTime(d);
  $('miniProgress').firstElementChild.style.width = `${d ? (t / d) * 100 : 0}%`;
  syncLyric(t);
});

player.on('unavailable', (s) => {
  document.querySelectorAll(`.song[data-key="${CSS.escape(songKey(s))}"]`).forEach((el) => el.classList.add('unavailable'));
});

pPlay.addEventListener('click', () => player.toggle());
$('pPrev').addEventListener('click', () => player.prev());
$('pNext').addEventListener('click', () => player.next());
$('pLike').addEventListener('click', () => player.current && toggleLike(player.current));

pSeek.addEventListener('input', () => {
  seeking = true;
  const ratio = pSeek.value / 1000;
  setRange(pSeek, ratio);
  $('pCur').textContent = fmtTime(ratio * player.duration);
});
pSeek.addEventListener('change', () => {
  player.seek((pSeek.value / 1000) * player.duration);
  seeking = false;
});

const MODE_META = { loop: ['repeat', '列表循环'], one: ['repeat-one', '单曲循环'], shuffle: ['shuffle', '随机播放'] };
function renderMode() {
  const [ic, label] = MODE_META[player.mode];
  setIcon($('pMode'), ic);
  $('pMode').title = label;
  $('pMode').classList.toggle('on', player.mode !== 'loop');
}
$('pMode').addEventListener('click', () => {
  player.cycleMode();
  toast(MODE_META[player.mode][1]);
});
player.on('mode', renderMode);

function renderVolume() {
  const v = player.volume;
  pVol.value = Math.round(v * 100);
  setRange(pVol, v);
  setIcon($('pMute'), v === 0 ? 'mute' : 'volume');
}
pVol.addEventListener('input', () => player.setVolume(pVol.value / 100));
$('pMute').addEventListener('click', () => player.toggleMute());
player.on('volume', renderVolume);

// ================= 正在播放 & 歌词 =================

const now = $('now');
let lyricLines = [];
let lyricActive = -1;
let lyricFor = '';

function openNow() {
  if (!player.current) return;
  now.hidden = false;
  now.classList.remove('closing');
  updateNowPlaying();
  centerLyric(true);
}
function closeNow() {
  if (now.hidden) return;
  now.classList.add('closing');
  now.addEventListener('animationend', () => {
    now.hidden = true;
    now.classList.remove('closing');
  }, { once: true });
}
$('openNow').addEventListener('click', openNow);
$('pLyricBtn').addEventListener('click', () => (now.hidden ? openNow() : closeNow()));
$('nowClose').addEventListener('click', closeNow);
// 移动端：点击播放栏信息区展开
document.querySelector('.player-meta').addEventListener('click', () => matchMedia('(max-width: 820px)').matches && openNow());

function updateNowPlaying() {
  const s = player.current;
  if (!s) return closeNow();
  $('nowCover').src = s.cover || '/favicon.svg';
  $('nowBg').style.backgroundImage = s.cover ? `url("${s.cover}")` : 'none';
  $('nowTitle').textContent = s.name;
  $('nowSub').textContent = [artistNames(s), s.album].filter(Boolean).join(' · ');
  const links = [];
  if (s.link) links.push(`<a class="chip" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">在${SOURCE_NAME[s.source]}打开${icon('link')}</a>`);
  const kw = `${s.name} ${s.artists?.[0]?.name || ''}`.trim();
  for (const [name, url] of platformLinks(kw).filter(([n]) => !n.startsWith(SOURCE_NAME[s.source])).slice(0, 4)) {
    links.push(`<a class="chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${name}${icon('link')}</a>`);
  }
  $('nowLinks').innerHTML = links.join('');
}

async function loadLyric(song, info) {
  const k = songKey(song);
  if (lyricFor === k) return;
  lyricFor = k;
  lyricLines = [];
  lyricActive = -1;
  const box = $('lyricsInner');
  box.innerHTML = '<p class="lyric-empty">歌词加载中…</p>';
  try {
    const params = song.source === 'netease'
      ? { id: song.id }
      : info?.lyricId ? { id: info.lyricId }
      // B 站的「歌手」是 UP 主，只按歌名找歌词
      : { name: song.name, artist: song.source === 'bilibili' ? '' : song.artists?.[0]?.name };
    const data = await api.lyric(params);
    if (lyricFor !== k) return;
    lyricLines = mergeLyric(data.lrc, data.tlyric);
    desktopLyric.setLyric(lyricLines, data.pure ? '纯音乐，请欣赏' : '暂无歌词');
    box.innerHTML = lyricLines.length
      ? lyricLines.map((l, i) => `<p class="lyric-line" data-i="${i}">${esc(l.text)}${l.trans ? `<small>${esc(l.trans)}</small>` : ''}</p>`).join('')
      : `<p class="lyric-empty">${data.pure ? '纯音乐，请欣赏' : '暂无歌词'}</p>`;
    syncLyric(player.time, true);
  } catch {
    if (lyricFor === k) {
      box.innerHTML = '<p class="lyric-empty">暂无歌词</p>';
      desktopLyric.setLyric([], '暂无歌词');
    }
  }
}

function syncLyric(t, force = false) {
  if (!lyricLines.length) return;
  const i = activeIndex(lyricLines, t);
  if (i === lyricActive && !force) return;
  const box = $('lyricsInner');
  box.querySelector('.lyric-line.active')?.classList.remove('active');
  lyricActive = i;
  if (i >= 0) box.querySelector(`[data-i="${i}"]`)?.classList.add('active');
  centerLyric(force);
}

let userScrollUntil = 0;
function centerLyric(instant) {
  if (now.hidden || Date.now() < userScrollUntil) return;
  const wrap = $('lyrics');
  const line = wrap.querySelector('.lyric-line.active');
  if (!line) return;
  const top = line.offsetTop - wrap.clientHeight / 2 + line.clientHeight / 2;
  wrap.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
}
// 用户手动滚动歌词时，暂停自动居中 3 秒
$('lyrics').addEventListener('wheel', () => (userScrollUntil = Date.now() + 3000), { passive: true });
$('lyrics').addEventListener('touchmove', () => (userScrollUntil = Date.now() + 3000), { passive: true });
$('lyrics').addEventListener('click', (e) => {
  const line = e.target.closest('.lyric-line');
  if (!line) return;
  userScrollUntil = 0;
  player.seek(lyricLines[line.dataset.i].t);
});

// ================= 桌面歌词 =================

$('pDeskLyric').addEventListener('click', () => desktopLyric.toggle());
desktopLyric.onChange((open) => {
  $('pDeskLyric').classList.toggle('on', open);
  $('pDeskLyric').title = open ? '关闭桌面歌词 (D)' : '桌面歌词 (D)';
});

// ================= 播放队列 =================

const queue = $('queue');
$('pQueueBtn').addEventListener('click', () => {
  queue.hidden = !queue.hidden;
  if (!queue.hidden) {
    renderQueue();
    queue.querySelector('li.current')?.scrollIntoView({ block: 'center' });
  }
});
$('queueClose').addEventListener('click', () => (queue.hidden = true));
$('queueClear').addEventListener('click', () => player.clear());

function renderQueue() {
  if (queue.hidden) return;
  $('queueCount').textContent = player.queue.length ? `${player.queue.length} 首` : '';
  $('queueList').innerHTML = player.queue.length
    ? player.queue
        .map(
          (s, i) => `<li class="${i === player.index ? 'current' : ''}" data-qi="${i}">
            <div class="q-text"><div class="q-name">${esc(s.name)}</div><div class="q-artist">${esc(artistNames(s))}</div></div>
            <button class="icon-btn sm" data-qremove="${i}" title="移除">${icon('close')}</button></li>`,
        )
        .join('')
    : '<li style="cursor:default;color:var(--text-3)">播放列表是空的</li>';
}
player.on('queue', renderQueue);
$('queueList').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-qremove]');
  if (rm) return player.remove(Number(rm.dataset.qremove));
  const li = e.target.closest('[data-qi]');
  if (li) player.playList(player.queue, Number(li.dataset.qi));
});

// ================= 主题 =================

function applyTheme() {
  const t = store.get('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const btn of [$('themeBtn'), $('themeBtnMobile')]) {
    setIcon(btn, dark ? 'sun' : 'moon');
    const label = btn.querySelector('span');
    if (label) label.textContent = dark ? '浅色模式' : '深色模式';
  }
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  store.set('theme', dark ? 'light' : 'dark');
  applyTheme();
}
$('themeBtn').addEventListener('click', toggleTheme);
$('themeBtnMobile').addEventListener('click', toggleTheme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ================= 键盘快捷键 =================

document.addEventListener('keydown', (e) => {
  if (e.target.closest('dialog[open]')) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (typing) return e.target.blur();
    if (!queue.hidden) return (queue.hidden = true);
    return closeNow();
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  } else if (e.key === ' ') {
    e.preventDefault();
    player.toggle();
  } else if (e.key === 'ArrowRight' && e.shiftKey) player.next();
  else if (e.key === 'ArrowLeft' && e.shiftKey) player.prev();
  else if (e.key === 'ArrowRight') player.seek(player.time + 5);
  else if (e.key === 'ArrowLeft') player.seek(player.time - 5);
  else if (e.key.toLowerCase() === 'l') now.hidden ? openNow() : closeNow();
  else if (e.key.toLowerCase() === 'd') desktopLyric.toggle();
});

// ================= 启动 =================

hydrateIcons();
applyTheme();
renderMode();
renderVolume();
restoreQueue();
route();
