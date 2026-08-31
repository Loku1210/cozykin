import type { BehaviorsFile, CharacterDefinition, EmotionsFile, PackManifest, PackSchemaVersion, ValidationIssue } from './types';

export const RUNTIME_VERSION = '0.2.0';
export const ALLOWED_EXTENSIONS = new Set(['.json', '.png', '.webp', '.md', '.txt']);
export const REQUIRED_ROOT_FILES = ['manifest.json', 'character.json', 'behaviors.json', 'emotions.json', 'preview/thumbnail.png'] as const;

export function resolvePackSchemaVersion(value: unknown): PackSchemaVersion | null {
  return value === '1.0' || value === '1.1' ? value : null;
}

export function issue(errorCode: string, file: string, expected: string, actual: string, message: string, suggestedFix: string, jsonPath = '', severity: 'error' | 'warning' = 'error'): ValidationIssue {
  return { errorCode, severity, file, jsonPath, expected, actual, message, suggestedFix };
}

export function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => `${a.file}\0${a.jsonPath}\0${a.errorCode}\0${a.message}`.localeCompare(`${b.file}\0${b.jsonPath}\0${b.errorCode}\0${b.message}`, 'en'));
}

export function validateArchivePath(rawPath: string): string | null {
  if (!rawPath || rawPath.includes('\\') || rawPath.includes('\0') || /[\u0000-\u001f\u007f]/.test(rawPath)) return null;
  if (rawPath.startsWith('/') || rawPath.startsWith('//') || /^[A-Za-z]:/.test(rawPath)) return null;
  const parts = rawPath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  if (parts.length > 8) return null;
  return parts.join('/');
}

export function validateSemantics(manifest: PackManifest, character: CharacterDefinition, behaviorsFile: BehaviorsFile, emotionsFile: EmotionsFile, files: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const animatedBehaviors = new Set(['walk', 'sleep', 'happy', 'curious', 'clicked', 'dragged', 'stretch', 'scratch', 'startled', 'hiss']);
  const behaviors = new Map<string, typeof behaviorsFile.behaviors[number]>();
  for (const behavior of behaviorsFile.behaviors) {
    if (behaviors.has(behavior.id)) issues.push(issue('DUPLICATE_BEHAVIOR', 'behaviors.json', 'unique behavior id', behavior.id, `Behavior ${behavior.id} is defined more than once.`, 'Keep exactly one definition for each behavior id.', '/behaviors'));
    behaviors.set(behavior.id, behavior);
    if (behavior.frameDurationsMs && behavior.frameDurationsMs.length !== behavior.frames.length) issues.push(issue('FRAME_DURATION_COUNT_MISMATCH', 'behaviors.json', `${behavior.frames.length} frame durations`, String(behavior.frameDurationsMs.length), `Behavior ${behavior.id} has a different number of frame durations and frames.`, 'Provide one frame duration for every frame or remove frameDurationsMs.', `/behaviors/${behavior.id}/frameDurationsMs`));
    if (animatedBehaviors.has(behavior.id) && behavior.frames.length < 2) issues.push(issue('ANIMATION_TOO_FEW_FRAMES', 'behaviors.json', 'at least 2 frames', String(behavior.frames.length), `Behavior ${behavior.id} will appear static.`, 'Provide a short frame sequence so this action visibly moves.', `/behaviors/${behavior.id}/frames`, 'warning'));
    for (const frame of behavior.frames) if (!files.has(frame)) issues.push(issue('MISSING_ASSET', 'behaviors.json', frame, 'not found', `Behavior ${behavior.id} references a missing frame.`, `Add ${frame} or correct the frame path.`, `/behaviors/${behavior.id}/frames`));
  }
  if (!behaviors.has('idle')) issues.push(issue('MISSING_REQUIRED_BEHAVIOR', 'behaviors.json', 'idle behavior', 'not found', 'The package does not define the required idle behavior.', 'Add an idle behavior and provide its referenced assets.', '/behaviors'));
  if (!behaviors.has(manifest.entryBehavior)) issues.push(issue('ENTRY_BEHAVIOR_NOT_FOUND', 'manifest.json', manifest.entryBehavior, 'not found', 'entryBehavior does not reference a defined behavior.', 'Set entryBehavior to an existing behavior, normally idle.', '/entryBehavior'));
  const fallbackTerminatesAtIdle = new Map<string, boolean>();
  for (const behavior of behaviors.values()) {
    if (!behaviors.has(behavior.fallback)) issues.push(issue('FALLBACK_NOT_FOUND', 'behaviors.json', behavior.fallback, 'not found', `Fallback for ${behavior.id} is missing.`, 'Reference an existing fallback behavior.', `/behaviors/${behavior.id}/fallback`));
    const seen = new Set<string>(); let current: string | undefined = behavior.id;
    while (current && current !== 'idle') {
      if (seen.has(current)) { issues.push(issue('FALLBACK_CYCLE', 'behaviors.json', 'fallback chain ending at idle', [...seen, current].join(' -> '), `Fallback chain for ${behavior.id} contains a cycle.`, 'Change fallbacks so the chain terminates at idle.', `/behaviors/${behavior.id}/fallback`)); break; }
      seen.add(current); current = behaviors.get(current)?.fallback;
    }
    fallbackTerminatesAtIdle.set(behavior.id, current === 'idle');
  }
  const seenWakeVariants = new Set<string>();
  for (const [index, variant] of (character.presentation?.wakeVariants ?? []).entries()) {
    const path = `/presentation/wakeVariants/${index}/behaviorId`;
    if (seenWakeVariants.has(variant.behaviorId)) issues.push(issue('DUPLICATE_WAKE_VARIANT', 'character.json', 'unique wake behavior id', variant.behaviorId, `Wake behavior ${variant.behaviorId} is declared more than once.`, 'Keep each wake behavior only once.', path));
    seenWakeVariants.add(variant.behaviorId);
    const behavior = behaviors.get(variant.behaviorId);
    if (!behavior) { issues.push(issue('WAKE_VARIANT_BEHAVIOR_NOT_FOUND', 'character.json', variant.behaviorId, 'not found', `Wake variant ${variant.behaviorId} does not reference a defined behavior.`, 'Reference an existing non-looping behavior.', path)); continue; }
    if (behavior.loop) issues.push(issue('WAKE_VARIANT_MUST_NOT_LOOP', 'character.json', 'non-looping behavior', 'looping behavior', `Wake variant ${variant.behaviorId} must complete before returning to idle.`, 'Set loop to false or choose a non-looping behavior.', path));
    if (!fallbackTerminatesAtIdle.get(variant.behaviorId)) issues.push(issue('WAKE_VARIANT_FALLBACK_INVALID', 'character.json', 'fallback chain ending at idle', 'missing or cyclic fallback chain', `Wake variant ${variant.behaviorId} cannot return to idle through its fallback chain.`, 'Update the fallback chain so it reaches idle.', path));
  }
  const emotionIds = new Set(emotionsFile.emotions.map((emotion) => emotion.id));
  if (!emotionIds.has(emotionsFile.defaultEmotion)) issues.push(issue('DEFAULT_EMOTION_NOT_FOUND', 'emotions.json', emotionsFile.defaultEmotion, 'not found', 'Default emotion is not present in the emotion list.', 'Add the default emotion or select an existing one.', '/defaultEmotion'));
  for (const emotion of emotionsFile.emotions) if (!behaviors.has(emotion.behaviorId)) issues.push(issue('EMOTION_BEHAVIOR_NOT_FOUND', 'emotions.json', emotion.behaviorId, 'not found', `Emotion ${emotion.id} references an unknown behavior.`, 'Reference an existing behavior.', `/emotions/${emotion.id}/behaviorId`));
  return sortIssues(issues);
}
