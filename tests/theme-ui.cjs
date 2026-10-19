'use strict';

// Run: node tests/theme-ui.cjs [--packaged]
// City themes in the real Electron window with an isolated fake engine: the
// saved city paints the first frame, previews follow the picker and the
// language, closing restores, saving persists without a reconnect, and every
// city's backdrop and soundtrack decode from the shipped files.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createI18n } = require('../src/i18n.js');
const { themes, ids } = require('../src/themes.js');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'work', 'theme-qa');
fs.mkdirSync(base, { recursive: true });
const testRoot = fs.mkdtempSync(path.join(base, 'run-'));
const workspace = path.join(testRoot, 'Workspace');
const executable = path.join(testRoot, process.platform === 'win32' ? 'grok.exe' : 'grok');
const stateFile = path.join(testRoot, 'data', 'conversations.json');
fs.mkdirSync(workspace); fs.mkdirSync(path.join(testRoot, 'data'));
fs.writeFileSync(executable, 'Fixture only; never executed.');
fs.chmodSync(executable, 0o755);
fs.writeFileSync(stateFile, JSON.stringify({ version: 1, settings: { executable, workspace, language: 'en', theme: 'kyoto', rainEnabled: true, musicEnabled: true, musicVolume: 31 }, sessions: [] }));
const readState = () => require('./fixtures/read-history.cjs')(stateFile);
const t = (locale, source, params) => createI18n(() => locale)(source, params);
const rgb = hex => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
// The primary accent each city's generated palette gives --lime.
const accents = { tokyo: '#d4eb89', kyoto: '#773269', okinawa: '#107a79', hokkaido: '#336197' };

(async () => {
  const env = { ...process.env, TOKYO_TEST_ROOT: testRoot };
  if (process.argv.includes('--packaged')) env.TOKYO_UI_SOURCE_ROOT = require('../scripts/package-paths.cjs').packagedArchive(root);
  delete env.ELECTRON_RUN_AS_NODE;
  let desktop, page;
  const errors = [], results = [];
  const stage = async (name, action) => { await action(); results.push(name); console.log(`PASS ${name}`); };
  try {
    desktop = await _electron.launch({ args: ['--mute-audio', path.join(__dirname, 'fixtures', 'ui-app.cjs')], env });
    page = await desktop.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => !document.querySelector('#settings-button').disabled && !document.querySelector('#connection-button').disabled);
    const starts = () => desktop.evaluate(() => globalThis.__tokyoUITest.calls.filter(item => item.method === 'start').length);
    const windowBackground = () => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase());
    const openSettings = async () => { await page.locator('#settings-button').click(); await page.locator('#settings-dialog').waitFor({ state: 'visible' }); };
    const closeSettings = async () => { await page.locator('[data-close-dialog="settings-dialog"]').click(); await page.locator('#settings-dialog').waitFor({ state: 'hidden' }); };
    const pick = async id => {
      await page.locator(`.theme-option[data-theme-option="${id}"]`).click();
      await page.waitForFunction(id => document.documentElement.dataset.theme === id, id);
    };
    const playing = (locale, id) => page.waitForFunction(label => document.querySelector('#music-status').textContent === label,
      t(locale, '正在播放 · {station} · 离线循环', { station: t(locale, themes[id].station) }), { timeout: 20000 });
    const chrome = () => page.evaluate(() => {
      const text = id => document.getElementById(id).textContent;
      const style = getComputedStyle(document.querySelector('.new-session'));
      return {
        theme: document.documentElement.dataset.theme, city: text('hero-city'), edition: text('brand-edition'), subtitle: text('hero-subtitle'), tagline: text('edition-tagline'),
        breadcrumb: text('breadcrumb-subtitle'), volume: text('edition-number'), headline: text('hero-headline'), location: text('location-name'),
        coordinates: text('location-coordinates'), star: text('hero-star'), orbit: text('model-orbit'), weather: text('rain-label'), station: text('music-label'),
        placeholder: document.querySelector('#prompt').placeholder, footer: text('session-path'), accent: style.backgroundColor,
        backdrop: getComputedStyle(document.querySelector('.ambient-image')).backgroundImage,
        weatherLayer: getComputedStyle(document.querySelector('.rain-layer'), '::before').backgroundImage,
        scheme: getComputedStyle(document.documentElement).colorScheme,
        window: getComputedStyle(document.querySelector('.ambient-image')).borderTopLeftRadius,
        avatars: [...document.querySelectorAll('.message.assistant .message-avatar')].map(element => element.textContent),
      };
    });
    const expectCity = async (id, locale) => {
      const theme = themes[id];
      // Buttons ease between colors; wait for the transition to settle.
      await page.waitForFunction(color => getComputedStyle(document.querySelector('.new-session')).backgroundColor === color, rgb(accents[id]));
      const view = await chrome();
      const expected = {
        theme: id, city: theme.hero, edition: t(locale, theme.edition), subtitle: t(locale, theme.subtitle), tagline: t(locale, theme.tagline), breadcrumb: t(locale, theme.subtitle),
        volume: t(locale, theme.volume), headline: t(locale, theme.headline), location: t(locale, theme.location), coordinates: theme.coordinates,
        star: theme.glyph, orbit: theme.glyph, weather: t(locale, theme.weather), station: t(locale, theme.station), placeholder: t(locale, theme.placeholder),
        footer: workspace, accent: rgb(accents[id]),
      };
      for (const [key, value] of Object.entries(expected)) assert.equal(view[key], value, `${id}/${locale}: ${key}`);
      assert.ok(view.backdrop.includes(theme.backdrop), `${id}: backdrop ${view.backdrop.slice(-80)}`);
      assert.ok(view.avatars.every(glyph => glyph === theme.glyph), `${id}: assistant avatars ${view.avatars}`);
      // Tokyo stays a night edition; the other cities are daylight editions,
      // each with its own weather: maple leaves, sea glitter or rimmed snow.
      // (Tokyo's dark scheme comes from the page's color-scheme meta tag.)
      assert.equal(view.scheme, id === 'tokyo' ? 'normal' : 'light', `${id}: color scheme`);
      if (id === 'tokyo' || id === 'hokkaido') assert.match(view.weatherLayer, /^radial-gradient/);
      else assert.match(view.weatherLayer, /^url\("data:image\/svg\+xml/);
      // Kyoto's lantern lane is seen through a round window; elsewhere it is full-bleed.
      assert.equal(view.window, id === 'kyoto' ? '50%' : '0px', `${id}: backdrop framing`);
    };

    await stage('the saved city paints the welcome screen and plays its soundtrack without a click', async () => {
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'kyoto' && document.querySelector('#hero-city').textContent === 'KYOTO');
      // The city is chosen before the first style pass: nothing eases out of Tokyo.
      // (Focus may still ease the composer border, exactly as in Tokyo.)
      assert.deepEqual(await page.evaluate(() => document.getAnimations().filter(animation => animation.transitionProperty && animation.effect?.target?.matches('.new-session, .send-button, .quota-fill')).map(animation => animation.transitionProperty)), []);
      await ready();
      await expectCity('kyoto', 'en');
      await playing('en', 'kyoto');
      assert.equal(await windowBackground(), themes.kyoto.windowBackground);
      await page.screenshot({ path: path.join(testRoot, 'welcome-kyoto.png') });
    });

    await stage('every city backdrop and preview sprite decodes from the shipped files', async () => {
      const sizes = await page.evaluate(async files => Promise.all(files.map(async file => {
        const image = new Image();
        image.src = new URL(`assets/${file}`, location.href).href;
        await image.decode();
        return [file, image.naturalWidth, image.naturalHeight];
      })), [...ids.map(id => themes[id].backdrop), 'theme-previews.webp']);
      for (const [file, width, height] of sizes) assert.ok(width > 0 && height > 0, `${file} decodes`);
    });

    await stage('a reply shows the city glyph as its avatar', async () => {
      await page.locator('#prompt').fill('Theme fixture message');
      await page.locator('#send-button').click();
      await page.waitForFunction(() => document.querySelector('#stop-button').hidden && document.querySelectorAll('.message.assistant').length > 0);
      assert.deepEqual(await page.locator('.message.assistant .message-avatar').allTextContents(), ['✿']);
    });

    await stage('previewing cities changes colors, copy, weather and music; closing restores the saved city', async () => {
      const before = await starts();
      await openSettings();
      assert.equal(await page.locator('input[name="theme"]:checked').inputValue(), 'kyoto');
      for (const id of ['okinawa', 'hokkaido', 'tokyo']) {
        await pick(id);
        await expectCity(id, 'en');
        await playing('en', id);
        await page.screenshot({ path: path.join(testRoot, `settings-${id}.png`) });
      }
      assert.equal(readState().settings.theme, 'kyoto', 'a preview is not saved');
      await closeSettings();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'kyoto');
      await expectCity('kyoto', 'en');
      await playing('en', 'kyoto');
      assert.equal(await starts(), before, 'previews never reconnect the engine');
    });

    await stage('a city preview follows a language preview, and both revert together', async () => {
      await openSettings();
      await pick('hokkaido');
      await page.locator('#language-select').selectOption('ja');
      await page.waitForFunction(() => document.documentElement.lang === 'ja');
      await expectCity('hokkaido', 'ja');
      assert.equal(await page.locator('.theme-option[data-theme-option="okinawa"] .theme-name').textContent(), '沖縄');
      await closeSettings();
      await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dataset.theme === 'kyoto');
      await expectCity('kyoto', 'en');
    });

    await stage('saving a city persists it without reconnecting, and it survives a restart', async () => {
      const before = await starts();
      await openSettings();
      await pick('hokkaido');
      await page.locator('#save-settings-button').click();
      await page.locator('#settings-dialog').waitFor({ state: 'hidden' });
      assert.equal(readState().settings.theme, 'hokkaido');
      assert.equal(await starts(), before);
      await expectCity('hokkaido', 'en');
      assert.equal(await windowBackground(), themes.hokkaido.windowBackground, 'the native window follows the saved city');
      await page.screenshot({ path: path.join(testRoot, 'welcome-hokkaido.png') });
      await desktop.close();
      desktop = await _electron.launch({ args: ['--mute-audio', path.join(__dirname, 'fixtures', 'ui-app.cjs')], env });
      page = await desktop.firstWindow();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'hokkaido' && document.querySelector('#hero-city')?.textContent === 'HOKKAIDO');
      await ready();
      await expectCity('hokkaido', 'en');
      await playing('en', 'hokkaido');
    });

    await stage('returning to Tokyo restores the original edition exactly', async () => {
      await page.locator('#settings-button').click();
      await page.locator('#settings-dialog').waitFor({ state: 'visible' });
      await page.locator('.theme-option[data-theme-option="tokyo"]').click();
      await page.locator('#save-settings-button').click();
      await page.locator('#settings-dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'tokyo');
      await expectCity('tokyo', 'en');
      const tokyo = await page.evaluate(() => ({
        star: getComputedStyle(document.querySelector('.hero-star')).color,
        pin: getComputedStyle(document.querySelector('.location-pin')).color,
        radius: getComputedStyle(document.querySelector('.new-session')).borderTopLeftRadius,
        sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundImage,
        panel: getComputedStyle(document.querySelector('.main-panel')).backgroundColor,
      }));
      assert.deepEqual(tokyo, { star: rgb('#d4eb89'), pin: rgb('#dc927c'), radius: '7px', sidebar: 'linear-gradient(160deg, rgb(18, 25, 28), rgb(15, 21, 23) 65%)', panel: rgb('#0b1116') });
      assert.equal(readState().settings.theme, 'tokyo');
      assert.equal(await windowBackground(), themes.tokyo.windowBackground);
    });
    assert.deepEqual(errors, []);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(testRoot, 'failure.png') }).catch(() => {});
    errors.push(error.stack || error.message); throw error;
  } finally {
    if (desktop) await desktop.close().catch(() => {});
    fs.writeFileSync(path.join(testRoot, 'results.json'), JSON.stringify({ isolated: true, packagedResources: process.argv.includes('--packaged'), realGenerations: 0, results, errors }, null, 2));
    console.log(JSON.stringify({ passed: results.length, failed: errors.length, output: testRoot }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
