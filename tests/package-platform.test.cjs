'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseTarget, packageOptions } = require('../scripts/package-config.cjs');
const { packagedArchive, packagedExecutable } = require('../scripts/package-paths.cjs');
const root = path.resolve(__dirname, '..');

test('build defaults preserve Windows x64 and use the native Mac architecture', () => {
  assert.deepEqual(parseTarget([], { platform: 'win32', arch: 'arm64' }), { platform: 'win32', arch: 'x64' });
  assert.deepEqual(parseTarget([], { platform: 'darwin', arch: 'arm64' }), { platform: 'darwin', arch: 'arm64' });
  assert.deepEqual(parseTarget(['--platform', 'win32'], { platform: 'darwin', arch: 'arm64' }), { platform: 'win32', arch: 'x64' });
  assert.deepEqual(parseTarget(['--platform', 'darwin', '--arch', 'universal']), { platform: 'darwin', arch: 'universal' });
  assert.throws(() => parseTarget(['--arch', 'universal'], { platform: 'win32', arch: 'x64' }), /Windows builds/);
  assert.throws(() => parseTarget(['--platform', 'linux']), /Unsupported platform/);
  assert.throws(() => parseTarget(['--arch']), /Usage/);
});

test('Mac and Windows ship the same runtime and assets with platform-specific metadata', () => {
  const mac = packageOptions(root, { platform: 'darwin', arch: 'universal' });
  const win = packageOptions(root, { platform: 'win32', arch: 'x64' });
  assert.equal(mac.electronVersion, '44.9.3');
  assert.equal(win.electronVersion, mac.electronVersion);
  assert.equal(mac.ignore, win.ignore);
  assert.equal(mac.asar, true);
  assert.equal(mac.extendInfo.LSMinimumSystemVersion, '13.0');
  assert.equal(mac.appBundleId, 'com.swf-cmd.dirth');
  assert.ok(mac.icon.endsWith('.icns'));
  assert.ok(win.icon.endsWith('.ico'));
  assert.deepEqual(mac.osxUniversal, { mergeASARs: true });
});

test('wherever people see the app name, it is spelled Dirth with a capital D', () => {
  const { productName } = require('../package.json');
  assert.equal(productName, 'Dirth');
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(html, /<title>Dirth<\/title>/, 'window title');
  assert.match(html, /<div class="brand-name">Dirth<span id="brand-edition"/, 'title-bar wordmark');
  assert.match(fs.readFileSync(path.join(root, 'src', 'main.cjs'), 'utf8'), /app\.setName\('Dirth'\)/, 'menu and dialog name');
  const mac = packageOptions(root, { platform: 'darwin', arch: 'universal' });
  const win = packageOptions(root, { platform: 'win32', arch: 'x64' });
  for (const options of [mac, win]) {
    assert.equal(options.name, productName);
    assert.equal(options.executableName, productName);
  }
  assert.equal(win.win32metadata.FileDescription, productName);
  assert.equal(win.win32metadata.ProductName, productName);
});

test('packaged checks resolve the actual Windows and macOS bundle layouts', () => {
  assert.equal(packagedArchive(root, 'darwin'), path.join(root, 'App', 'Dirth.app', 'Contents', 'Resources', 'app.asar'));
  assert.equal(packagedExecutable(root, 'darwin'), path.join(root, 'App', 'Dirth.app', 'Contents', 'MacOS', 'Dirth'));
  assert.equal(packagedArchive(root, 'win32'), path.join(root, 'App', 'resources', 'app.asar'));
  assert.equal(packagedExecutable(root, 'win32'), path.join(root, 'App', 'Dirth.exe'));
});
