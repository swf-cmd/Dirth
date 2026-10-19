'use strict';

// Repaint the Kyoto, Okinawa and Hokkaido backdrops and the theme picker
// previews: node scripts/render-backdrops.cjs [--theme kyoto] [--preview]
// Every stroke comes from scripts/backdrop-art.js and a fixed seed; no photos,
// downloads, image models or fonts are used. --preview writes PNG copies to
// work/backdrops for review instead of replacing the shipped WebP files.
if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  app.commandLine.appendSwitch('force-color-profile', 'srgb');
  app.whenReady().then(() => {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.loadURL('data:text/html,<title>Backdrop renderer</title><body style="margin:0;background:#000"></body>');
  });
} else {
  const { _electron } = require('playwright');
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const assets = path.join(root, 'src', 'renderer', 'assets');
  const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
  const preview = process.argv.includes('--preview');
  const requested = option('--theme');
  const { themes: registry, ids, previewSprite: previewFile } = require('../src/themes.js');
  // Tokyo keeps its original generated photograph; the other cities are painted.
  const backdropFiles = Object.fromEntries(ids.filter(id => id !== 'tokyo').map(id => [id, registry[id].backdrop]));
  const themes = requested ? [requested] : Object.keys(backdropFiles);
  (async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const desktop = await _electron.launch({ args: [__filename], env });
    const outputDir = preview ? path.join(root, 'work', 'backdrops') : assets;
    fs.mkdirSync(outputDir, { recursive: true });
    try {
      const page = await desktop.firstWindow();
      await page.addScriptTag({ path: path.join(__dirname, 'backdrop-art.js') });
      const report = [];
      for (const theme of themes) {
        if (!Object.hasOwn(backdropFiles, theme)) throw new Error(`Unknown backdrop theme: ${theme}`);
        const began = Date.now();
        const result = await page.evaluate(async ({ theme, preview }) => {
          const canvas = await window.paintBackdrop(theme);
          const encode = (type, quality) => canvas.toDataURL(type, quality).split(',')[1];
          return { width: canvas.width, height: canvas.height, webp: encode('image/webp', 0.9), png: preview ? encode('image/png') : null };
        }, { theme, preview });
        const file = path.join(outputDir, backdropFiles[theme]);
        fs.writeFileSync(file, Buffer.from(result.webp, 'base64'));
        if (result.png) fs.writeFileSync(file.replace(/\.webp$/, '.png'), Buffer.from(result.png, 'base64'));
        report.push({ theme, file: path.relative(root, file), width: result.width, height: result.height, bytes: fs.statSync(file).size, seconds: (Date.now() - began) / 1000 });
      }
      // The picker shows every city, so its sprite is rebuilt from the shipped
      // artwork (including the original Tokyo image) whenever any city changes.
      const located = ids.map(id => registry[id].backdrop).map(name => [path.join(outputDir, name), path.join(assets, name)].find(file => fs.existsSync(file)));
      if (located.some(file => !file)) {
        console.log(JSON.stringify(report, null, 2));
        console.log('Theme previews skipped until every backdrop has been painted.');
        return;
      }
      const sources = located.map(file => `data:image/${file.endsWith('.png') ? 'png' : 'webp'};base64,${fs.readFileSync(file).toString('base64')}`);
      const frames = ids.map(id => (id === 'kyoto' ? 'window' : 'cover'));
      const sprite = await page.evaluate(({ sources, frames }) => window.paintThemePreviews(sources, frames).then(canvas => canvas.toDataURL('image/webp', 0.86).split(',')[1]), { sources, frames });
      const spriteFile = path.join(outputDir, previewFile);
      fs.writeFileSync(spriteFile, Buffer.from(sprite, 'base64'));
      report.push({ file: path.relative(root, spriteFile), bytes: fs.statSync(spriteFile).size });
      console.log(JSON.stringify(report, null, 2));
    } finally { await desktop.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
