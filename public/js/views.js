// 各页面视图

import { api } from './api.js';
import { store, songKey } from './store.js';
import { player } from './player.js';
import { icon, esc, fmtTime, fmtCount, fmtDate, artistNames, SOURCE_NAME, platformLinks, toast } from './ui.js';

// ---------- 歌曲列表（行渲染 + 列表注册，供事件委托使用） ----------

const lists = new Map();
let seq = 0;
export function registerList(songs) {
  const id = `l${++seq}`;
  lists.set(id, songs);
  if (lists.size > 40) lists.delete(lists.keys().next().value);
  return id;
}
export const getList = (id) => lists.get(id);

const coverImg = (s, cls = 'song-cover') =>
  s.cover
    ? `<img class="${cls}" src="${esc(s.cover)}" alt="" loading="lazy" />`
    : `<div class="${cls} ph">${icon('music')}</div>`;

const artistLinks = (s) =>
  (s.artists || []).length
    ? s.artists.map((a) => `<a href="#/search/${encodeURIComponent(a.name)}">${esc(a.name)}</a>`).join(' / ')
    : '未知歌手';

function sourceTags(s) {
  const alts = s.alts || [{ source: s.source, link: s.link }];
  return alts
    .map((a) =>
      a.link
        ? `<a class="src src-${a.source}" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer" title="在${SOURCE_NAME[a.source]}打开">${SOURCE_NAME[a.source]}</a>`
        : `<span class="src src-${a.source}">${SOURCE_NAME[a.source]}</span>`,
    )
    .join('');
}

/**
 * @param {object[]} songs
 * @param {{album?: boolean, note?: (s)=>string, top?: boolean, dislike?: boolean, head?: boolean}} opt
 *   note: 替代专辑列显示的说明文字（推荐理由、播放次数）
 */
export function songList(songs, opt = {}) {
  const { album = true, note, top = false, dislike = false, head = true } = opt;
  const id = registerList(songs);
  const cur = player.current ? songKey(player.current) : '';
  const rows = songs
    .map((s, i) => {
      const k = songKey(s);
      const third = note ? `<span class="song-reason">${esc(note(s) || '')}</span>` : esc(s.album);
      return `
      <div class="song${k === cur ? ' playing' : ''}${s.unavailable ? ' unavailable' : ''}" data-list="${id}" data-i="${i}" data-key="${esc(k)}">
        <div class="song-idx${top && i < 3 ? ' top' : ''}">
          <span class="idx-num">${String(i + 1).padStart(2, '0')}</span>
          <button class="idx-play" data-act="play" title="播放">${icon('play')}</button>
          <span class="eq"><span></span><span></span><span></span></span>
        </div>
        <div class="song-main">
          ${coverImg(s)}
          <div class="song-text">
            <div class="song-name"><span title="${esc(s.title || s.name)}">${esc(s.name)}</span><span class="avail-slot"></span></div>
            <div class="song-artist">${artistLinks(s)}</div>
          </div>
        </div>
        <div class="song-album" title="${esc(note ? note(s) : s.album)}">${third}</div>
        <div class="song-srcs">${sourceTags(s)}</div>
        <div class="song-dur">${s.duration ? fmtTime(s.duration / 1000) : '--:--'}</div>
        <div class="song-acts">
          <button class="icon-btn sm${store.isLiked(s) ? ' on' : ''}" data-act="like" title="喜欢">${icon('heart')}</button>
          ${dislike
            ? `<button class="icon-btn sm" data-act="dislike" title="不感兴趣">${icon('ban')}</button>`
            : `<button class="icon-btn sm" data-act="next" title="下一首播放">${icon('plus')}</button>`}
          ${s.link ? `<a class="icon-btn sm act-link" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer" title="去${SOURCE_NAME[s.source]}收听">${icon('link')}</a>` : ''}
        </div>
      </div>`;
    })
    .join('');
  const header = head
    ? `<div class="list-head"><span>#</span><span>歌曲</span><span class="h-album">${note ? '' : '专辑'}</span><span class="h-src">来源</span><span class="h-dur r">时长</span><span></span></div>`
    : '';
  return `<div class="songs${album || note ? '' : ' no-album'}">${header}${rows}</div>`;
}

function compactSongs(songs) {
  const id = registerList(songs);
  return `<div class="grid-songs">${songs
    .map(
      (s, i) => `
      <div class="song" data-list="${id}" data-i="${i}" data-key="${esc(songKey(s))}">
        <div class="song-main">
          <div class="song-cover-wrap">${coverImg(s)}<span class="cover-play">${icon('play')}</span></div>
          <div class="song-text">
            <div class="song-name"><span>${esc(s.name)}</span><span class="avail-slot"></span></div>
            <div class="song-artist">${artistLinks(s)}</div>
          </div>
        </div>
        <div class="song-dur">${s.duration ? fmtTime(s.duration / 1000) : ''}</div>
      </div>`,
    )
    .join('')}</div>`;
}

const playlistCards = (lists) =>
  `<div class="cards">${lists
    .map(
      (p) => `
      <a class="card" href="#/playlist/${p.id}">
        <div class="card-cover">
          <img src="${esc(p.cover)}" alt="" loading="lazy" />
          ${p.playCount ? `<span class="card-count">${icon('headphones')}${fmtCount(p.playCount)}</span>` : ''}
          <span class="card-play" data-act="play-playlist" data-id="${p.id}">${icon('play')}</span>
        </div>
        <div class="card-title">${esc(p.name)}</div>
        ${p.copywriter ? `<div class="card-sub">${esc(p.copywriter)}</div>` : ''}
      </a>`,
    )
    .join('')}</div>`;

const chartCards = (charts) =>
  `<div class="charts">${charts
    .map(
      (c) => `
      <a class="chart" href="#/playlist/${c.id}">
        <div class="chart-cover"><img src="${esc(c.cover)}" alt="" loading="lazy" /><span>${c.updateTime ? `${fmtDate(c.updateTime)}更新` : ''}</span></div>
        <div class="chart-body">
          <h3>${esc(c.name)}</h3>
          <ol>${c.top
            .map((s, i) => `<li><b>${i + 1}</b><span>${esc(s.name)} <em>- ${esc(artistNames(s))}</em></span></li>`)
            .join('')}</ol>
        </div>
      </a>`,
    )
    .join('')}</div>`;

const section = (title, body, { sub = '', more = '', actions = '' } = {}) => `
  <section class="section">
    <div class="section-head"><h2>${title}</h2>${sub ? `<span class="muted">${sub}</span>` : ''}${actions}
      ${more ? `<a class="more" href="${more}">更多${icon('right')}</a>` : ''}</div>
    ${body}
  </section>`;

const empty = (ic, title, text = '') => `<div class="empty">${icon(ic)}<h3>${title}</h3>${text ? `<p>${text}</p>` : ''}</div>`;

const errorBox = (err) => empty('info', '加载失败', `${esc(err.message)}。稍后刷新重试。`);

const skRows = (n = 8) => Array.from({ length: n }, () => '<div class="skeleton sk-row"></div>').join('');
const skCards = (n = 6) =>
  `<div class="cards">${Array.from({ length: n }, () => '<div><div class="skeleton sk-card"></div><div class="skeleton sk-line"></div></div>').join('')}</div>`;

// ---------- 发现 ----------

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export async function homeView(el, alive) {
  const d = new Date();
  const week = '日一二三四五六'[d.getDay()];
  const recent = store.get('history').slice(0, 6).map((h) => h.song);
  el.innerHTML = `
    <div class="hero">
      <h1>${greeting()}</h1>
      <p>${d.getMonth() + 1}月${d.getDate()}日 · 星期${week} · 一处搜遍各大平台，听见喜欢的声音</p>
    </div>
    ${recent.length ? section('继续收听', compactSongs(recent), { more: '#/history' }) : ''}
    <div id="homePl">${section('推荐歌单', skCards(6), { sub: '来自网易云音乐' })}</div>
    <div id="homeRest">${section('新歌速递', skRows(4))}</div>`;

  try {
    const data = await api.discover();
    if (!alive()) return;
    el.querySelector('#homePl').innerHTML = section(
      '推荐歌单',
      data.playlists.length ? playlistCards(data.playlists.slice(0, 12)) : empty('music', '暂无推荐歌单'),
      { sub: '来自网易云音乐' },
    );
    el.querySelector('#homeRest').innerHTML =
      (data.newSongs.length ? section('新歌速递', compactSongs(data.newSongs)) : '') +
      (data.toplists.length ? section('排行榜', chartCards(data.toplists), { more: '#/charts' }) : '');
  } catch (err) {
    if (alive()) el.querySelector('#homeRest').innerHTML = errorBox(err);
  }
}

// ---------- 排行榜 ----------

export async function chartsView(el, alive) {
  el.innerHTML = `<div class="hero"><h1>排行榜</h1><p>网易云音乐官方榜单，每日更新</p></div><div id="chartsBody">${skRows(6)}</div>`;
  try {
    const charts = await api.toplists();
    if (!alive()) return;
    el.querySelector('#chartsBody').innerHTML = chartCards(charts);
  } catch (err) {
    if (alive()) el.querySelector('#chartsBody').innerHTML = errorBox(err);
  }
}

// ---------- 歌单 / 榜单详情 ----------

export async function playlistView(el, alive, id) {
  el.innerHTML = `<div class="detail-head"><div class="detail-cover skeleton"></div><div class="detail-info" style="flex:1"><div class="skeleton sk-line" style="width:30%"></div><div class="skeleton sk-line" style="height:30px;width:50%"></div></div></div>${skRows(10)}`;
  try {
    const pl = await api.playlist(id);
    if (!alive()) return;
    const isChart = /榜/.test(pl.name);
    const listHtml = songList(pl.tracks, { top: isChart });
    const listId = listHtml.match(/data-list="(l\d+)"/)?.[1];
    el.innerHTML = `
      <div class="detail-head">
        <div class="detail-cover"><img src="${esc(pl.cover)}" alt="" /></div>
        <div class="detail-info">
          <div class="kicker">${isChart ? '排行榜' : '歌单'}${pl.updateTime ? ` · ${fmtDate(pl.updateTime)}更新` : ''}</div>
          <h1>${esc(pl.name)}</h1>
          <p>${esc(pl.description || (pl.creator ? `by ${pl.creator}` : ''))}</p>
          <div class="detail-actions">
            <button class="btn" data-act="play-all" data-list="${listId}">${icon('play')}播放全部</button>
            <a class="btn secondary" href="https://music.163.com/#/playlist?id=${esc(pl.id)}" target="_blank" rel="noopener noreferrer">${icon('link')}网易云打开</a>
          </div>
        </div>
      </div>
      ${pl.tracks.length ? listHtml : empty('music', '歌单是空的')}`;
  } catch (err) {
    if (alive()) el.innerHTML = errorBox(err);
  }
}

// ---------- 搜索 ----------

const SOURCE_ORDER = ['netease', 'kugou', 'kuwo', 'bilibili', 'douyin', 'qishui'];
const norm = (s = '') => s.toLowerCase().replace(/[\s·・,，.。'"!！?？&、/-]/g, '');

/** 合并多平台结果：同名同歌手合为一条，保留各平台链接，优先使用可免费完整播放的音源 */
export function mergeResults(results) {
  const groups = new Map();
  const max = Math.max(0, ...SOURCE_ORDER.map((s) => results[s]?.songs?.length || 0));
  for (let i = 0; i < max; i++) {
    for (const src of SOURCE_ORDER) {
      const s = results[src]?.songs?.[i];
      if (!s) continue;
      const k = `${norm(s.name)}|${norm(s.artists?.[0]?.name)}`;
      const g = groups.get(k);
      if (!g) groups.set(k, { primary: s, alts: [{ source: s.source, link: s.link }], sources: new Set([src]) });
      else if (!g.sources.has(src)) {
        g.sources.add(src);
        g.alts.push({ source: s.source, link: s.link });
        const better =
          (s.source === 'netease' && s.fee !== 'vip' && !(g.primary.source === 'netease' && g.primary.fee !== 'vip')) ||
          (!g.primary.cover && s.cover && g.primary.source !== 'netease');
        if (better) g.primary = { ...s, cover: s.cover || g.primary.cover };
        else if (!g.primary.cover && s.cover) g.primary = { ...g.primary, cover: s.cover };
      }
    }
  }
  return [...groups.values()].map((g) => ({ ...g.primary, alts: g.alts }));
}

let lastSearch = { q: '', data: null, tab: 'all' };

export async function searchView(el, alive, q) {
  q = q.trim();
  const input = document.getElementById('searchInput');
  if (input && document.activeElement !== input) input.value = q;
  if (!q) {
    el.innerHTML = empty('search', '搜点什么吧', '搜索网易云、酷狗、酷我、B站，或前往抖音与汽水音乐官方入口');
    return;
  }
  el.innerHTML = `
    <div class="search-head"><h1>「<em>${esc(q)}</em>」的搜索结果</h1></div>
    <div id="searchBody">${skRows(10)}</div>`;

  let data = lastSearch.q === q ? lastSearch.data : null;
  try {
    data ||= await api.search(q);
  } catch (err) {
    if (alive()) el.querySelector('#searchBody').innerHTML = errorBox(err);
    return;
  }
  if (!alive()) return;
  if (lastSearch.q !== q) lastSearch = { q, data, tab: 'all' };

  const merged = mergeResults(data.results);
  const render = () => {
    const tab = lastSearch.tab;
    const songs = tab === 'all' ? merged : data.results[tab]?.songs || [];
    const failed = tab !== 'all' && data.results[tab] && !data.results[tab].ok;
    const external = data.results[tab]?.status === 'external';
    const tabs = [['all', '全部', merged.length], ...SOURCE_ORDER.filter((s) => data.results[s]).map((s) => [s, SOURCE_NAME[s], data.results[s].status === 'external' ? '官方入口' : data.results[s].songs.length, !data.results[s].ok])];
    el.querySelector('#searchBody').innerHTML = `
      <div class="tabs" role="tablist">${tabs
        .map(([k, label, n, err]) => `<button class="tab${k === tab ? ' active' : ''}${err ? ' err' : ''}" data-tab="${k}" role="tab" aria-selected="${k === tab}">${label}<small>${err ? '失败' : n}</small></button>`)
        .join('')}</div>
      ${tab === 'all' ? `<div class="notice">${icon('info')}<span>点击歌名旁的资源标签，查看并选择免费资源与音质。原平台为 VIP 的歌曲也会查找其他平台公开的免费版本。视频音轨可能与录音室版本不同；抖音与汽水音乐目前提供官方入口。</span></div>` : ''}
      ${external ? `<div class="notice">${icon('info')}<span>${esc(data.results[tab].message)}。<a href="${esc(data.results[tab].link)}" target="_blank" rel="noopener noreferrer">打开${esc(SOURCE_NAME[tab])}</a></span></div>` : ''}
      ${failed ? `<div class="notice">${icon('info')}<span>${SOURCE_NAME[tab]}暂时无法访问：${esc(data.results[tab].error)}</span></div>` : ''}
      ${songs.length ? songList(songs) : failed || external ? '' : empty('search', '没有找到相关歌曲', '换个关键词试试，或在下方的平台中直接搜索')}
      <div class="elsewhere">
        <h3>在其他平台查找「${esc(q)}」</h3>
        <p>打开官方搜索页或客户端入口</p>
        <div class="chips">${platformLinks(q)
          .map(([name, url]) => `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${name}${icon('link')}</a>`)
          .join('')}</div>
      </div>`;
  };
  render();
  el.querySelector('#searchBody').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    lastSearch.tab = t.dataset.tab;
    render();
  });
}

// ---------- 为你推荐 ----------

let recCache = null; // { key, data, page }

export async function forYouView(el, alive) {
  const history = store.get('history');
  const likes = store.get('likes');
  const dislikes = store.get('dislikes');
  const totalPlays = history.reduce((n, h) => n + (h.plays || 0), 0);

  el.innerHTML = `
    <div class="hero"><h1>为你推荐</h1><p>根据你的收听与收藏偏好，每次都更懂你一点</p></div>
    <div class="profile">
      <div class="panel"><h3>${icon('sparkle')}你的音乐画像</h3><div class="taste" id="taste"><div class="skeleton sk-line" style="width:80%"></div></div></div>
      <div class="panel"><h3>${icon('headphones')}听歌足迹</h3>
        <div class="stats">
          <div class="stat"><b>${history.length}</b><span>听过的歌</span></div>
          <div class="stat"><b>${totalPlays}</b><span>累计播放</span></div>
          <div class="stat"><b>${likes.length}</b><span>收藏</span></div>
        </div>
      </div>
    </div>
    <div id="recBody">${section('猜你喜欢', skRows(8))}</div>
    <div id="recPl"></div>`;

  // 网易云推荐歌单（与个性化推荐并行加载）
  api.discover().then((d) => {
    if (alive() && d.playlists.length)
      el.querySelector('#recPl').innerHTML = section('网易云 · 推荐歌单', playlistCards(d.playlists.slice(0, 6)), { more: '#/' });
  }).catch(() => {});

  const key = `${history.length}:${history[0]?.lastPlayed || 0}:${likes.length}:${dislikes.length}`;
  let data = recCache?.key === key ? recCache.data : null;
  try {
    data ||= await api.recommend({
      history: history.slice(0, 200).map(({ song, plays, skips, lastPlayed }) => ({ song, plays, skips, lastPlayed })),
      likes: likes.slice(0, 200),
      dislikes: dislikes.slice(0, 200),
    });
  } catch (err) {
    if (alive()) {
      el.querySelector('#recBody').innerHTML = errorBox(err);
      el.querySelector('#taste').innerHTML = '';
    }
    return;
  }
  if (!alive()) return;
  if (recCache?.key !== key) recCache = { key, data, page: 0 };

  const artists = data.profile.artists;
  el.querySelector('#taste').innerHTML = artists.length
    ? artists.map((a) => `<a href="#/search/${encodeURIComponent(a.name)}" style="--w:${a.score}">${esc(a.name)}</a>`).join('')
    : `<span class="empty-taste">还没有足够的听歌记录。随便听几首、点几个喜欢，画像就会慢慢清晰起来。</span>`;

  const PAGE = 20;
  const render = () => {
    const pages = Math.max(1, Math.ceil(data.songs.length / PAGE));
    const page = recCache.page % pages;
    const songs = data.songs.slice(page * PAGE, page * PAGE + PAGE);
    const listHtml = songList(songs, { note: (s) => s.reason, dislike: true });
    const listId = listHtml.match(/data-list="(l\d+)"/)?.[1];
    el.querySelector('#recBody').innerHTML = section(
      data.coldStart ? '热门推荐' : '猜你喜欢',
      songs.length ? listHtml : empty('sparkle', '暂时没有新的推荐', '去搜索或排行榜里多听几首吧'),
      {
        sub: data.coldStart ? '先从大家都在听的开始' : `基于 ${data.profile.songCount} 首你喜欢的歌`,
        actions: `<span style="margin-left:auto;display:flex;gap:8px">
          ${pages > 1 ? `<button class="btn secondary" data-act="rec-more">${icon('refresh')}换一批</button>` : ''}
          ${songs.length ? `<button class="btn" data-act="play-all" data-list="${listId}">${icon('play')}播放全部</button>` : ''}</span>`,
      },
    );
  };
  render();
  el.querySelector('#recBody').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="rec-more"]')) {
      recCache.page++;
      render();
    }
  });
}

/** 推荐缓存失效（例如点了不感兴趣） */
export function invalidateRecommend() {
  recCache = null;
}

// ---------- 我喜欢 / 最近播放 ----------

export function likesView(el) {
  const likes = store.get('likes');
  const listHtml = likes.length ? songList(likes) : '';
  const listId = listHtml.match(/data-list="(l\d+)"/)?.[1];
  el.innerHTML = `
    <div class="hero"><h1>我喜欢</h1><p>${likes.length} 首收藏 · 收藏越多，推荐越准 · <a href="#/history" style="color:var(--accent)">最近播放 →</a></p></div>
    ${likes.length
      ? `<div class="detail-actions" style="margin-bottom:18px"><button class="btn" data-act="play-all" data-list="${listId}">${icon('play')}播放全部</button></div>${listHtml}`
      : empty('heart', '还没有收藏的歌曲', '点击歌曲旁的 ♡ 即可收藏')}`;
}

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return fmtDate(ts);
}

export function historyView(el) {
  const history = store.get('history');
  const meta = new Map(history.map((h) => [songKey(h.song), h]));
  const songs = history.map((h) => h.song);
  const listHtml = songs.length
    ? songList(songs, {
        note: (s) => {
          const h = meta.get(songKey(s));
          return h ? `${ago(h.lastPlayed)}${h.plays ? ` · 听了 ${h.plays} 次` : ''}` : '';
        },
      })
    : '';
  const listId = listHtml.match(/data-list="(l\d+)"/)?.[1];
  el.innerHTML = `
    <div class="hero"><h1>最近播放</h1><p>这些记录只保存在你的浏览器里，用于生成推荐</p></div>
    ${songs.length
      ? `<div class="detail-actions" style="margin-bottom:18px">
          <button class="btn" data-act="play-all" data-list="${listId}">${icon('play')}播放全部</button>
          <button class="btn secondary" data-act="clear-history">${icon('trash')}清空记录</button></div>${listHtml}`
      : empty('clock', '还没有播放记录', '听过的歌会出现在这里')}`;
}

/** 点击歌单卡片上的播放按钮：直接播放整个歌单 */
export async function playPlaylist(id) {
  try {
    const pl = await api.playlist(id);
    if (pl.tracks.length) {
      player.playList(pl.tracks, 0);
      toast(`开始播放「${pl.name}」`);
    }
  } catch (err) {
    toast(err.message);
  }
}
