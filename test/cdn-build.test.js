/**
 * CDN distribution metadata regression net (slice 1 of #35).
 *
 * The build itself ships a UMD bundle and SRI hashes (separate ticket
 * for the actual build script). This file pins the package.json metadata
 * so future edits cannot silently strip the unpkg / jsdelivr / exports /
 * files fields that CDN consumers rely on.
 */

const fs = require('fs');
const path = require('path');

const PKG_PATH = path.join(__dirname, '..', 'package.json');

describe('package.json: CDN metadata', () => {
  let pkg;
  beforeAll(() => { pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')); });

  test('declares main / module / unpkg / jsdelivr', () => {
    expect(pkg.main).toBe('dist/tablecrafter.cjs.js');
    expect(pkg.module).toBe('dist/tablecrafter.esm.mjs');
    expect(pkg.unpkg).toBe('dist/tablecrafter.umd.min.js');
    expect(pkg.jsdelivr).toBe('dist/tablecrafter.umd.min.js');
  });

  test('files allowlist limits the published tarball to dist and src artefacts', () => {
    expect(pkg.files).toEqual(expect.arrayContaining([
      'dist',
      'src/tablecrafter.js'
    ]));
  });

  test('exports map declares import + require + types entries', () => {
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].require).toBe('./dist/tablecrafter.cjs.js');
    expect(pkg.exports['.'].import).toBe('./dist/tablecrafter.esm.mjs');
    expect(pkg.exports['.'].types).toBe('./src/tablecrafter.d.ts');
  });

  test('build script is wired', () => {
    expect(pkg.scripts && pkg.scripts.build).toBeTruthy();
  });

  test('test script remains wired and untouched', () => {
    expect(pkg.scripts && pkg.scripts.test).toBe('jest');
  });
});
