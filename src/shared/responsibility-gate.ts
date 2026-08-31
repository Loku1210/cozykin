import type { ValidationReport } from './types';

export const RESPONSIBILITY_ACKNOWLEDGEMENT_ERROR = 'Responsibility acknowledgement is required before installation.';

export function responsibilityAcceptedForReport(
  report: ValidationReport | null,
  acceptedToken: string | null
): boolean {
  return Boolean(
    report?.valid
    && report.stagingToken
    && acceptedToken === report.stagingToken
  );
}

export function responsibilityTokenAfterChange(
  report: ValidationReport | null,
  checked: boolean
): string | null {
  if (!checked || !report?.valid || !report.stagingToken) return null;
  return report.stagingToken;
}

export function assertResponsibilityAcknowledged(value: unknown): asserts value is true {
  if (value !== true) throw new Error(RESPONSIBILITY_ACKNOWLEDGEMENT_ERROR);
}
