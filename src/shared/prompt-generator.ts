import type { BehaviorId, CharacterBrief, ValidationReport } from './types';

export const PROMPT_TEMPLATE_VERSION = '1.3' as const;
export const PACK_SCHEMA_VERSION = '1.1' as const;

const BEHAVIOR_GUIDE: Record<string, { frames: string; loop: string; duration: string; trigger: string; fallback: string; qa: string }> = {
  idle: { frames: '4–8 key poses; 6+ playback steps', loop: 'yes', duration: '240–600 ms/frame; hold open eyes for 2–4 s', trigger: 'startup, behavior_complete', fallback: 'idle', qa: 'Blink only the eyelids; non-blinking body landmarks may drift by at most 2 px.' },
  walk: { frames: '4–8 key poses; 6+ playback steps', loop: 'yes', duration: '160–240 ms/frame', trigger: 'random', fallback: 'idle', qa: 'Animate a real gait: limbs, head, torso and tail move. Do not translate the character across the canvas; CozyKin moves the window.' },
  sleep: { frames: '3–6 key poses; 6+ playback steps', loop: 'yes', duration: '500–900 ms/frame', trigger: 'idle_timeout', fallback: 'idle', qa: 'Use slow breathing and anatomically continuous tail poses. Do not bake zzZZ into the image.' },
  happy: { frames: '4–8 key poses; 6+ playback steps preferred', loop: 'no', duration: '280–450 ms/frame', trigger: 'double_click', fallback: 'idle', qa: 'Use a readable anticipation, response and settle; avoid a one-frame pop.' },
  curious: { frames: '4–8 key poses; 6+ playback steps preferred', loop: 'no', duration: '280–500 ms/frame', trigger: 'random', fallback: 'idle', qa: 'Keep scale and grounding stable while head, ears or posture express curiosity.' },
  clicked: { frames: '4–6 key poses; 6+ playback steps preferred', loop: 'no', duration: '280–450 ms/frame', trigger: 'single_click', fallback: 'idle', qa: 'Make the reaction slower than a blink and preserve the silhouette.' },
  dragged: { frames: '4–6 key poses; 6+ playback steps', loop: 'yes', duration: '240–380 ms/frame', trigger: 'drag_start', fallback: 'idle', qa: 'For pets, use a gentle limited scruff lift with a stable contact point, relaxed hanging limbs and subtle tail sway; never over-stretch the neck.' },
  stretch: { frames: '4–7 key poses; 6+ playback steps preferred', loop: 'no', duration: '450–1000 ms/frame', trigger: 'random', fallback: 'idle', qa: 'Use slow anticipation and recovery; preserve anatomy and the ground line.' },
  scratch: { frames: '4–8 key poses; 6+ playback steps preferred', loop: 'no', duration: '380–900 ms/frame', trigger: 'random', fallback: 'idle', qa: 'Animate repeated paw/body effort without drawing the screen or a scratching board into the frame.' },
  startled: { frames: '4–7 key poses; 6+ playback steps preferred', loop: 'no', duration: '300–1000 ms/frame', trigger: 'rapid_click', fallback: 'idle', qa: 'Use a distinct startled silhouette while keeping identity and anatomy intact.' },
  hiss: { frames: '4–8 key poses; 6+ playback steps preferred', loop: 'no', duration: '400–1400 ms/frame', trigger: 'rapid_click', fallback: 'idle', qa: 'Use a readable escalation and settle; preserve markings, limbs and tail continuity.' }
};

function redactedPath(path: string): string { return `[local path redacted]${path.endsWith('.') ? '.' : ''}`; }

function clean(value: string): string {
  return value.trim().replace(/\r\n?/g, '\n')
    .replace(/\b(file:\/\/\/[^\s"'`<>|)\]},;]+)/gi, (_match, path: string) => redactedPath(path))
    .replace(/(^|[\s"'(=:\[{])(\\\\[^\s"'`<>|)\]},;]+)/gm, (_match, prefix: string, path: string) => `${prefix}${redactedPath(path)}`)
    .replace(/\b([A-Za-z]:\\[^\s"'`<>|)\]},;]+)/g, (_match, path: string) => redactedPath(path))
    .replace(/(^|[\s"'(=:\[{])(\/(?!\/)[^\s"'`<>|)\]},;]+)/gm, (_match, prefix: string, path: string) => `${prefix}${redactedPath(path)}`)
    .replace(/(^|[\s"'(=:\[{])(~\/[^\s"'`<>|)\]},;]+)/gm, (_match, prefix: string, path: string) => `${prefix}${redactedPath(path)}`);
}
function list(values: string[]): string { return values.length ? values.map((entry) => `- ${clean(entry)}`).join('\n') : '- None specified'; }
function value(input: string, fallback = 'Not specified'): string { return clean(input) || fallback; }
function trait(number: number): string { return Math.max(0, Math.min(1, number)).toFixed(2); }

export function normalizeBrief(brief: CharacterBrief): CharacterBrief {
  return {
    ...brief,
    deliveryProfile: brief.deliveryProfile === 'pudding-front' ? 'pudding-front' : 'standard',
    displayName: clean(brief.displayName),
    relationship: { description: clean(brief.relationship.description), userAddress: clean(brief.relationship.userAddress) || '你' },
    introduction: clean(brief.introduction),
    visual: {
      ...brief.visual,
      style: clean(brief.visual.style), bodyProportion: clean(brief.visual.bodyProportion), primaryView: clean(brief.visual.primaryView),
      defaultSize: clean(brief.visual.defaultSize), mustKeep: clean(brief.visual.mustKeep), mustNotChange: clean(brief.visual.mustNotChange),
      additionalRequirements: clean(brief.visual.additionalRequirements)
    },
    personality: {
      ...brief.personality,
      typicalTraits: clean(brief.personality.typicalTraits),
      likes: brief.personality.likes.map(clean).filter(Boolean), dislikes: brief.personality.dislikes.map(clean).filter(Boolean),
      habits: clean(brief.personality.habits), backstory: clean(brief.personality.backstory)
    },
    behaviors: [...new Set(brief.behaviors.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en')),
    emotions: { ...brief.emotions, enabled: [...new Set(brief.emotions.enabled)].sort((a, b) => a.localeCompare(b, 'en')) },
    specialRequirements: clean(brief.specialRequirements), privacyRequirements: clean(brief.privacyRequirements)
  };
}

function requirements(b: CharacterBrief): string {
  const facingDirection = isFrontPrimaryView(b) ? 'front' : b.visual.facingDirection;
  return `- Character name: ${value(b.displayName)}
- Character type: ${b.characterType}
- Relationship: ${value(b.relationship.description)}
- The character should address the user as: ${b.relationship.userAddress}
- Introduction: ${value(b.introduction)}
- Reference image count: ${b.visual.referenceImageCount}
- Visual style: ${value(b.visual.style)}
- Body proportion: ${value(b.visual.bodyProportion)}
- Primary view: ${value(b.visual.primaryView)}
- Facing direction: ${facingDirection}
- User preference for transparent background: ${b.visual.transparentBackground ? 'yes' : 'no'}
- Runtime asset requirement: transparent alpha is mandatory for every PNG/WebP frame in Pack v1
- Default asset size: ${value(b.visual.defaultSize)}
- Shadow requested: ${b.visual.shadow ? 'yes' : 'no'} (Pack frames must not contain a rectangular backdrop)
- Must keep: ${value(b.visual.mustKeep)}
- Must not change: ${value(b.visual.mustNotChange)}
- Additional visual requirements: ${value(b.visual.additionalRequirements)}

Personality values use a 0.00–1.00 scale:

- Energy: ${trait(b.personality.energy)}
- Affection: ${trait(b.personality.affection)}
- Curiosity: ${trait(b.personality.curiosity)}
- Shyness: ${trait(b.personality.shyness)}
- Playfulness: ${trait(b.personality.playfulness)}
- Independence: ${trait(b.personality.independence)}
- Courage: ${trait(b.personality.courage)}
- Warmth: ${trait(b.personality.warmth)}
- Typical traits: ${value(b.personality.typicalTraits)}
- Habits: ${value(b.personality.habits)}
- Backstory: ${value(b.personality.backstory)}

Likes:
${list(b.personality.likes)}

Dislikes:
${list(b.personality.dislikes)}

- Enabled emotions: ${b.emotions.enabled.join(', ') || 'None specified'}
- Default emotion: ${b.emotions.defaultEmotion}
- Random emotion changes: ${b.emotions.randomTransitionsEnabled ? 'allowed' : 'disabled'}
- Special requirements: ${value(b.specialRequirements)}
- Privacy requirements: ${value(b.privacyRequirements)}`;
}

function isFrontPrimaryView(b: CharacterBrief): boolean {
  return /^(front|frontal|正面)$/iu.test(b.visual.primaryView.trim());
}

function isPuddingFront(b: CharacterBrief): boolean { return b.deliveryProfile === 'pudding-front'; }

function characterExample(b: CharacterBrief): string {
  const presentation = isPuddingFront(b)
    ? ',"presentation":{"effectAnchors":{"sleep":{"x":0.68,"y":0.24}},"wakeVariants":[{"behaviorId":"stretch","weight":0.7},{"behaviorId":"wake-blep","weight":0.3}]}'
    : ',"presentation":{"effectAnchors":{"sleep":{"x":0.68,"y":0.24}}}';
  return `{"name":"Character Name","description":"Short description","relationship":{"userAddress":"你"},"personality":{"energy":0.5,"affection":0.5,"curiosity":0.5,"shyness":0.5,"playfulness":0.5},"preferences":{"likes":[],"dislikes":[]},"appearance":{"mustKeep":[],"mustNotChange":[]},"privacy":{"localOnly":true,"sourceDeclaration":"User supplied or authorized source material."}${presentation}}`;
}

function behaviorExample(b: CharacterBrief): string {
  const idle = '{"id":"idle","frames":["assets/idle/00.png","assets/idle/01.png"],"loop":true,"frameDurationMs":400,"frameDurationsMs":[2400,320],"weight":1,"triggers":["startup","behavior_complete"],"fallback":"idle","mirrorable":true}';
  if (!isPuddingFront(b)) return `{"behaviors":[${idle}]}`;
  const stretch = '{"id":"stretch","frames":["assets/stretch/00.png","assets/stretch/01.png"],"loop":false,"frameDurationMs":600,"weight":1,"triggers":["random"],"fallback":"idle","mirrorable":true}';
  const wakeBlep = '{"id":"wake-blep","frames":["assets/wake-blep/00.png","assets/wake-blep/01.png","assets/wake-blep/02.png"],"loop":false,"frameDurationMs":600,"frameDurationsMs":[500,2400,500],"weight":1,"triggers":["random"],"fallback":"idle","mirrorable":true}';
  return `{"behaviors":[${idle},${stretch},${wakeBlep}]}`;
}

function behaviorRows(behaviors: BehaviorId[]): string {
  return behaviors.map((id) => {
    const guide = BEHAVIOR_GUIDE[id] ?? { frames: '4–8 key poses; 6+ playback steps preferred', loop: 'no', duration: '280–700 ms/frame', trigger: 'declared trigger', fallback: 'idle', qa: 'Define a readable anticipation, action and settle while preserving identity and anatomy.' };
    return `| ${id} | ${id === 'idle' ? 'Required' : 'Requested'} | ${guide.frames} | ${guide.loop} | ${guide.duration} | ${guide.trigger} | ${guide.fallback} | ${guide.qa} |`;
  }).join('\n');
}

function identityLock(b: CharacterBrief): string {
  const table = `| Region | Locked requirement |
|---|---|
| Silhouette and proportions | ${value(b.visual.bodyProportion)} |
| Head, face, eyes and ears | Infer from references, then document exact invariants before generation |
| Colors, coat/skin and region-specific markings | ${value(b.visual.mustKeep)} |
| Limbs, paws/hands and tail | Anatomically continuous; no missing, duplicated or malformed parts |
| Accessories | Only those explicitly required; never add optional accessories |
| Forbidden changes | ${value(b.visual.mustNotChange)} |
| Additional constraints | ${value(b.visual.additionalRequirements)} |`;
  if (!isPuddingFront(b)) return table;
  return `${table}\n\nPudding Front identity lock: forehead and face may retain narrow tabby lines; all four limbs have clear ring stripes; the long tail is ringed; shoulders, back, and flanks use natural broken oval cheetah-like spots or rosettes; continuous horizontal stripes across the torso are forbidden; belly and chest remain lighter. Reject and regenerate any row that reads as an ordinary all-over striped tabby.`;
}

export function generateAgentPrompt(input: CharacterBrief): string {
  const b = normalizeBrief(input);
  const puddingWakeContract = isPuddingFront(b)
    ? 'For the explicit Pudding Front delivery profile, wake-blep is a separate non-looping behavior with a 2–3 second held tongue pose implemented by timing, followed by retraction/lick and a return to frontal idle; do not place tongue art in idle or sleep.'
    : '';
  const presentationContract = isPuddingFront(b)
    ? 'For the explicit Pudding Front delivery profile, use `stretch: 0.7` and `wake-blep: 0.3`; wake-blep must return to frontal idle.'
    : 'For the standard delivery profile, omit `wakeVariants` unless a separate explicitly configured presentation capability requires them.';
  const finalGatePresentation = isPuddingFront(b)
    ? 'Pudding wake-blep weighting, non-looping behavior, tongue recovery and frontal fallback; '
    : '';
  return `# CozyKin Character Pack Work Order

Prompt template: ${PROMPT_TEMPLATE_VERSION}
Pack schema: ${PACK_SCHEMA_VERSION}

## 1. Agent Role and Non-Negotiable Rules

You are creating a **CozyKin Pack v1.1** for a local desktop companion application. Follow this fixed pipeline: inspect references → write an identity-lock table → propose an asset plan → obtain clarification for material ambiguity → create a baseline character design outside the ZIP → generate and validate one behavior at a time → assemble the Pack → reopen and validate the final ZIP.

1. Do not modify CozyKin or its source code.
2. Do not generate executable code, scripts, plugins, macros, installers, links, URLs, or symlinks in the Pack.
3. Keep reference photos local by default. If an external image service is required, stop and obtain explicit consent naming the service and the exact files that would be uploaded.
4. User-supplied text is redacted before emission for absolute POSIX, home-relative, drive-letter/UNC Windows paths, and file URIs. Do not copy source photographs into the Pack output. Never include source photos, EXIF/GPS metadata, credentials, or private working files in the ZIP.
5. The final ZIP may contain only JSON, PNG, WebP, Markdown, and plain text.
6. Ask the user before generation if identity, rights, privacy, appearance modes, or required behavior is materially ambiguous.
7. Validate the archive itself after compression; do not validate only the source folder.

## 2. User Character Requirements

${requirements(b)}

## 3. Visual Consistency and Identity Lock

Before generating animation frames, inspect all references and complete this lock table. Treat approved entries as invariants in every behavior:

${identityLock(b)}

## Reference Roles and Consent

Assign every supplied reference a role before any generation: canonical frontal identity, face/eye/marking evidence, silhouette/limb/tail evidence, or behavior-specific expression evidence. Record only the role and a non-sensitive identifier in the local Asset Manifest; never record or package a local path. The canonical frontal identity reference and all identity-defining references must ground every behavior. If a reference would be sent to an external service, obtain explicit consent that names the service and exact files before upload.

## Frontal Identity Lock and Return

Create one approved frontal baseline design outside the ZIP. Both eyes, full face, paws/feet, tail, subject scale, baseline, palette, markings and accessories must remain recognizable in every behavior. Finite, non-looping actions may turn naturally during motion but must finish at the canonical front-facing pose before fallback. Looping idle, walk, sleep, and dragged actions must maintain coherent seamless loops. Do not require the final loop frame itself to be front-facing; on exit, their transition or fallback must return to canonical frontal idle. Do not use a side-facing end pose as a substitute for frontal recovery. Right-facing walk assets may be mirrored by CozyKin only when the identity lock remains valid.

### Generation contract for a high first-pass success rate

- Treat the approved baseline and every user reference that defines the face, eyes, silhouette, markings, material, palette or accessories as required grounding inputs for every generated behavior. A behavior generated without its identity references is invalid.
- Generate each behavior as one coherent pose family. If a contact sheet is used, keep a fixed left-to-right/top-to-bottom frame order with generous cell separation; layout guides are invisible construction references and must not appear in the artwork.
- Define the behavior's motion before generation: what remains anchored, what leads, what follows through, which parts may deform, and how finite actions recover to frontal idle or looping actions exit through that recovery. Adjacent frames, including the loop boundary, must progress without a snap, side flip, scale pop or accessory teleport.
- Prefer pose, expression and silhouette changes over decorative effects. Effects must be state-relevant, opaque, physically attached to the character and contained inside the same frame. Do not add motion lines, speed streaks, detached stars/sparkles/tears/smoke, punctuation, floor patches, impact bursts, glow, aura, shadows or scenery.
- Keep each behavior semantically exclusive: idle is calm micro-motion; walk is directional gait without canvas translation; happy has anticipation/action/settle; curious uses gaze/head/posture; clicked is a readable reaction; startled has a distinct surprise silhouette; hiss escalates and settles. Do not leak one behavior's signature action or props into another.
- For humanoids, preserve facial proportions. Eyes and eyelids should participate naturally with the head and upper body; do not slide replacement pupils over unrelated eye art, stretch the skull with a broad raster warp or change expression independently of the action.
- If a chroma-key intermediate is necessary, use one perfectly flat key color absent from the character, with no gradient, shadow, reflection or floor. Remove it once after frame extraction, clear hidden RGB under fully transparent pixels, despill translucent boundary pixels, and validate the final alpha assets. The packaged frames must contain zero visible key-color panels or green/magenta fringe.

Quantitative QA for every unique frame:

- Exact canvas dimensions declared by manifest.json; recommended 512×512.
- Real alpha channel, all four corner alpha values equal 0, and at least 12 px transparent margin around visible pixels.
- stable front-facing baseline, full feet/paws, and no baked-in shadow. No cream/white/colored rectangle, floor plane, watermark, text, speech bubble, zzZZ/ZZZ symbol, screen edge or UI chrome.
- Ground-contact landmark drift no more than 6 px unless the action intentionally jumps or hangs.
- Non-intentional visible-character scale drift no more than 5% across a behavior.
- Blink-only frames: non-eyelid landmarks drift no more than 2 px.
- No cropped ears, hair, hands/paws, feet or tail; no missing, duplicated, fused or malformed anatomy.
- Preserve the approved identity lock, color regions, markings, face shape, proportions and accessories.
- Every loop contains visible but controlled motion; reject duplicate stills presented as animation.
- Inspect every adjacent pair and the final-to-first loop boundary for cadence, grounding, expression continuity and attached-part continuity.
- Fully transparent pixels may surround the character but must not form accidental bands, seams or holes inside a filled body.
- No disconnected outline fragments, stray pixels or detached visual components unless the approved character itself is naturally multi-part.

## 4. Action Asset Plan

For a front-facing bundled character, deliver the complete 11-action set: idle, walk, sleep, happy, curious, clicked, dragged, stretch, scratch, startled, and hiss. The table below records the requested action plan. Finite actions must complete on the canonical front-facing pose before their fallback; looping actions need seamless loop closure and return to frontal idle only when exiting their loop.

| Behavior ID | Status | Recommended frames | Loop | Timing | Trigger | Fallback | Behavior-specific QA |
|---|---|---:|---|---|---|---|---|
${behaviorRows(b.behaviors)}

"Key poses" means distinct artwork. "Playback steps" means the ordered entries in frames and may reuse key poses forward/reverse to improve motion without inventing unstable anatomy. Add a key pose only when actual-speed playback proves a visible cadence gap; do not generate interpolation merely to increase frame count. Every behavior must list ordered POSIX frame paths. idle is mandatory. frameDurationsMs, when present, must contain exactly one integer for each frames entry. Every fallback must reference an existing behavior and all fallback chains must terminate at idle. ${puddingWakeContract}

## 5. CozyKin Pack v1.1 File and JSON Specification

The ZIP root must directly contain the following tree, with no enclosing directory:

\`\`\`text
manifest.json
character.json
behaviors.json
emotions.json
assets/<behavior-id>/<frame>.png
preview/thumbnail.png
docs/character-summary.md
docs/source-declaration.md
validation-report.md
\`\`\`

Allowed extensions: .json, .png, .webp, .md, .txt. Paths must be case-sensitive relative POSIX paths. No URL, absolute path, backslash, .. segment, duplicate/case-colliding path, link or file outside the ZIP is allowed. All JSON objects reject unknown fields.

Use these schema-compatible shapes (replace example values; do not add fields):

\`\`\`json
{"schemaVersion":"1.1","packageId":"safe-lowercase-slug","displayName":"Character Name","characterType":"custom","author":"User","createdAt":"2026-01-01T00:00:00.000Z","runtimeCompatibility":{"minimumVersion":"0.2.0"},"canvas":{"width":512,"height":512},"defaultScale":1,"entryBehavior":"idle"}
\`\`\`

\`\`\`json
${characterExample(b)}
\`\`\`

\`\`\`json
${behaviorExample(b)}
\`\`\`

Valid triggers are: startup, behavior_complete, single_click, double_click, rapid_click, drag_start, drag_end, idle_timeout, random.

\`\`\`json
{"defaultEmotion":"neutral","randomTransitionsEnabled":false,"emotions":[{"id":"neutral","weight":1,"durationMs":5000,"triggers":["startup"],"behaviorId":"idle"}]}
\`\`\`

## Pack 1.1 Presentation

\`character.presentation\` is optional, so Pack 1.0 characters remain valid without it. When present, \`effectAnchors.sleep\` uses normalized \`x\`/\`y\` coordinates in \`[0,1]\`; use it for runtime-owned sleep indicators and never bake zzZZ/ZZZ, text, glow, detached effects, or a shadow into the frame. \`wakeVariants\` contains one to eight positive weighted behavior IDs. Each referenced behavior must exist, must be non-looping, and its fallback chain must terminate at idle. ${presentationContract}

## 6. Automatic Validation Before Compression

Validate JSON syntax against the supplied CozyKin Draft 2020-12 Schemas; unknown fields; required root files; packageId and runtime version; every resource reference; unique case-sensitive filenames; PNG/WebP magic and decoding; exact dimensions; alpha and transparent corners; 12 px margin; residual chroma-key contamination; accidental interior alpha holes or seam bands; disconnected fragments; required idle; frame count/duration alignment; allowed triggers; emotion references; fallback existence and cycle termination; ZIP root structure; path safety; file count, nesting, single-file size, total expanded size and compression ratio; illegal extensions, links and executable content.

Create a contact sheet and an actual-speed motion preview for every behavior. Review at the in-app display size, not only enlarged. Record behavior-level pass/fail evidence for identity, intended expression, natural action, frontal return, baseline/scale stability, adjacent continuity, loop closure, edge cleanliness and absence of detached effects. Deterministic checks and visual review are both required; one does not replace the other.

When a check fails, classify the root cause as identity, action semantics, continuity, layout/extraction, grounding, component connectivity, alpha/chroma or archive/schema. Use a deterministic correction for deterministic failures before regenerating art. Regenerate only the smallest coherent behavior family whose source visual is wrong, preserve every property that already passed, and compare the new result against the prior failure. If the same root failure recurs twice or merely moves to another frame, stop varying wording and change strategy or ask the user.

Then compress, reopen the final .cozykin.zip, run the same checks against the archive, and sort validation issues deterministically by file, JSON path and errorCode. A report marked valid must contain zero error-severity issues.

## Asset Manifest

Maintain a local Asset Manifest outside the ZIP. For every output, record its relative output path, role, upstream reference role (never a source path), generator or processing step, schema/template version, status, and the exact validation or visual-review evidence. List source photographs only as external read-only inputs; do not copy them into Git or the Pack.

## Final Package Gate

Before delivery, mark each requirement pass, fail, or not-applicable with exact command, file, or review evidence: Pack 1.1 schema and runtime floor; complete 11-action coverage; ${finalGatePresentation}alpha, stable canvas, full paws/feet, and no baked effects; actual-speed playback; Asset Manifest; archive reopening; and source-photo/path exclusion. No gate may pass from intent or indirect evidence. If any required check is missing or fails, report the limitation and do not claim full validation.

## 7. Final Delivery

Deliver exactly:

1. One validated .cozykin.zip archive.
2. validation-report.md describing checks actually run and any warnings.
3. docs/character-summary.md.
4. docs/source-declaration.md stating rights and whether the character is local-only.
5. A short local installation note.

An optional source-material workspace may be delivered separately, but never inside the ZIP. If any required check was not actually run, state that limitation and do not claim full validation.`;
}

export function generateRepairPrompt(brief: CharacterBrief, report: ValidationReport): string {
  const b = normalizeBrief(brief);
  const issues = [...report.issues].sort((a, c) => `${a.file}\0${a.jsonPath}\0${a.errorCode}`.localeCompare(`${c.file}\0${c.jsonPath}\0${c.errorCode}`, 'en'));
  const formatted = issues.map((issue, index) => `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.errorCode}\n   File: ${issue.file || '(package)'}\n   JSON path: ${issue.jsonPath || '(none)'}\n   Expected: ${issue.expected}\n   Actual: ${issue.actual}\n   Explanation: ${issue.message}\n   Suggested fix: ${issue.suggestedFix}`).join('\n\n');
  const affected = [...new Set(issues.map((issue) => issue.file || '(package structure)'))].sort((a, c) => a.localeCompare(c, 'en'));
  return `# CozyKin Pack Repair Work Order

Prompt template: ${PROMPT_TEMPLATE_VERSION}
Pack schema: ${PACK_SCHEMA_VERSION}
Character: ${b.displayName || 'Unnamed character'}

## Original Character Goal and Identity Constraints

${requirements(b)}

${identityLock(b)}

## Validation Errors

${formatted || 'No validation issues were supplied.'}

## Files Allowed to Change

${list(affected)}

## Repair Rules

- Modify only the files required to resolve the listed errors and only from the allowlist above.
- Make the smallest change set that resolves every listed error.
- Preserve all passed and unmentioned files byte-for-byte unless a referenced-path correction requires a coordinated change.
- Preserve the approved identity, proportions, markings, palette, anatomy, behavior intent and timing.
- Regenerate only assets that fail a stated visual or decode check; do not redesign the character.
- Classify each failure as identity, action semantics, continuity, extraction/layout, grounding, connectivity, alpha/chroma or archive/schema before changing files.
- Use deterministic repair for deterministic faults. If the source visual or motion family is wrong, repair the complete containing behavior coherently; do not insert a visibly unrelated one-off frame. Ask to expand the allowlist first when that behavior contains passed files outside it.
- Recheck adjacent frames and loop closure at real playback timing; a still contact sheet alone is insufficient.
- For chroma/alpha repairs, remove the key once, clear hidden RGB, despill boundary pixels and verify there is no visible fringe, opaque key panel, interior seam or accidental hole.
- Do not modify CozyKin, loosen validation, add code or unsupported files, include source photos/local paths/metadata, or change Pack schema version.
- Keep the ZIP root flat with manifest.json at its root.
- Re-run Schema, path, archive, reference, image, alpha, dimension, animation and fallback checks after repair.
- Rebuild and reopen the final ZIP, then deliver it with a new deterministic validation-report.md.
- If a requested fix conflicts with the original identity lock, stop and ask the user instead of guessing.`;
}
