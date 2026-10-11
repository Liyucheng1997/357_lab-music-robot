// 显示用的简单等级：按接口提供的码率估算，不推测未知音源。
export function qualityLevel(quality = {}) {
  const bitrate = Number(quality?.bitrate);
  if (Number.isFinite(bitrate) && bitrate > 0) {
    return bitrate >= 256 ? 'high' : bitrate >= 128 ? 'medium' : 'low';
  }
  return ['high', 'medium', 'low'].includes(quality?.level) ? quality.level : 'unknown';
}

export function qualityLabel(quality) {
  return { high: '高', medium: '中', low: '低', unknown: '未知' }[qualityLevel(quality)];
}

export function normalizeQuality(quality = {}) {
  return { ...quality, level: qualityLevel(quality), label: qualityLabel(quality) };
}

// 确认的等级优先；同等级以码率排序。未知资源排在已知等级之后。
export function compareQuality(a, b) {
  const ranks = { high: 3, medium: 2, low: 1, unknown: 0 };
  return ranks[qualityLevel(b.quality)] - ranks[qualityLevel(a.quality)]
    || (Number(b.quality?.bitrate) || 0) - (Number(a.quality?.bitrate) || 0);
}
