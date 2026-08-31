import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackSchemaVersion, ValidationIssue } from '../shared/types';
import { issue, resolvePackSchemaVersion } from '../shared/validation';

const SCHEMA_FILES: Record<string, string> = {
  'manifest.json': 'manifest.schema.json',
  'character.json': 'character.schema.json',
  'behaviors.json': 'behaviors.schema.json',
  'emotions.json': 'emotions.schema.json'
};

export class SchemaValidator {
  private readonly validators = new Map<string, ValidateFunction>();
  private schemaVersion: PackSchemaVersion | null = null;
  constructor(private readonly schemaRoot: string) {}

  async initialize(version: PackSchemaVersion): Promise<void> {
    const schemaVersion = resolvePackSchemaVersion(version);
    if (!schemaVersion) throw new Error(`Unsupported CozyKin Pack schema version: ${String(version)}.`);
    this.validators.clear();
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const schemaDirectory = schemaVersion === '1.0' ? 'v1' : 'v1.1';
    addFormats(ajv);
    for (const [target, schemaFile] of Object.entries(SCHEMA_FILES)) {
      const schema = JSON.parse(await readFile(join(this.schemaRoot, schemaDirectory, schemaFile), 'utf8')) as object;
      this.validators.set(target, ajv.compile(schema));
    }
    this.schemaVersion = schemaVersion;
  }

  validate(file: string, value: unknown): ValidationIssue[] {
    const validator = this.validators.get(file);
    if (!validator) return [];
    if (validator(value)) return [];
    return (validator.errors ?? []).map((error: ErrorObject) => issue(
      'SCHEMA_VALIDATION_ERROR', file, error.message ?? 'valid schema value', JSON.stringify(error.data ?? null),
      `Schema validation failed at ${error.instancePath || '/'}.`, `Update the JSON value to match CozyKin Pack v${this.schemaVersion ?? 'unknown'}.`, error.instancePath || '/'
    ));
  }
}
