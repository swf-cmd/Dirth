'use strict';
const path = require('node:path');

function packagedBundle(root) {
  return path.join(root, 'App', 'Akari.app');
}

function packagedArchive(root, platform = process.platform) {
  return platform === 'darwin'
    ? path.join(packagedBundle(root), 'Contents', 'Resources', 'app.asar')
    : path.join(root, 'App', 'resources', 'app.asar');
}

function packagedExecutable(root, platform = process.platform) {
  return platform === 'darwin'
    ? path.join(packagedBundle(root), 'Contents', 'MacOS', 'Akari')
    : path.join(root, 'App', 'Akari.exe');
}

module.exports = { packagedBundle, packagedArchive, packagedExecutable };
