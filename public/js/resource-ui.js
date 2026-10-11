import { esc, SOURCE_NAME, artistNames } from './ui.js';
import { qualityLabel } from './quality.js';

export function resourceLabel(r) {
  return `${SOURCE_NAME[r.via] || r.via} · ${r.media === 'video' ? '视频音轨' : r.kind === 'preview' ? '试听' : '免费完整'} · 音质${qualityLabel(r.quality)}`;
}

export function resourceBadge(r) {
  if (!r || r === 'pending') return '<button class="avail wait" data-act="resources" title="正在查找资源，点击查看" aria-label="查看播放资源"></button>';
  const count = r.resources?.length || (r.url ? 1 : 0);
  const failed = Object.values(r.statuses || {}).includes('error') || r.error;
  const text = count ? `${SOURCE_NAME[r.via] || r.via} · 音质${qualityLabel(r.quality)}${count > 1 ? ` · ${count} 个资源` : ''}` : failed ? '查询失败 · 重试' : '暂无免费资源';
  return `<button class="avail ${count ? 'ok' : 'no'}" data-act="resources" title="查看来源与音质，选择资源播放">${esc(text)}</button>`;
}

export function resourceOptions(info) {
  const resources = info.resources || (info.url ? [info] : []);
  const choices = resources.map((r, i) => `<button class="resource-option" data-resource-index="${i}">
    <strong>${esc(resourceLabel(r))}</strong>
    <small>${esc(r.matched ? `${r.matched.name} — ${artistNames(r.matched)}` : '当前歌曲')}${r.media === 'video' ? ' · 可能与录音室版本不同' : ''}</small>
    <span>播放</span>
  </button>`).join('');
  const status = Object.entries(info.statuses || {}).filter(([, value]) => value !== 'available')
    .map(([via, value]) => `<li>${esc(SOURCE_NAME[via] || via)}：${value === 'error' ? '查询失败，可重试' : '暂未找到免费资源'}</li>`).join('');
  return `${choices || '<p>暂未找到可播放的免费资源。</p>'}${status ? `<ul class="resource-status">${status}</ul>` : ''}
    <p class="resource-note">默认优先播放音质最高的可用资源；音质分为低、中、高，无法确认时显示未知。</p>`;
}
