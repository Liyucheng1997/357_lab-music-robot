import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolver, sameSong } from '../server/play.js';
import { externalSources } from '../server/sources/external.js';
import { resourceBadge, resourceOptions } from '../public/js/resource-ui.js';

const song = { id: 'free', name: '晴天', artists: [{ name: '周杰伦' }], fee: 'free' };
const audio = (url, bitrate) => ({ url, quality: { label: `${bitrate} kbps`, bitrate } });
const provider = (info = null, songs = []) => ({ songInfo: async () => info, search: async () => songs });

test('VIP 原平台无地址时保留其他平台免费版本及视频音轨', async () => {
  const resolve = createResolver({
    netease: provider(null, []),
    kugou: provider(audio('https://example.com/free.mp3', 320), [song]),
    bilibili: { match: async () => ({ ...audio('/video', 192), media: 'video', matched: song }) },
  });
  const result = await resolve({ source: 'netease', id: 'vip', name: '晴天', artist: '周杰伦' });
  assert.equal(result.resources.length, 2);
  assert.equal(result.via, 'kugou');
  assert.equal(result.resources[0].quality.bitrate, 320);
  assert.equal(result.resources[1].media, 'video');
  assert.equal(result.lyricId, 'vip');
});

test('音质优先，全部可用来源都保留，失败来源独立标记', async () => {
  const result = await createResolver({
    netease: provider(audio('/ne', 128), [song]),
    kugou: provider(audio('/kg', 320), [song]),
    bilibili: { match: async () => { throw new Error('upstream'); } },
  })({ source: 'kugou', id: 'kg', name: '晴天', artist: '周杰伦' });
  assert.equal(result.via, 'kugou');
  assert.equal(result.resources.length, 2);
  assert.equal(result.statuses.bilibili, 'error');
  assert.equal(result.resources[1].lyricId, 'free');
});

test('候选不匹配歌手/版本或标记 VIP 时不尝试播放', async () => {
  let attempted = false;
  const result = await createResolver({ kugou: {
    search: async () => [{ ...song, fee: 'vip' }, { ...song, name: '晴天 (Live)' }, { ...song, artists: [{ name: '翻唱歌手' }] }],
    songInfo: async () => { attempted = true; return audio('/wrong', 320); },
  } })({ source: 'netease', id: 'vip', name: '晴天', artist: '周杰伦' });
  assert.equal(attempted, false);
  assert.equal(result.url, null);
  assert.deepEqual(result.resources, []);
  assert.equal(result.statuses.kugou, 'unavailable');
  assert.equal(sameSong({ ...song, name: '晴天 (Live)' }, '晴天', '周杰伦'), false);
});

test('未提供音质信息的音源显示未知，UI 转义资源标题', async () => {
  const result = await createResolver({ netease: provider({ url: '/audio' }) })({ source: 'netease', id: '1' });
  assert.equal(result.quality.label, '未知');
  const html = resourceOptions({ ...result, resources: [{ ...result.resources[0], matched: { name: '<script>', artists: [] } }] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(resourceBadge(result).includes('网易云 · 音质未知'));
  assert.ok(resourceBadge({ statuses: { netease: 'error' } }).includes('查询失败'));
});

test('抖音和汽水为官方入口，关键词正确编码，不伪造音源', () => {
  assert.equal(externalSources.douyin.status, 'external');
  assert.equal(externalSources.qishui.status, 'external');
  assert.ok(externalSources.douyin.link('晴天 &').includes(encodeURIComponent('晴天 &')));
  assert.equal(externalSources.qishui.link('晴天'), 'https://www.qishui.com/');
});
