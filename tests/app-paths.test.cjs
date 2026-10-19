'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appRoot, adoptLegacyRoot } = require('../src/app-paths.cjs');

test('Mac profiles survive app moves and development builds', () => {
  const appData = path.resolve('fixture/Library/Application Support');
  for (const isPackaged of [false, true]) for (const location of ['Applications', 'Volumes/Read Only', 'AppTranslocation/random']) {
    const root = appRoot({ platform: 'darwin', appData, isPackaged, executablePath: path.resolve(location, 'Akari.app/Contents/MacOS/Akari'), sourceRoot: path.resolve('checkout') });
    assert.equal(root, path.join(appData, 'Akari'));
  }
});

test('Windows keeps existing portable roots and QA overrides isolate both platforms', () => {
  const sourceRoot = path.resolve('checkout');
  const executablePath = path.join(sourceRoot, 'App', 'Akari.exe');
  for (const isPackaged of [false, true]) assert.equal(appRoot({ platform: 'win32', isPackaged, executablePath, sourceRoot }), sourceRoot);
  for (const platform of ['darwin', 'win32']) {
    const testRoot = path.resolve('isolated QA');
    assert.equal(appRoot({ platform, testRoot }), testRoot);
    assert.throws(() => appRoot({ platform, testRoot: 'relative' }), /absolute/);
  }
});

function withAppData(run) {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-app-data-'));
  try { return run(appData, path.join(appData, 'Akari'), path.join(appData, 'Grokbuild Tokyo')); }
  finally { fs.rmSync(appData, { recursive: true, force: true }); }
}

function writeLegacyProfile(legacy) {
  fs.mkdirSync(path.join(legacy, 'data', 'browser'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'Workspace', 'project'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'data', 'conversations.json'), '{"saved":true}');
}

// Creating directory links needs extra rights on Windows; the Mac behaviour is what matters.
const linkTest = process.platform === 'win32' ? test.skip : test;

linkTest('Mac data saved as Grokbuild Tokyo moves to Akari and the old path still resolves', () => withAppData((appData, root, legacy) => {
  writeLegacyProfile(legacy);
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'darwin', appData }), { root, movedFrom: legacy });
  assert.equal(fs.readFileSync(path.join(root, 'data', 'conversations.json'), 'utf8'), '{"saved":true}');
  assert.ok(fs.lstatSync(legacy).isSymbolicLink());
  assert.equal(fs.realpathSync(path.join(legacy, 'Workspace', 'project')), fs.realpathSync(path.join(root, 'Workspace', 'project')));
  // The next launch finds Akari in place and leaves the link alone.
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'darwin', appData }), { root, movedFrom: null });
  assert.ok(fs.lstatSync(legacy).isSymbolicLink());
}));

test('An existing Akari folder wins and the old folder is left untouched', () => withAppData((appData, root, legacy) => {
  writeLegacyProfile(legacy);
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'darwin', appData }), { root, movedFrom: null });
  assert.ok(fs.lstatSync(legacy).isDirectory());
  assert.ok(fs.existsSync(path.join(legacy, 'data', 'conversations.json')));
  assert.ok(!fs.existsSync(path.join(root, 'data', 'conversations.json')));
}));

test('A first launch with no earlier data starts in the Akari folder', () => withAppData((appData, root, legacy) => {
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'darwin', appData }), { root, movedFrom: null });
  assert.ok(!fs.existsSync(legacy));
  assert.ok(!fs.existsSync(root));
}));

test('When the old folder cannot be moved the app keeps using it instead of starting empty', () => withAppData((appData, root, legacy) => {
  writeLegacyProfile(legacy);
  const failingFs = { ...fs, renameSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } };
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'darwin', appData, fs: failingFs }), { root: legacy, movedFrom: null });
  assert.ok(fs.lstatSync(legacy).isDirectory());
}));

test('A failed link after the move keeps the moved data', () => withAppData((appData, root, legacy) => {
  writeLegacyProfile(legacy);
  const noLinks = { ...fs, symlinkSync: () => { throw Object.assign(new Error('not permitted'), { code: 'EPERM' }); } };
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'darwin', appData, fs: noLinks }), { root, movedFrom: legacy });
  assert.ok(fs.existsSync(path.join(root, 'data', 'conversations.json')));
}));

test('Windows roots, QA roots and custom roots are never moved', () => withAppData((appData, root, legacy) => {
  writeLegacyProfile(legacy);
  assert.deepEqual(adoptLegacyRoot(root, { platform: 'win32', appData }), { root, movedFrom: null });
  const testRoot = path.join(appData, 'QA');
  assert.deepEqual(adoptLegacyRoot(testRoot, { platform: 'darwin', appData, testRoot }), { root: testRoot, movedFrom: null });
  const elsewhere = path.join(appData, 'nested', 'Akari');
  assert.deepEqual(adoptLegacyRoot(elsewhere, { platform: 'darwin', appData }), { root: elsewhere, movedFrom: null });
  assert.ok(fs.lstatSync(legacy).isDirectory());
}));
