# Deploy em Produção com Docker (VPS)

Guia completo para deploy e atualização do **Sigma** em VPS usando Docker Compose.

---

## Arquitetura

| Container         | Tecnologia              | Porta interna | Exposição externa         |
| ----------------- | ----------------------- | ------------- | ------------------------- |
| **next-app**      | Next.js 16 (standalone) | 3000          | Via Nginx                 |
| **socket-server** | Express + Socket.IO     | 3001          | Via Nginx (`/socket.io/`) |
| **mongodb**       | MongoDB 7               | 27017         | 27017 (host)              |
| **nginx**         | Nginx Alpine            | 80            | Porta configurável        |

O Nginx atua como proxy reverso unificado na porta 80, roteando:

- `/` → **next-app:3000**
- `/socket.io/` → **socket-server:3001** (com upgrade WebSocket)

---

## 1. Setup Inicial (primeira vez)

### 1.1 Pré-requisitos na VPS

- Ubuntu Server 22.04+ (ou qualquer distro com Docker)
- Docker Engine + Docker Compose plugin
- Git

O script `deploy.sh` automatiza a instalação do Docker, firewall e clone do repositório:

```bash
chmod +x deploy.sh && sudo ./deploy.sh
```

### 1.2 Clonar o repositório

```bash
cd /opt
git clone <url-do-repositorio> severino
cd severino
```

### 1.3 Configurar variáveis de ambiente

Criar o arquivo `.env` na raiz do projeto:

```env
# Obrigatórias
AUTH_SECRET=<gerar-com-openssl-rand-base64-32>
SOCKET_INTERNAL_SECRET=<gerar-com-openssl-rand-base64-32>

# URLs públicas
NEXT_PUBLIC_SOCKET_URL=http://sigma.ap.trf1.gov.br
SOCKET_CORS_ORIGIN=http://sigma.ap.trf1.gov.br
AUTH_URL=http://sigma.ap.trf1.gov.br

# Opcionais
AUTH_COOKIE_NAME=session
AUTH_COOKIE_SECURE=false          # true se usar HTTPS
APP_PORT=80                       # porta do Nginx no host

# LDAP / Active Directory (opcional — se omitido, apenas autenticação local)
LDAP_URL=ldaps://ad.empresa.com:636
LDAP_BASE_DN=DC=empresa,DC=com
LDAP_BIND_DN=CN=svc-sigma,OU=ServiceAccounts,DC=empresa,DC=com
LDAP_BIND_PASSWORD=senha-da-conta-de-servico
LDAP_USER_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_TLS_REJECT_UNAUTHORIZED=false    # false para certificados de CA interna
LDAP_DEBUG=false                       # true para logs detalhados
```

> **Importante**: `NEXT_PUBLIC_SOCKET_URL` deve ser a URL acessível pelo browser (o Nginx roteia `/socket.io/` para o socket-server internamente).

### 1.4 Subir os containers

```bash
docker compose up -d --build
```

### 1.5 Popular o banco (seed)

```bash
docker exec -i severino-mongodb-1 mongosh manutencao < scripts/seed.js
```

O seed cria: unidades, tipos/subtipos de serviço, catálogo, usuários, configurações de SLA, calendário comercial e feriados.

**Credenciais padrão** (senha `123456` para todos):

| Username        | Role        | Observação      |
| --------------- | ----------- | --------------- |
| `admin`         | Admin       | Setor de TI     |
| `preposto01`    | Preposto    | Diretoria Geral |
| `tecnico01`     | Técnico     | Predial + AC    |
| `tecnico02`     | Técnico     | Predial         |
| `tecnico03`     | Técnico     | Ar-Condicionado |
| `solicitante01` | Solicitante | RH              |
| `solicitante02` | Solicitante | Financeiro      |

> **Atenção**: O seed usa `insertMany` com `ordered: true`. Se rodar novamente em banco já populado, itens duplicados causam erro e itens novos do mesmo batch não são inseridos. Para re-semear, limpe as collections primeiro (veja seção 4).

### 1.6 Verificar

```bash
docker compose ps            # Status dos containers
docker compose logs -f       # Logs em tempo real
```

Acessar: `http://sigma.ap.trf1.gov.br`

---

## 2. Atualizar a Aplicação (deploy de atualizações)

### Automático (CI/CD) — Recomendado

O deploy é automático via GitHub Actions. Basta fazer push na branch `main`:

```bash
git push origin main
```

O fluxo é:

1. **CI** roda no GitHub (lint + build Next.js + build socket-server)
2. **Deploy** roda no self-hosted runner na VPS (`git pull` + `docker compose up -d --build`)

O self-hosted runner está instalado em `/opt/actions-runner` e roda como o usuário `github-runner`.

### Manual (fallback)

Se necessário, conectar via SSH na VPS e rodar:

```bash
cd /opt/severino
git pull origin main
docker compose up -d --build
```

O `--build` reconstrói apenas as imagens que mudaram (next-app e/ou socket-server). O MongoDB e Nginx não são afetados.

### Após atualizar, se necessário

- **Se o seed mudou** (novos tipos, subtipos, etc.): veja seção 4
- **Limpar imagens antigas**: `docker image prune -f`

---

## 3. Comandos Úteis

```bash
# Status
docker compose ps

# Logs
docker compose logs -f                    # Todos os serviços
docker compose logs -f next-app           # Apenas Next.js
docker compose logs -f socket-server      # Apenas Socket.IO

# Reiniciar um serviço específico
docker compose restart next-app

# Parar tudo
docker compose down

# Parar e remover volumes (CUIDADO: apaga dados do MongoDB)
docker compose down -v

# Acessar shell do MongoDB
docker exec -it severino-mongodb-1 mongosh manutencao

# Limpar imagens não utilizadas
docker image prune -f
```

---

## 4. Re-semear o Banco de Dados

Se o seed foi atualizado com novos dados, é necessário limpar as collections antes de re-executar (o `insertMany` não faz upsert):

```bash
# Limpar todas as collections do seed
docker exec -i severino-mongodb-1 mongosh manutencao --eval "
db.units.drop();
db.servicetypes.drop();
db.servicesubtypes.drop();
db.servicecatalogs.drop();
db.users.drop();
db.sla_configs.drop();
db.business_calendar.drop();
db.holidays.drop();
"

# Re-executar o seed
docker exec -i severino-mongodb-1 mongosh manutencao < scripts/seed.js
```

> **Atenção**: Isso apaga todos os usuários e dados de catálogo. Chamados (`chamados`), histórico (`chamadohistories`) e notificações (`notifications`) **não** são afetados. Se houver dados de produção em `users`, faça backup antes.

---

## 5. Arquivos de Configuração

| Arquivo                        | Descrição                                             |
| ------------------------------ | ----------------------------------------------------- |
| `docker-compose.yml`           | Orquestra os 4 serviços (next, socket, mongo, nginx)  |
| `Dockerfile`                   | Build multi-stage do Next.js (standalone)             |
| `socket-server/Dockerfile`     | Build multi-stage do socket-server                    |
| `nginx/default.conf`           | Proxy reverso: `/` → Next, `/socket.io/` → Socket     |
| `.dockerignore`                | Exclui node_modules, .next, .env do contexto de build |
| `socket-server/.dockerignore`  | Exclui node_modules e dist do contexto do socket      |
| `.env`                         | Variáveis de ambiente (não versionado)                |
| `scripts/seed.js`              | Dados iniciais do banco                               |
| `deploy.sh`                    | Script de setup inicial da VPS                        |
| `.github/workflows/ci.yml`     | CI: lint + build em push/PR na main                   |
| `.github/workflows/deploy.yml` | CD: deploy via self-hosted runner                     |

---

## 5.1. Self-Hosted Runner (CI/CD)

O deploy automático usa um GitHub Actions self-hosted runner instalado na VPS (rede interna, sem acesso SSH externo).

- **Localização**: `/opt/actions-runner`
- **Usuário**: `github-runner` (com acesso ao Docker)
- **Serviço**: `actions.runner.brunoprestesap-gestao_chamados.srvmanutencao-ap`

```bash
# Verificar status do runner
sudo systemctl status actions.runner.brunoprestesap-gestao_chamados.srvmanutencao-ap

# Reiniciar
sudo ./svc.sh stop && sudo ./svc.sh start

# Logs
journalctl -u actions.runner.brunoprestesap-gestao_chamados.srvmanutencao-ap -f
```

---

## 6. Variáveis de Ambiente

### App (next-app)

| Variável                 | Descrição                                   | Definida em        |
| ------------------------ | ------------------------------------------- | ------------------ |
| `MONGODB_URI`            | Connection string do MongoDB                | docker-compose.yml |
| `AUTH_SECRET`            | Segredo do NextAuth (JWT)                   | `.env`             |
| `AUTH_COOKIE_NAME`       | Nome do cookie de sessão                    | `.env`             |
| `AUTH_COOKIE_SECURE`     | `true` para HTTPS                           | `.env`             |
| `AUTH_URL`               | URL pública da aplicação                    | `.env`             |
| `SOCKET_INTERNAL_SECRET` | Secret para comunicação Next → Socket       | `.env`             |
| `SOCKET_EMIT_URL`        | URL interna do socket (rede Docker)         | docker-compose.yml |
| `NEXT_PUBLIC_SOCKET_URL` | URL pública do socket (acesso pelo browser) | `.env`             |

### LDAP / Active Directory (opcional)

| Variável                       | Descrição                                             | Definida em |
| ------------------------------ | ----------------------------------------------------- | ----------- |
| `LDAP_URL`                     | URL do servidor LDAP (`ldaps://...` ou `ldap://`)     | `.env`      |
| `LDAP_BASE_DN`                 | Base DN para busca de usuários                        | `.env`      |
| `LDAP_BIND_DN`                 | DN da conta de serviço (para buscar usuários)         | `.env`      |
| `LDAP_BIND_PASSWORD`           | Senha da conta de serviço                             | `.env`      |
| `LDAP_USER_SEARCH_FILTER`      | Filtro LDAP (padrão: `(sAMAccountName={{username}})`) | `.env`      |
| `LDAP_TLS_REJECT_UNAUTHORIZED` | `false` para certificados auto-assinados/CA interna   | `.env`      |
| `LDAP_DEBUG`                   | `true` para logs detalhados de autenticação           | `.env`      |

> Se `LDAP_URL` não estiver definido, apenas autenticação local (senha no banco) será usada. Usuários autenticados via LDAP que não existem no MongoDB são provisionados automaticamente com role `Solicitante`.

### Socket Server

| Variável                 | Descrição                                    | Definida em        |
| ------------------------ | -------------------------------------------- | ------------------ |
| `SOCKET_PORT`            | Porta do servidor (3001)                     | docker-compose.yml |
| `SOCKET_INTERNAL_SECRET` | Deve coincidir com o do next-app             | `.env`             |
| `SOCKET_CORS_ORIGIN`     | Origem permitida para CORS                   | `.env`             |
| `SOCKET_TRUSTED_PROXIES` | IPs/hosts confiáveis (rede Docker)           | docker-compose.yml |
| `APP_URL`                | URL interna do Next.js (validação de sessão) | docker-compose.yml |

---

## 7. Troubleshooting

### Erro de merge conflict ao fazer `git pull`

Se houve alterações locais na VPS:

```bash
git stash --include-untracked
git pull origin main
# Se precisar reaplicar: git stash pop
# Se não precisar: git stash drop
```

Se ficar em estado de conflito:

```bash
git reset HEAD <arquivo>
git checkout -- <arquivo>
```

### Container não sobe / erro de build

```bash
docker compose logs <servico>       # Ver erro específico
docker compose build --no-cache     # Forçar rebuild completo
```

### Socket.IO não conecta no browser

- Verificar se `NEXT_PUBLIC_SOCKET_URL` aponta para o IP/domínio acessível pelo browser
- Verificar se `SOCKET_CORS_ORIGIN` corresponde à URL do app
- No setup com Nginx, ambas devem apontar para o mesmo endereço (ex: `http://172.18.3.48`), pois o Nginx roteia `/socket.io/` internamente

### LDAP: login falha mesmo com credenciais corretas

1. Ativar debug: `LDAP_DEBUG=true` no `.env`, rebuildar e verificar logs:
   ```bash
   docker logs severino-next-app-1 -f --tail 50
   ```
2. **"Unbalanced parens in filter"**: filtro LDAP malformado. Não usar `{{username}}` como default no docker-compose (conflito de sintaxe). Definir `LDAP_USER_SEARCH_FILTER` explicitamente no `.env`.
3. **"invalid_credentials" para conta local**: username coincide com conta no AD. Usuários com `passwordHash` no banco fazem fallback para senha local automaticamente.
4. **Erro de TLS/certificado**: usar `LDAP_TLS_REJECT_UNAUTHORIZED=false` para CA interna.
5. **Endpoint de diagnóstico** (dev): `GET /api/debug-ldap?username=LOGIN` retorna status detalhado do LDAP e MongoDB.

### Seed falha com duplicate key

O banco já contém dados. Limpe as collections antes (seção 4) ou insira apenas os registros novos manualmente.

---

## 8. HTTPS (produção com domínio)

Para habilitar HTTPS, adicione um serviço Certbot ou use Traefik/Caddy. Com Nginx + Certbot:

1. Configurar domínio DNS apontando para o IP da VPS
2. Adicionar volume para certificados no `nginx` do docker-compose
3. Atualizar `nginx/default.conf` com bloco SSL
4. Ajustar variáveis: `AUTH_COOKIE_SECURE=true`, URLs com `https://`

---

## 9. Backup do MongoDB

### 9.1 Backup manual (rápido)

```bash
cd /opt/severino
./scripts/backup-mongodb.sh
```

O script:

- Gera dump comprimido (gzip) em `/opt/severino/backups/`
- Verifica integridade do backup (dry-run restore)
- Remove backups com mais de 30 dias (configurável)
- Previne execução concorrente via lock file
- Gera log com resumo (tamanho, duração, total em disco)

### 9.2 Backup automático (cron)

Configurar execução diária às 02:00:

```bash
# Editar crontab do root
sudo crontab -e

# Adicionar a linha:
0 2 * * * /opt/severino/scripts/backup-mongodb.sh >> /var/log/severino-backup.log 2>&1
```

Para verificar se o cron está ativo:

```bash
sudo crontab -l | grep severino
```

### 9.3 Configuração

O script aceita variáveis de ambiente para personalização:

| Variável          | Padrão                  | Descrição                        |
| ----------------- | ----------------------- | -------------------------------- |
| `MONGO_CONTAINER` | `severino-mongodb-1`    | Nome do container MongoDB        |
| `MONGO_DB`        | `manutencao`            | Nome do banco de dados           |
| `BACKUP_DIR`      | `/opt/severino/backups` | Diretório de destino dos backups |
| `RETENTION_DAYS`  | `30`                    | Dias para manter backups antigos |

Exemplo com configuração customizada:

```bash
BACKUP_DIR=/mnt/nfs/backups RETENTION_DAYS=60 ./scripts/backup-mongodb.sh
```

### 9.4 Restaurar backup

```bash
cd /opt/severino

# Restaurar o backup mais recente
./scripts/restore-mongodb.sh

# Restaurar um backup específico
./scripts/restore-mongodb.sh backups/manutencao_20260408_020000.archive.gz
```

O script de restore:

- Se nenhum arquivo for informado, usa o backup mais recente
- Pede confirmação antes de sobrescrever (digitar `sim`)
- Cria backup de segurança automático antes do restore
- Usa `--drop` para substituir collections existentes
- Exibe contagem de documentos por collection após restauração

### 9.5 Backup externo (offsite)

Para proteção contra falha do servidor, copie os backups para um local externo:

```bash
# Via rsync (outro servidor)
rsync -avz /opt/severino/backups/ usuario@servidor-backup:/backups/severino/

# Via rclone (S3, Google Drive, etc.)
rclone sync /opt/severino/backups/ remote:severino-backups/
```

Exemplo de cron combinado (backup + sync diário):

```bash
0 2 * * * /opt/severino/scripts/backup-mongodb.sh >> /var/log/severino-backup.log 2>&1
30 2 * * * rsync -avz /opt/severino/backups/ usuario@servidor-backup:/backups/severino/ >> /var/log/severino-backup.log 2>&1
```

### 9.6 Monitorar backups

```bash
# Verificar logs do último backup
tail -20 /var/log/severino-backup.log

# Listar backups existentes (mais recente primeiro)
ls -lhtr /opt/severino/backups/

# Espaço em disco usado por backups
du -sh /opt/severino/backups/
```
