import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AuditRecord } from './audit-logger.js';

interface VerificationReport {
  generatedAt: string;
  period: {
    from: string | null;
    to: string | null;
  };
  total: number;
  successful: number;
  failed: number;
  averageDurationMs: number;
  byKeyType: Record<string, number>;
  byStatus: Record<string, number>;
  byErrorCode: Record<string, number>;
}

function increment(target: Record<string, number>, key: string | undefined): void {
  if (key) {
    target[key] = (target[key] ?? 0) + 1;
  }
}

export function generateVerificationReport(sourcePath: string, destinationPath: string): VerificationReport {
  const records = existsSync(sourcePath)
    ? readFileSync(sourcePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditRecord];
        } catch {
          return [];
        }
      })
      .filter((record) => record.event === 'pix_verification_completed')
    : [];

  const byKeyType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byErrorCode: Record<string, number> = {};
  let durationTotal = 0;

  for (const record of records) {
    increment(byKeyType, record.keyType);
    increment(byStatus, record.status?.toString());
    increment(byErrorCode, record.errorCode);
    durationTotal += record.durationMs ?? 0;
  }

  const timestamps = records.map((record) => record.timestamp).sort();
  const successful = records.filter((record) => record.success).length;
  const report: VerificationReport = {
    generatedAt: new Date().toISOString(),
    period: {
      from: timestamps[0] ?? null,
      to: timestamps[timestamps.length - 1] ?? null,
    },
    total: records.length,
    successful,
    failed: records.length - successful,
    averageDurationMs: records.length ? Math.round(durationTotal / records.length) : 0,
    byKeyType,
    byStatus,
    byErrorCode,
  };

  mkdirSync(dirname(destinationPath), { recursive: true });
  writeFileSync(destinationPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = resolve(process.env.LOG_DIR ?? './logs', 'audit.jsonl');
  const destination = resolve('./reports/verification-summary.json');
  const report = generateVerificationReport(source, destination);
  process.stdout.write(`${JSON.stringify({ destination, report })}\n`);
}
