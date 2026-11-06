# sicam-gateway: leitura do saldo no Oracle do SICAM

Serviço Express separado (spec 0024) que lê o saldo do almoxarifado no Oracle do SICAM para a checagem antes da cotação de material. O Next nunca fala com o Oracle: chama este serviço por `lib/material/sicam.ts`. Assim o driver `oracledb`, o Instant Client e a senha do banco ficam fora do Next, que segue em Alpine. Spec: `docs/specs/0024-checagem-almoxarifado-cotacao/` (varredura do SICAM em `rationale.md`).

## Arquivos

| Arquivo                    | O que tem                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`             | Sobe o servidor (porta `SICAM_GATEWAY_PORT`, padrão 3002) e fecha o pool no `SIGTERM`                                                    |
| `src/app.ts`               | `criarApp(segredo, consultas)`: as rotas, os limites de entrada e o 401; recebe as consultas por parâmetro, para o teste não usar Oracle |
| `src/oracle.ts`            | O pool, a transação somente leitura por pedido e `paraMaterial` (a linha bruta para o formato da resposta)                               |
| `src/sql.ts`               | O texto das consultas, com bind e só as duas tabelas permitidas                                                                          |
| `oracle-config/sqlnet.ora` | Configuração isolada do Oracle Client (modo Thick), apontada por `SICAM_ORACLE_CONFIG_DIR`                                               |

## Comandos

```bash
cd sicam-gateway && npm ci
npm run dev      # tsx, porta 3002
npm run build    # tsc para dist/
npm test         # node --test com tsx (401, segredo vazio, limites, bind e tabelas permitidas)
docker compose --profile sicam build sicam-gateway   # a imagem, com o Instant Client
```

O CI tem o job próprio `build-sicam-gateway` (build e testes), que depende do `static-checks`.

## Convenções

- Rotas: `GET /healthz` aberta, sem tocar no Oracle; `POST /candidatos`, `GET /materiais?q=&limite=` e `POST /materiais/lote` exigem `x-internal-secret`, comparado em tempo constante. Segredo vazio recusa tudo com 401.
- Entrada pequena e conferida antes de ir ao banco: até 50 itens, 8 palavras de até 40 letras por item, busca de 3 a 100 letras, limite até 25 e `coMat` só com dígitos. Fora disso, 400.
- Toda consulta usa bind, nunca texto montado com a entrada, e só lê `SICAM.MATERIAL` e `SICAM.ALMOXARIFADO_MATERIAL`. Um teste em `sql.test.ts` quebra com tabela nova.
- Cada pedido abre `SET TRANSACTION READ ONLY` e desfaz no fim. O `callTimeout` é de 3 segundos, para o erro do banco chegar antes do corte de 4 segundos do Next (`PRAZO_SICAM_MS`; 6 segundos no lote).
- O serviço não tem regra de negócio: devolve `VL_ATU` bruto em `valorTotal`, e o preço médio e o disponível são conta do Next (`shared/material/checagem.ts`).
- Qualquer falha de consulta vira 503 com `SICAM indisponível`, e o log registra só o código do erro: o texto da busca nunca vai para o log (LGPD). No Next, serviço fora, prazo e variável ausente contam igual, como SICAM fora do ar, e a tela oferece o registro manual.
- Sem `SICAM_ORACLE_INSTANT_CLIENT_DIR`, o driver roda em modo Thin (só serve para conta com senha em formato novo); na imagem, o padrão é o Thick, com o Instant Client 23.8 em `/opt/oracle/instantclient_23_8`.

## Variáveis

`SICAM_GATEWAY_PORT`, `SICAM_GATEWAY_SECRET` (o mesmo do `next-app`), `SICAM_ORACLE_USER`, `SICAM_ORACLE_PASSWORD`, `SICAM_ORACLE_CONNECT_STRING` (`host:porta/servico`), `SICAM_ORACLE_INSTANT_CLIENT_DIR` e `SICAM_ORACLE_CONFIG_DIR`. O Next conhece só `SICAM_GATEWAY_URL` e `SICAM_GATEWAY_SECRET`.

## Gotchas

- No `docker-compose.yml` o serviço fica no perfil `sicam` e não publica porta: só a rede `sigma` alcança. Ligue com `COMPOSE_PROFILES=sicam` no `.env` e recrie o `next-app` junto, para ele ler o segredo. O passo a passo está em `DOCKER_PRODUCAO.md`, seção "Checagem do almoxarifado".
- O `/healthz` responde mesmo sem rota até o Oracle. Se a faixa de uma rede do Docker contiver o IP do Oracle, toda checagem cai no registro manual com `NJS-040` no log; confira a rede como manda o `DOCKER_PRODUCAO.md`.
- O build da imagem baixa o Instant Client de `download.oracle.com`. Sem acesso, baixe o zip antes e copie para o contexto da imagem.
- Em produção desde 05/11/2026 com uma conta pessoal emprestada; a conta de serviço do DBA, com `SELECT` só nas duas tabelas, ainda está pendente (item da funcionalidade 35 no escopo).
- No E2E, o serviço falso `e2e/fixtures/sicam-falso.ts` responde na porta 3902 com o segredo `e2e-sicam`.

_Drafted by /sync from the introducing change, worth a quick human pass._
