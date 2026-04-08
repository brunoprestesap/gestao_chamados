#!/usr/bin/env bash
# ============================================================
# restore-mongodb.sh — Restaurar backup do MongoDB (Docker)
#
# Uso:
#   ./scripts/restore-mongodb.sh                          # restaura o backup mais recente
#   ./scripts/restore-mongodb.sh backups/manutencao_20260408_020000.archive.gz  # backup específico
#
# ATENÇÃO: Este script SOBRESCREVE os dados atuais do banco.
# ============================================================

set -euo pipefail

# -----------------------------------------------------------
# Configuração
# -----------------------------------------------------------
CONTAINER_NAME="${MONGO_CONTAINER:-severino-mongodb-1}"
DB_NAME="${MONGO_DB:-manutencao}"
BACKUP_DIR="${BACKUP_DIR:-/opt/severino/backups}"
LOG_PREFIX="[restore-mongodb]"

# -----------------------------------------------------------
# Funções
# -----------------------------------------------------------
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $LOG_PREFIX $1"; }
die() { log "ERRO: $1"; exit 1; }

# -----------------------------------------------------------
# Determinar arquivo de backup
# -----------------------------------------------------------
if [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
else
  # Usar o backup mais recente
  BACKUP_FILE=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.archive.gz" -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)

  if [ -z "$BACKUP_FILE" ]; then
    die "Nenhum backup encontrado em '$BACKUP_DIR'."
  fi
fi

# Verificar arquivo
[ -f "$BACKUP_FILE" ] || die "Arquivo não encontrado: $BACKUP_FILE"
[ -s "$BACKUP_FILE" ] || die "Arquivo vazio: $BACKUP_FILE"

# Verificar container
docker inspect --format='{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true \
  || die "Container '$CONTAINER_NAME' não está rodando."

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_DATE=$(stat -c '%y' "$BACKUP_FILE" 2>/dev/null | cut -d'.' -f1)

# -----------------------------------------------------------
# Confirmação
# -----------------------------------------------------------
log "=== Restauração de Backup ==="
log "  Arquivo:   $BACKUP_FILE"
log "  Tamanho:   $BACKUP_SIZE"
log "  Data:      $BACKUP_DATE"
log "  Banco:     $DB_NAME"
log "  Container: $CONTAINER_NAME"
log ""
log "ATENÇÃO: Isso irá SOBRESCREVER os dados atuais do banco '$DB_NAME'."

read -rp "Deseja continuar? (digite 'sim' para confirmar): " CONFIRM
if [ "$CONFIRM" != "sim" ]; then
  log "Restauração cancelada pelo usuário."
  exit 0
fi

# -----------------------------------------------------------
# Backup de segurança antes do restore
# -----------------------------------------------------------
log "Criando backup de segurança antes do restore..."
SAFETY_FILE="$BACKUP_DIR/${DB_NAME}_pre_restore_$(date +%Y%m%d_%H%M%S).archive.gz"

docker exec "$CONTAINER_NAME" mongodump \
  --db="$DB_NAME" \
  --archive \
  --gzip \
  2>/dev/null \
  > "$SAFETY_FILE"

if [ -s "$SAFETY_FILE" ]; then
  log "Backup de segurança salvo em: $SAFETY_FILE"
else
  rm -f "$SAFETY_FILE"
  log "AVISO: Backup de segurança falhou (banco pode estar vazio)."
fi

# -----------------------------------------------------------
# Executar restore
# -----------------------------------------------------------
log "Iniciando restore..."
START_TIME=$(date +%s)

docker exec -i "$CONTAINER_NAME" mongorestore \
  --archive \
  --gzip \
  --drop \
  --nsInclude="${DB_NAME}.*" \
  < "$BACKUP_FILE" \
  2>&1

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log "Restore concluído em ${DURATION}s."

# -----------------------------------------------------------
# Verificação pós-restore
# -----------------------------------------------------------
log "Verificando collections restauradas..."
docker exec "$CONTAINER_NAME" mongosh "$DB_NAME" --quiet --eval "
  const cols = db.getCollectionNames();
  print('Collections: ' + cols.length);
  cols.forEach(c => {
    const count = db.getCollection(c).countDocuments();
    print('  ' + c + ': ' + count + ' docs');
  });
"

log "=== Restore finalizado com sucesso ==="
log "Backup de segurança (pré-restore): $SAFETY_FILE"
