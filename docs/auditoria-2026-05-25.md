# Auditoria de Produção — Sigma — 2026-05-25

Host `srvmanutencao-ap` (172.18.3.48) · Ubuntu 24.04.4 · 5 containers Docker em `/opt/severino`.
Coleta via `prod-audit.sh` (read-only). Runtime **estável** (0 restarts, 0 OOM, latência <10ms);
risco concentrado em **exposição/segurança de infra**.

## Achados e status de remediação

| # | Sev | Achado | Correção | Patch |
|---|-----|--------|----------|-------|
| C1 | 🔴 | MongoDB exposto na rede interna (`0.0.0.0:27017`, Docker ignora UFW) e **sem auth** (`admin_users=0`) | Remover `ports` do mongo + (opcional) habilitar `--auth` | `docker-compose.yml` ✅ · `scripts/mongo-enable-auth.md` |
| C2 | 🔴 | App em HTTP puro, sem TLS; `AUTH_COOKIE_SECURE=false` → cookie/senha em texto claro | Terminar TLS no nginx, redirect 80→443, cookie secure + HSTS | `nginx/default.tls.conf` |
| A1 | 🟠 | `.env` e `.env.bak` world-readable (644) → segredos legíveis por usuários locais | `chmod 600` | `scripts/prod-hardening.sh` ✅ |
| M1 | 🟡 | `LDAP_DEBUG=true` em prod → logs vazam DNs/usernames/fluxo de auth | `LDAP_DEBUG=false` + `up -d` | `scripts/prod-hardening.sh` ✅ |
| M2 | 🟡 | Disco `/` em 83% (4.5G livres) | `docker image prune`, monitorar | — |
| M3 | 🟡 | `POST /api/upload` deu 500 (1×) + coleção `attachments` vazia | Investigar feature de anexos | — |
| M4 | 🟡 | Drift de patch nas imagens base (nginx/mongo ~2 meses) | `docker compose pull` + rebuild | — |
| B1 | 🔵 | Headers de segurança ausentes + disclosure de versão | Incluído no `default.tls.conf` (`server_tokens off`, X-Frame, etc.) | `nginx/default.tls.conf` |
| B2 | 🔵 | Cron recorrente sem evidência de execução (mas `recurringtickets=0`) | Validar com agendamento de teste | — |
| B3 | 🔵 | `/api/health` → 404 (sem endpoint de health) | Criar endpoint opcional | — |
| B4 | 🔵 | Conta local `admin` (bcrypt) mapeia p/ AD `Admin Zabbix` (colisão de username) | Revisar necessidade/força | — |
| B5 | 🔵 | Drift de deploy não medível (git recusa como root, "dubious ownership") | `git config --global --add safe.directory /opt/severino` | — |

## Saudável (confirmado)
- 0 restarts / 0 OOM em todos os containers; sem unidades systemd falhas; journal limpo (72h).
- RAM 1.5/7.8GB; CPU ociosa; HTTP 2262×200 / 1×500; `/login` ~3-6ms.
- `resolucao_vencida_ativos=0`; índices do `chamados` bem desenhados; `fail2ban` ativo.
- LDAP via `ldaps://` (TLS).

## Falsos positivos do script de coleta (NÃO são problemas)
- `sem_solicitante=92`: o check usou `requesterId`; o campo real é `solicitanteId`. Sem órfãos.
- `slaconfigs: ns does not exist`: a coleção é `sla_configs` (4 docs).

## Ordem sugerida
1. `prod-hardening.sh` (A1+M1) + remover porta do Mongo (C1) — baixo esforço.
2. TLS (C2) — `nginx/default.tls.conf`.
3. M2/M3/M4.
