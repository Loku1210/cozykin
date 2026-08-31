export type CharacterType = 'cat' | 'dog' | 'other-pet' | 'original-person' | 'original-creature' | 'cartoon' | 'memorial' | 'custom';
export type PackSchemaVersion = '1.0' | '1.1';
export type BehaviorId = 'idle' | 'walk' | 'sleep' | 'happy' | 'curious' | 'clicked' | 'dragged' | string;
export type EmotionId = 'neutral' | 'happy' | 'sleepy' | 'curious' | 'shy' | 'sad' | 'annoyed' | 'excited';
export type TriggerId = 'startup' | 'behavior_complete' | 'single_click' | 'double_click' | 'rapid_click' | 'drag_start' | 'drag_end' | 'idle_timeout' | 'random';
export type DialogueCategory = 'click' | 'doubleClick' | 'rapidClick' | 'hiss' | 'drag' | 'sleep' | 'wake' | 'wander';
export type DialogueConfig = Record<DialogueCategory, string[]>;
export type PromptDeliveryProfile = 'standard' | 'pudding-front';

export interface CharacterBrief {
  schemaVersion: '1.0';
  deliveryProfile?: PromptDeliveryProfile;
  displayName: string;
  characterType: CharacterType;
  relationship: { description: string; userAddress: string };
  introduction: string;
  visual: {
    referenceImageCount: number;
    style: string;
    bodyProportion: string;
    primaryView: string;
    transparentBackground: boolean;
    facingDirection: 'left' | 'right' | 'front' | 'mixed';
    defaultSize: string;
    shadow: boolean;
    mustKeep: string;
    mustNotChange: string;
    additionalRequirements: string;
  };
  personality: {
    energy: number;
    affection: number;
    curiosity: number;
    shyness: number;
    playfulness: number;
    independence: number;
    courage: number;
    warmth: number;
    typicalTraits: string;
    likes: string[];
    dislikes: string[];
    habits: string;
    backstory: string;
  };
  behaviors: BehaviorId[];
  emotions: {
    defaultEmotion: EmotionId;
    enabled: EmotionId[];
    randomTransitionsEnabled: boolean;
  };
  specialRequirements: string;
  privacyRequirements: string;
}

export interface PackManifest {
  schemaVersion: PackSchemaVersion;
  packageId: string;
  displayName: string;
  characterType: CharacterType;
  author: string;
  createdAt: string;
  runtimeCompatibility: { minimumVersion: string };
  canvas: { width: number; height: number };
  defaultScale: number;
  entryBehavior: string;
}

export interface NormalizedPoint { x: number; y: number }

export interface WeightedBehaviorVariant { behaviorId: string; weight: number }

export interface CharacterPresentation {
  effectAnchors?: Partial<Record<'sleep', NormalizedPoint>>;
  wakeVariants?: WeightedBehaviorVariant[];
}

export interface CharacterDefinition {
  name: string;
  description: string;
  relationship: { userAddress: string };
  personality: Pick<CharacterBrief['personality'], 'energy' | 'affection' | 'curiosity' | 'shyness' | 'playfulness'>;
  preferences: { likes: string[]; dislikes: string[] };
  appearance: { mustKeep: string[]; mustNotChange: string[] };
  privacy: { localOnly: boolean; sourceDeclaration: string };
  dialogues?: Partial<DialogueConfig>;
  presentation?: CharacterPresentation;
}

export interface BehaviorDefinition {
  id: string;
  frames: string[];
  loop: boolean;
  frameDurationMs: number;
  frameDurationsMs?: number[];
  weight: number;
  triggers: TriggerId[];
  fallback: string;
  mirrorable: boolean;
}

export interface BehaviorsFile { behaviors: BehaviorDefinition[] }

export interface EmotionDefinition {
  id: EmotionId;
  weight: number;
  durationMs: number;
  triggers: TriggerId[];
  behaviorId: string;
}

export interface EmotionsFile {
  defaultEmotion: EmotionId;
  randomTransitionsEnabled: boolean;
  emotions: EmotionDefinition[];
}

export interface ValidationIssue {
  errorCode: string;
  severity: 'error' | 'warning';
  file: string;
  jsonPath: string;
  expected: string;
  actual: string;
  message: string;
  suggestedFix: string;
}

export interface ValidationReport {
  schemaVersion: '1.0';
  valid: boolean;
  packageId?: string;
  displayName?: string;
  previewDataUrl?: string;
  stagingToken?: string;
  issues: ValidationIssue[];
}

export interface InstalledCharacter {
  packageId: string;
  displayName: string;
  characterType: CharacterType;
  thumbnailUrl: string;
  active: boolean;
  builtIn: boolean;
}

export interface RuntimeCharacter {
  manifest: PackManifest;
  character: CharacterDefinition;
  behaviors: BehaviorsFile;
  emotions: EmotionsFile;
  assetBaseUrl: string;
}

export interface AppSettings {
  scale: number;
  opacity: number;
  alwaysOnTop: boolean;
  edgeHideEnabled: boolean;
  activeCharacterId: string;
  windowPosition: { x: number; y: number } | null;
}
