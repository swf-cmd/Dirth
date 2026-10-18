/* City themes shared by the main process, the controller and the renderer.
 * Text values are translation keys from locales.js; the hero word and the
 * coordinates are shown as written in every language, like the original
 * Tokyo edition. Colors live in renderer/theme-colors.css and themes.css.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TokyoThemes = factory();
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const freeze = value => Object.freeze(value);
  const themes = freeze({
    tokyo: freeze({
      id: 'tokyo', name: '东京', hero: 'TOKYO', glyph: '✳',
      edition: 'TOKYO EDITION', subtitle: 'AFTER HOURS', volume: 'VOL. 01',
      headline: '城市未眠，\n你的灵感也是。',
      location: '渋谷 · RAINY NIGHT', coordinates: '35°40′ N / 139°42′ E',
      footer: 'TOKYO / NIGHT SHIFT', placeholder: '在雨声中，开始你的下一个想法…',
      weather: '窗外有雨', weatherHelp: '窗前飘落的动态雨滴，切换即可预览。\n关闭后保留静态东京夜景；跟随系统的减少动态效果设置。',
      station: '东京午夜电台', musicHelp: '日式复古蒸汽波 · 原创器乐循环\n温暖电钢琴、合成器与慢拍鼓点，陪你留在八十年代的夜晚。',
      backdrop: 'tokyo-rain.png', windowBackground: '#0b0e11',
    }),
    kyoto: freeze({
      id: 'kyoto', name: '京都', hero: 'KYOTO', glyph: '✿',
      edition: 'KYOTO EDITION', subtitle: 'LANTERN LANES', volume: 'VOL. 02',
      headline: '灯笼已亮，\n你的灵感也是。',
      location: '東山 · LANTERN NIGHT', coordinates: '35°00′ N / 135°47′ E',
      footer: 'KYOTO / NIGHT SHIFT', placeholder: '伴着远处的钟声，开始你的下一个想法…',
      weather: '窗外红叶', weatherHelp: '窗前飘落的红叶，切换即可预览。\n关闭后保留静态京都夜景；跟随系统的减少动态效果设置。',
      station: '京都灯笼电台', musicHelp: '和风氛围 · 原创器乐循环\n筝的拨弦、尺八般的气息与远处钟声，陪你走过灯影小巷。',
      backdrop: 'kyoto-lanterns.webp', windowBackground: '#120b0e',
    }),
    okinawa: freeze({
      id: 'okinawa', name: '冲绳', hero: 'OKINAWA', glyph: '✺',
      edition: 'OKINAWA EDITION', subtitle: 'ISLAND TIME', volume: 'VOL. 03',
      headline: '潮水渐涨，\n你的灵感也是。',
      location: '恩納 · TWILIGHT TIDE', coordinates: '26°30′ N / 127°51′ E',
      footer: 'OKINAWA / NIGHT SHIFT', placeholder: '伴着海浪声，开始你的下一个想法…',
      weather: '窗外萤火', weatherHelp: '窗前缓缓飘舞的萤火，切换即可预览。\n关闭后保留静态冲绳暮色；跟随系统的减少动态效果设置。',
      station: '冲绳海风电台', musicHelp: '琉球海岛律动 · 原创器乐循环\n三线般的拨弦、温暖合成器与轻摇的鼓点，陪你吹着傍晚的海风。',
      backdrop: 'okinawa-twilight.webp', windowBackground: '#070f12',
    }),
    hokkaido: freeze({
      id: 'hokkaido', name: '北海道', hero: 'HOKKAIDO', glyph: '❅',
      edition: 'HOKKAIDO EDITION', subtitle: 'SNOW LIGHT', volume: 'VOL. 04',
      headline: '雪落无声，\n灵感渐渐成形。',
      location: '小樽 · SNOWY NIGHT', coordinates: '43°12′ N / 141°00′ E',
      footer: 'HOKKAIDO / NIGHT SHIFT', placeholder: '在静静落雪中，开始你的下一个想法…',
      weather: '窗外飘雪', weatherHelp: '窗前飘落的雪花，切换即可预览。\n关闭后保留静态小樽雪夜；跟随系统的减少动态效果设置。',
      station: '北海道雪夜电台', musicHelp: '冬夜氛围 · 原创器乐循环\n八音盒、柔和钢琴与清冷合成器，陪你看雪落在运河上。',
      backdrop: 'hokkaido-snowlight.webp', windowBackground: '#0b0d14',
    }),
  });
  const ids = freeze(Object.keys(themes));
  const defaultTheme = 'tokyo';
  const normalizeTheme = value => typeof value === 'string' && Object.hasOwn(themes, value) ? value : defaultTheme;
  // Translation keys every theme supplies; tests check each one in all catalogs.
  const textFields = freeze(['name', 'edition', 'subtitle', 'volume', 'headline', 'location', 'footer', 'placeholder', 'weather', 'weatherHelp', 'station', 'musicHelp']);
  const previewSprite = 'theme-previews.webp';
  return freeze({ themes, ids, defaultTheme, normalizeTheme, textFields, previewSprite });
});
