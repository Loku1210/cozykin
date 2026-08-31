import type { ValidationIssue } from './types';
import { ALLOWED_EXTENSIONS, REQUIRED_ROOT_FILES, issue, validateArchivePath } from './validation';

export interface ArchiveEntryInfo {
  index: number;
  path: string;
  directory: boolean;
  symlink: boolean;
  uncompressedSize: number;
  compressedSize: number;
  compressionMethod: number;
  encrypted: boolean;
}

export interface ArchiveLimits {
  totalBytes: number;
  singleFileBytes: number;
  textFileBytes: number;
  fileCount: number;
  totalCompressionRatio: number;
}

export interface ArchiveAuditResult {
  accepted: Array<{ index: number; path: string }>;
  files: Set<string>;
  issues: ValidationIssue[];
}

export function auditArchiveEntries(entries: ArchiveEntryInfo[], limits: ArchiveLimits): ArchiveAuditResult {
  const issues: ValidationIssue[] = [];
  const accepted: Array<{ index: number; path: string }> = [];
  const files = new Set<string>();
  const caseFolded = new Set<string>();
  let totalUncompressed = 0;
  let totalCompressed = 0;
  const fileEntries = entries.filter((entry) => !entry.directory);
  if (fileEntries.length > limits.fileCount) issues.push(issue('TOO_MANY_FILES', '', `<= ${limits.fileCount}`, String(fileEntries.length), 'The ZIP contains too many files.', 'Remove unnecessary files or reduce frame counts.'));

  for (const entry of entries) {
    const rawName = entry.directory ? entry.path.replace(/\/$/, '') : entry.path;
    const normalized = validateArchivePath(rawName);
    if (!normalized) { issues.push(issue('UNSAFE_ARCHIVE_PATH', rawName, 'safe relative POSIX path', rawName, 'The ZIP entry path is unsafe or too deeply nested.', 'Use relative forward-slash paths without empty, dot, parent, absolute, drive, UNC, or control-character segments.')); continue; }
    if (entry.symlink) { issues.push(issue('SYMLINK_FORBIDDEN', normalized, 'regular file or directory', 'symbolic link', 'Symbolic links are not allowed in CozyKin Packs.', 'Replace the link with a regular in-package file.')); continue; }
    if (entry.directory) continue;
    const lower = normalized.toLocaleLowerCase('en-US');
    if (files.has(normalized) || caseFolded.has(lower)) { issues.push(issue('DUPLICATE_PATH', normalized, 'unique case-insensitive path', normalized, 'The ZIP contains duplicate or case-colliding paths.', 'Keep one consistently cased file path.')); continue; }
    files.add(normalized); caseFolded.add(lower);
    const dot = normalized.lastIndexOf('.');
    const extension = dot >= 0 ? normalized.slice(dot).toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.has(extension)) issues.push(issue('ILLEGAL_FILE_TYPE', normalized, [...ALLOWED_EXTENSIONS].join(', '), extension || '(none)', 'The file type is not allowed in CozyKin Pack v1.', 'Remove the file or convert it to an allowed data or image format.'));
    const maximum = ['.json', '.md', '.txt'].includes(extension) ? limits.textFileBytes : limits.singleFileBytes;
    if (entry.uncompressedSize > maximum) issues.push(issue('FILE_TOO_LARGE', normalized, `<= ${maximum} bytes`, String(entry.uncompressedSize), 'A package file exceeds its size limit.', 'Reduce the file size.'));
    if (![0, 8].includes(entry.compressionMethod)) issues.push(issue('UNSUPPORTED_COMPRESSION', normalized, 'stored or deflate', String(entry.compressionMethod), 'The ZIP uses an unsupported compression method.', 'Recreate the ZIP with standard deflate compression.'));
    if (entry.encrypted) issues.push(issue('ENCRYPTED_ENTRY_FORBIDDEN', normalized, 'unencrypted entry', 'encrypted', 'Encrypted ZIP entries cannot be safely inspected.', 'Create an unencrypted ZIP.'));
    totalUncompressed += entry.uncompressedSize; totalCompressed += entry.compressedSize;
    accepted.push({ index: entry.index, path: normalized });
  }
  if (totalUncompressed > limits.totalBytes) issues.push(issue('UNCOMPRESSED_SIZE_LIMIT', '', `<= ${limits.totalBytes} bytes`, String(totalUncompressed), 'The extracted package would be too large.', 'Reduce asset count or dimensions.'));
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > limits.totalCompressionRatio) issues.push(issue('COMPRESSION_RATIO_LIMIT', '', `<= ${limits.totalCompressionRatio}:1`, `${(totalUncompressed / totalCompressed).toFixed(1)}:1`, 'The ZIP has a suspicious compression ratio.', 'Recreate the ZIP without highly compressible padding or oversized files.'));
  for (const required of REQUIRED_ROOT_FILES) if (!files.has(required)) issues.push(issue('MISSING_REQUIRED_FILE', required, 'present at ZIP root', 'not found', `${required} is required.`, `Add ${required} at the package root.`));
  return { accepted, files, issues };
}
