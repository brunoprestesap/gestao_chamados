#!/usr/bin/env bash
# ============================================================
# prod-audit.sh — Auditoria READ-ONLY do Sigma em produção
# Nao altera nada: sem restart, sem escrita, sem mudanca de config.
# ============================================================
set +e
export LC_ALL=C
APP_DIR="/opt/severino"
SINCE="72h"
sec(){ printf '\n\n========== %s ==========\n' "$1"; }
sub(){ printf '\n----- %s -----\n' "$1"; }
have(){ command -v "$1" >/dev/null 2>&1; }

sec "0. METADADOS DA COLETA"
date -u '+coleta_utc=%Y-%m-%dT%H:%M:%SZ'; date '+coleta_local=%Y-%m-%dT%H:%M:%S%z'
echo "whoami=$(whoami)  euid=$EUID"; hostname; uname -a
[ -r /etc/os-release ] && grep -E '^(PRETTY_NAME|VERSION)=' /etc/os-release

# Descoberta de containers
NEXT=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'next' | head -1)
SOCK=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'socket' | head -1)
MONGO=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'mongo' | head -1)
NGINX=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'nginx' | head -1)
CRON=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'cron' | head -1)
echo "NEXT=$NEXT SOCK=$SOCK MONGO=$MONGO NGINX=$NGINX CRON=$CRON"

# ================= HOST / PERFORMANCE / INFRA =================
sec "1. HOST: RECURSOS"
sub "uptime/load"; uptime
sub "cpu"; echo "nproc=$(nproc)"; have lscpu && lscpu | grep -E 'Model name|^CPU\(s\)|Socket'
sub "memoria"; free -h
sub "disco"; df -h -x tmpfs -x devtmpfs; sub "inodes"; df -i -x tmpfs -x devtmpfs
sub "top 12 processos por memoria"; ps -eo pid,ppid,user,pmem,pcpu,rss,etime,comm --sort=-pmem | head -13
sub "top 12 processos por cpu"; ps -eo pid,ppid,user,pmem,pcpu,etime,comm --sort=-pcpu | head -13

sec "2. HOST: KERNEL / BOOT / OOM"
sub "ultimos reboots"; have last && last -x reboot 2>/dev/null | head -6
sub "dmesg erros recentes (OOM/segfault/IO)"
( dmesg -T 2>/dev/null || dmesg 2>/dev/null ) | grep -iE 'oom|killed process|segfault|i/o error|ext4-fs error|out of memory' | tail -25
sub "systemd unidades falhas"; have systemctl && systemctl --failed --no-legend --no-pager 2>/dev/null

sec "3. HOST: LOGS DE SISTEMA (journal, prioridade<=3, 72h)"
if have journalctl; then journalctl -p 3 -S "-3 days" --no-pager 2>/dev/null | tail -60; else echo "journalctl indisponivel"; fi

# ================= SEGURANCA =================
sec "4. SEGURANCA: FIREWALL & PORTAS"
sub "ufw status"; have ufw && ufw status verbose 2>/dev/null || echo "ufw indisponivel/sem permissao"
sub "portas em escuta (host)"; ( ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null ) | grep -i listen
sub "27017 exposto fora do localhost?"; ( ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null ) | grep -E '27017' || echo "27017 nao listado"

sec "5. SEGURANCA: SSH / AUTENTICACAO DO SO"
sub "tentativas SSH falhas (top origens)"
( journalctl -u ssh -u sshd -S "-7 days" --no-pager 2>/dev/null; cat /var/log/auth.log 2>/dev/null; cat /var/log/secure 2>/dev/null ) \
  | grep -iE 'failed password|invalid user|authentication failure' \
  | grep -oE 'from [0-9.]+' | sort | uniq -c | sort -rn | head -15
sub "total de falhas vs sucessos (7d)"
FAILS=$(( journalctl -u ssh -u sshd -S "-7 days" --no-pager 2>/dev/null; cat /var/log/auth.log 2>/dev/null; cat /var/log/secure 2>/dev/null ) | grep -ciE 'failed password|invalid user|authentication failure')
OKS=$(( journalctl -u ssh -u sshd -S "-7 days" --no-pager 2>/dev/null; cat /var/log/auth.log 2>/dev/null; cat /var/log/secure 2>/dev/null ) | grep -ciE 'accepted (password|publickey)')
echo "ssh_failhas_7d=$FAILS  ssh_sucessos_7d=$OKS"
sub "logins recentes"; have last && last -aiF 2>/dev/null | head -12
sub "fail2ban"; have fail2ban-client && fail2ban-client status 2>/dev/null || echo "fail2ban ausente"
sub "usuarios com shell de login"; grep -E '/(bash|sh|zsh)$' /etc/passwd 2>/dev/null | cut -d: -f1,3,7

sec "6. SEGURANCA: APP / SECRETS / PERMISSOES"
sub "permissoes .env e arquivos sensiveis"; ls -la "$APP_DIR"/.env "$APP_DIR"/.env.* 2>/dev/null
sub "AUTH_COOKIE_SECURE / TLS efetivo (do container next)"
[ -n "$NEXT" ] && docker exec "$NEXT" sh -c 'echo AUTH_COOKIE_SECURE=$AUTH_COOKIE_SECURE; echo AUTH_URL=$AUTH_URL; echo LDAP_URL=$LDAP_URL; echo NODE_ENV=$NODE_ENV' 2>/dev/null
sub "nginx escuta 443/TLS?"; [ -n "$NGINX" ] && docker exec "$NGINX" sh -c 'grep -E "listen|ssl|server_name" /etc/nginx/conf.d/default.conf' 2>/dev/null
sub "imagens e idade (CVE/patch drift)"; docker images --format '{{.Repository}}:{{.Tag}}  criada {{.CreatedSince}}' 2>/dev/null | head -20

# ================= DOCKER / ERROS / ESTABILIDADE =================
sec "7. DOCKER: STATUS & ESTABILIDADE"
sub "compose ps"; ( cd "$APP_DIR" 2>/dev/null && docker compose ps 2>/dev/null ) || docker ps -a
sub "restart count por container"
for c in $(docker ps -aq 2>/dev/null); do
  printf '%-28s restarts=%s  started=%s  oomkilled=%s exit=%s\n' \
    "$(docker inspect -f '{{.Name}}' "$c" | sed 's,^/,,')" \
    "$(docker inspect -f '{{.RestartCount}}' "$c")" \
    "$(docker inspect -f '{{.State.StartedAt}}' "$c")" \
    "$(docker inspect -f '{{.State.OOMKilled}}' "$c")" \
    "$(docker inspect -f '{{.State.ExitCode}}' "$c")"
done
sub "uso de recursos por container (snapshot)"; docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null

sec "8. APP NEXT: ERROS (ultimas $SINCE)"
if [ -n "$NEXT" ]; then
  sub "contagem por tipo"
  docker logs --since "$SINCE" "$NEXT" 2>&1 | grep -ciE 'error' | sed 's/^/error_lines=/'
  docker logs --since "$SINCE" "$NEXT" 2>&1 | grep -ciE 'unhandled|uncaught|fatal' | sed 's/^/fatal_lines=/'
  sub "ultimas linhas de erro/excecao"
  docker logs --since "$SINCE" "$NEXT" 2>&1 | grep -iE 'error|exception|unhandled|uncaught|fatal|ECONNREFUSED|ETIMEDOUT|MongoServerError|cast to|validation' | tail -60
  sub "linhas de auth/LDAP (sem expor segredos)"
  docker logs --since "$SINCE" "$NEXT" 2>&1 | grep -iE '\[Auth|\[LDAP|CredentialsSignin|signIn' | tail -25
else echo "container next nao encontrado"; fi

sec "9. SOCKET SERVER: ERROS"
[ -n "$SOCK" ] && docker logs --since "$SINCE" "$SOCK" 2>&1 | grep -iE 'error|exception|refused|unauthorized|timeout|disconnect' | tail -30 || echo "sem socket/sem erros"

sec "10. NGINX: ERROS & TRAFEGO"
if [ -n "$NGINX" ]; then
  sub "error.log (tail)"; docker logs --since "$SINCE" "$NGINX" 2>&1 | grep -iE 'error|emerg|warn|upstream' | tail -30
  sub "status HTTP (contagem) a partir do access log"
  docker logs --since "$SINCE" "$NGINX" 2>&1 | grep -oE '" [1-5][0-9][0-9] ' | tr -d '" ' | sort | uniq -c | sort -rn
  sub "top 10 IPs"
  docker logs --since "$SINCE" "$NGINX" 2>&1 | grep -oE '^[0-9.]+' | sort | uniq -c | sort -rn | head -10
  sub "amostra de 5xx"
  docker logs --since "$SINCE" "$NGINX" 2>&1 | grep -E '" 5[0-9][0-9] ' | tail -15
fi

sec "11. CRON RECORRENTE"
[ -n "$CRON" ] && { sub "logs cron (tail)"; docker logs --since "$SINCE" "$CRON" 2>&1 | tail -20; }
sub "evidencia de execucao no next (recurring-tickets)"
[ -n "$NEXT" ] && docker logs --since "$SINCE" "$NEXT" 2>&1 | grep -iE 'recurring|cron' | tail -15

# ================= MONGODB =================
sec "12. MONGODB: SAUDE"
MRUN(){ docker exec "$MONGO" mongosh manutencao --quiet --eval "$1" 2>&1; }
if [ -n "$MONGO" ]; then
  sub "versao / uptime / conexoes / memoria"
  MRUN 'const s=db.serverStatus(); print("version="+s.version); print("uptime_h="+(s.uptime/3600).toFixed(1)); printjson({connections:s.connections, mem:s.mem, network:{bytesIn:s.network.bytesIn,bytesOut:s.network.bytesOut}});'
  sub "auth habilitada?"
  MRUN 'try{ const u=db.getSiblingDB("admin").system.users.countDocuments({}); print("admin_users="+u);}catch(e){print("err="+e.message)} try{print("authEnabled_param="+JSON.stringify(db.adminCommand({getParameter:1,authenticationMechanisms:1})))}catch(e){print(e.message)}'
  sub "dbStats"
  MRUN 'const d=db.stats(1024*1024); printjson({db:d.db, collections:d.collections, objects:d.objects, dataSize_MB:d.dataSize, storageSize_MB:d.storageSize, indexSize_MB:d.indexSize});'
  sub "contagem e tamanho por collection"
  MRUN 'db.getCollectionNames().sort().forEach(c=>{try{const s=db[c].stats(1024*1024);print((""+s.count).padStart(9)+"  idx="+(""+s.nindexes).padStart(2)+"  data="+(s.size).toFixed(1)+"MB  "+c)}catch(e){print(c+": "+e.message)}});'
  sub "indices das collections principais"
  for col in chamados users chamadohistories notifications slaconfigs recurringtickets; do
    echo "# $col"; MRUN "db.$col.getIndexes().map(i=>i.name+' => '+JSON.stringify(i.key)).forEach(x=>print('  '+x))"
  done
  sub "operacoes longas em andamento (>2s)"
  MRUN 'const o=db.currentOp({"active":true,"secs_running":{$gte:2},"ns":{$not:/^(admin|local|config)\./}}); printjson((o.inprog||[]).map(p=>({op:p.op,ns:p.ns,secs:p.secs_running,plan:p.planSummary})));'
  sub "profiling (queries lentas, se habilitado)"
  MRUN 'const p=db.getProfilingStatus(); print("level="+p.was+" slowms="+p.slowms); if(p.was>0){db.system.profile.find({millis:{$gt:100}}).sort({ts:-1}).limit(10).forEach(d=>print(d.millis+"ms "+d.op+" "+d.ns+" plan="+(d.planSummary||"")))}else{print("profiling desligado (sem dados de slow query)")}'
  sub "chamados: distribuicao por status (saude de dados)"
  MRUN 'printjson(db.chamados.aggregate([{$group:{_id:"$status",n:{$sum:1}}},{$sort:{n:-1}}]).toArray());'
  sub "chamados: SLA vencido em aberto (atrasados ativos)"
  MRUN 'const now=new Date(); print("resolucao_vencida_ativos="+db.chamados.countDocuments({status:{$in:["aberto","validado","em_atendimento"]},resolutionDueAt:{$lt:now}}));'
  sub "integridade: chamados sem campos criticos"
  MRUN 'print("sem_status="+db.chamados.countDocuments({status:{$in:[null,""]}})); print("sem_solicitante="+db.chamados.countDocuments({$or:[{requesterId:{$exists:false}},{requesterId:null}]}));'
else echo "container mongo nao encontrado"; fi

# ================= APP HEALTH / DRIFT =================
sec "13. APP: LATENCIA & HEALTH (interno)"
if have curl; then
  for path in / /login /api/health; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: sigma.ap.trf1.gov.br' --max-time 10 "http://127.0.0.1$path")
    t=$(curl -s -o /dev/null -w '%{time_total}' -H 'Host: sigma.ap.trf1.gov.br' --max-time 10 "http://127.0.0.1$path")
    printf '%-14s http=%s  tempo=%ss\n' "$path" "$code" "$t"
  done
fi

sec "14. DEPLOY DRIFT (git em /opt/severino)"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)  HEAD=$(git rev-parse --short HEAD 2>/dev/null)"
  git fetch -q origin 2>/dev/null
  echo "atras_de_origin/main=$(git rev-list --count HEAD..origin/main 2>/dev/null)  a_frente=$(git rev-list --count origin/main..HEAD 2>/dev/null)"
  sub "arquivos modificados nao versionados (drift de config)"; git status --porcelain 2>/dev/null | head -20
fi

sec "FIM DA AUDITORIA"
echo "ok"
