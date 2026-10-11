// 播放器核心：队列、播放模式、音源解析、听歌行为记录（用于推荐）

import { api } from './api.js';
import { store, songKey, slim } from './store.js';
import { toast } from './ui.js';

const audio = document.getElementById('audio');
const listeners = new Map();
const emit = (ev, data) => (listeners.get(ev) || []).forEach((fn) => fn(data));

const URL_TTL = 10 * 60e3; // 音频地址有时效，缓存 10 分钟
const urlCache = new Map();

let token = 0;
let failStreak = 0;
let session = null; // { song, counted }

const MODES = ['loop', 'one', 'shuffle'];

export const player = {
  queue: [],
  index: -1,
  current: null,
  info: null,
  loading: false,
  mode: MODES.includes(store.get('mode')) ? store.get('mode') : 'loop',

  on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, []);
    listeners.get(ev).push(fn);
  },

  get playing() {
    return !audio.paused && !audio.ended;
  },
  get time() {
    return audio.currentTime || 0;
  },
  get duration() {
    return Number.isFinite(audio.duration) ? audio.duration : (this.current?.duration || 0) / 1000;
  },

  playList(songs, start = 0) {
    if (!songs.length) return;
    this.queue = songs.map(slim);
    emit('queue');
    load(start);
  },

  playSong(song) {
    const k = songKey(song);
    const i = this.queue.findIndex((s) => songKey(s) === k);
    if (i >= 0) return load(i);
    this.queue.splice(this.index + 1, 0, slim(song));
    emit('queue');
    load(this.index + 1);
  },

  playResource(song, resource, resources, statuses) {
    if (!resource?.url) return;
    primeUrl(song, { ...resource, resources, statuses });
    this.playSong(song);
  },

  playNext(song) {
    const k = songKey(song);
    const i = this.queue.findIndex((s) => songKey(s) === k);
    if (i === this.index && i >= 0) return;
    if (i >= 0) {
      this.queue.splice(i, 1);
      if (i < this.index) this.index--;
    }
    this.queue.splice(this.index + 1, 0, slim(song));
    emit('queue');
    toast('已添加到下一首播放');
    if (this.index < 0) load(0);
  },

  remove(i) {
    if (i === this.index) {
      this.queue.splice(i, 1);
      if (!this.queue.length) return this.clear();
      load(Math.min(i, this.queue.length - 1));
    } else {
      this.queue.splice(i, 1);
      if (i < this.index) this.index--;
    }
    emit('queue');
  },

  clear() {
    token++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    Object.assign(this, { queue: [], index: -1, current: null, info: null });
    emit('queue');
    emit('song', null);
    emit('state');
  },

  toggle() {
    if (!this.current) return;
    if (!audio.src || this.loading) return this.loading ? undefined : load(this.index);
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  },

  next() {
    if (!this.queue.length) return;
    load(pickNext(1));
  },
  prev() {
    if (!this.queue.length) return;
    if (audio.currentTime > 5) return this.seek(0);
    load(pickNext(-1));
  },

  seek(sec) {
    if (Number.isFinite(sec) && audio.src) audio.currentTime = Math.max(0, Math.min(sec, this.duration || sec));
  },

  setVolume(v) {
    audio.volume = Math.max(0, Math.min(1, v));
    if (audio.volume > 0 && audio.muted) audio.muted = false;
    store.set('volume', audio.volume);
    store.set('muted', audio.muted);
    emit('volume');
  },
  toggleMute() {
    audio.muted = !audio.muted;
    store.set('muted', audio.muted);
    emit('volume');
  },
  get volume() {
    return audio.muted ? 0 : audio.volume;
  },

  cycleMode() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    store.set('mode', this.mode);
    emit('mode');
    return this.mode;
  },
};

/** 预先写入音源缓存（来自列表的免费源查询） */
export function primeUrl(song, info) {
  if (info?.url) urlCache.set(songKey(song), { ...info, exp: Date.now() + URL_TTL });
}

function pickNext(dir) {
  const n = player.queue.length;
  if (player.mode === 'shuffle' && n > 1) {
    let r;
    do r = Math.floor(Math.random() * n);
    while (r === player.index);
    return r;
  }
  return (player.index + dir + n) % n;
}

function finalizeSession(auto) {
  // 播放不到 10 秒就被手动切走，记为「跳过」，推荐时降低权重
  if (!auto && session && !session.counted && audio.currentTime > 0 && audio.currentTime < 10) {
    store.recordSkip(session.song);
  }
  session = null;
}

async function load(i, { auto = false } = {}) {
  const n = player.queue.length;
  if (!n) return;
  finalizeSession(auto);
  const my = ++token;
  player.index = ((i % n) + n) % n;
  const song = player.queue[player.index];
  player.current = song;
  player.info = null;
  audio.pause();
  setLoading(true);
  emit('song', song);
  saveQueue();

  const key = songKey(song);
  let info = urlCache.get(key);
  if (!info || info.exp < Date.now()) {
    try {
      info = { ...(await api.play(song)), exp: Date.now() + URL_TTL };
    } catch (err) {
      info = { url: null, error: err.message };
    }
    if (info.url) urlCache.set(key, info);
  }
  if (my !== token) return;
  setLoading(false);

  if (!info.url) {
    audio.removeAttribute('src');
    song.unavailable = true;
    emit('unavailable', song);
    failStreak++;
    const canSkip = n > 1 && failStreak < n;
    toast(`《${song.name}》暂无可免费播放的音源${canSkip ? '，已跳过' : ''}`);
    if (canSkip) setTimeout(() => my === token && load(pickNext(1), { auto: true }), 700);
    else failStreak = 0;
    emit('state');
    return;
  }

  player.info = info;
  emit('info', info);
  session = { song, counted: false };
  audio.src = info.url;
  try {
    await audio.play();
    failStreak = 0;
    prefetchNext(my);
  } catch (err) {
    // 浏览器拦截自动播放时，等待用户再次点击
    if (err.name !== 'AbortError') emit('state');
  }
}

/** 后台预解析下一首的音源，切歌时无需等待 */
function prefetchNext(my) {
  if (player.mode === 'shuffle' || player.queue.length < 2) return;
  const song = player.queue[(player.index + 1) % player.queue.length];
  const key = songKey(song);
  if (urlCache.get(key)?.exp > Date.now()) return;
  setTimeout(async () => {
    if (my !== token) return;
    try {
      const info = await api.play(song);
      if (info.url) urlCache.set(key, { ...info, exp: Date.now() + URL_TTL });
    } catch {
      /* 忽略，切歌时再试 */
    }
  }, 3000);
}

function setLoading(v) {
  player.loading = v;
  emit('loading', v);
}

// ---------- audio 事件 ----------

audio.volume = store.get('volume') ?? 0.8;
audio.muted = !!store.get('muted');

audio.addEventListener('play', () => emit('state'));
audio.addEventListener('pause', () => emit('state'));
audio.addEventListener('loadedmetadata', () => emit('time'));
audio.addEventListener('timeupdate', () => {
  emit('time');
  if (session && !session.counted) {
    const threshold = Math.min(30, (player.duration || 60) * 0.5);
    if (audio.currentTime >= threshold) {
      session.counted = true;
      store.recordPlay(session.song);
    }
  }
});
audio.addEventListener('ended', () => {
  if (player.mode === 'one') {
    if (session) session.counted = false;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    load(pickNext(1), { auto: true });
  }
});
audio.addEventListener('error', () => {
  if (!player.current || !audio.getAttribute('src')) return;
  const alternatives = (player.info?.resources || []).filter((r) => r.url !== player.info.url);
  if (alternatives.length) {
    primeUrl(player.current, { ...alternatives[0], resources: alternatives, statuses: player.info.statuses });
    load(player.index, { auto: true });
    return;
  }
  urlCache.delete(songKey(player.current));
  failStreak++;
  const n = player.queue.length;
  toast(`《${player.current.name}》加载失败${n > 1 && failStreak < n ? '，播放下一首' : ''}`);
  if (n > 1 && failStreak < n) load(pickNext(1), { auto: true });
  else failStreak = 0;
});

// ---------- 系统媒体控制（锁屏 / 耳机按键） ----------

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  player.on('song', (s) => {
    if (!s) return;
    ms.metadata = new MediaMetadata({
      title: s.name,
      artist: (s.artists || []).map((a) => a.name).join(' / '),
      album: s.album || '',
      artwork: s.cover ? [{ src: s.cover, sizes: '300x300' }] : [],
    });
  });
  const set = (action, fn) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* 不支持的动作 */
    }
  };
  set('play', () => player.toggle());
  set('pause', () => player.toggle());
  set('previoustrack', () => player.prev());
  set('nexttrack', () => player.next());
  set('seekto', (e) => player.seek(e.seekTime));
}

// ---------- 队列持久化 ----------

let queueTimer;
function saveQueue() {
  clearTimeout(queueTimer);
  queueTimer = setTimeout(() => {
    store.set('queue', player.queue.slice(0, 300));
    store.set('queueIndex', player.index);
  }, 300);
}
player.on('queue', saveQueue);

/** 页面加载时恢复上次的队列（不自动播放） */
export function restoreQueue() {
  const q = store.get('queue');
  const i = store.get('queueIndex');
  if (Array.isArray(q) && q.length && i >= 0 && i < q.length) {
    player.queue = q;
    player.index = i;
    player.current = q[i];
    emit('queue');
    emit('song', player.current);
    emit('state');
  }
}
