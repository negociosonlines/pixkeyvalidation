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
    private readonly fetchImpl: FetchLike = fetch,
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
    url.searchParams.set('cpf', cpf);

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
