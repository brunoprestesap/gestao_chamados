#!/usr/bin/env bash
#
# update-llm-env.sh
# Grava as variáveis da IA local (LLM_*, spec 0001) no .env de produção,
# recria o container next-app e confere, de dentro dele, que o vLLM responde
# e serve o modelo configurado.
#
# Rodar NA VPS, como root, depois do deploy que trouxe o docker-compose.yml
# com as variáveis LLM_*:
#   sudo bash /opt/severino/scripts/update-llm-env.sh
#
# Valores não secretos podem vir do ambiente (senão são perguntados):
#   sudo LLM_BASE_URL=http://host:8000/v1 LLM_MODEL=qwen3-8b bash .../update-llm-env.sh
#
# Faz:
#   1. Lê endereço, modelo e vagas; lê a chave de forma oculta
#   2. Confere, a partir do host, que o vLLM aceita a chave e serve o modelo
#   3. Backup do .env e regrava as linhas LLM_* preservando dono e permissão
#      (o .env precisa continuar 600 e do github-runner, senão o CD quebra)
#   4. Recria o next-app (compose restart NÃO recarrega o .env)
#   5. Confere as variáveis e a consulta ao /models de dentro do container

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/severino}"
SERVICE="next-app"
umask 077

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERRO: rode com sudo (o .env é 600 do github-runner e o Docker exige root)." >&2
  exit 1
fi

cd "$PROJECT_DIR"

if [[ ! -f .env || ! -f docker-compose.yml ]]; then
  echo "ERRO: .env ou docker-compose.yml não encontrado em $PROJECT_DIR" >&2
  exit 1
fi
if ! grep -q 'LLM_BASE_URL' docker-compose.yml; then
  echo "ERRO: este docker-compose.yml não repassa LLM_*. Faça o deploy da spec 0001 antes." >&2
  exit 1
fi

echo "== IA local (vLLM): variáveis LLM_* do next-app =="
echo "Diretório: $PROJECT_DIR"
echo

# ── 1. Leitura ─────────────────────────────────────────────────
BASE_URL="${LLM_BASE_URL:-}"
MODEL="${LLM_MODEL:-}"
MAX_CONCURRENCY="${LLM_MAX_CONCURRENCY:-}"
[[ -n "$BASE_URL" ]] || read -r -p "LLM_BASE_URL (com /v1 no fim): " BASE_URL
[[ -n "$MODEL" ]] || read -r -p "LLM_MODEL (nome exato servido): " MODEL
[[ -n "$MAX_CONCURRENCY" ]] || read -r -p "LLM_MAX_CONCURRENCY [4]: " MAX_CONCURRENCY
MAX_CONCURRENCY="${MAX_CONCURRENCY:-4}"
read -r -s -p "LLM_API_KEY (oculta): " API_KEY
echo
echo

BASE_URL="${BASE_URL%/}"
if [[ ! "$BASE_URL" =~ ^https?://[^[:space:]]+/v1$ ]]; then
  echo "ERRO: LLM_BASE_URL precisa ser http(s) e terminar em /v1. Nada foi alterado." >&2
  exit 1
fi
if [[ -z "$MODEL" || -z "$API_KEY" ]]; then
  echo "ERRO: modelo ou chave vazios. Nada foi alterado." >&2
  exit 1
fi
if [[ ! "$MAX_CONCURRENCY" =~ ^[0-9]+$ ]] || ((MAX_CONCURRENCY < 1 || MAX_CONCURRENCY > 16)); then
  echo "ERRO: LLM_MAX_CONCURRENCY precisa ser inteiro de 1 a 16. Nada foi alterado." >&2
  exit 1
fi
# Aspas simples no .env tornam o valor literal; um ' dentro do valor não cabe.
if [[ "$BASE_URL$MODEL$API_KEY" == *\'* ]]; then
  echo "ERRO: algum valor contém aspas simples ('). Edite o .env manualmente." >&2
  exit 1
fi
echo "Chave lida (${#API_KEY} caracteres)."

# ── 2. Conferência a partir do host ────────────────────────────
# A chave vai por arquivo de cabeçalho, nunca na linha de comando.
HEADER_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
trap 'rm -f "$HEADER_FILE" "$BODY_FILE" .env.llm.tmp' EXIT
printf 'Authorization: Bearer %s\n' "$API_KEY" > "$HEADER_FILE"

HTTP_CODE="$(curl -s -m 5 -o "$BODY_FILE" -w '%{http_code}' -H @"$HEADER_FILE" "$BASE_URL/models" || true)"
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERRO: GET $BASE_URL/models respondeu '$HTTP_CODE' a partir do host." >&2
  echo "      401/403 = chave recusada; 000 = rede não alcança. Nada foi alterado." >&2
  exit 1
fi
if ! grep -q "\"id\":[[:space:]]*\"$MODEL\"" "$BODY_FILE"; then
  echo "ERRO: o vLLM responde, mas não serve o modelo '$MODEL'. Modelos servidos:" >&2
  grep -o '"id":[[:space:]]*"[^"]*"' "$BODY_FILE" >&2 || true
  echo "      Nada foi alterado." >&2
  exit 1
fi
echo "OK: a partir do host, o vLLM aceita a chave e serve '$MODEL'."
echo

# ── 3. Backup e regravação do .env ─────────────────────────────
BACKUP=".env.bak.$(date +%Y%m%d-%H%M%S)"
cp -p .env "$BACKUP"
echo "Backup criado: $BACKUP"

grep -v -E '^[[:space:]]*LLM_[A-Z_]+=' .env > .env.llm.tmp || true
{
  echo
  echo "# IA local (vLLM com Qwen3), spec 0001. Chave emitida pela equipe da GPU."
  printf "LLM_BASE_URL='%s'\n" "$BASE_URL"
  printf "LLM_API_KEY='%s'\n" "$API_KEY"
  printf "LLM_MODEL='%s'\n" "$MODEL"
  printf "LLM_ENABLED='true'\n"
  printf "LLM_MAX_CONCURRENCY='%s'\n" "$MAX_CONCURRENCY"
  printf "LLM_DEBUG='false'\n"
} >> .env.llm.tmp
# Escreve por cima do arquivo existente: mantém dono (github-runner) e modo (600).
cat .env.llm.tmp > .env
echo "Variáveis LLM_* gravadas. Permissão do .env: $(stat -c '%a %U:%G' .env)"
echo

# ── 4. Recria o container ──────────────────────────────────────
echo "Recriando o container '$SERVICE'..."
docker compose up -d --no-deps "$SERVICE"
echo

# ── 5. Conferência de dentro do container ──────────────────────
echo "Aguardando o container ficar pronto..."
ACTUAL_KEY=""
for _ in $(seq 1 20); do
  if ACTUAL_KEY="$(docker compose exec -T "$SERVICE" printenv LLM_API_KEY 2>/dev/null)"; then
    break
  fi
  sleep 1
done

OK=1
for pair in "LLM_BASE_URL=$BASE_URL" "LLM_MODEL=$MODEL" "LLM_ENABLED=true" "LLM_MAX_CONCURRENCY=$MAX_CONCURRENCY" "LLM_DEBUG=false"; do
  name="${pair%%=*}"
  expected="${pair#*=}"
  actual="$(docker compose exec -T "$SERVICE" printenv "$name" 2>/dev/null || true)"
  if [[ "$actual" == "$expected" ]]; then
    echo "OK: $name=$actual"
  else
    echo "FALHA: $name no container é '$actual', esperado '$expected'." >&2
    OK=0
  fi
done
if [[ "$ACTUAL_KEY" == "$API_KEY" ]]; then
  echo "OK: LLM_API_KEY aplicada sem alteração (valor não exibido)."
else
  echo "FALHA: LLM_API_KEY no container difere da informada." >&2
  OK=0
fi

# Mesma consulta do /api/llm/status, usando só o ambiente do container.
PROBE='const t0=Date.now();
fetch(process.env.LLM_BASE_URL+"/models",{headers:{Authorization:"Bearer "+process.env.LLM_API_KEY},signal:AbortSignal.timeout(5000)})
  .then(async r=>{const b=await r.json().catch(()=>null);const ids=Array.isArray(b?.data)?b.data.map(m=>m?.id):[];
    console.log(JSON.stringify({reachable:r.ok,status:r.status,modelServed:r.ok?ids.includes(process.env.LLM_MODEL):null,latencyMs:Date.now()-t0}));})
  .catch(e=>console.log(JSON.stringify({reachable:false,error:e?.cause?.code||e?.name})));'
PROBE_RESULT="$(docker compose exec -T "$SERVICE" node -e "$PROBE" 2>&1 || true)"
echo "Consulta de dentro do container: $PROBE_RESULT"
if [[ "$PROBE_RESULT" != *'"reachable":true'* || "$PROBE_RESULT" != *'"modelServed":true'* ]]; then
  echo "FALHA: de dentro do container o vLLM não respondeu com o modelo servido." >&2
  echo "       Confira se alguma rede Docker cobre o endereço do vLLM (docker network inspect)." >&2
  OK=0
fi

APP_CODE="$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H 'Host: sigma.ap.trf1.gov.br' http://127.0.0.1/login || true)"
echo "App: /login respondeu $APP_CODE"
[[ "$APP_CODE" == "200" ]] || OK=0
echo

if [[ "$OK" -eq 1 ]]; then
  echo "✅ IA local configurada. Confirme como Admin em http://sigma.ap.trf1.gov.br/api/llm/status"
  echo "   (reachable e modelServed devem ser true)."
else
  echo "⚠️  Algo divergiu. Para reverter:" >&2
  echo "     cp -p $BACKUP .env && docker compose up -d --no-deps $SERVICE" >&2
  exit 1
fi
