import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { accumulateAutomaticWalkMovement, automaticWalkVelocityPxPerSecond, behaviorPlaybackDurationMs, canvasPixelCoordinates, canRevealEdge, CLICK_SETTLE_MS, companionResizeAnchor, companionWindowSize, edgeHideDelta, edgeMotionAllowsHide, edgeRevealDelta, flushSettingsPatch, frameDurationAt, frozenMenuOffset, IDLE_SLEEP_MS, isTransparentPixel, mergePendingSettings, RAPID_CLICK_WINDOW_MS, recentClicks, renderedCanvasSize, resolveRapidClicks, resolveRuntimeSleepIndicator, resolveRuntimeWakeBehavior, resolveSettledClicks, shouldConstrainCompanionResize, shouldEnterSleep, shouldMirrorBehaviorFrame, visibleBoundsCacheKey, WAKE_REACTION_LOCK_MS } from '../shared/runtime-state';
import type { PixelRect } from '../shared/runtime-state';
import type { AppSettings, DialogueCategory, DialogueConfig, RuntimeCharacter } from '../shared/types';
import './styles.css';

type Direction = 'left' | 'right';
type PointerStart = { x: number; y: number; pointerId: number; dragging: boolean; lastDx: number; lastDy: number };

function assetUrl(character: RuntimeCharacter, path: string): string { return new URL(path, character.assetBaseUrl).href; }
function randomItem(values: string[]): string { return values[Math.floor(Math.random() * values.length)] ?? ''; }

function alphaPixelRect(canvas: HTMLCanvasElement): PixelRect {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let minX = 0; let minY = 0; let maxX = canvas.width - 1; let maxY = canvas.height - 1;
  if (context) try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    minX = canvas.width; minY = canvas.height; maxX = -1; maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3]! <= 10) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (maxX < 0) { minX = 0; minY = 0; maxX = canvas.width - 1; maxY = canvas.height - 1; }
  } catch { /* Fall back to the canvas rectangle if pixel access is unavailable. */ }
  return { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 };
}

function updateVisibleCssBounds(canvas: HTMLCanvasElement, visible: PixelRect): void {
  const stage = canvas.parentElement;
  if (!stage) return;
  stage.style.setProperty('--pet-left', `${visible.left / canvas.width * 100}%`);
  stage.style.setProperty('--pet-top', `${visible.top / canvas.height * 100}%`);
  stage.style.setProperty('--pet-right', `${visible.right / canvas.width * 100}%`);
}

function visibleCharacterRect(canvas: HTMLCanvasElement, windowBounds: { x: number; y: number }, alphaBounds = alphaPixelRect(canvas)): PixelRect {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width; const scaleY = rect.height / canvas.height;
  return {
    left: windowBounds.x + rect.left + alphaBounds.left * scaleX,
    top: windowBounds.y + rect.top + alphaBounds.top * scaleY,
    right: windowBounds.x + rect.left + alphaBounds.right * scaleX,
    bottom: windowBounds.y + rect.top + alphaBounds.bottom * scaleY
  };
}

function RuntimeApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const imageCache = useRef(new Map<string, HTMLImageElement>());
  const visibleBoundsCache = useRef(new Map<string, PixelRect>());
  const currentVisibleBounds = useRef<PixelRect | null>(null);
  const direction = useRef<Direction>('right');
  const pointerStart = useRef<PointerStart | null>(null);
  const clickTimes = useRef<number[]>([]);
  const clickSettleTimer = useRef<number | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const movementTimer = useRef<number | null>(null);
  const resizeTimer = useRef<number | null>(null);
  const windowSizingMode = useRef<'runtime' | 'menu'>('runtime');
  const settingsRef = useRef<AppSettings | null>(null);
  const pendingSettings = useRef<Partial<AppSettings>>({});
  const settingsSaveGeneration = useRef(0);
  const settingsFlushInFlight = useRef<Promise<void> | null>(null);
  const settingsRetryTimer = useRef<number | null>(null);
  const automaticSettingsRetries = useRef(0);
  const settingsFlushRequiresDrain = useRef(false);
  const scalePreviewRef = useRef<number | null>(null);
  const behaviorRef = useRef('idle');
  const lastInteractionAt = useRef(Date.now());
  const sleepingRef = useRef(false);
  const reactionLockedUntil = useRef(0);
  const edgeHiddenAt = useRef(0);
  const edgeCheckPending = useRef(false);
  const latestEdgeMotion = useRef({ dx: 0, dy: 0 });
  const [character, setCharacter] = useState<RuntimeCharacter | null>(null);
  const [dialogues, setDialogues] = useState<DialogueConfig | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [behaviorId, setBehaviorId] = useState('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const [bubble, setBubble] = useState('');
  const [scalePreview, setScalePreview] = useState<number | null>(null);
  const [interactionVersion, setInteractionVersion] = useState(0);

  const load = useCallback(async () => {
    const [nextCharacter, nextSettings] = await Promise.all([window.cozykin.getActiveCharacter(), window.cozykin.getSettings()]);
    const nextDialogues = await window.cozykin.getDialogues(nextCharacter.manifest.packageId);
    imageCache.current.clear();
    visibleBoundsCache.current.clear();
    currentVisibleBounds.current = null;
    lastInteractionAt.current = Date.now();
    sleepingRef.current = false;
    reactionLockedUntil.current = 0;
    edgeHiddenAt.current = 0;
    scalePreviewRef.current = null;
    setScalePreview(null);
    settingsRef.current = nextSettings;
    behaviorRef.current = nextCharacter.manifest.entryBehavior;
    setCharacter(nextCharacter); setDialogues(nextDialogues); setSettings(nextSettings); setBehaviorId(nextCharacter.manifest.entryBehavior);
  }, []);

  useEffect(() => { void load(); return window.cozykin.onCharacterChanged(() => void load()); }, [load]);

  const behavior = useMemo(() => character?.behaviors.behaviors.find((entry) => entry.id === behaviorId) ?? character?.behaviors.behaviors.find((entry) => entry.id === 'idle'), [behaviorId, character]);
  const hasBehavior = useCallback((id: string) => Boolean(character?.behaviors.behaviors.some((entry) => entry.id === id)), [character]);
  const transition = useCallback((id: string) => {
    const next = hasBehavior(id) ? id : 'idle';
    behaviorRef.current = next;
    setBehaviorId(next);
  }, [hasBehavior]);
  const stopMovement = useCallback(() => { if (movementTimer.current) window.clearInterval(movementTimer.current); movementTimer.current = null; }, []);

  const showMessage = useCallback((category: DialogueCategory, fallback = '') => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    const message = randomItem(dialogues?.[category] ?? []) || fallback;
    setBubble(message);
    bubbleTimer.current = window.setTimeout(() => setBubble(''), 3000);
  }, [dialogues]);

  const touchInteraction = useCallback((): boolean => {
    stopMovement();
    lastInteractionAt.current = Date.now();
    setInteractionVersion((value) => value + 1);
    if (!sleepingRef.current) return false;
    sleepingRef.current = false;
    clickTimes.current = [];
    reactionLockedUntil.current = Date.now() + WAKE_REACTION_LOCK_MS;
    transition(resolveRuntimeWakeBehavior(character?.character, character?.behaviors, Math.random()));
    showMessage('wake', '唔，醒来啦。');
    return true;
  }, [character, showMessage, stopMovement, transition]);

  const hideAtEdge = useCallback(async (motion?: { dx: number; dy: number }): Promise<boolean> => {
    if (motion) latestEdgeMotion.current = motion;
    if (!settingsRef.current?.edgeHideEnabled || edgeCheckPending.current) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    edgeCheckPending.current = true;
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const { window: bounds, workArea } = await window.cozykin.getRuntimeBounds();
      const delta = edgeHideDelta(visibleCharacterRect(canvas, bounds, currentVisibleBounds.current ?? undefined), workArea);
      if (!delta || !edgeMotionAllowsHide(delta, latestEdgeMotion.current) || (Math.abs(delta.dx) < 1 && Math.abs(delta.dy) < 1)) return false;
      edgeHiddenAt.current = Date.now();
      window.cozykin.moveWindow(delta.dx, delta.dy);
      window.cozykin.setMousePassthrough(true);
      return true;
    } finally {
      edgeCheckPending.current = false;
    }
  }, []);

  useEffect(() => {
    if (!character || !behavior || !canvasRef.current) return;
    let canceled = false; let animation = 0; let frame = 0; let displayedBoundsKey = ''; let nextFrameAt = 0;
    const canvas = canvasRef.current; const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const frameUrls = behavior.frames.map((path) => assetUrl(character, path));
    const images = frameUrls.map((url) => {
      const cached = imageCache.current.get(url);
      if (cached) return cached;
      const image = new Image(); image.src = url; imageCache.current.set(url, image); return image;
    });
    const render = (time: number) => {
      if (canceled) return;
      if (!nextFrameAt) nextFrameAt = time + frameDurationAt(behavior.frameDurationMs, behavior.frameDurationsMs, frame);
      else if (time >= nextFrameAt) {
        frame += 1;
        if (frame >= images.length) frame = behavior.loop ? 0 : images.length - 1;
        nextFrameAt = time + frameDurationAt(behavior.frameDurationMs, behavior.frameDurationsMs, frame);
      }
      const image = images[frame];
      if (image?.complete && image.naturalWidth) {
        const mirrored = shouldMirrorBehaviorFrame(
          character.manifest.packageId,
          behavior.id,
          direction.current,
          behavior.mirrorable
        );
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        if (mirrored) { context.translate(canvas.width, 0); context.scale(-1, 1); }
        context.drawImage(image, 0, 0, canvas.width, canvas.height); context.restore();
        const cacheKey = visibleBoundsCacheKey(frameUrls[frame]!, mirrored);
        let visible = visibleBoundsCache.current.get(cacheKey);
        if (!visible) {
          visible = alphaPixelRect(canvas);
          visibleBoundsCache.current.set(cacheKey, visible);
        }
        currentVisibleBounds.current = visible;
        if (displayedBoundsKey !== cacheKey) { updateVisibleCssBounds(canvas, visible); displayedBoundsKey = cacheKey; }
      }
      animation = requestAnimationFrame(render);
    };
    void Promise.allSettled(images.map((image) => image.decode())).then(() => { if (!canceled) animation = requestAnimationFrame(render); });
    let fallbackTimer: number | undefined;
    if (!behavior.loop) {
      const duration = behavior.frames.reduce((sum, _path, index) => sum + frameDurationAt(behavior.frameDurationMs, behavior.frameDurationsMs, index), 0);
      fallbackTimer = window.setTimeout(() => transition(behavior.fallback), Math.max(700, duration));
    }
    return () => { canceled = true; cancelAnimationFrame(animation); if (fallbackTimer) clearTimeout(fallbackTimer); };
  }, [behavior, character, transition]);

  useEffect(() => {
    if (!settings || !character) return;
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    const nextSize = companionWindowSize(character.manifest.canvas.width, character.manifest.canvas.height, scalePreview ?? settings.scale, menuOpen);
    const wasMenu = windowSizingMode.current === 'menu';
    const delay = menuOpen ? 0 : 260;
    resizeTimer.current = window.setTimeout(() => {
      const anchor = companionResizeAnchor(menuOpen, wasMenu);
      // Constrain once when the menu opens and again after it closes. During
      // slider preview/commit, keeping the bottom-left anchor untouched avoids
      // a second work-area clamp that would make the character jump on release.
      window.cozykin.resizeCompanion(nextSize.width, nextSize.height, anchor, shouldConstrainCompanionResize(menuOpen, wasMenu));
      windowSizingMode.current = menuOpen ? 'menu' : 'runtime';
    }, delay);
    return () => { if (resizeTimer.current) window.clearTimeout(resizeTimer.current); };
  }, [settings, character, menuOpen, scalePreview]);

  useEffect(() => {
    if (!character) return;
    let canceled = false;
    let ambientTimer = 0;
    let sleepTimer = 0;
    const scheduleAmbient = () => {
      ambientTimer = window.setTimeout(() => {
        if (canceled) return;
        if (sleepingRef.current || edgeHiddenAt.current > 0) return;
        if (behaviorRef.current === 'dragged') { scheduleAmbient(); return; }
        const options = ['walk', 'stretch', 'scratch', 'curious'].filter(hasBehavior);
        const selected = randomItem(options);
        if (selected === 'walk') {
          direction.current = Math.random() < 0.5 ? 'left' : 'right'; transition('walk'); showMessage('wander');
          let steps = 0;
          let movementRemainder = 0;
          const velocity = automaticWalkVelocityPxPerSecond(character.manifest.packageId, settingsRef.current?.scale ?? 0.75);
          movementTimer.current = window.setInterval(() => {
            const movement = accumulateAutomaticWalkMovement(movementRemainder, direction.current, velocity, 16);
            movementRemainder = movement.remainder;
            const motionDirection = direction.current === 'left' ? -1 : 1;
            if (++steps > 170) { stopMovement(); transition('idle'); void hideAtEdge({ dx: motionDirection, dy: 0 }); return; }
            if (movement.pixels !== 0) window.cozykin.moveWindow(movement.pixels, 0);
            if (steps % 12 === 0) void hideAtEdge({ dx: motionDirection, dy: 0 }).then((hidden) => { if (hidden) { stopMovement(); transition('idle'); } });
          }, 16);
        } else if (selected) transition(selected);
        scheduleAmbient();
      }, 18_000 + Math.random() * 16_000);
    };
    const scheduleSleep = (delay = IDLE_SLEEP_MS) => {
      sleepTimer = window.setTimeout(() => {
        if (canceled) return;
        const now = Date.now();
        const remaining = IDLE_SLEEP_MS - (now - lastInteractionAt.current);
        if (shouldEnterSleep(lastInteractionAt.current, now)) {
          if (behaviorRef.current === 'dragged') { scheduleSleep(); return; }
          sleepingRef.current = true;
          stopMovement(); transition('sleep'); showMessage('sleep', 'zzZZ…');
          return;
        }
        if (remaining > 0) { scheduleSleep(remaining); return; }
      }, delay);
    };
    scheduleAmbient(); scheduleSleep();
    return () => { canceled = true; clearTimeout(sleepTimer); clearTimeout(ambientTimer); stopMovement(); };
  }, [character, hasBehavior, hideAtEdge, interactionVersion, showMessage, stopMovement, transition]);

  useEffect(() => {
    const close = () => { closeMenu(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('blur', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('blur', close); window.removeEventListener('keydown', key); };
  }, []);

  useEffect(() => () => {
    if (clickSettleTimer.current) clearTimeout(clickSettleTimer.current);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    if (settingsRetryTimer.current) clearTimeout(settingsRetryTimer.current);
    void flushPendingSettings();
    stopMovement();
  }, [stopMovement]);

  const registerClick = () => {
    const wokeFromSleep = touchInteraction();
    const now = Date.now();
    if (wokeFromSleep || now < reactionLockedUntil.current) { clickTimes.current = []; return; }
    clickTimes.current = recentClicks(clickTimes.current, now, RAPID_CLICK_WINDOW_MS);
    if (clickSettleTimer.current) clearTimeout(clickSettleTimer.current);
    const rapid = resolveRapidClicks(clickTimes.current.length);
    if (rapid.action) {
      transition(rapid.action); showMessage(rapid.action === 'hiss' ? 'hiss' : 'rapidClick');
      if (rapid.action === 'hiss') {
        const hiss = character?.behaviors.behaviors.find((entry) => entry.id === 'hiss');
        const duration = hiss
          ? behaviorPlaybackDurationMs(hiss.frames.length, hiss.frameDurationMs, hiss.frameDurationsMs)
          : 5_000;
        reactionLockedUntil.current = now + duration;
        clickTimes.current = [];
      }
      return;
    }
    clickSettleTimer.current = window.setTimeout(() => {
      const settled = resolveSettledClicks(clickTimes.current.length); clickTimes.current = [];
      if (!settled) return;
      transition(settled); showMessage(settled === 'happy' ? 'doubleClick' : 'click', settled === 'happy' ? '好开心！' : '喵～');
    }, CLICK_SETTLE_MS);
  };

  const beginPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    if (menuOpen) { closeMenu(); return; }
    stopMovement();
    pointerStart.current = { x: event.screenX, y: event.screenY, pointerId: event.pointerId, dragging: false, lastDx: 0, lastDy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    hitTest(event);
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (start.dragging) {
      if ((event.buttons & 1) === 0) {
        pointerStart.current = null;
        window.cozykin.endDrag();
        void hideAtEdge({ dx: start.lastDx, dy: start.lastDy }).then(() => transition('idle'));
        return;
      }
      const dx = event.screenX - start.x;
      const dy = event.screenY - start.y;
      start.x = event.screenX; start.y = event.screenY; start.lastDx = dx; start.lastDy = dy;
      if (Math.abs(dx) > 1) direction.current = dx < 0 ? 'left' : 'right';
      if (dx || dy) {
        window.cozykin.moveWindow(dx, dy);
        void hideAtEdge({ dx, dy }).then((hidden) => {
          if (!hidden || pointerStart.current !== start) return;
          pointerStart.current = null;
          window.cozykin.endDrag();
          transition('idle');
        });
      }
      return;
    }
    if (Math.hypot(event.screenX - start.x, event.screenY - start.y) < 6) return;
    const dx = event.screenX - start.x;
    const dy = event.screenY - start.y;
    start.dragging = true; start.x = event.screenX; start.y = event.screenY; start.lastDx = dx; start.lastDy = dy;
    touchInteraction(); transition('dragged'); showMessage('drag');
    window.cozykin.setMousePassthrough(false);
    if (Math.abs(dx) > 1) direction.current = dx < 0 ? 'left' : 'right';
    window.cozykin.moveWindow(dx, dy);
    void hideAtEdge({ dx, dy }).then((hidden) => {
      if (!hidden || pointerStart.current !== start) return;
      pointerStart.current = null;
      window.cozykin.endDrag();
      transition('idle');
    });
  };

  const finishPointer = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer may already be released */ }
    if (!start.dragging) { registerClick(); return; }
    window.cozykin.endDrag();
    await hideAtEdge({ dx: start.lastDx, dy: start.lastDy });
    transition('idle');
  };

  const cancelPointer = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    if (start.dragging) { window.cozykin.endDrag(); await hideAtEdge({ dx: start.lastDx, dy: start.lastDy }); transition('idle'); }
  };

  const hitTest = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerStart.current?.dragging || menuOpen) { window.cozykin.setMousePassthrough(false); return; }
    const canvas = canvasRef.current; const context = canvas?.getContext('2d', { willReadFrequently: true }); if (!canvas || !context) return;
    const { x, y } = canvasPixelCoordinates(event.clientX, event.clientY, canvas.width, canvas.height, canvas.getBoundingClientRect());
    try { window.cozykin.setMousePassthrough(isTransparentPixel(context.getImageData(x, y, 1, 1).data[3]!)); } catch { window.cozykin.setMousePassthrough(false); }
  };

  const pullFromEdge = async (pointer: { screenX: number; screenY: number }) => {
    if (pointerStart.current?.dragging || menuOpen) return;
    if (!canRevealEdge(edgeHiddenAt.current, Date.now())) return;
    const { window: bounds, workArea } = await window.cozykin.getRuntimeBounds();
    const canvas = canvasRef.current; if (!canvas) return;
    const visibleBounds = visibleCharacterRect(canvas, bounds, currentVisibleBounds.current ?? undefined);
    const workRight = workArea.x + workArea.width;
    const workBottom = workArea.y + workArea.height;
    const hitSlop = 10;
    const overExposedCharacter = pointer.screenX >= Math.max(workArea.x, visibleBounds.left) - hitSlop
      && pointer.screenX <= Math.min(workRight, visibleBounds.right) + hitSlop
      && pointer.screenY >= Math.max(workArea.y, visibleBounds.top) - hitSlop
      && pointer.screenY <= Math.min(workBottom, visibleBounds.bottom) + hitSlop;
    if (!overExposedCharacter) return;
    const delta = edgeRevealDelta(visibleBounds, workArea);
    if (delta) {
      edgeHiddenAt.current = 0;
      window.cozykin.setMousePassthrough(false);
      window.cozykin.moveWindow(delta.dx, delta.dy);
      touchInteraction();
    }
  };

  function updateSettings(partial: Partial<AppSettings>) {
    const current = settingsRef.current;
    if (!current) return;
    const optimistic = { ...current, ...partial };
    settingsRef.current = optimistic; setSettings(optimistic);
    pendingSettings.current = mergePendingSettings(pendingSettings.current, partial);
    settingsSaveGeneration.current += 1;
    automaticSettingsRetries.current = 0;
    if (settingsFlushInFlight.current) settingsFlushRequiresDrain.current = true;
  }

  function schedulePendingSettingsRetry() {
    if (settingsRetryTimer.current || automaticSettingsRetries.current >= 1) return;
    automaticSettingsRetries.current += 1;
    settingsRetryTimer.current = window.setTimeout(() => {
      settingsRetryTimer.current = null;
      void flushPendingSettings();
    }, 800);
  }

  function flushPendingSettings(): Promise<void> {
    if (settingsFlushInFlight.current) return settingsFlushInFlight.current;
    if (settingsRetryTimer.current) { window.clearTimeout(settingsRetryTimer.current); settingsRetryTimer.current = null; }
    const patch = pendingSettings.current;
    if (!Object.keys(patch).length) return Promise.resolve();
    pendingSettings.current = {};
    const generation = settingsSaveGeneration.current;
    const flush = (async () => {
      try {
        const saved = await flushSettingsPatch(window.cozykin.saveSettings, patch);
        if (!saved) return;
        automaticSettingsRetries.current = 0;
        if (generation !== settingsSaveGeneration.current) return;
        settingsRef.current = saved; setSettings(saved);
      } catch {
        pendingSettings.current = mergePendingSettings(patch, pendingSettings.current);
        schedulePendingSettingsRetry();
      }
    })();
    settingsFlushInFlight.current = flush;
    void flush.finally(() => {
      if (settingsFlushInFlight.current === flush) settingsFlushInFlight.current = null;
      if (!settingsFlushRequiresDrain.current) return;
      settingsFlushRequiresDrain.current = false;
      void flushPendingSettings();
    });
    return flush;
  }

  function beginScaleAdjustment() {
    if (scalePreviewRef.current !== null) return;
    const currentScale = settingsRef.current?.scale;
    if (currentScale === undefined) return;
    scalePreviewRef.current = currentScale;
    setScalePreview(currentScale);
  }

  function previewScaleAdjustment(value: number) {
    if (scalePreviewRef.current === null) beginScaleAdjustment();
    const nextScale = Math.max(0.4, Math.min(1.5, value));
    scalePreviewRef.current = nextScale;
    setScalePreview(nextScale);
  }

  function commitScaleAdjustment() {
    const nextScale = scalePreviewRef.current;
    if (nextScale === null) return;
    scalePreviewRef.current = null;
    setScalePreview(null);
    if (Math.abs(nextScale - (settingsRef.current?.scale ?? nextScale)) >= 0.001) updateSettings({ scale: nextScale });
  }

  function closeMenu() {
    commitScaleAdjustment();
    void flushPendingSettings();
    setMenuOpen(false);
  }

  if (!character || !settings) return <div className="runtime-loading">Loading CozyKin…</div>;
  const displayedScale = scalePreview ?? settings.scale;
  const { width: displayWidth, height: displayHeight } = renderedCanvasSize(character.manifest.canvas.width, character.manifest.canvas.height, displayedScale);
  const committedMenuSize = companionWindowSize(character.manifest.canvas.width, character.manifest.canvas.height, settings.scale, true);
  const previewMenuSize = companionWindowSize(character.manifest.canvas.width, character.manifest.canvas.height, displayedScale, true);
  const menuOffset = scalePreview === null ? { x: 0, y: 0 } : frozenMenuOffset(committedMenuSize, previewMenuSize);
  const bubbleSide = direction.current === 'right' ? 'right' : 'left';
  const sleepIndicator = resolveRuntimeSleepIndicator(character.manifest.packageId, character.character.presentation, Boolean(behavior?.mirrorable), direction.current);
  const mirroredSleepAnchor = sleepIndicator.kind === 'anchor' ? sleepIndicator.point : undefined;
  const stageStyle: React.CSSProperties = {
    width: displayWidth,
    height: displayHeight,
    ...({ '--canvas-aspect-ratio': `${character.manifest.canvas.width} / ${character.manifest.canvas.height}` } as React.CSSProperties),
    ...(mirroredSleepAnchor && {
      '--sleep-anchor-x': String(mirroredSleepAnchor.x),
      '--sleep-anchor-y': String(mirroredSleepAnchor.y)
    } as React.CSSProperties)
  };

  return <main className={`runtime-shell${menuOpen ? ' menu-open' : ''}`} onPointerDownCapture={(event) => {
    if (menuOpen && !menuRef.current?.contains(event.target as Node)) { closeMenu(); event.stopPropagation(); }
  }} onMouseEnter={(event) => void pullFromEdge({ screenX: event.screenX, screenY: event.screenY })} onMouseLeave={() => { if (!menuOpen && !pointerStart.current?.dragging) window.cozykin.setMousePassthrough(true); }}>
    <div className="runtime-stage" style={stageStyle}>
      {bubble && <div className={`runtime-bubble ${bubbleSide}`} role="status">{bubble}</div>}
      {behaviorId === 'sleep' && <div className={`sleep-zzz ${sleepIndicator.kind === 'anchor' ? 'anchored' : sleepIndicator.side}`} aria-hidden="true"><i>z</i><i>Z</i><i>Z</i></div>}
      <canvas ref={canvasRef} width={character.manifest.canvas.width} height={character.manifest.canvas.height} style={{ width: displayWidth, height: displayHeight, opacity: settings.opacity }}
        onPointerMove={movePointer} onPointerDown={beginPointer} onPointerUp={(event) => void finishPointer(event)} onPointerCancel={(event) => void cancelPointer(event)}
        onContextMenu={(event) => { event.preventDefault(); pointerStart.current = null; touchInteraction(); setMenuOpen(true); window.cozykin.setMousePassthrough(false); }} />
    </div>
    {menuOpen && <aside ref={menuRef} className="runtime-menu" style={{ transform: `translate(${menuOffset.x}px, ${menuOffset.y}px)` }}>
      <header><strong>{character.manifest.displayName}</strong><small>当前伙伴</small></header>
      <button onClick={() => void window.cozykin.openStudio()}>管理我的伙伴</button>
      <label>大小 <output>{Math.round(displayedScale * 100)}%</output><input type="range" min="40" max="150" value={Math.round(displayedScale * 100)}
        onPointerDown={beginScaleAdjustment}
        onChange={(event) => previewScaleAdjustment(Number(event.target.value) / 100)}
        onPointerUp={() => { commitScaleAdjustment(); void flushPendingSettings(); }}
        onPointerCancel={() => { commitScaleAdjustment(); void flushPendingSettings(); }}
        onKeyUp={() => { commitScaleAdjustment(); void flushPendingSettings(); }}
        onBlur={() => { commitScaleAdjustment(); void flushPendingSettings(); }} /></label>
      <label>透明度 <output>{Math.round(settings.opacity * 100)}%</output><input type="range" min="20" max="100" value={Math.round(settings.opacity * 100)} onChange={(event) => updateSettings({ opacity: Number(event.target.value) / 100 })}
        onPointerUp={() => void flushPendingSettings()}
        onPointerCancel={() => void flushPendingSettings()}
        onKeyUp={() => void flushPendingSettings()}
        onBlur={() => void flushPendingSettings()} /></label>
      <label className="runtime-check"><input type="checkbox" checked={settings.alwaysOnTop} onChange={(event) => { updateSettings({ alwaysOnTop: event.target.checked }); void flushPendingSettings(); }} />始终置顶</label>
      <label className="runtime-check"><input type="checkbox" checked={settings.edgeHideEnabled} onChange={(event) => { updateSettings({ edgeHideEnabled: event.target.checked }); void flushPendingSettings(); }} />靠边隐藏</label>
      <button onClick={() => void window.cozykin.resetRuntimePosition()}>重置位置</button>
      <button onClick={() => { closeMenu(); void window.cozykin.hideCompanion(); }}>隐藏伙伴</button>
    </aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><RuntimeApp /></React.StrictMode>);
