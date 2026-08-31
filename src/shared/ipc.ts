import type { AppSettings, CharacterBrief, DialogueConfig, InstalledCharacter, RuntimeCharacter, ValidationReport } from './types';
import type { CompanionResizeAnchor } from './runtime-state';

export interface CozyKinApi {
  openStudio(): Promise<void>;
  hideCompanion(): Promise<void>;
  quit(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  getActiveCharacter(): Promise<RuntimeCharacter>;
  listCharacters(): Promise<InstalledCharacter[]>;
  activateCharacter(packageId: string): Promise<void>;
  deleteCharacter(packageId: string): Promise<{ deleted: boolean; reason?: string }>;
  getDialogues(packageId: string): Promise<DialogueConfig>;
  saveDialogues(packageId: string, dialogues: DialogueConfig): Promise<DialogueConfig>;
  chooseAndValidatePack(): Promise<ValidationReport | null>;
  installValidatedPack(stagingToken: string, replace: boolean, responsibilityAccepted: boolean): Promise<InstalledCharacter>;
  exportPrompt(brief: CharacterBrief, markdown: string): Promise<{ path?: string; canceled: boolean }>;
  saveBrief(brief: CharacterBrief): Promise<{ path?: string; canceled: boolean }>;
  exportReport(report: ValidationReport): Promise<{ path?: string; canceled: boolean }>;
  copyText(text: string): Promise<void>;
  endDrag(): void;
  moveWindow(dx: number, dy: number): void;
  resizeCompanion(width: number, height: number, anchor?: CompanionResizeAnchor, constrainToWorkArea?: boolean): void;
  setMousePassthrough(ignore: boolean): void;
  getRuntimeBounds(): Promise<{ window: { x: number; y: number; width: number; height: number }; workArea: { x: number; y: number; width: number; height: number } }>;
  resetRuntimePosition(): Promise<void>;
  onCharacterChanged(callback: () => void): () => void;
}
