import type { CharacterBrief } from './types';

export const CORE_BEHAVIORS = ['idle', 'walk', 'sleep', 'happy', 'curious', 'clicked', 'dragged', 'stretch', 'scratch', 'startled', 'hiss'] as const;
export const ALL_EMOTIONS = ['neutral', 'happy', 'sleepy', 'curious', 'shy', 'sad', 'annoyed', 'excited'] as const;

export function createDefaultBrief(): CharacterBrief {
  return {
    schemaVersion: '1.0',
    deliveryProfile: 'standard',
    displayName: '',
    characterType: 'cat',
    relationship: { description: '', userAddress: '你' },
    introduction: '',
    visual: {
      referenceImageCount: 1,
      style: '柔和 2D 卡通',
      bodyProportion: '自然比例，适合桌面小尺寸显示',
      primaryView: '正面',
      transparentBackground: true,
      facingDirection: 'front',
      defaultSize: '512 × 512 px',
      shadow: false,
      mustKeep: '',
      mustNotChange: '',
      additionalRequirements: ''
    },
    personality: {
      energy: 0.5, affection: 0.7, curiosity: 0.7, shyness: 0.3, playfulness: 0.6,
      independence: 0.5, courage: 0.5, warmth: 0.7,
      typicalTraits: '', likes: [], dislikes: [], habits: '', backstory: ''
    },
    behaviors: [...CORE_BEHAVIORS],
    emotions: { defaultEmotion: 'neutral', enabled: [...ALL_EMOTIONS], randomTransitionsEnabled: true },
    specialRequirements: '',
    privacyRequirements: 'Reference photos must remain local and must not be included in the final ZIP.'
  };
}
