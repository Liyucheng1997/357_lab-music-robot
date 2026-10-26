// AI 选歌：用自然语言描述想听的风格，由 Claude 挑歌，再到各平台匹配可播放的版本。
// API Key 由用户在网页上填写，只保存在当前浏览器；请求从浏览器直接发往 Anthropic，不经过音隅的服务器。

const KEY = 'yinyu:claude';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
export const MODEL = 'claude-opus-5-5';
export const DEFAULT_BASE = 'https://api.anthropic.com';

export function getAiConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { apiKey: c.apiKey || '', baseURL: c.baseURL || '' };
  } catch {
    return { apiKey: '', baseURL: '' };
  }
}

export function setAiConfig({ apiKey = '', baseURL = '' }) {
  apiKey = apiKey.trim();
  baseURL = baseURL.trim().replace(/\/+$/, '');
  if (!apiKey) {
    try { localStorage.removeItem(KEY); } catch {}
    return;
  }
  if (/\s/.test(apiKey)) throw new Error('API Key 里不能有空格或换行');
  if (baseURL) {
    const url = new URL(baseURL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('接口地址请填写不含账号、参数的 HTTPS 地址');
    }
  }
  localStorage.setItem(KEY, JSON.stringify({ apiKey, baseURL: baseURL === DEFAULT_BASE ? '' : baseURL }));
}

export const hasAiKey = () => !!getAiConfig().apiKey;

const SYSTEM = `你是「音隅」音乐网站的选歌助手。用户会用自然语言描述想听的音乐：心情、场景、风格、年代、语言、参考歌手都有可能。

请挑选 15 首最贴合描述的歌曲：
- 只推荐真实存在、在网易云音乐、酷狗等主流平台能搜到的歌，不要编造歌名或张冠李戴。
- 歌名和歌手写成平台上的原名：华语歌用简体中文，外文歌保留原文，不加翻译、括号备注或版本说明；多位歌手只写第一位。
- 风格要统一贴合描述，同时兼顾多样性：同一位歌手最多 2 首，经典与新歌搭配。
- reason 用简体中文一句话说明为什么适合，不超过 20 个字，不要重复歌名。
- title 是这份歌单的名字，不超过 12 个字；summary 用一句话概括选歌思路，不超过 40 个字。
- 如果附带了用户的听歌口味，只把它当作参考，用户的描述优先；不要推荐用户标记过不感兴趣的歌。`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    songs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          artist: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['name', 'artist', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'summary', 'songs'],
  additionalProperties: false,
};

/** 把用户的本地听歌数据压缩成几行提示 */
export function tasteNote({ history = [], likes = [], dislikes = [] }) {
  const score = new Map();
  const add = (s, w) => {
    const name = s?.artists?.[0]?.name;
    if (name) score.set(name, (score.get(name) || 0) + w);
  };
  likes.forEach((s) => add(s, 3));
  history.forEach((h) => add(h.song, Math.min(h.plays || 0, 5) + 1));
  const artists = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n]) => n);
  const lines = [];
  if (artists.length) lines.push(`常听的歌手：${artists.join('、')}`);
  if (dislikes.length) lines.push(`不感兴趣的歌：${dislikes.slice(0, 20).map((s) => `${s.name} - ${s.artists?.[0]?.name || ''}`).join('；')}`);
  return lines.join('\n');
}

/** 从还没生成完的 JSON 文本里取出已经完整的部分（标题、简介、每首歌） */
export function parsePartial(text) {
  const str = (key) => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) return '';
    try { return JSON.parse(`"${m[1]}"`); } catch { return ''; }
  };
  const songs = [];
  const at = text.indexOf('"songs"');
  if (at >= 0) {
    for (const m of text.slice(at).matchAll(/\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/g)) {
      try {
        const s = JSON.parse(m[0]);
        if (s.name && s.artist) songs.push({ name: String(s.name), artist: String(s.artist), reason: String(s.reason || '') });
      } catch { /* 不完整，等下一段 */ }
    }
  }
  return { title: str('title'), summary: str('summary'), songs };
}

const comparable = (s = '') => String(s)
  .toLowerCase()
  .replace(/[（(【\[].*?[）)】\]]/g, '')
  .replace(/\s+-\s+.*$/, '')
  .replace(/[\s·・,，.。'"!！?？&、/\-_:：]/g, '');

/** 在搜索结果里找出 Claude 说的那首歌 */
export function pickMatch(songs, name, artist) {
  const n = comparable(name);
  const a = comparable(artist);
  const byArtist = (s) => !a || (s.artists || []).some((x) => {
    const xa = comparable(x.name);
    return xa === a || (xa && (xa.includes(a) || a.includes(xa)));
  });
  const nameOf = (s) => comparable(s.name);
  return songs.find((s) => nameOf(s) === n && byArtist(s))
    || songs.find((s) => n && nameOf(s) && (nameOf(s).includes(n) || n.includes(nameOf(s))) && byArtist(s))
    || null;
}

let sdk;
async function client() {
  const { apiKey, baseURL } = getAiConfig();
  if (!apiKey) throw new AiError('请先填写 Claude API Key', 'nokey');
  sdk ||= import(SDK_URL).catch((err) => {
    sdk = null;
    throw new AiError('Claude 组件加载失败，请检查网络后重试', 'network', err);
  });
  const { default: Anthropic } = await sdk;
  // 用户自己的 Key、在用户自己的浏览器里使用，所以允许浏览器直连
  return { Anthropic, c: new Anthropic({ apiKey, baseURL: baseURL || undefined, dangerouslyAllowBrowser: true, maxRetries: 1 }) };
}

export class AiError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

function friendly(Anthropic, err) {
  if (err instanceof AiError) return err;
  if (err?.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError) return new AiError('已停止', 'abort', err);
  if (err instanceof Anthropic.AuthenticationError) return new AiError('API Key 无效，请检查后重新填写', 'auth', err);
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError('这个 API Key 没有使用 Claude Opus 5.5 的权限', 'auth', err);
  if (err instanceof Anthropic.RateLimitError) return new AiError('请求太频繁或额度已用完，稍后再试', 'rate', err);
  if (err instanceof Anthropic.BadRequestError) return new AiError(`请求被拒绝：${err.error?.error?.message || err.message}`, 'bad', err);
  if (err instanceof Anthropic.APIConnectionError) return new AiError('连不上 Claude 服务。若所在网络无法直连，可在设置里填写可用的接口地址', 'network', err);
  if (err instanceof Anthropic.APIError) return new AiError(`Claude 服务暂时不可用（${err.status || '网络错误'}），稍后再试`, 'server', err);
  return new AiError(err?.message || 'AI 推荐失败', 'unknown', err);
}

/**
 * 新建一次选歌对话。同一对话里「换一批」会接着上下文继续，避免重复。
 * @returns {{ ask(prompt: string, opt: { taste?: string, onUpdate?: (partial) => void, signal?: AbortSignal }): Promise<{title, summary, songs}> }}
 */
export function createSession() {
  const messages = [];
  return {
    get turns() { return messages.length / 2; },
    async ask(prompt, { taste = '', onUpdate, signal } = {}) {
      const { Anthropic, c } = await client();
      const content = taste && !messages.length ? `${prompt}\n\n（参考：用户的听歌口味）\n${taste}` : prompt;
      const pending = [...messages, { role: 'user', content }];
      let text = '';
      try {
        const stream = c.beta.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // 选歌靠的是曲库知识而不是长推理，用 low 让结果更快出来
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM,
          messages: pending,
        }, { signal });
        stream.on('text', (delta) => {
          text += delta;
          onUpdate?.(parsePartial(text));
        });
        // 被拒后服务端换模型重答时，之前的部分作废
        stream.on('streamEvent', (e) => {
          if (e.type === 'content_block_start' && e.content_block?.type === 'fallback') text = '';
        });
        const msg = await stream.finalMessage();
        if (msg.stop_reason === 'refusal') throw new AiError('Claude 没有回答这个请求，换个描述试试', 'refusal');
        if (msg.stop_reason === 'max_tokens') throw new AiError('回答太长被截断了，换个更具体的描述试试', 'truncated');
        const blocks = msg.content;
        const last = blocks.findLastIndex((b) => b.type === 'fallback');
        const final = blocks.slice(last + 1).filter((b) => b.type === 'text').map((b) => b.text).join('');
        const data = JSON.parse(final);
        messages.push(pending.at(-1), { role: 'assistant', content: blocks });
        return {
          title: String(data.title || ''),
          summary: String(data.summary || ''),
          songs: (data.songs || []).filter((s) => s?.name && s?.artist),
        };
      } catch (err) {
        if (err instanceof SyntaxError) throw new AiError('Claude 返回的格式有误，请重试', 'format', err);
        throw friendly(Anthropic, err);
      }
    },
  };
}
