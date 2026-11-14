# 0025. Órgão e isolamento dos dados: por que

Registro da decisão. O build lê o [index.md](index.md); este arquivo guarda o contexto, as opções e o raciocínio.

## Context

O Sigma passa a atender vários órgãos do Judiciário numa só instalação (escopo `docs/scope/orgaos.md`, funcionalidades 38 a 49). Os dados guardam pessoa (nome, matrícula, e-mail), responsável patrimonial e custo, então mostrar a um órgão dado de outro é incidente de LGPD. Por isso a fatia leva o nível GA.

O código de hoje foi escrito para um órgão só: 58 modelos Mongoose, cerca de 1000 chamadas de consulta e gravação em 152 arquivos de `app/` e `lib/`, 5 `aggregate`, 3 `$lookup`, 35 índices únicos (alguns de valor de negócio, como número de chamado e matrícula) e um `Contador` com `_id` fixo por chave. A leitura acontece em Server Components, Server Actions, rotas de API, PDFs e 5 rotas de cron; o login roda antes de existir sessão.

Restrições que moldam a escolha:

- O órgão 1 (os dados de hoje) precisa seguir funcionando a cada fatia entregue, e nenhum órgão novo entra antes de 38 a 48 prontas.
- Os modelos são importados como singletons ligados à conexão padrão do Mongoose.
- Num Server Component não existe um ponto de entrada onde se possa abrir um contexto síncrono que valha para os filhos; o Next 16 só oferece `cookies()`/`headers()` de forma assíncrona.
- O MongoDB não tem segurança por linha: qualquer isolamento por campo é de aplicação.
- O time é pequeno e opera uma VPS com Docker Compose; infraestrutura nova custa caro.

Sem decidir isso primeiro, cada spec seguinte (login, cron, contratos, IMR) inventaria a sua forma de saber o órgão.

## Options considered

### Option 1: campo `orgaoId` com plugin do Mongoose e órgão pela sessão

Coleções compartilhadas; todo documento leva `orgaoId`; um plugin em cada schema filtra leituras e carimba gravações em ganchos `pre` assíncronos, resolvendo o órgão do JWT (ou de um `comOrgao` explícito fora da requisição).

**Pros**:

- Nenhuma das cerca de 1000 chamadas muda; consulta nova herda o filtro.
- Os ganchos são assíncronos no Mongoose 9, então dá para resolver a sessão dentro deles, inclusive em Server Components.
- Operação igual à de hoje: um banco, um backup, uma conexão.

**Cons**:

- Isolamento de aplicação: o que não passa pelo Mongoose não é protegido.
- Índices únicos de valor de negócio viram compostos, e os dados de hoje precisam receber o campo (spec 39).
- `$lookup`/`$unionWith` precisam de regra própria; o plugin só filtra a coleção de origem.

### Option 2: um banco por órgão

Cada órgão no seu database (`connection.useDb`), o banco de hoje vira o do órgão 1.

**Pros**:

- O isolamento mais forte: `$lookup`, índices, `distinct`, acesso direto à coleção, tudo fica preso ao banco do órgão.
- O órgão 1 não precisa de migração de dados nem de troca de índice; backup e remoção por órgão ficam naturais.

**Cons**:

- O modelo do Mongoose fica preso à conexão: cada uma das 1000 chamadas teria de pedir o modelo do órgão, ou os modelos viram um Proxy que precisa saber o órgão de forma síncrona na hora de montar a consulta, o que um Server Component não consegue.
- Trocar a coleção da consulta dentro de um gancho depende de detalhes internos do Mongoose que mudam entre versões.
- Índices criados por banco, a cada órgão novo; cron e relatórios iteram conexões.

### Option 3: prefixo de coleção por órgão

`chamados_sjap`, `chamados_trf1`, um conjunto de coleções por órgão no mesmo banco.

**Pros**:

- Isolamento físico sem vários bancos.

**Cons**:

- Tem o mesmo problema da opção 2 (modelo por órgão, resolução síncrona) sem o ganho de backup por órgão, e multiplica coleções.

### Option 4: `orgaoId` explícito em cada chamada

O campo da opção 1, mas sem plugin: cada função recebe o órgão e o põe no filtro.

**Pros**:

- O filtro aparece no código, sem mágica.

**Cons**:

- Cerca de 1000 pontos para mudar, e um esquecido vaza em silêncio; a varredura teria de provar a ausência de um filtro, o que é difícil de checar estaticamente.

## Rationale

O risco mais caro é o vazamento, e o vazamento mais provável é o esquecimento. A opção 1 troca "lembrar do filtro em 1000 lugares" por "lembrar do plugin em 58 modelos", e isso a varredura dos modelos confere de forma barata e completa. A opção 2 isolaria mais forte, mas esbarra numa restrição concreta: os modelos são singletons e um Server Component não tem como saber o órgão de forma síncrona, que é o que um modelo por conexão exigiria. Os ganchos assíncronos do Mongoose 9 resolvem exatamente esse ponto para a opção 1.

A falha fechada fecha a fraqueza conhecida do filtro implícito: sem contexto, a consulta não roda. O modo observação existe porque o órgão 1 precisa seguir funcionando a cada fatia, e filtrar antes de a spec 39 preencher o campo esconderia todos os dados; com o padrão `estrito` quando a variável falta, os testes exercitam o filtro de verdade desde o primeiro dia e esquecer a configuração nunca abre os dados.

Decisões menores tomadas ao escrever:

- **Plugin explícito por schema**, e não `mongoose.plugin` global: o global só vale para schemas compilados depois do registro, e a ordem de importação no Next não é garantida. A varredura confere cada modelo. Alternativa: o global, mais curto, mas frágil.
- **`Contador` do órgão 1 com os `_id` de hoje** e `<orgaoId>:<chave>` para os outros: mantém a numeração do órgão 1 sem migração e sem risco de reiniciar a sequência no meio das fatias. Alternativa: `{ orgaoId, chave }` com `_id` novo, mais limpo, mas exige migrar os contadores junto com a 39.
- **Índices alvo criados já na 38, antigos removidos na 39**: o índice novo nasce ao lado do antigo (que é mais restritivo), então nunca há janela de duplicado. Alternativa: tudo na 39, mas aí a 38 não cumpriria a unicidade por órgão do seu próprio "done when".
- **`$lookup` simples liberado, com `pipeline` só com `$match` de `orgaoId`**: o simples junta por id de documento que já veio filtrado. Alternativa: proibir todo `$lookup`, seguro mas reescreveria código que já é seguro.
- **`authorize` em `comOrgao(ORGAO_1_ID)` até a spec 41**: até o segundo órgão existir só há um, e a descoberta no login é decisão da 41. Alternativa: descobrir o órgão já aqui, antecipando a 41.
- **Erro e aviso sem dado pessoal**: só modelo, operação e órgão, porque o log da VPS não é lugar de dado pessoal.
