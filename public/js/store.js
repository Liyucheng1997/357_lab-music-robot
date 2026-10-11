// 本地状态：收藏、听歌记录、不感兴趣、偏好设置。全部保存在浏览器 localStorage。

const KEY = 'yinyu:v1';
const MAX_HISTORY = 500;

const defaults = () => ({ likes: [], history: [], dislikes: [], volume: 0.8, muted: false, mode: 'loop', theme: 'auto' });

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults();
  }
}

const state = load();
const listeners = new Set();
let saveTimer;

function commit(what) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 隐私模式等情况下无法保存，功能照常 */
    }
  }, 150);
  listeners.forEach((fn) => fn(what));
}

export const songKey = (s) => `${s.source}:${s.id}`;

/** 只保存需要的字段 */
export function slim(s) {
  const { id, source, name, artists, album, cover, duration, fee, link, previewUrl } = s;
  return {
    id, source, name, album, cover, duration, fee, link,
    artists: (artists || []).map(({ id: aid, name: an }) => ({ id: aid || '', name: an })),
    ...(previewUrl ? { previewUrl } : {}),
  };
}

export const store = {
  get: (k) => state[k],
  set(k, v) {
    state[k] = v;
    commit(k);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // 收藏
  isLiked: (s) => state.likes.some((x) => songKey(x) === songKey(s)),
  toggleLike(s) {
    const k = songKey(s);
    const i = state.likes.findIndex((x) => songKey(x) === k);
    if (i >= 0) state.likes.splice(i, 1);
    else {
      state.likes.unshift(slim(s));
      state.dislikes = state.dislikes.filter((x) => songKey(x) !== k);
    }
    commit('likes');
    return i < 0;
  },

  // 听歌记录
  recordPlay(s) {
    const entry = touch(s);
    entry.plays += 1;
    commit('history');
  },
  recordSkip(s) {
    const entry = touch(s);
    entry.skips = (entry.skips || 0) + 1;
    commit('history');
  },
  clearHistory() {
    state.history = [];
    commit('history');
  },

  // 不感兴趣
  dislike(s) {
    const k = songKey(s);
    if (!state.dislikes.some((x) => songKey(x) === k)) state.dislikes.unshift(slim(s));
    state.dislikes = state.dislikes.slice(0, 300);
    state.likes = state.likes.filter((x) => songKey(x) !== k);
    commit('dislikes');
  },
};

function touch(s) {
  const k = songKey(s);
  let i = state.history.findIndex((h) => songKey(h.song) === k);
  let entry;
  if (i >= 0) [entry] = state.history.splice(i, 1);
  else entry = { song: slim(s), plays: 0, skips: 0 };
  entry.lastPlayed = Date.now();
  state.history.unshift(entry);
  if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
  return entry;
}
