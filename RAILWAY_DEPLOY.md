# Railway deployment
# 1. Instale o CLI: npm i -g @railway/cli
# 2. Login: railway login
# 3. Crie o projeto: railway init
# 4. Configure variáveis no dashboard Railway ou via CLI:
#
# railway variables set NODE_ENV=production
# railway variables set HOST=0.0.0.0
# railway variables set PORT=3000
# railway variables set MAGMA_API_BASE_URL=https://magmadatahub.com/api.php
# railway variables set MAGMA_API_TOKEN=<SEU_TOKEN>
# railway variables set MAGMA_API_TIMEOUT_MS=8000
# railway variables set MAGMA_REAL_REQUESTS_ENABLED=true
# railway variables set CORS_ALLOWED_ORIGINS=https://pv-etapas.pages.dev
# railway variables set PIX_VERIFY_RATE_LIMIT_WINDOW_MS=60000
# railway variables set PIX_VERIFY_RATE_LIMIT_MAX=10
# railway variables set LOG_DIR=/app/logs
#
# 5. Deploy: railway up