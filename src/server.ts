import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { JsonAuditLogger } from './observability/audit-logger.js';
import { MagmaService } from './services/magma.service.js';

const config = loadConfig();
const registry = new MagmaService({
  baseUrl: config.magmaBaseUrl,
  token: config.magmaToken,
  timeoutMs: config.magmaTimeoutMs,
  realRequestsEnabled: config.realProviderRequestsEnabled,
});
const auditLogger = new JsonAuditLogger(config.logDir);
const app = createApp(config, registry, auditLogger);
const server = app.listen(config.port, config.host, () => {
  process.stdout.write(`pixkeyvalidation listening on http://${config.host}:${config.port}\n`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
