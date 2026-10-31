'use strict';

// Test-only entry point: start the production main process with error boxes
// written to error-box.json in TOKYO_TEST_ROOT, where the test reads them,
// instead of shown.
const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
dialog.showErrorBox = (title, content) => fs.writeFileSync(path.join(process.env.TOKYO_TEST_ROOT, 'error-box.json'), JSON.stringify({ title, content }));
require(path.join(process.env.TOKYO_UI_SOURCE_ROOT || path.resolve(__dirname, '../..'), 'src', 'main.cjs'));
