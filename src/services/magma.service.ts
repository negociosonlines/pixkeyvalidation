import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ProviderError } from '../shared/errors.js';

export interface RegistryResult {
  found: boolean;
  name?: string;
}

export interface RegistryLookup {
  lookupCpf(cpf: string): Promise<RegistryResult>;
}

interface MagmaConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  realRequestsEnabled: boolean;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function rawHttpFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const path = `${url.pathname}${url.search}`
    .replaceAll('%7B', '{')
    .replaceAll('%7D', '}');

  return new Promise((resolve, reject) => {
    const outgoing = request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path,
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string> | undefined,
      signal: init?.signal ?? undefined,
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      incoming.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            value.forEach((item) => headers.append(name, item));
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        const status = incoming.statusCode ?? 502;
        const body = status === 204 || status === 304 ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status, headers }));
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

const providerMessages = {
  integration: 'Não foi possível processar a consulta cadastral.',
  unavailable: 'O serviço de verificação cadastral está temporariamente indisponível.',
  error: 'Não foi possível consultar a base cadastral.',
  timeout: 'O serviço de verificação cadastral não respondeu a tempo.',
};

function normalizeRegistryResponse(payload: unknown): RegistryResult {
  if (!payload || typeof payload !== 'object') {
    return { found: false };
  }

  const name = Reflect.get(payload, 'nome');
  if (typeof name !== 'string' || !name.trim()) {
    return { found: false };
  }

  return { found: true, name: name.trim() };
}

export class MagmaService implements RegistryLookup {
  constructor(
    private readonly config: MagmaConfig,
    private readonly fetchImpl: FetchLike = rawHttpFetch,
  ) {}

  async lookupCpf(cpf: string): Promise<RegistryResult> {
    if (!this.config.realRequestsEnabled) {
      throw new ProviderError(
        503,
        'REAL_PROVIDER_REQUESTS_DISABLED',
        'As consultas reais ao provider estão desabilitadas.',
      );
    }

    const url = new URL(this.config.baseUrl);
    url.searchParams.set('token', this.config.token);
    url.searchParams.set('cpf', `{{${cpf}}}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (response.status === 404) {
        return { found: false };
      }

      if (response.status === 400) {
        throw new ProviderError(502, 'REGISTRY_PROVIDER_INTEGRATION_ERROR', providerMessages.integration);
      }

      if (response.status === 403) {
        throw new ProviderError(503, 'REGISTRY_PROVIDER_UNAVAILABLE', providerMessages.unavailable);
      }

      if (response.status === 502 || !response.ok) {
        throw new ProviderError(502, 'REGISTRY_PROVIDER_ERROR', providerMessages.error);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ProviderError(502, 'REGISTRY_PROVIDER_ERROR', providerMessages.error);
      }

      return normalizeRegistryResponse(payload);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new ProviderError(504, 'REGISTRY_PROVIDER_TIMEOUT', providerMessages.timeout);
      }

      throw new ProviderError(502, 'REGISTRY_PROVIDER_ERROR', providerMessages.error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
