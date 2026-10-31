'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { packageFiles, ignorePackagePath, validatePackageSource, installPackagedBuild } = require('../scripts/package-policy.cjs');
const root = path.resolve(__dirname, '..');

test('the public package ignore callback excludes secrets and unknown files at every depth', () => {
  // Packager documents a root-relative path (with a leading slash) for ignore.
  // verify-package.cjs checks the actual produced ASAR inventory after building.
  for (const file of packageFiles) assert.equal(ignorePackagePath('/' + file), false, file);
  for (const file of ['.env', '.env.production', '.npmrc', 'auth.json', 'private-key.pem', 'debug.log', 'backup.zip', '.git/config', 'data/conversations.json', 'dist/old.zip', 'out/report.json', 'coverage/credentials.json', 'src/.env', 'src/secret.cjs', 'src/renderer/assets/private.png', 'node_modules/example/index.js']) {
    assert.equal(ignorePackagePath('/' + file), true, `must not ship ${file}`);
    assert.equal(ignorePackagePath('\\' + file.replaceAll('/', '\\')), true, `Windows must not ship ${file}`);
  }
});

test('the window runs the Markdown parser and sanitizer versions that the audit checks', () => {
  // npm audit reads package.json, but the window loads the copies in
  // src/renderer/vendor: updating the package alone would ship the old file.
  const manifest = require('../package.json');
  const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  for (const { name, title, vendored, dist, license, upstreamLicense } of [
    { name: 'dompurify', title: 'DOMPurify', vendored: 'src/renderer/vendor/purify.min.js', dist: 'dist/purify.min.js', license: 'licenses/DOMPurify-LICENSE.txt', upstreamLicense: 'LICENSE' },
    { name: 'marked', title: 'Marked', vendored: 'src/renderer/vendor/marked.umd.js', dist: 'lib/marked.umd.js', license: 'licenses/marked-LICENSE.txt', upstreamLicense: 'LICENSE' },
  ]) {
    const version = manifest.devDependencies[name];
    const installed = path.join('node_modules', name);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, installed, 'package.json'), 'utf8')).version, version, `run npm ci: ${name} ${version} is not installed`);
    assert.equal(digest(vendored), digest(path.join(installed, dist)), `${vendored} must be a copy of ${name} ${version}'s ${dist}`);
    assert.equal(digest(license), digest(path.join(installed, upstreamLicense)), `${license} must match ${name} ${version}`);
    assert.ok(notices.includes(`| ${version} | \`${vendored}\``), `THIRD_PARTY_NOTICES.md must list ${title} ${version}`);
  }
});

test('package validation rejects junctions before dereferencing allowed source paths', () => {
  fs.mkdirSync(path.join(root, 'work'), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(root, 'work/package-security-'));
  try {
    for (const file of packageFiles) {
      fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      fs.writeFileSync(path.join(fixture, file), 'fixture');
    }
    validatePackageSource(fixture);
    const source = path.join(fixture, 'src');
    const privateSource = path.join(fixture, 'private-source');
    fs.renameSync(source, privateSource);
    fs.symlinkSync(privateSource, source, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => validatePackageSource(fixture), /symbolic link/);
    fs.unlinkSync(source);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('installing a package excludes stale destination secrets and preserves the previous build', () => {
  const fixture = fs.mkdtempSync(path.join(root, 'work/package-install-'));
  try {
    const staged = path.join(fixture, 'work/package/new-build');
    fs.mkdirSync(staged, { recursive: true });
    fs.mkdirSync(path.join(fixture, 'App'));
    fs.writeFileSync(path.join(fixture, 'App/credentials.txt'), 'test-only sentinel');
    fs.writeFileSync(path.join(staged, 'app.exe'), 'new test build');
    const { appDir, backup } = installPackagedBuild(fixture, staged);
    assert.deepEqual(fs.readdirSync(appDir), ['app.exe']);
    assert.equal(fs.readFileSync(path.join(backup, 'credentials.txt'), 'utf8'), 'test-only sentinel');
    assert.throws(() => installPackagedBuild(fixture, path.join(fixture, 'outside')), /inside work\/package/);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});
