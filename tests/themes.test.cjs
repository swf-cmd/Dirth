'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalogs = require('../src/locales.js');
const { themes, ids, defaultTheme, normalizeTheme, textFields, previewSprite } = require('../src/themes.js');
const { build } = require('../scripts/build-theme-css.cjs');
const { packageFiles } = require('../scripts/package-policy.cjs');

const root = path.resolve(__dirname, '..');
const renderer = path.join(root, 'src', 'renderer');
const assets = path.join(renderer, 'assets');
const codes = ['ja', 'en', 'ko', 'es', 'de', 'fr'];

function playerTracks() {
  const window = { addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(renderer, 'ambient-audio.js'), 'utf8'), { window, document: { baseURI: 'file:///app/index.html' }, URL });
  return window.TokyoAmbience.tracks;
}

// Width and height of a lossy, lossless or extended WebP file.
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = bytes.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  throw new Error(`Unknown WebP chunk ${chunk}`);
}

// STREAMINFO of a FLAC file: sample rate, channels, bit depth and length.
function flacInfo(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'fLaC');
  assert.equal(bytes[4] & 0x7f, 0, 'STREAMINFO comes first');
  const info = bytes.subarray(8, 8 + 34);
  const sampleRate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4);
  const channels = ((info[12] >> 1) & 0x7) + 1;
  const bitsPerSample = (((info[12] & 1) << 4) | (info[13] >> 4)) + 1;
  const samples = (info[13] & 0x0f) * 2 ** 32 + info.readUInt32BE(14);
  return { sampleRate, channels, bitsPerSample, samples };
}

test('four city themes share one shape, with Tokyo as the safe default', () => {
  assert.deepEqual(ids, ['tokyo', 'kyoto', 'okinawa', 'hokkaido']);
  assert.equal(defaultTheme, 'tokyo');
  for (const id of ids) assert.equal(normalizeTheme(id), id);
  for (const unknown of [undefined, null, '', 'Kyoto', 'osaka', 'toString', '__proto__', 3, {}]) assert.equal(normalizeTheme(unknown), 'tokyo');
  const fields = Object.keys(themes.tokyo).sort();
  for (const id of ids) {
    const theme = themes[id];
    assert.equal(theme.id, id);
    assert.deepEqual(Object.keys(theme).sort(), fields, `${id} fields`);
    assert.ok(Object.isFrozen(theme));
    assert.match(theme.hero, /^[A-Z]+$/);
    assert.match(theme.coordinates, /^\d+°\d{2}′ N \/ \d+°\d{2}′ E$/);
    assert.match(theme.windowBackground, /^#[0-9a-f]{6}$/);
    assert.equal([...theme.glyph].length, 1);
  }
  for (const field of ['hero', 'glyph', 'edition', 'subtitle', 'volume', 'headline', 'location', 'coordinates', 'placeholder', 'station', 'backdrop']) {
    assert.equal(new Set(ids.map(id => themes[id][field])).size, ids.length, `every city has its own ${field}`);
  }
});

test('the original Tokyo copy is unchanged and is what the static page shows', () => {
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const tokyo = themes.tokyo;
  assert.match(html, /<span id="hero-city">TOKYO<\/span>/);
  for (const field of ['edition', 'subtitle', 'volume', 'location']) assert.ok(html.includes(`data-i18n="${tokyo[field]}"`), field);
  assert.ok(html.includes(tokyo.coordinates));
  assert.ok(html.includes(`class="hero-star" id="hero-star">${tokyo.glyph}<`));
});

test('every city text is translated in every catalog without parameters', () => {
  for (const id of ids) {
    for (const field of textFields) {
      const key = themes[id][field];
      for (const code of codes) {
        assert.equal(typeof catalogs[code][key], 'string', `${code}: ${id}.${field}`);
        assert.ok(catalogs[code][key].trim(), `${code}: ${id}.${field}`);
        assert.doesNotMatch(catalogs[code][key], /\{[A-Za-z]/, `${code}: ${id}.${field}`);
      }
      if (/^[\x00-\x7F]+$/.test(key)) assert.match(catalogs['zh-CN'][key], /[一-鿿]/, `zh-CN: ${id}.${field}`);
    }
  }
  for (const key of ['正在播放 · {station} · 离线循环', '正在准备{station}…', '点击窗口或按任意键，开启{station}。']) {
    for (const code of codes) assert.match(catalogs[code][key], /\{station\}/, `${code}: ${key}`);
  }
});

test('the picker offers every city in order with its own preview tile', () => {
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const values = [...html.matchAll(/<input type="radio" name="theme" value="([a-z]+)">/g)].map(match => match[1]);
  assert.deepEqual(values, ids);
  const css = fs.readFileSync(path.join(renderer, 'themes.css'), 'utf8');
  for (const id of ids) assert.match(css, new RegExp(`\\.theme-option\\[data-theme-option="${id}"\\] \\{ --swatch: #[0-9a-f]{6}; \\}`));
  const sprite = webpSize(fs.readFileSync(path.join(assets, previewSprite)));
  assert.equal(sprite.height, sprite.width / 16 * 9 * ids.length, 'one 16:9 tile per city');
});

test('each city ships its own backdrop and lossless 96-second soundtrack', () => {
  const tracks = playerTracks();
  assert.deepEqual(Object.keys(tracks), ids, 'the player has one track per city');
  const files = new Set();
  for (const id of ids) {
    const backdrop = path.join(assets, themes[id].backdrop);
    if (id !== 'tokyo') {
      const size = webpSize(fs.readFileSync(backdrop));
      assert.deepEqual(size, { width: 2400, height: 1350 }, `${id} backdrop size`);
      assert.ok(fs.statSync(backdrop).size < 1.5 * 1024 * 1024, `${id} backdrop stays light`);
      const info = flacInfo(fs.readFileSync(path.join(assets, tracks[id].file)));
      assert.deepEqual(info, { sampleRate: 44100, channels: 2, bitsPerSample: 16, samples: tracks[id].duration * 44100 }, `${id} soundtrack`);
    }
    assert.equal(tracks[id].duration, 96);
    for (const file of [themes[id].backdrop, tracks[id].file]) {
      assert.ok(packageFiles.includes(`src/renderer/assets/${file}`), `${file} is packaged`);
      files.add(file);
    }
  }
  assert.equal(files.size, ids.length * 2, 'no two cities share an asset');
});

test('generated theme colors match styles.css and every referenced asset exists', () => {
  const generated = fs.readFileSync(path.join(renderer, 'theme-colors.css'), 'utf8');
  assert.equal(generated, build(), 'run node scripts/build-theme-css.cjs after changing styles.css');
  for (const id of ids.filter(id => id !== 'tokyo')) assert.ok(generated.includes(`:root[data-theme="${id}"]{--bg:`), `${id} palette`);
  assert.equal(generated.includes('data-theme="tokyo"'), false, 'Tokyo keeps styles.css as written');
  for (const file of ['styles.css', 'theme-colors.css', 'themes.css']) {
    const css = fs.readFileSync(path.join(renderer, file), 'utf8');
    for (const [, reference] of css.matchAll(/url\("(assets\/[^"]+)"\)/g)) {
      assert.ok(fs.existsSync(path.join(renderer, reference)), `${file}: ${reference}`);
      assert.ok(packageFiles.includes(`src/renderer/${reference}`), `${reference} is packaged`);
    }
  }
  for (const file of ['src/themes.js', 'src/renderer/theme-colors.css', 'src/renderer/themes.css']) assert.ok(packageFiles.includes(file), file);
});
