'use strict';
// A release bumps package.json. The download links, archive names and version
// examples in the docs have to follow it, or the README keeps sending visitors
// to the previous release (as after v1.3.1) and bug reports suggest an old one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');

const releaseDocs = [
  'README.md', 'README.zh-CN.md', 'docs/guide.md', 'docs/guide.zh-CN.md',
  'CONTRIBUTING.md', 'CONTRIBUTING.zh-CN.md', '.github/ISSUE_TEMPLATE/bug_report.yml',
];
// Each pattern captures the version in one kind of mention of the current release.
const mentions = [
  /releases\/download\/v(\d+\.\d+\.\d+)\//g,
  /Dirth-(\d+\.\d+\.\d+)-(?:mac|win)-/g,
  /\| v(\d+\.\d+\.\d+) (?:download|下载) \|/g,
  /(?:Current version: |当前版本：)\*\*(\d+\.\d+\.\d+)\*\*/g,
  /placeholder: "App (\d+\.\d+\.\d+);/g,
];

test('Download links, archive names and the bug report example name the packaged version', () => {
  for (const file of releaseDocs) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const found = mentions.flatMap(pattern => [...text.matchAll(pattern)]);
    assert.ok(found.length, `${file} no longer names the release; update this test to its new wording`);
    for (const match of found) assert.equal(match[1], version, `${file}: ${match[0]}`);
  }
});
