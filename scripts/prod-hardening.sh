#!/usr/bin/env bash
# ============================================================
# prod-hardening.sh — Correções rápidas da auditoria 2026-05-25
# Trata: A1 (permissões do .env) e M1 (LDAP_DEBUG em produção).
# Uso na VPS:
#   scp scripts/prod-hardening.sh manutencao@172.18.3.48:~/
#   ssh -t manutencao@172.18.3.48 'sudo bash ~/prod-hardening.sh'
# Idempotente. Mostra o que mudou. Recria o next-app no final.
# ============================================================
set -euo pipefail
APP_DIR="/opt/severino"
ENV="$APP_DIR/.env"

echo "== A1: restringindo permissões dos arquivos .env =="
shopt -s nullglob
for f in "$ENV" "$APP_DIR"/.env.bak.* "$APP_DIR"/.env.*; do
  [ -f "$f" ] || continue
  before=$(stat -c '%a %U:%G' "$f")
  chown root:root "$f"
  chmod 600 "$f"
  echo "  $f : $before -> $(stat -c '%a %U:%G' "$f")"
done

echo "== M1: desativando LDAP_DEBUG em produção =="
if grep -q '^LDAP_DEBUG=' "$ENV"; then
  sed -i 's/^LDAP_DEBUG=.*/LDAP_DEBUG=false/' "$ENV"
  echo "  LDAP_DEBUG ajustado para false"
else
  echo "LDAP_DEBUG=false" >> "$ENV"
  echo "  LDAP_DEBUG=false adicionado"
fi

echo "== Aplicando (up -d recarrega o .env; 'restart' NÃO recarrega) =="
cd "$APP_DIR"
docker compose up -d next-app
echo "== Concluído. Verifique: docker logs severino-next-app-1 --tail 20 =="
