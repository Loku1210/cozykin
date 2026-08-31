import { assertResponsibilityAcknowledged } from '../shared/responsibility-gate';
import type { InstalledCharacter } from '../shared/types';

interface ValidatedPackInstaller {
  install(stagingToken: string, replace: boolean): Promise<InstalledCharacter>;
}

export async function installPackWithResponsibility(
  importer: ValidatedPackInstaller,
  stagingToken: string,
  replace: boolean,
  responsibilityAccepted: unknown
): Promise<InstalledCharacter> {
  assertResponsibilityAcknowledged(responsibilityAccepted);
  return importer.install(stagingToken, Boolean(replace));
}
