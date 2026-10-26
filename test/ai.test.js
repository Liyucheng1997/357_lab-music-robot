import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePartial, pickMatch, tasteNote, setAiConfig, getAiConfig } from '../public/js/ai.js';

test('parsePartial 只取出已经完整的歌曲', () => {
  const text = '{"title":"雨天 \\"Lo-fi\\"","summary":"安静","songs":[{"name":"晴天","artist":"周杰伦","reason":"雨声里的回忆"},{"name":"Chill';
  const p = parsePartial(text);
  assert.equal(p.title, '雨天 "Lo-fi"');
  assert.equal(p.songs.length, 1);
  assert.deepEqual(p.songs[0], { name: '晴天', artist: '周杰伦', reason: '雨声里的回忆' });
});

test('parsePartial 处理含花括号的字符串和完整 JSON', () => {
  const full = JSON.stringify({ title: 'A', summary: 'B', songs: [{ name: 'x{y}', artist: 'Z', reason: 'r' }, { name: '夜曲', artist: '周杰伦', reason: '' }] });
  const p = parsePartial(full);
  assert.equal(p.summary, 'B');
  assert.deepEqual(p.songs.map((s) => s.name), ['x{y}', '夜曲']);
});

test('pickMatch 优先歌名歌手都对上的，忽略括号与大小写', () => {
  const songs = [
    { name: '晴天', artists: [{ name: '翻唱歌手' }] },
    { name: '晴天 (Live)', artists: [{ name: '周杰伦' }] },
  ];
  assert.equal(pickMatch(songs, '晴天', '周杰伦'), songs[1]);
  assert.equal(pickMatch([{ name: 'Shape of You', artists: [{ name: 'Ed Sheeran' }] }], 'shape of you', 'ed sheeran')?.name, 'Shape of You');
  assert.equal(pickMatch(songs, '稻香', '周杰伦'), null);
});

test('tasteNote 汇总常听歌手与不感兴趣的歌', () => {
  const s = (name, artist) => ({ name, artists: [{ name: artist }] });
  const note = tasteNote({
    likes: [s('a', '陈奕迅')],
    history: [{ song: s('b', '五月天'), plays: 1 }, { song: s('c', '陈奕迅'), plays: 2 }],
    dislikes: [s('d', '某歌手')],
  });
  assert.match(note, /常听的歌手：陈奕迅、五月天/);
  assert.match(note, /不感兴趣的歌：d - 某歌手/);
  assert.equal(tasteNote({}), '');
});

test('setAiConfig 校验并保存在浏览器本地', () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  setAiConfig({ apiKey: ' sk-ant-test ', baseURL: 'https://api.anthropic.com/' });
  assert.deepEqual(getAiConfig(), { apiKey: 'sk-ant-test', baseURL: '' });
  assert.throws(() => setAiConfig({ apiKey: 'k', baseURL: 'http://example.com' }), /HTTPS/);
  setAiConfig({ apiKey: '' });
  assert.equal(getAiConfig().apiKey, '');
});
