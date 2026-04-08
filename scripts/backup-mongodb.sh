#!/usr/bin/env bash
# ============================================================
# backup-mongodb.sh — Backup automatizado do MongoDB (Docker)
#
# Uso:
#   ./scripts/backup-mongodb.sh              # backup padrão
#   BACKUP_DIR=/mnt/nfs/backups ./scripts/backup-mongodb.sh
#
# Cron (diário às 02:00):
#   0 2 * * * /opt/severino/scripts/backup-mongodb.sh >> /var/log/severino-backup.log 2>&1
# ============================================================

set -euo pipefail

# -----------------------------------------------------------
# Configuração (pode ser sobrescrita via variáveis de ambiente)
# -----------------------------------------------------------
CONTAINER_NAME="${MONGO_CONTAINER:-severino-mongodb-1}"
DB_NAME="${MONGO_DB:-manutencao}"
BACKUP_DIR="${BACKUP_DIR:-/opt/severino/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_PREFIX="[backup-mongodb]"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.archive.gz"
LOCK_FILE="/tmp/severino-backup.lock"

# -----------------------------------------------------------
# Funções
# -----------------------------------------------------------
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $LOG_PREFIX $1"; }

cleanup() {
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

die() {
  log "ERRO: $1"
  exit 1
}

# -----------------------------------------------------------
# Pré-checks
# -----------------------------------------------------------

# Evitar execução concorrente
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    die "Backup já em execução (PID $LOCK_PID). Abortando."
  else
    log "Lock file órfão encontrado, removendo..."
    rm -f "$LOCK_FILE"
  fi
fi
echo $$ > "$LOCK_FILE"

# Verificar se Docker está acessível
command -v docker &>/dev/null || die "Docker não encontrado no PATH."

# Verificar se o container está rodando
docker inspect --format='{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true \
  || die "Container '$CONTAINER_NAME' não está rodando."

# Criar diretório de backup
mkdir -p "$BACKUP_DIR"

# -----------------------------------------------------------
# Executar backup
# -----------------------------------------------------------
log "Iniciando backup do banco '$DB_NAME' (container: $CONTAINER_NAME)..."
log "Destino: $BACKUP_FILE"

START_TIME=$(date +%s)

docker exec "$CONTAINER_NAME" mongodump \
  --db="$DB_NAME" \
  --archive \
  --gzip \
  2>/dev/null \
  > "$BACKUP_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Verificar se o arquivo foi criado e tem conteúdo
if [ ! -s "$BACKUP_FILE" ]; then
  rm -f "$BACKUP_FILE"
  die "Backup gerou arquivo vazio. Verifique o container e o banco."
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup concluído em ${DURATION}s — tamanho: $BACKUP_SIZE"

# -----------------------------------------------------------
# Verificar integridade (dry-run do restore)
# -----------------------------------------------------------
log "Verificando integridade do backup..."

docker exec -i "$CONTAINER_NAME" mongorestore \
  --archive \
  --gzip \
  --dryRun \
  --nsFrom="${DB_NAME}.*" \
  --nsTo="${DB_NAME}_verify.*" \
  < "$BACKUP_FILE" \
  2>/dev/null \
  && log "Verificação de integridade OK." \
  || log "AVISO: Verificação de integridade falhou — backup pode estar corrompido."

# -----------------------------------------------------------
# Rotação: remover backups antigos
# -----------------------------------------------------------
if [ "$RETENTION_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.archive.gz" -mtime +"$RETENTION_DAYS" -type f -print -delete | wc -l)
  if [ "$DELETED" -gt 0 ]; then
    log "Rotação: $DELETED backup(s) com mais de ${RETENTION_DAYS} dias removido(s)."
  fi
fi

# -----------------------------------------------------------
# Resumo
# -----------------------------------------------------------
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.archive.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

log "=== Resumo ==="
log "  Arquivo:   $BACKUP_FILE"
log "  Tamanho:   $BACKUP_SIZE"
log "  Duração:   ${DURATION}s"
log "  Retenção:  ${RETENTION_DAYS} dias"
log "  Total:     $TOTAL_BACKUPS backup(s), $TOTAL_SIZE em disco"
log "Backup finalizado com sucesso."
