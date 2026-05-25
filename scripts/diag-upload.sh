#!/usr/bin/env bash
# Diagnóstico READ-ONLY do 500 em /api/upload (auditoria M3).
# Não altera nada. Uso:
#   scp scripts/diag-upload.sh manutencao@172.18.3.48:~/
#   ssh -t manutencao@172.18.3.48 'sudo bash ~/diag-upload.sh'
set +e
C=severino-next-app-1

echo "== 1. Permissões do diretório de uploads (host) =="
ls -land /opt/severino/uploads
ls -lan  /opt/severino/uploads 2>/dev/null | head -20

echo ""
echo "== 2. Como o container enxerga o diretório + uid do processo =="
docker exec "$C" id
docker exec "$C" sh -c 'ls -land /app/data/uploads; echo "cwd=$(pwd)"'

echo ""
echo "== 3. Teste de escrita real como o processo (uid 1001) =="
# Replica o que a rota faz: mkdir recursivo + escrita do arquivo.
docker exec "$C" sh -c 'mkdir -p /app/data/uploads/chamados && touch /app/data/uploads/chamados/.wtest && echo ESCRITA_OK && rm -f /app/data/uploads/chamados/.wtest || echo ESCRITA_NEGADA'

echo ""
echo "== 4. ERRO REAL do upload nos logs (todo o histórico do container) =="
docker logs "$C" 2>&1 | grep -n -A 12 '\[upload\]' | tail -60
echo "--- (se vazio acima, procurar Error/stack genéricos recentes) ---"
docker logs --since 168h "$C" 2>&1 | grep -iE 'error|unhandled|rejection|EACCES|ENOENT|Mongo|validation' | tail -30
