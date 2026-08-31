import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  assertResponsibilityAcknowledged,
  responsibilityAcceptedForReport,
  responsibilityTokenAfterChange
} from '../src/shared/responsibility-gate';
import {
  RESPONSIBILITY_HELP_ID,
  ResponsibilityGate,
  chooseAndSetValidationReport,
  clearInstalledValidation,
  closeValidationReport,
  installAcceptedPack
} from '../src/renderer/responsibility-gate';
import { installPackWithResponsibility } from '../src/main/pack-install-handler';
import type { InstalledCharacter, ValidationReport } from '../src/shared/types';

const validReport = (stagingToken: string): ValidationReport => ({
  schemaVersion: '1.0',
  valid: true,
  stagingToken,
  packageId: `pack-${stagingToken}`,
  displayName: `Pack ${stagingToken}`,
  issues: []
});

const installed: InstalledCharacter = {
  packageId: 'pack-token-a',
  displayName: 'Pack token-a',
  characterType: 'cat',
  thumbnailUrl: 'cozykin://thumbnail',
  active: false,
  builtIn: false
};

describe('responsibility acknowledgement token state', () => {
  it('starts unchecked and cannot enable installation for a different Pack token', () => {
    const reportA = validReport('token-a');
    const reportB = validReport('token-b');

    expect(responsibilityAcceptedForReport(reportA, null)).toBe(false);
    const acceptedToken = responsibilityTokenAfterChange(reportA, true);
    expect(responsibilityAcceptedForReport(reportA, acceptedToken)).toBe(true);
    expect(responsibilityAcceptedForReport(reportB, acceptedToken)).toBe(false);
  });

  it('clears token A before choosing token B and remains clear if the chooser is canceled', async () => {
    let acceptedToken: string | null = 'token-a';
    let report: ValidationReport | null = validReport('token-a');
    let finishChoice: ((value: ValidationReport | null) => void) | undefined;
    const choosing = new Promise<ValidationReport | null>((resolve) => { finishChoice = resolve; });

    const pending = chooseAndSetValidationReport(
      () => choosing,
      (value) => { report = value; },
      (value) => { acceptedToken = value; }
    );
    expect(acceptedToken).toBeNull();
    expect(report?.stagingToken).toBe('token-a');

    finishChoice?.(validReport('token-b'));
    await pending;
    expect(report?.stagingToken).toBe('token-b');
    expect(acceptedToken).toBeNull();

    acceptedToken = 'token-b';
    await chooseAndSetValidationReport(
      async () => null,
      (value) => { report = value; },
      (value) => { acceptedToken = value; }
    );
    expect(report).toBeNull();
    expect(acceptedToken).toBeNull();
  });

  it('clears both report and acceptance on close and after successful installation', async () => {
    let acceptedToken: string | null = 'token-a';
    let report: ValidationReport | null = validReport('token-a');
    const setReport = (value: ValidationReport | null) => { report = value; };
    const setAcceptedToken = (value: string | null) => { acceptedToken = value; };

    closeValidationReport(setReport, setAcceptedToken);
    expect(report).toBeNull();
    expect(acceptedToken).toBeNull();

    report = validReport('token-a');
    acceptedToken = 'token-a';
    const refresh = vi.fn(async () => undefined);
    await clearInstalledValidation(setReport, setAcceptedToken, refresh);
    expect(report).toBeNull();
    expect(acceptedToken).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('clears acceptance when unchecked and never accepts an invalid report', () => {
    const report = validReport('token-a');
    expect(responsibilityTokenAfterChange(report, false)).toBeNull();
    expect(responsibilityTokenAfterChange({ ...report, valid: false }, true)).toBeNull();
  });
});

describe('ResponsibilityGate UI', () => {
  it('renders the exact unchecked acknowledgement above a disabled described install action', () => {
    const report = validReport('token-a');
    const accepted = responsibilityAcceptedForReport(report, null);
    const markup = renderToStaticMarkup(React.createElement(
      React.Fragment,
      null,
      React.createElement(ResponsibilityGate, {
        report,
        acceptedToken: null,
        onAcceptedTokenChange: () => undefined
      }),
      React.createElement('button', {
        disabled: !accepted,
        'aria-describedby': RESPONSIBILITY_HELP_ID
      }, '确认并安装')
    ));

    expect(markup).toContain('我对所生成角色负责且不商业化传播');
    expect(markup).toContain('type="checkbox"');
    expect(markup).not.toContain('checked=""');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(`aria-describedby="${RESPONSIBILITY_HELP_ID}"`);
    expect(markup.indexOf('type="checkbox"')).toBeLessThan(markup.indexOf('确认并安装'));
  });

  it('renders checked and enables installation only for the current token', () => {
    const report = validReport('token-a');
    const acceptedToken = responsibilityTokenAfterChange(report, true);
    const accepted = responsibilityAcceptedForReport(report, acceptedToken);
    const markup = renderToStaticMarkup(React.createElement(
      React.Fragment,
      null,
      React.createElement(ResponsibilityGate, {
        report,
        acceptedToken,
        onAcceptedTokenChange: () => undefined
      }),
      React.createElement('button', {
        disabled: !accepted,
        'aria-describedby': RESPONSIBILITY_HELP_ID
      }, '确认并安装')
    ));

    expect(markup).toContain('checked=""');
    expect(markup).not.toContain('disabled=""');
    expect(accepted).toBe(true);
    expect(responsibilityAcceptedForReport(validReport('token-b'), acceptedToken)).toBe(false);
  });
});

describe('accepted Pack installation', () => {
  it('does not call normal or replacement installation while unchecked or stale', async () => {
    const install = vi.fn<(...args: [string, boolean, boolean]) => Promise<InstalledCharacter>>();

    await expect(installAcceptedPack(validReport('token-a'), null, install, vi.fn())).resolves.toBeNull();
    await expect(installAcceptedPack(validReport('token-b'), 'token-a', install, vi.fn())).resolves.toBeNull();
    expect(install).not.toHaveBeenCalled();
  });

  it('sends an explicit acknowledgement on a normal install', async () => {
    const install = vi.fn<(...args: [string, boolean, boolean]) => Promise<InstalledCharacter>>()
      .mockResolvedValue(installed);

    await expect(installAcceptedPack(validReport('token-a'), 'token-a', install, vi.fn())).resolves.toEqual(installed);
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith('token-a', false, true);
  });

  it('gates replacement with the same accepted token and explicit acknowledgement', async () => {
    const install = vi.fn<(...args: [string, boolean, boolean]) => Promise<InstalledCharacter>>()
      .mockRejectedValueOnce(new Error('already installed'))
      .mockResolvedValueOnce(installed);
    const confirmReplacement = vi.fn(() => true);

    await expect(installAcceptedPack(validReport('token-a'), 'token-a', install, confirmReplacement)).resolves.toEqual(installed);
    expect(install).toHaveBeenNthCalledWith(1, 'token-a', false, true);
    expect(install).toHaveBeenNthCalledWith(2, 'token-a', true, true);
  });

  it('does not call replacement when confirmation is rejected', async () => {
    const install = vi.fn<(...args: [string, boolean, boolean]) => Promise<InstalledCharacter>>()
      .mockRejectedValueOnce(new Error('already installed'));

    await expect(installAcceptedPack(validReport('token-a'), 'token-a', install, () => false)).resolves.toBeNull();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith('token-a', false, true);
  });
});

describe('main-process responsibility guard', () => {
  it.each([false, undefined, null, 1, 'true', {}])('rejects non-true acknowledgement %j', (value) => {
    expect(() => assertResponsibilityAcknowledged(value)).toThrow(
      'Responsibility acknowledgement is required before installation.'
    );
  });

  it('accepts exact true', () => {
    expect(() => assertResponsibilityAcknowledged(true)).not.toThrow();
  });

  it('rejects before the Pack importer is called and permits exact true', async () => {
    const importer = { install: vi.fn(async () => installed) };

    await expect(installPackWithResponsibility(importer, 'token-a', false, undefined)).rejects.toThrow(
      'Responsibility acknowledgement is required before installation.'
    );
    expect(importer.install).not.toHaveBeenCalled();

    await expect(installPackWithResponsibility(importer, 'token-a', true, true)).resolves.toEqual(installed);
    expect(importer.install).toHaveBeenCalledWith('token-a', true);
  });
});
