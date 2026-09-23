# Habilitar autenticação no MongoDB de produção (defesa em profundidade — C1)

> **Pré-requisito:** o fix principal de C1 (remover `ports: 27017:27017` do
> `docker-compose.yml`) já fecha a exposição externa, pois o Mongo passa a
> ser alcançável só pela rede interna do Docker. A autenticação abaixo é uma
> **camada extra** (caso outro container/processo no host seja comprometido).

Como o volume `mongodb_data` **já está populado**, as variáveis
`MONGO_INITDB_ROOT_*` **não** criam o usuário (só funcionam em volume vazio).
Faça manualmente:

## 1. Criar o usuário admin (com auth ainda desligada)

```bash
cd /opt/severino
# senha forte
MONGO_PW="$(openssl rand -base64 24)"
docker exec -i severino-mongodb-1 mongosh admin --quiet --eval "
  db.createUser({
    user: 'sigma_app',
    pwd: '${MONGO_PW}',
    roles: [{ role: 'readWrite', db: 'manutencao' }]
  })
"
echo "Senha gerada (guarde): ${MONGO_PW}"
```

## 2. Gravar credenciais no `.env`

```bash
# URI usada pelo next-app passa a incluir credenciais + authSource=admin
echo "MONGODB_URI=mongodb://sigma_app:${MONGO_PW}@mongodb:27017/manutencao?authSource=admin" >> /opt/severino/.env
chmod 600 /opt/severino/.env
# o CD roda como github-runner e precisa ler o .env — manter o dono correto
chown github-runner:github-runner /opt/severino/.env*
```

## 2.1. Validar a URI nova com auth ainda desligada

```bash
cd /opt/severino
docker compose up -d next-app   # só recria o next-app, mongodb continua sem --auth
docker logs severino-next-app-1 --tail 30   # sem erro de conexão/auth
```

Confirme a aplicação funcionando (login, listagem de chamados) antes do próximo
passo — se algo der errado aqui, é só reverter a linha `MONGODB_URI` do `.env`
e rodar `docker compose up -d next-app` de novo, sem qualquer impacto no Mongo.

## 3. Ligar `--auth` no container

No `docker-compose.yml`, serviço `mongodb`, descomentar:

```yaml
command: ['--auth']
```

## 4. Aplicar e validar

```bash
cd /opt/severino
docker compose up -d            # recria mongodb + next-app
# valida que SEM credencial agora é negado:
docker exec -i severino-mongodb-1 mongosh manutencao --quiet --eval 'db.chamados.countDocuments()' || echo 'OK: negado sem auth'
# valida que a app continua conectando (logs sem erro de auth):
docker logs severino-next-app-1 --tail 30
```

## Rollback

Se a app não conectar: comentar `command: ['--auth']`, remover a linha
`MONGODB_URI` adicionada no `.env`, `docker compose up -d`.
