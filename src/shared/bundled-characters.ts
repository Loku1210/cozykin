export const BUNDLED_CHARACTER_DIRS = ['cookie', 'pudding', 'cookie-front', 'pudding-front'] as const;

export const BUNDLED_PACKAGE_IDS: ReadonlySet<string> = new Set(
  BUNDLED_CHARACTER_DIRS.map((directory) => `cozykin-${directory}`)
);

export const REQUIRED_BUNDLED_CHARACTER_DIRS: ReadonlySet<string> = new Set(
  BUNDLED_CHARACTER_DIRS
);

export const BUNDLED_CHARACTER_DISPLAY_NAMES: ReadonlyMap<string, string> = new Map([
  ['cookie', 'Cookie'],
  ['pudding', 'Pudding'],
  ['cookie-front', 'Cookie（正面）'],
  ['pudding-front', '小布丁（正面）']
]);
