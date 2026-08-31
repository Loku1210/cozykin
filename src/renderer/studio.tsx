import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ALL_EMOTIONS, CORE_BEHAVIORS, createDefaultBrief } from '../shared/defaults';
import { generateAgentPrompt, generateRepairPrompt, normalizeBrief } from '../shared/prompt-generator';
import type { CharacterBrief, CharacterType, DialogueCategory, DialogueConfig, EmotionId, InstalledCharacter, ValidationReport } from '../shared/types';
import { t, type Locale } from './i18n';
import { RESPONSIBILITY_HELP_ID, ResponsibilityGate, chooseAndSetValidationReport, clearInstalledValidation, closeValidationReport, installAcceptedPack } from './responsibility-gate';
import { responsibilityAcceptedForReport } from '../shared/responsibility-gate';
import './styles.css';

const DRAFT_KEY = 'cozykin.character-brief.v1';
const STEPS = ['基础信息', '视觉设置', '性格设置', '行为设置', '情绪设置', '特殊要求', 'Agent 交付'];
const CHARACTER_TYPES: Array<[CharacterType, string]> = [['cat', '猫'], ['dog', '狗'], ['other-pet', '其他宠物'], ['original-person', '原创人物'], ['original-creature', '原创生物'], ['cartoon', '卡通角色'], ['memorial', '纪念角色'], ['custom', '自定义']];
const DIALOGUE_LABELS: Array<[DialogueCategory, string]> = [['click', '单击'], ['doubleClick', '双击'], ['rapidClick', '3 秒内连续点击 3 次／惊恐'], ['hiss', '3 秒内连续点击 5 次／愤怒动作完整播放'], ['drag', '拖动'], ['sleep', '睡觉'], ['wake', '醒来'], ['wander', '散步']];

function readDraft(): CharacterBrief {
  try {
    const defaults = createDefaultBrief();
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '') as Partial<CharacterBrief>;
    return {
      ...defaults,
      ...saved,
      relationship: { ...defaults.relationship, ...saved.relationship },
      visual: { ...defaults.visual, ...saved.visual },
      personality: { ...defaults.personality, ...saved.personality },
      emotions: { ...defaults.emotions, ...saved.emotions }
    };
  }
  catch { return createDefaultBrief(); }
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={wide ? 'form-field wide' : 'form-field'}><span>{label}</span>{children}</label>; }
function TextArea({ value, onChange, rows = 4 }: { value: string; onChange: (value: string) => void; rows?: number }) { return <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} />; }

function StudioApp() {
  const [locale, setLocale] = useState<Locale>('zh-CN');
  const [mode, setMode] = useState<'studio' | 'library'>('library');
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<CharacterBrief>(readDraft);
  const [characters, setCharacters] = useState<InstalledCharacter[]>([]);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [responsibilityAcceptedToken, setResponsibilityAcceptedToken] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [dialogueEditor, setDialogueEditor] = useState<{ packageId: string; displayName: string; values: DialogueConfig } | null>(null);
  const prompt = useMemo(() => generateAgentPrompt(brief), [brief]);
  const responsibilityAccepted = responsibilityAcceptedForReport(report, responsibilityAcceptedToken);

  const refreshCharacters = async () => setCharacters(await window.cozykin.listCharacters());
  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(brief)); }, [brief]);
  useEffect(() => { void refreshCharacters(); }, []);

  const patch = <K extends keyof CharacterBrief>(key: K, value: CharacterBrief[K]) => setBrief((current) => ({ ...current, [key]: value }));
  const patchVisual = (value: Partial<CharacterBrief['visual']>) => patch('visual', { ...brief.visual, ...value });
  const patchPersonality = (value: Partial<CharacterBrief['personality']>) => patch('personality', { ...brief.personality, ...value });
  const notify = (message: string) => { setStatus(message); window.setTimeout(() => setStatus(''), 2500); };

  const copy = async (text: string, message: string) => { await window.cozykin.copyText(text); notify(message); };
  const validateBeforeDelivery = () => {
    if (!brief.displayName.trim()) { setStep(0); notify('请先填写角色名称。'); return false; }
    if (!brief.behaviors.includes('idle')) { setStep(3); notify('idle 是必需行为。'); return false; }
    return true;
  };

  const importPack = async () => {
    await chooseAndSetValidationReport(
      window.cozykin.chooseAndValidatePack,
      setReport,
      setResponsibilityAcceptedToken
    );
  };
  const editDialogues = async (character: InstalledCharacter) => setDialogueEditor({ packageId: character.packageId, displayName: character.displayName, values: await window.cozykin.getDialogues(character.packageId) });
  const saveDialogueEditor = async () => {
    if (!dialogueEditor) return;
    const values = await window.cozykin.saveDialogues(dialogueEditor.packageId, dialogueEditor.values);
    setDialogueEditor({ ...dialogueEditor, values }); notify('互动对白已保存在本机。');
  };
  const installPack = async () => {
    if (!report?.valid || !report.stagingToken || responsibilityAcceptedToken !== report.stagingToken) return;
    const installed = await installAcceptedPack(
      report,
      responsibilityAcceptedToken,
      window.cozykin.installValidatedPack,
      (error) => window.confirm(`同一 packageId 已安装。${error instanceof Error ? `\n\n${error.message}` : ''}\n\n替换会更新该角色的 Pack 文件；你的本机对白设置会保留。是否继续？`)
    );
    if (!installed) return;
    notify('角色安装完成。');
    await clearInstalledValidation(setReport, setResponsibilityAcceptedToken, refreshCharacters);
  };

  const renderStep = () => {
    if (step === 0) return <div className="form-grid">
      <Field label={t(locale, 'name')}><input value={brief.displayName} maxLength={80} onChange={(e) => patch('displayName', e.target.value)} /></Field>
      <Field label={t(locale, 'type')}><select value={brief.characterType} onChange={(e) => patch('characterType', e.target.value as CharacterType)}>{CHARACTER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label={t(locale, 'relationship')}><input value={brief.relationship.description} onChange={(e) => patch('relationship', { ...brief.relationship, description: e.target.value })} placeholder="例如：家人、朋友、纪念伙伴" /></Field>
      <Field label={t(locale, 'address')}><input value={brief.relationship.userAddress} onChange={(e) => patch('relationship', { ...brief.relationship, userAddress: e.target.value })} placeholder="留空时使用“你”" /></Field>
      <Field label={t(locale, 'intro')} wide><TextArea value={brief.introduction} onChange={(value) => patch('introduction', value)} rows={3} /></Field>
    </div>;
    if (step === 1) return <div className="form-grid">
      <Field label="参考图片数量"><input type="number" min="0" max="100" value={brief.visual.referenceImageCount} onChange={(e) => patchVisual({ referenceImageCount: Number(e.target.value) })} /></Field>
      <Field label="画风"><select value={brief.visual.style} onChange={(e) => patchVisual({ style: e.target.value })}><option>柔和 2D 卡通</option><option>扁平插画</option><option>像素风</option><option>半写实</option><option>用户自定义</option></select></Field>
      <Field label="身体比例"><input value={brief.visual.bodyProportion} onChange={(e) => patchVisual({ bodyProportion: e.target.value })} /></Field>
      <Field label="主视角"><input value={brief.visual.primaryView} onChange={(e) => patchVisual({ primaryView: e.target.value })} /></Field>
      <Field label="面向方向"><select value={brief.visual.facingDirection} onChange={(e) => patchVisual({ facingDirection: e.target.value as CharacterBrief['visual']['facingDirection'] })}><option value="right">向右</option><option value="left">向左</option><option value="front">正面</option><option value="mixed">混合</option></select></Field>
      <Field label="默认尺寸"><input value={brief.visual.defaultSize} onChange={(e) => patchVisual({ defaultSize: e.target.value })} /></Field>
      <label className="check-row"><input type="checkbox" checked={brief.visual.transparentBackground} onChange={(e) => patchVisual({ transparentBackground: e.target.checked })} />透明背景</label>
      <label className="check-row"><input type="checkbox" checked={brief.visual.shadow} onChange={(e) => patchVisual({ shadow: e.target.checked })} />需要阴影</label>
      <Field label="必须保持的特征" wide><TextArea value={brief.visual.mustKeep} onChange={(value) => patchVisual({ mustKeep: value })} /></Field>
      <Field label="禁止改变的特征" wide><TextArea value={brief.visual.mustNotChange} onChange={(value) => patchVisual({ mustNotChange: value })} /></Field>
      <Field label="其他视觉要求" wide><TextArea value={brief.visual.additionalRequirements} onChange={(value) => patchVisual({ additionalRequirements: value })} /></Field>
    </div>;
    if (step === 2) {
      const sliders: Array<[keyof Pick<CharacterBrief['personality'], 'energy' | 'affection' | 'curiosity' | 'shyness' | 'playfulness' | 'independence' | 'courage' | 'warmth'>, string]> = [['energy', '慵懒 ↔ 精力充沛'], ['affection', '独立 ↔ 黏人'], ['curiosity', '好奇程度'], ['shyness', '热情 ↔ 害羞'], ['playfulness', '温柔 ↔ 调皮'], ['independence', '依赖 ↔ 独立'], ['courage', '胆小 ↔ 勇敢'], ['warmth', '慢热 ↔ 热情']];
      return <div className="personality-layout"><div className="slider-stack">{sliders.map(([key, label]) => <label className="trait" key={key}><span>{label}<b>{brief.personality[key].toFixed(2)}</b></span><input type="range" min="0" max="100" value={brief.personality[key] * 100} onChange={(e) => patchPersonality({ [key]: Number(e.target.value) / 100 })} /></label>)}</div><div className="form-grid compact">
        <Field label="典型性格" wide><TextArea value={brief.personality.typicalTraits} onChange={(value) => patchPersonality({ typicalTraits: value })} /></Field>
        <Field label="喜欢（逗号分隔）" wide><input value={brief.personality.likes.join(', ')} onChange={(e) => patchPersonality({ likes: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /></Field>
        <Field label="不喜欢（逗号分隔）" wide><input value={brief.personality.dislikes.join(', ')} onChange={(e) => patchPersonality({ dislikes: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /></Field>
        <Field label="特殊习惯" wide><TextArea value={brief.personality.habits} onChange={(value) => patchPersonality({ habits: value })} /></Field>
        <Field label="背景故事" wide><TextArea value={brief.personality.backstory} onChange={(value) => patchPersonality({ backstory: value })} /></Field>
      </div></div>;
    }
    if (step === 3) return <div><p className="section-note">MVP 核心行为均由 CozyKin 内置声明式状态机执行；idle 不可取消。</p><div className="option-grid">{CORE_BEHAVIORS.map((id) => <label className="option-card" key={id}><input type="checkbox" checked={brief.behaviors.includes(id)} disabled={id === 'idle'} onChange={(e) => patch('behaviors', e.target.checked ? [...brief.behaviors, id] : brief.behaviors.filter((value) => value !== id))} /><b>{id}</b><span>{id === 'idle' ? '必需 · Required' : '可回退到 idle'}</span></label>)}</div><Field label="特殊自定义行为" wide><input placeholder="用小写英文 ID，以逗号分隔" onBlur={(e) => { const custom = e.target.value.split(',').map((v) => v.trim().toLowerCase()).filter((v) => /^[a-z][a-z0-9_-]{1,31}$/.test(v)); patch('behaviors', [...new Set([...brief.behaviors.filter((v) => CORE_BEHAVIORS.includes(v as typeof CORE_BEHAVIORS[number])), ...custom])]); }} /></Field></div>;
    if (step === 4) return <div className="form-grid"><Field label="默认情绪"><select value={brief.emotions.defaultEmotion} onChange={(e) => patch('emotions', { ...brief.emotions, defaultEmotion: e.target.value as EmotionId })}>{ALL_EMOTIONS.map((id) => <option key={id}>{id}</option>)}</select></Field><label className="check-row"><input type="checkbox" checked={brief.emotions.randomTransitionsEnabled} onChange={(e) => patch('emotions', { ...brief.emotions, randomTransitionsEnabled: e.target.checked })} />允许随机情绪变化</label><div className="option-grid wide">{ALL_EMOTIONS.map((id) => <label className="option-card" key={id}><input type="checkbox" checked={brief.emotions.enabled.includes(id)} disabled={id === brief.emotions.defaultEmotion} onChange={(e) => patch('emotions', { ...brief.emotions, enabled: e.target.checked ? [...brief.emotions.enabled, id] : brief.emotions.enabled.filter((value) => value !== id) })} /><b>{id}</b></label>)}</div></div>;
    if (step === 5) return <div className="form-grid"><Field label="特殊动作、姿势、纪念意义与生成注意事项" wide><TextArea value={brief.specialRequirements} onChange={(value) => patch('specialRequirements', value)} rows={8} /></Field><Field label="私密性要求" wide><TextArea value={brief.privacyRequirements} onChange={(value) => patch('privacyRequirements', value)} rows={6} /></Field><div className="rights-notice wide"><b>使用权确认</b><p>仅使用你有权使用的照片与素材。真人、儿童或纪念角色默认仅供私人本地使用；CozyKin 不宣称复刻意识、人格、意见或声音，也不提供自动公开分享。</p></div></div>;
    return <div className="delivery-layout"><div className="prompt-actions"><button onClick={() => { if (validateBeforeDelivery()) void copy(prompt, 'Prompt 已复制。'); }}>{t(locale, 'copy')}</button><button onClick={() => { if (validateBeforeDelivery()) void window.cozykin.exportPrompt(normalizeBrief(brief), prompt); }}>{t(locale, 'export')}</button><button onClick={() => { if (validateBeforeDelivery()) void window.cozykin.saveBrief(normalizeBrief(brief)); }}>{t(locale, 'saveBrief')}</button></div><textarea className="prompt-preview" readOnly value={prompt} /><details><summary>{t(locale, 'required')}</summary><pre>manifest.json\ncharacter.json\nbehaviors.json\nemotions.json\nassets/&lt;behavior&gt;/*.png\npreview/thumbnail.png\ndocs/character-summary.md\ndocs/source-declaration.md\nvalidation-report.md</pre></details><details><summary>{t(locale, 'specification')}</summary><p>Schema 1.0 · PNG/WebP frames · JSON/Markdown/Text only · no executable code · idle required · 512×512 recommended.</p></details></div>;
  };

  const libraryView = <div className="library-view"><div className="library-toolbar"><div><p className="eyebrow">MY DESKTOP COMPANIONS</p><h2>我的伙伴</h2><p className="library-intro">切换、导入并调整已经安装的角色。要制作全新角色，请进入“创建新角色”。</p></div><button onClick={() => void importPack()}>{t(locale, 'import')}</button></div>
    <section className="onboarding-panel" aria-label="首次使用流程"><div><b>本地优先</b><p>所有草稿、角色包和对白默认留在本机；CozyKin 不会替你上传参考图片或发布角色。</p></div><div><b>从想法到伙伴</b><p>生成 Prompt → 交给你选择的 Agent → 导入 ZIP → 检查报告 → 确认责任 → 安装</p></div></section>
    <div className="character-grid">{characters.map((character) => <article className={character.active ? 'character-card active' : 'character-card'} key={character.packageId}><img src={character.thumbnailUrl} alt="" /><div><h3>{character.displayName}</h3><p>{character.packageId}</p>{character.active && <span>{t(locale, 'active')}</span>}</div><div className="card-actions"><button disabled={character.active} onClick={async () => { await window.cozykin.activateCharacter(character.packageId); await refreshCharacters(); }}>{t(locale, 'activate')}</button><button onClick={() => void editDialogues(character)}>编辑互动对白</button><button disabled={character.active || character.builtIn} title={character.builtIn ? '内置示例角色不可删除' : undefined} onClick={async () => { if (!window.confirm(`删除 ${character.displayName}？`)) return; const result = await window.cozykin.deleteCharacter(character.packageId); if (!result.deleted) notify(result.reason ?? '无法删除'); await refreshCharacters(); }}>{t(locale, 'remove')}</button></div></article>)}</div>
    {dialogueEditor && <section className="dialogue-editor"><div className="dialogue-editor-heading"><div><p className="eyebrow">LOCAL INTERACTION SETTINGS</p><h3>{dialogueEditor.displayName} 的互动对白</h3><p>每行一句；随机选择。只保存在本机，不修改原始角色包。</p></div><button onClick={() => setDialogueEditor(null)}>关闭</button></div><div className="dialogue-grid">{DIALOGUE_LABELS.map(([category, label]) => <Field key={category} label={label}><TextArea rows={3} value={dialogueEditor.values[category].join('\n')} onChange={(value) => setDialogueEditor({ ...dialogueEditor, values: { ...dialogueEditor.values, [category]: value.split('\n').map((line) => line.trim()).filter(Boolean) } })} /></Field>)}</div><div className="dialogue-actions"><button onClick={() => void saveDialogueEditor()}>保存对白</button></div></section>}
    {report && <section className={report.valid ? 'validation-panel valid' : 'validation-panel invalid'}><div className="validation-summary">{report.previewDataUrl && <img src={report.previewDataUrl} alt="Pack preview" />}<div><p className="eyebrow">VALIDATION RESULT</p><h3>{report.valid ? '验证通过' : '验证失败'}</h3><p>{report.displayName ?? 'Unknown pack'} · {report.issues.length} issues</p><p>{report.valid ? '先核对预览、角色名称和验证报告，再确认责任并安装。' : '先按下方 Fix 修复全部错误，重新打包 ZIP 后再导入；当前 Pack 不会安装。'}</p></div></div>{report.valid && <ResponsibilityGate report={report} acceptedToken={responsibilityAcceptedToken} onAcceptedTokenChange={setResponsibilityAcceptedToken} />}<div className="validation-actions">{report.valid && <button disabled={!responsibilityAccepted} aria-describedby={RESPONSIBILITY_HELP_ID} onClick={() => void installPack()}>确认并安装</button>}<button onClick={() => void window.cozykin.exportReport(report)}>导出错误报告</button><button onClick={() => void copy(JSON.stringify({ ...report, previewDataUrl: undefined, stagingToken: undefined }, null, 2), '报告已复制。')}>复制错误报告</button>{!report.valid && <button onClick={() => void copy(generateRepairPrompt(brief, report), 'Repair Prompt 已复制。')}>生成 Repair Prompt</button>}<button onClick={() => closeValidationReport(setReport, setResponsibilityAcceptedToken)}>关闭</button></div>{report.issues.length > 0 && <div className="issue-list">{report.issues.map((issue, index) => <article key={`${issue.errorCode}-${index}`}><b>{issue.severity.toUpperCase()} · {issue.errorCode}</b><code>{issue.file}{issue.jsonPath}</code><p>{issue.message}</p><small>Fix: {issue.suggestedFix}</small></article>)}</div>}</section>}
  </div>;

  return <main className="studio-app"><header className="app-header"><div className="brand-lockup"><img src="../brand/cozykin-icon.png" alt="" /><div><p className="eyebrow">PERSONAL DESKTOP COMPANION STUDIO</p><h1>CozyKin</h1></div></div><nav><button className={mode === 'library' ? 'selected' : ''} onClick={() => { setMode('library'); void refreshCharacters(); }}>我的伙伴</button><button className={mode === 'studio' ? 'selected' : ''} onClick={() => setMode('studio')}>创建新角色 · 生成 Prompt</button></nav><div className="header-tools"><span>{t(locale, 'local')}</span><button onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}>{locale === 'zh-CN' ? 'EN' : '中文'}</button></div></header>
    {status && <div className="toast">{status}</div>}
    {mode === 'library' ? libraryView : <div className="studio-workspace"><aside className="step-nav"><div className="creation-note"><b>这是新角色制作向导</b><span>不会直接修改当前伙伴。完成后会生成交给外部 Agent 的制作 Prompt。</span></div><button className="new-brief" onClick={() => { if (window.confirm('清空当前草稿并创建新角色？')) { setBrief(createDefaultBrief()); setStep(0); } }}>{t(locale, 'newCharacter')}</button>{STEPS.map((label, index) => <button className={step === index ? 'active' : ''} onClick={() => setStep(index)} key={label}><span>{String(index + 1).padStart(2, '0')}</span>{label}</button>)}</aside><section className="step-content"><div className="step-heading"><p className="eyebrow">CREATE A NEW COMPANION · STEP {step + 1} / 7</p><h2>{STEPS[step]}</h2><p>填写需求并生成制作说明；这里不会直接改动已安装角色。</p></div>{renderStep()}<footer className="step-footer"><button disabled={step === 0} onClick={() => setStep((value) => value - 1)}>{t(locale, 'previous')}</button><span>草稿自动保存在本机</span><button disabled={step === 6} onClick={() => setStep((value) => value + 1)}>{t(locale, 'next')}</button></footer></section></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><StudioApp /></React.StrictMode>);
