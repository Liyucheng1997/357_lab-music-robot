// 无授权接口时只提供官方入口，不伪造曲库或可播放地址。
export const externalSources = {
  douyin: {
    name: '抖音', status: 'external', message: '官方入口：可搜索音乐与视频，暂不支持站内播放',
    link: (keyword) => `https://www.douyin.com/search/${encodeURIComponent(keyword)}`,
  },
  qishui: {
    name: '汽水音乐', status: 'external', message: '官方入口：请在汽水音乐客户端搜索与收听，暂不支持站内播放',
    link: () => 'https://www.qishui.com/',
  },
};
