# pixkeyvalidation

Backend Express + TypeScript para validação sintática de chaves Pix e consulta cadastral de CPF via Magma Data Hub.

A consulta Magma é `registryVerification`. Ela não comprova existência ou titularidade da chave no DICT/Pix. `pixOwnershipVerification` permanece `not_checked`.

## Caminho de execução

```text
/home/felipe/pixkeyvalidation
```

## Instalação

```bash
cd /home/felipe/pixkeyvalidation
npm install
cp .env.example .env
npm run dev
```

Preencha `MAGMA_API_TOKEN` somente em `.env`. O arquivo é ignorado pelo Git.

Por segurança, mantenha durante implementação:

```env
MAGMA_REAL_REQUESTS_ENABLED=false
```

Com essa configuração, uma tentativa de consulta CPF retorna `REAL_PROVIDER_REQUESTS_DISABLED` sem fazer requisição externa.

## Endpoint

```http
POST /api/pix/verify
Content-Type: application/json
```

```json
{
  "pixKey": "52998224725",
  "pixKeyType": "cpf"
}
```

`pixKeyType` aceita `cpf`, `cnpj`, `email`, `phone` e `random`. Se omitido, o backend tenta detectar. CPF e CNPJ são validados matematicamente. CPF inválido não chega à Magma.

## Verificações locais sem consumir Magma

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Os testes usam fetch mockado e consomem zero créditos.

## Uma verificação real controlada

Esta operação gasta uma requisição do provider. Só execute conscientemente:

1. Coloque a chave nova em `MAGMA_API_TOKEN` no `.env`.
2. Altere temporariamente `MAGMA_REAL_REQUESTS_ENABLED=true`.
3. Inicie a API com `npm run dev`.
4. Faça uma única chamada CPF ao `POST /api/pix/verify`.
5. Volte imediatamente para `MAGMA_REAL_REQUESTS_ENABLED=false`.

Nenhum teste automatizado habilita requisições reais.

## Logs de observabilidade

Cada conclusão de `/api/pix/verify` gera uma linha JSON em:

```text
/home/felipe/pixkeyvalidation/logs/audit.jsonl
```

O mesmo evento é enviado ao stdout, adequado para systemd, Docker, journald ou coletor da VPS.

Campos registrados:

```text
timestamp
event
requestId
method
path
keyType
provider
status
success
durationMs
errorCode
```

Não são registrados body, CPF, token Magma, nome, cookies, autorização ou resposta bruta do provider.

## Relatórios

Gere o relatório agregado com:

```bash
cd /home/felipe/pixkeyvalidation
npm run report
```

Saída:

```text
/home/felipe/pixkeyvalidation/reports/verification-summary.json
```

O relatório contém período, total, sucessos, falhas, duração média, contagem por tipo de chave, status HTTP e código de erro. Não contém dados pessoais.

## Variáveis de ambiente

```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
MAGMA_API_BASE_URL=https://magmadatahub.com/api.php
MAGMA_API_TOKEN=
MAGMA_API_TIMEOUT_MS=8000
MAGMA_REAL_REQUESTS_ENABLED=false
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
PIX_VERIFY_RATE_LIMIT_WINDOW_MS=60000
PIX_VERIFY_RATE_LIMIT_MAX=10
LOG_DIR=./logs
```

## CORS

A API aceita apenas origins listadas literalmente em `CORS_ALLOWED_ORIGINS`. Wildcard é rejeitado na inicialização. Cookies não são habilitados e `credentials` está `false`.

## CSRF e autenticação

O serviço atual não usa cookies de sessão, portanto não há credenciais automáticas do navegador e não foi adicionada camada CSRF artificial. Antes de exposição pública, integre o endpoint à autenticação/autorização real do produto. Se cookies forem adotados, implemente CSRF token, validação de Origin e atributos `HttpOnly`, `Secure` e `SameSite` adequados à topologia.

## Rate limit

O limite padrão é 10 chamadas por minuto por IP, configurável por ambiente. Se a VPS estiver atrás de Nginx, Caddy ou Cloudflare, configure `trust proxy` somente após definir a quantidade e a origem dos proxies confiáveis; o projeto não habilita `trust proxy` cegamente.

## Produção

1. Use HTTPS no reverse proxy.
2. Configure `NODE_ENV=production`.
3. Use somente o domínio real em `CORS_ALLOWED_ORIGINS`.
4. Armazene `.env` fora do Git e restrinja permissões.
5. Encaminhe stdout para o coletor de logs.
6. Configure autenticação/autorização antes de tornar o endpoint público.
7. Habilite `MAGMA_REAL_REQUESTS_ENABLED=true` somente no processo que deve consultar o provider.

## Fluxo

```text
frontend -> HTTPS -> API na VPS -> validação local -> Magma
```

O frontend nunca recebe `MAGMA_API_TOKEN` e nunca acessa a Magma diretamente.
