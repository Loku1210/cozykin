// Headless equivalent of the Runtime interaction path. This intentionally uses
// compiled main-process helpers plus the shipped Pack JSON; it does not claim
// to launch Electron's GUI.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = process.cwd();
const { BUNDLED_CHARACTER_DIRS } = require('../dist-main/shared/bundled-characters.js');
const {
  canvasPixelCoordinates,
  companionWindowSize,
  flushSettingsPatch,
  isTransparentPixel,
  mergePendingSettings,
  renderedCanvasSize,
  resolveRuntimeSleepIndicator,
  resolveRuntimeWakeBehavior,
  visibleBoundsCacheKey
} = require('../dist-main/shared/runtime-state.js');

const expectedDirectories = ['cookie', 'pudding', 'cookie-front', 'pudding-front'];
assert.deepEqual(BUNDLED_CHARACTER_DIRS, expectedDirectories);

const packs = BUNDLED_CHARACTER_DIRS.map((directory) => {
  const path = join(root, 'examples', directory);
  return {
    directory,
    manifest: JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')),
    character: JSON.parse(readFileSync(join(path, 'character.json'), 'utf8')),
    behaviors: JSON.parse(readFileSync(join(path, 'behaviors.json'), 'utf8'))
  };
});

async function main() {
  for (const pack of packs) {
    assert.equal(pack.manifest.packageId, `cozykin-${pack.directory}`);
    const behaviorIds = new Set(pack.behaviors.behaviors.map((behavior) => behavior.id));
    assert(behaviorIds.has('idle'));
    assert(behaviorIds.has('sleep'));
    assert(behaviorIds.has('stretch'));
    const sleep = pack.behaviors.behaviors.find((behavior) => behavior.id === 'sleep');
    const normal = resolveRuntimeSleepIndicator(pack.manifest.packageId, pack.character.presentation, Boolean(sleep?.mirrorable), 'right');
    const mirrored = resolveRuntimeSleepIndicator(pack.manifest.packageId, pack.character.presentation, Boolean(sleep?.mirrorable), 'left');
    if (pack.directory.endsWith('-front')) {
      assert(pack.character.presentation?.effectAnchors?.sleep, `${pack.directory} must ship a sleep anchor`);
      assert.equal(normal.kind, 'anchor');
      assert.equal(mirrored.kind, 'anchor');
      assert.equal(normal.point.x + mirrored.point.x, 1);
      assert.equal(normal.point.y, mirrored.point.y);
    } else {
      assert.equal(normal.kind, 'side');
      assert.equal(mirrored.kind, 'side');
    }
    assert.equal(resolveRuntimeWakeBehavior(pack.character, pack.behaviors, 0.2), 'stretch');
  }

  const puddingFront = packs.find(({ directory }) => directory === 'pudding-front');
  assert(puddingFront);
  const originalRandom = Math.random;
  let stretch;
  let wakeBlep;
  try {
    Math.random = () => 0.2;
    stretch = resolveRuntimeWakeBehavior(puddingFront.character, puddingFront.behaviors, Math.random());
    Math.random = () => 0.9;
    wakeBlep = resolveRuntimeWakeBehavior(puddingFront.character, puddingFront.behaviors, Math.random());
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(stretch, 'stretch');
  assert.equal(wakeBlep, 'wake-blep');
  assert.equal(Math.random, originalRandom);

  assert.deepEqual(renderedCanvasSize(640, 360, 1.25), { width: 800, height: 450 });
  assert.deepEqual(companionWindowSize(640, 360, 1, false), { width: 704, height: 464 });
  assert.deepEqual(companionWindowSize(640, 360, 1, true), { width: 924, height: 464 });
  assert.deepEqual(canvasPixelCoordinates(170, 100, 640, 360, { left: 10, top: 10, width: 320, height: 180 }), { x: 320, y: 180 });
  assert.equal(isTransparentPixel(10), true);
  assert.equal(isTransparentPixel(11), false);
  assert.notEqual(visibleBoundsCacheKey('file:///frame.png', false), visibleBoundsCacheKey('file:///frame.png', true));

  const pendingSettings = mergePendingSettings({ scale: 0.8 }, { opacity: 0.7 });
  const settingsWrites = [];
  const savedSettings = await flushSettingsPatch(async (patch) => {
    settingsWrites.push(patch);
    return patch;
  }, pendingSettings);
  assert.deepEqual(settingsWrites, [{ scale: 0.8, opacity: 0.7 }]);
  assert.deepEqual(savedSettings, { scale: 0.8, opacity: 0.7 });

  console.log(`runtime presentation smoke: ${packs.length} built-ins passed`);
  console.log(`pudding-front samples: 0.2 -> ${stretch}, 0.9 -> ${wakeBlep}`);
  console.log(`Math.random restored: ${Math.random === originalRandom}`);
  console.log('pixel hit testing wiring: preserved');
  console.log('settings flush wiring: preserved');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
