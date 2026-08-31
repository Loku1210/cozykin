import type { BehaviorsFile, CharacterDefinition, CharacterPresentation, NormalizedPoint, WeightedBehaviorVariant } from './types';

export type RuntimeAction = 'clicked' | 'happy' | 'startled' | 'hiss';

export const RAPID_CLICK_WINDOW_MS = 3_000;
export const CLICK_SETTLE_MS = 520;
export const STARTLED_CLICK_THRESHOLD = 3;
export const HISS_CLICK_THRESHOLD = 5;
export const WAKE_REACTION_LOCK_MS = 3_000;
export const IDLE_SLEEP_MS = 5 * 60 * 1_000;
export const EDGE_REVEAL_COOLDOWN_MS = 350;

export interface ClickResolution {
  action: RuntimeAction | null;
  immediate: boolean;
  clickCount: number;
}

export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowDelta {
  dx: number;
  dy: number;
}

export function edgeMotionAllowsHide(delta: WindowDelta, motion?: WindowDelta): boolean {
  if (!motion) return true;
  if (delta.dx < 0) return motion.dx < 0 && Math.abs(motion.dx) >= Math.abs(motion.dy);
  if (delta.dx > 0) return motion.dx > 0 && Math.abs(motion.dx) >= Math.abs(motion.dy);
  if (delta.dy < 0) return motion.dy < 0 && Math.abs(motion.dy) >= Math.abs(motion.dx);
  if (delta.dy > 0) return motion.dy > 0 && Math.abs(motion.dy) >= Math.abs(motion.dx);
  return false;
}

export type CompanionResizeAnchor = 'center' | 'left';

export interface CompanionWindowSize {
  width: number;
  height: number;
}

export interface CompanionWindowBounds extends CompanionWindowSize {
  x: number;
  y: number;
}

export interface FrozenMenuOffset {
  x: number;
  y: number;
}

export type RuntimeDirection = 'left' | 'right';

export interface AccumulatedWalkMovement {
  pixels: number;
  remainder: number;
}

const LEGACY_AUTOMATIC_WALK_VELOCITY_PX_PER_SECOND = 62.5;
const PUDDING_FRONT_AUTHORED_WALK_VELOCITY_PX_PER_SECOND = 50;

/**
 * Converts the authored source-canvas gait velocity to screen pixels. Pudding
 * Front uses a slower four-beat walk so its planted rear paw remains visually
 * anchored instead of being carried forward by the Electron window.
 */
export function automaticWalkVelocityPxPerSecond(packageId: string, displayScale: number): number {
  if (packageId !== 'cozykin-pudding-front') return LEGACY_AUTOMATIC_WALK_VELOCITY_PX_PER_SECOND;
  const scale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 0.75;
  return PUDDING_FRONT_AUTHORED_WALK_VELOCITY_PX_PER_SECOND * scale;
}

/** Retains sub-pixel travel until Electron can receive a non-zero integer delta. */
export function accumulateAutomaticWalkMovement(
  remainder: number,
  direction: RuntimeDirection,
  velocityPxPerSecond: number,
  elapsedMs: number
): AccumulatedWalkMovement {
  const sign = direction === 'left' ? -1 : 1;
  const distance = remainder + sign * velocityPxPerSecond * Math.max(0, elapsedMs) / 1_000;
  const pixels = Math.trunc(distance);
  return {
    pixels,
    remainder: Math.round((distance - pixels) * 1_000_000) / 1_000_000
  };
}

const INVERTED_DRAG_SOURCE_PACKAGES = new Set([
  'cozykin-cookie-front',
  'cozykin-pudding-front'
]);

/** Resolves horizontal mirroring from the source art's authored facing direction. */
export function shouldMirrorBehaviorFrame(
  packageId: string,
  behaviorId: string,
  direction: RuntimeDirection,
  mirrorable: boolean
): boolean {
  if (!mirrorable) return false;
  const sourceFacesLeft = behaviorId === 'dragged' && INVERTED_DRAG_SOURCE_PACKAGES.has(packageId);
  return sourceFacesLeft ? direction === 'right' : direction === 'left';
}

export type RuntimeSleepIndicator =
  | { kind: 'anchor'; point: NormalizedPoint }
  | { kind: 'side'; side: RuntimeDirection };

export interface CanvasClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Mirrors a Pack-provided point when the current frame is horizontally flipped. */
export function mirrorNormalizedPoint(point: NormalizedPoint, mirrored: boolean): NormalizedPoint {
  return mirrored ? { x: 1 - point.x, y: point.y } : { ...point };
}

/**
 * Resolves a Pack's validated wake variants using a caller-provided random
 * sample. Pack 1.0 remains compatible through the legacy stretch fallback.
 */
export function resolveWakeBehavior(
  variants: WeightedBehaviorVariant[] | undefined,
  randomSample: number,
  availableBehaviors: ReadonlySet<string>
): string {
  const availableVariants = (variants ?? []).filter((variant) => (
    availableBehaviors.has(variant.behaviorId) && Number.isFinite(variant.weight) && variant.weight > 0
  ));
  if (!availableVariants.length) return availableBehaviors.has('stretch') ? 'stretch' : 'idle';

  const totalWeight = availableVariants.reduce((total, variant) => total + variant.weight, 0);
  const sample = Number.isFinite(randomSample)
    ? Math.min(Math.max(randomSample, 0), 1 - Number.EPSILON)
    : 0;
  let boundary = 0;
  for (const variant of availableVariants) {
    boundary += variant.weight / totalWeight;
    if (sample < boundary) return variant.behaviorId;
  }
  return availableVariants[availableVariants.length - 1]!.behaviorId;
}

/** Renderer-facing wake adapter: uses the Pack presentation and actual behavior inventory together. */
export function resolveRuntimeWakeBehavior(
  character: CharacterDefinition | undefined,
  behaviors: BehaviorsFile | undefined,
  randomSample: number
): string {
  const availableBehaviors = new Set(behaviors?.behaviors.map((entry) => entry.id));
  return resolveWakeBehavior(character?.presentation?.wakeVariants, randomSample, availableBehaviors);
}

/** Renderer-facing sleep adapter for Pack 1.1 anchors and Pack 1.0 legacy sides. */
export function resolveRuntimeSleepIndicator(
  packageId: string,
  presentation: CharacterPresentation | undefined,
  mirrorable: boolean,
  direction: RuntimeDirection
): RuntimeSleepIndicator {
  const anchor = presentation?.effectAnchors?.sleep;
  if (anchor) return { kind: 'anchor', point: mirrorNormalizedPoint(anchor, mirrorable && direction === 'left') };
  const sourceSide = packageId === 'cozykin-pudding' ? 'left' : packageId === 'cozykin-cookie' ? 'right' : direction;
  const side = mirrorable && direction === 'left' ? (sourceSide === 'left' ? 'right' : 'left') : sourceSide;
  return { kind: 'side', side };
}

/**
 * A menu resize is anchored to the window's bottom-left corner. The Runtime
 * stage is also bottom-left aligned while the menu is open, so changing scale
 * no longer moves the character in the opposite direction on every slider
 * update. Ordinary menu-free resizes remain centred.
 */
export function companionResizeAnchor(menuOpen: boolean, wasMenuOpen: boolean): CompanionResizeAnchor {
  return menuOpen || wasMenuOpen ? 'left' : 'center';
}

/** Clamp only at menu mode boundaries, never during its live scale preview. */
export function shouldConstrainCompanionResize(menuOpen: boolean, wasMenuOpen: boolean): boolean {
  return !menuOpen || !wasMenuOpen;
}

/** Returns an integer resize that preserves the selected screen-space anchor. */
export function companionResizeBounds(
  current: CompanionWindowBounds,
  next: CompanionWindowSize,
  anchor: CompanionResizeAnchor
): CompanionWindowBounds {
  const width = Math.round(next.width);
  const height = Math.round(next.height);
  return {
    x: anchor === 'left' ? current.x : current.x + Math.round((current.width - width) / 2),
    y: anchor === 'left' ? current.y + current.height - height : current.y + Math.round((current.height - height) / 2),
    width,
    height
  };
}

/**
 * With a bottom-left anchored window, its right edge moves by the complete
 * width delta while its bottom edge stays fixed. Translate the menu by the
 * inverse width delta so it remains at one screen coordinate during preview.
 */
export function frozenMenuOffset(committed: CompanionWindowSize, preview: CompanionWindowSize): FrozenMenuOffset {
  return {
    x: committed.width - preview.width,
    y: 0
  };
}

/**
 * The normal window reserves only the transparent breathing room needed for
 * speech. When the context menu is open it adds a compact sidecar to the
 * right of the current rendered size instead of allocating the 150% canvas.
 */
export function companionWindowSize(canvasWidth: number, canvasHeight: number, scale: number, menuOpen: boolean): CompanionWindowSize {
  const { width: renderedWidth, height: renderedHeight } = renderedCanvasSize(canvasWidth, canvasHeight, scale);
  if (!menuOpen) return { width: renderedWidth + 64, height: renderedHeight + 104 };
  return {
    width: renderedWidth + 284,
    height: Math.max(renderedHeight + 104, 430)
  };
}

/** Computes the CSS canvas dimensions without assuming a square source canvas. */
export function renderedCanvasSize(canvasWidth: number, canvasHeight: number, scale: number): CompanionWindowSize {
  return { width: Math.round(canvasWidth * scale), height: Math.round(canvasHeight * scale) };
}

/** Maps a CSS pointer coordinate into the source-canvas pixel sampled by Runtime. */
export function canvasPixelCoordinates(
  clientX: number,
  clientY: number,
  canvasWidth: number,
  canvasHeight: number,
  rect: CanvasClientRect
): { x: number; y: number } {
  return {
    x: Math.floor((clientX - rect.left) * canvasWidth / rect.width),
    y: Math.floor((clientY - rect.top) * canvasHeight / rect.height)
  };
}

export function isTransparentPixel(alpha: number, threshold = 10): boolean {
  return alpha <= threshold;
}

/** Gives mirrored copies of an asset their own alpha-bound cache entry. */
export function visibleBoundsCacheKey(assetUrl: string, mirrored: boolean): string {
  return `${assetUrl}|${mirrored ? 'mirrored' : 'normal'}`;
}

/** Applies the newest local settings patch without losing other queued fields. */
export function mergePendingSettings<T extends object>(pending: Partial<T>, patch: Partial<T>): Partial<T> {
  return { ...pending, ...patch };
}

/** Retries one transient settings write without issuing concurrent saves. */
export async function retrySettingsSave<T extends object>(
  save: (patch: Partial<T>) => Promise<T>,
  patch: Partial<T>,
  attempts = 2
): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      return await save(patch);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

/** Executes the renderer's single settings-flush boundary. */
export async function flushSettingsPatch<T extends object>(
  save: (patch: Partial<T>) => Promise<T>,
  patch: Partial<T>
): Promise<T | null> {
  return Object.keys(patch).length > 0 ? retrySettingsSave(save, patch) : null;
}

/**
 * Returns the movement needed to leave only `visiblePixels` of the rendered
 * character on screen. The caller must pass the alpha-pixel bounds, not the
 * transparent Electron window or canvas bounds.
 */
export function edgeHideDelta(rect: PixelRect, workArea: WorkArea, visiblePixels = 58, threshold = 6): WindowDelta | null {
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;
  if (rect.left <= workArea.x + threshold) return { dx: workArea.x + visiblePixels - rect.right, dy: 0 };
  if (rect.right >= workRight - threshold) return { dx: workRight - visiblePixels - rect.left, dy: 0 };
  if (rect.top <= workArea.y + threshold) return { dx: 0, dy: workArea.y + visiblePixels - rect.bottom };
  if (rect.bottom >= workBottom - threshold) return { dx: 0, dy: workBottom - visiblePixels - rect.top };
  return null;
}

/** Restores an alpha-pixel rectangle that is partially outside its display. */
export function edgeRevealDelta(rect: PixelRect, workArea: WorkArea): WindowDelta | null {
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;
  if (rect.left < workArea.x) return { dx: workArea.x - rect.left, dy: 0 };
  if (rect.right > workRight) return { dx: workRight - rect.right, dy: 0 };
  if (rect.top < workArea.y) return { dx: 0, dy: workArea.y - rect.top };
  if (rect.bottom > workBottom) return { dx: 0, dy: workBottom - rect.bottom };
  return null;
}

export function recentClicks(clicks: number[], now: number, windowMs = 1200): number[] {
  return [...clicks.filter((time) => now - time <= windowMs), now];
}

export function resolveRapidClicks(clickCount: number): ClickResolution {
  if (clickCount >= HISS_CLICK_THRESHOLD) return { action: 'hiss', immediate: true, clickCount };
  if (clickCount >= STARTLED_CLICK_THRESHOLD) return { action: 'startled', immediate: true, clickCount };
  return { action: null, immediate: false, clickCount };
}

export function canRevealEdge(hiddenAt: number, now: number, cooldownMs = EDGE_REVEAL_COOLDOWN_MS): boolean {
  return hiddenAt <= 0 || now - hiddenAt >= cooldownMs;
}

export function shouldEnterSleep(lastInteractionAt: number, now: number, idleMs = IDLE_SLEEP_MS): boolean {
  return now - lastInteractionAt >= idleMs;
}

export function resolveSettledClicks(clickCount: number): RuntimeAction | null {
  if (clickCount <= 0) return null;
  return clickCount === 1 ? 'clicked' : 'happy';
}

export function frameDurationAt(frameDurationMs: number, frameDurationsMs: number[] | undefined, index: number): number {
  const configured = frameDurationsMs?.[index];
  return Number.isFinite(configured) ? Math.max(40, Math.min(6000, configured!)) : frameDurationMs;
}

/** Locks a non-looping reaction for exactly the time needed to show every frame. */
export function behaviorPlaybackDurationMs(frameCount: number, frameDurationMs: number, frameDurationsMs?: number[]): number {
  return Array.from({ length: Math.max(0, frameCount) }, (_, index) => frameDurationAt(frameDurationMs, frameDurationsMs, index))
    .reduce((total, duration) => total + duration, 0);
}
