#!/usr/bin/env bash
#
# update-ldap-creds.sh
# Atualiza com segurança as credenciais da conta de serviço LDAP/AD
# (LDAP_BIND_DN e LDAP_BIND_PASSWORD) no .env de produção e recria o
# container next-app para aplicar.
#
# Rodar NA VPS, dentro de /opt/severino:
#   bash scripts/update-ldap-creds.sh
#
# Faz:
#   1. Backup do .env
#   2. Lê novo DN e nova senha interativamente (senha oculta)
#   3. Grava no .env usando aspas simples (evita interpolação do $ pelo compose)
#   4. Recria o container next-app (compose restart NÃO recarrega o .env)
#   5. Valida lendo as variáveis de dentro do container em execução

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/severino}"
SERVICE="next-app"

cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  echo "ERRO: .env não encontrado em $PROJECT_DIR" >&2
  exit 1
fi
if [[ ! -f docker-compose.yml ]]; then
  echo "ERRO: docker-compose.yml não encontrado em $PROJECT_DIR" >&2
  exit 1
fi

echo "== Atualização de credenciais LDAP/AD (conta de serviço) =="
echo "Diretório: $PROJECT_DIR"
echo

# ── 1. Backup ──────────────────────────────────────────────────
BACKUP=".env.bak.$(date +%Y%m%d-%H%M%S)"
cp .env "$BACKUP"
echo "Backup criado: $BACKUP"
echo

# ── 2. Leitura interativa ──────────────────────────────────────
read -r -p "Novo LDAP_BIND_DN: " NEW_DN
echo
read -r -s -p "Nova LDAP_BIND_PASSWORD: " NEW_PASS
echo
read -r -s -p "Confirme a senha: " NEW_PASS2
echo
echo

if [[ "$NEW_PASS" != "$NEW_PASS2" ]]; then
  echo "ERRO: as senhas não conferem. Nada foi alterado." >&2
  exit 1
fi
if [[ -z "$NEW_DN" || -z "$NEW_PASS" ]]; then
  echo "ERRO: DN ou senha vazios. Nada foi alterado." >&2
  exit 1
fi

# Aspas simples no .env tornam o valor literal (sem interpolação de $).
# Porém um ' literal dentro do valor não é representável com aspas simples
# na sintaxe do .env do compose — abortamos e pedimos ajuste manual.
if [[ "$NEW_DN" == *\'* || "$NEW_PASS" == *\'* ]]; then
  echo "ERRO: o DN ou a senha contém aspas simples ('), que este script não" >&2
  echo "consegue gravar com segurança no .env. Edite o .env manualmente." >&2
  exit 1
fi

# ── 3. Reescreve as linhas no .env ─────────────────────────────
# Remove qualquer atribuição existente (não comentada) e reanexa no fim.
grep -v -E '^[[:space:]]*(LDAP_BIND_DN|LDAP_BIND_PASSWORD)=' .env > .env.tmp
printf "LDAP_BIND_DN='%s'\n"       "$NEW_DN"   >> .env.tmp
printf "LDAP_BIND_PASSWORD='%s'\n" "$NEW_PASS" >> .env.tmp
mv .env.tmp .env
echo "Valores gravados no .env (LDAP_BIND_DN e LDAP_BIND_PASSWORD)."
echo

# ── 4. Recria o container ──────────────────────────────────────
echo "Recriando o container '$SERVICE' para aplicar as variáveis..."
docker compose up -d --no-deps "$SERVICE"
echo

# ── 5. Validação dentro do container ───────────────────────────
echo "Aguardando o container ficar pronto..."
ACTUAL_DN=""
ACTUAL_PASS=""
for _ in $(seq 1 15); do
  if ACTUAL_DN=$(docker compose exec -T "$SERVICE" printenv LDAP_BIND_DN 2>/dev/null) \
     && ACTUAL_PASS=$(docker compose exec -T "$SERVICE" printenv LDAP_BIND_PASSWORD 2>/dev/null); then
    break
  fi
  sleep 1
done

OK=1
if [[ "$ACTUAL_DN" == "$NEW_DN" ]]; then
  echo "OK: LDAP_BIND_DN aplicado corretamente no container."
else
  echo "FALHA: LDAP_BIND_DN no container difere do informado." >&2
  OK=0
fi

if [[ "$ACTUAL_PASS" == "$NEW_PASS" ]]; then
  echo "OK: LDAP_BIND_PASSWORD aplicada corretamente (sem corrupção de \$)."
else
  echo "FALHA: LDAP_BIND_PASSWORD no container difere da informada." >&2
  echo "       (provável interpolação de '\$' — revise o .env)" >&2
  OK=0
fi
echo

if [[ "$OK" -eq 1 ]]; then
  echo "✅ Credenciais atualizadas e aplicadas. Faça um login de teste com um usuário do AD."
  echo "   Para depurar o bind: defina LDAP_DEBUG=true no .env, recrie e veja:"
  echo "     docker compose logs -f --tail 50 $SERVICE"
  echo "   (lembre de voltar LDAP_DEBUG=false depois)."
else
  echo "⚠️  Algo divergiu. Para reverter:" >&2
  echo "     cp $BACKUP .env && docker compose up -d --no-deps $SERVICE" >&2
  exit 1
fi
