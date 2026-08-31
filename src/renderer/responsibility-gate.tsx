import React from 'react';
import type { InstalledCharacter, ValidationReport } from '../shared/types';
import {
  responsibilityAcceptedForReport,
  responsibilityTokenAfterChange
} from '../shared/responsibility-gate';

export const RESPONSIBILITY_HELP_ID = 'responsibility-install-help';

export async function chooseAndSetValidationReport(
  choose: () => Promise<ValidationReport | null>,
  setReport: (report: ValidationReport | null) => void,
  setAcceptedToken: (token: string | null) => void
): Promise<void> {
  setAcceptedToken(null);
  setReport(await choose());
}

export function closeValidationReport(
  setReport: (report: ValidationReport | null) => void,
  setAcceptedToken: (token: string | null) => void
): void {
  setAcceptedToken(null);
  setReport(null);
}

export async function clearInstalledValidation(
  setReport: (report: ValidationReport | null) => void,
  setAcceptedToken: (token: string | null) => void,
  refreshCharacters: () => Promise<void>
): Promise<void> {
  closeValidationReport(setReport, setAcceptedToken);
  await refreshCharacters();
}

export function ResponsibilityGate({
  report,
  acceptedToken,
  onAcceptedTokenChange
}: {
  report: ValidationReport;
  acceptedToken: string | null;
  onAcceptedTokenChange: (token: string | null) => void;
}) {
  const accepted = responsibilityAcceptedForReport(report, acceptedToken);
  return <div className="responsibility-gate">
    <label>
      <input
        type="checkbox"
        checked={accepted}
        aria-describedby={RESPONSIBILITY_HELP_ID}
        onChange={(event) => onAcceptedTokenChange(responsibilityTokenAfterChange(report, event.currentTarget.checked))}
      />
      <span>我对所生成角色负责且不商业化传播</span>
    </label>
    <p id={RESPONSIBILITY_HELP_ID}>确认只对当前这一个已验证 Pack 有效；更换角色包或关闭验证结果后需重新确认。</p>
  </div>;
}

export async function installAcceptedPack(
  report: ValidationReport | null,
  acceptedToken: string | null,
  install: (stagingToken: string, replace: boolean, responsibilityAccepted: boolean) => Promise<InstalledCharacter>,
  confirmReplacement: (error: unknown) => boolean
): Promise<InstalledCharacter | null> {
  if (!report?.valid || !report.stagingToken || !responsibilityAcceptedForReport(report, acceptedToken)) return null;
  try {
    return await install(report.stagingToken, false, true);
  }
  catch (error) {
    if (!confirmReplacement(error)) return null;
    return install(report.stagingToken, true, true);
  }
}
