import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AuditFields {
  requestId?: string;
  method?: string;
  path?: string;
  keyType?: string;
  provider?: string;
  status?: number;
  success?: boolean;
  durationMs?: number;
  errorCode?: string;
}

export interface AuditRecord extends AuditFields {
  timestamp: string;
  event: string;
}

export interface AuditLogger {
  log(event: string, fields: AuditFields): void;
}

export const noOpAuditLogger: AuditLogger = {
  log(): void {},
};

export class JsonAuditLogger implements AuditLogger {
  private readonly filePath: string;

  constructor(
    logDirectory: string,
    private readonly output: (line: string) => void = (line) => process.stdout.write(line),
  ) {
    const directory = resolve(logDirectory);
    mkdirSync(directory, { recursive: true });
    this.filePath = resolve(directory, 'audit.jsonl');
  }

  log(event: string, fields: AuditFields): void {
    const record: AuditRecord = {
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    };
    const line = `${JSON.stringify(record)}\n`;
    appendFileSync(this.filePath, line, { encoding: 'utf8', mode: 0o600 });
    this.output(line);
  }
}
