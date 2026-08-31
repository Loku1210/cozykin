export type Locale = 'zh-CN' | 'en';

const messages = {
  'zh-CN': {
    studio: '角色工作室', library: '角色库', local: '本地优先', newCharacter: '新角色', previous: '上一步', next: '下一步',
    name: '角色名称', type: '角色类型', relationship: '你与角色的关系', address: '角色如何称呼你', intro: '一句话介绍',
    visual: '视觉设置', personality: '性格设置', behaviors: '行为设置', emotions: '情绪设置', special: '特殊要求', delivery: 'Agent 交付',
    import: '导入 CozyKin ZIP', activate: '切换到此角色', remove: '删除', active: '当前角色', copy: '复制 Prompt', export: '导出 Markdown', saveBrief: '保存角色简报', required: '所需文件', specification: 'Pack 规范'
  },
  en: {
    studio: 'Character Studio', library: 'Character Library', local: 'Local-first', newCharacter: 'New character', previous: 'Previous', next: 'Next',
    name: 'Character name', type: 'Character type', relationship: 'Relationship', address: 'How the character addresses you', intro: 'One-line introduction',
    visual: 'Visual', personality: 'Personality', behaviors: 'Behaviors', emotions: 'Emotions', special: 'Special requirements', delivery: 'Agent delivery',
    import: 'Import CozyKin ZIP', activate: 'Use this character', remove: 'Delete', active: 'Active', copy: 'Copy Prompt', export: 'Export Markdown', saveBrief: 'Save Character Brief', required: 'Required files', specification: 'Pack specification'
  }
} as const;

export function t(locale: Locale, key: keyof typeof messages['zh-CN']): string { return messages[locale][key]; }
