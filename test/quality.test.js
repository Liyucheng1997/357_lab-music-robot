import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityLabel } from '../public/js/quality.js';
import { resourceBadge, resourceOptions } from '../public/js/resource-ui.js';
import { createResolver } from '../server/play.js';

test('音质只显示低中高未知，不展示码率或编码', () => {
  for (const [bitrate, expected] of [[64, '低'], [127, '低'], [128, '中'], [222, '中'], [255, '中'], [256, '高'], [320, '高'], [null, '未知']]) {
    assert.equal(qualityLabel({ bitrate }), expected);
  }
  const resource = { via: 'bilibili', url: '/audio', media: 'video', quality: { bitrate: 222, codec: 'mp4a.40.2', label: '222 kbps · mp4a.40.2' } };
  for (const html of [resourceBadge(resource), resourceOptions({ ...resource, resources: [resource] })]) {
    assert.ok(html.includes('音质中'));
    assert.ok(!/222|kbps|mp4a/.test(html));
  }
});

test('高音质歌曲优先于低音质B站，默认标签与播放地址对应', async () => {
  const result = await createResolver({
    netease: { songInfo: async () => ({ url: '/native', quality: {} }) },
    kugou: { search: async () => [{ id: 'kg', name: '歌', artists: [{ name: '歌手' }], fee: 'free' }], songInfo: async () => ({ url: '/high', quality: { bitrate: 320 } }) },
    bilibili: { match: async () => ({ url: '/low', media: 'video', quality: { bitrate: 64 } }) },
  })({ source: 'netease', id: 'ne', name: '歌', artist: '歌手' });
  assert.equal(result.url, '/high');
  assert.equal(result.via, 'kugou');
  assert.equal(result.quality.label, '高');
  assert.deepEqual(result.resources.map((r) => r.url), ['/high', '/low', '/native']);
  assert.ok(resourceBadge(result).includes('酷狗 · 音质高'));
});

test('B站音质更高时优先B站，同等级按码率排序', async () => {
  const result = await createResolver({
    netease: { songInfo: async () => ({ url: '/native', quality: { bitrate: 128 } }) },
    bilibili: { match: async () => ({ url: '/better', media: 'video', quality: { bitrate: 222 } }) },
  })({ source: 'netease', id: 'ne', name: '歌', artist: '歌手' });
  assert.equal(result.url, '/better');
  assert.equal(result.quality.label, '中');
});

test('同平台多个匹配候选选最好音质，缺少质量信息保持未知', async () => {
  const result = await createResolver({ kugou: {
    search: async () => [64, 320, 128].map((id) => ({ id, name: '歌', artists: [{ name: '歌手' }], fee: 'free' })),
    songInfo: async (id) => {
      if (id === 128) throw new Error('一个候选失败不影响已找到的高音质资源');
      return { url: `/${id}`, quality: { bitrate: id } };
    },
  } })({ source: 'netease', id: 'ne', name: '歌', artist: '歌手' });
  assert.equal(result.url, '/320');
  assert.equal(qualityLabel(null), '未知');
});
