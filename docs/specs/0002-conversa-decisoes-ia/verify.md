# Verify: Conversa e decisões da IA no banco · spec 0002 · updated 2026-09-17

_Passos tirados dos critérios de aceite e da tabela de origem dos valores da spec 0002. O `/check verify` roda estes passos; o `/test` tranca os duráveis._

Esta fundação não tem tela: ela é código de servidor mais banco. A maior parte se
verifica pelos testes contra o Mongo de verdade e por consulta direta ao banco.

Para rodar os testes de banco, suba um MongoDB e aponte a variável:

```bash
docker run -d --name severino-mongo-test -p 27018:27017 mongo:7
MONGO_TEST_URI=mongodb://localhost:27018/severino_test npm test
```

Sem `MONGO_TEST_URI` esses testes são pulados e o resto da suíte roda normal.

## Commands

- [x] `npx tsc --noEmit` → sem erro → base de todos os AC
- [x] `npx eslint .` → 0 erro (avisos antigos seguem) → base de todos os AC
- [x] `npm run build` → build do Next conclui → base de todos os AC
- [x] `MONGO_TEST_URI=... npx vitest run lib/conversas` → 23 testes passam → AC-1 a AC-14, AC-16
- [x] `MONGO_TEST_URI=... npm test` → suíte inteira passa, sem regressão nas actions de gestão e de comentário → AC-10, AC-13
- [x] `npx vitest run lib/llm/__tests__/generate.integration.test.ts` → os dois testes de `meta.callId` passam → AC-15

## Banco (consulta direta)

Os nomes de coleção saem do pluralizador do Mongoose, que não fala português:
`ConversaMensagem` vira `conversamensagems` e `DecisaoIa` vira `decisaoias`, não
`conversamensagens` nem `decisoesia`. `getIndexes()` num nome que não existe dá
erro em vez de lista vazia. Os nomes valem também para backup e script de
operação, e estão trancados em `models/__tests__/ConversaMensagem.test.ts` e
`models/__tests__/DecisaoIa.test.ts`.

- [x] `db.conversas.getIndexes()` → tem `{ expiresAt: 1 }` com `expireAfterSeconds: 0` e `{ chamadoId: 1 }` único parcial → AC-2, AC-16
- [ ] `db.conversamensagems.getIndexes()` → tem `{ expiresAt: 1 }` com `expireAfterSeconds: 0` e `{ conversaId: 1, createdAt: 1, _id: 1 }` → AC-2, AC-16
- [ ] `db.decisaoias.getIndexes()` → tem `{ chamadoId: 1, campo: 1 }` único → AC-6, AC-16
- [x] `db.chamados.getIndexes()` → tem `{ conversaId: 1 }` único parcial → AC-4, AC-16
- [ ] Na VPS, depois de subir o `next-app`: os índices acima existem mesmo (dependem do `autoIndex` do Mongoose ao subir, não de migração) → AC-16

## Origem dos valores (varie a entrada e confira a saída)

Cada passo aqui mexe na fonte de um valor para pegar valor mal originado, que é
o erro que passa despercebido quando o código "parece certo".

- [x] `criarConversa` com a sessão de A: a conversa nasce com `solicitanteId` = A mesmo se o corpo do pedido mandar B → `viewer.userId` vem da sessão verificada
- [x] Conversa recém-criada, antes de qualquer mensagem: `ultimaMensagemEm` é igual ao `createdAt` e `expiresAt` são exatamente 30 dias depois → AC-1, AC-2
- [x] Mude `CONVERSA_RASCUNHO_DIAS` em `lib/conversas/config.ts` para 1 e crie um rascunho: `expiresAt` passa a ser 1 dia à frente (depois desfaça) → a data é derivada da constante, não fixa no código
- [x] Primeira mensagem do solicitante com 200 caracteres: `previa` guarda os 120 primeiros; a segunda mensagem não troca a `previa` → AC-1
- [x] Mensagem de autor `ia` numa conversa cuja `previa` está vazia: a `previa` continua vazia → só a primeira do solicitante alimenta a lista lateral
- [x] Renomeie o serviço no catálogo depois de gravada a decisão: o `valorIa.rotulo` da decisão continua com o nome antigo → o rótulo é lido do banco no momento da gravação e nunca muda
- [x] Decisão com `decididoPor: 'regra'`: `confianca`, `modelo`, `promptVersion`, `task` e `llmCallId` ficam todos `null` → AC-6
- [x] Decisão com `decididoPor: 'ia'` e `meta` de uma chamada real: o `llmCallId` gravado acha o `LlmCall` por `_id` → AC-15
- [x] Abertura sem nenhuma decisão → `iaSituacao` é `sem_ia`; só com `sugestao` → `sugerida`; com alguma `aplicado` → `decidida` → AC-3
- [x] Depois do primeiro veredito da gestão: `iaSituacao` do chamado vira `revisada` → AC-9
- [x] `abrirChamadoDaConversa` duas vezes: o `ticket_number` da segunda é o mesmo da primeira, e existe um chamado só → AC-4
- [x] Force `generateTicketNumber()` a devolver um número já usado na primeira tentativa: a abertura tenta outro e termina com um chamado só → AC-4
- [x] Chamado aberto pela conversa: `canalAbertura` é `chat`; chamado aberto pelo formulário: lê `formulario` → AC-3
- [x] Chamado antigo, gravado antes desta mudança, lido com `.lean()`: trate `canalAbertura` e `iaSituacao` ausentes (o padrão do Mongoose não se aplica em `lean()` nem em `aggregate`)
- [x] Correção da gestão com `classificationNotes` preenchido: o `motivo` da correção traz esse texto; sem notas, fica vazio → AC-9
- [x] Decisão corrigida e depois devolvida ao valor da IA por outro gestor: `situacao` volta a `confirmada` e a lista tem duas correções → AC-9
- [x] Linha do tempo de um chamado com mensagem, comentário e histórico: a ordem é por data e, no empate, por `_id` → AC-12
- [x] Linha do tempo com mais de 300 itens numa fonte: vêm os 300 mais recentes e `truncado` é verdadeiro → AC-12

## Comportamento (com o app rodando)

- [x] Classifique um chamado aberto pelo formulário (sem decisão): a ação devolve sucesso, nada é gravado em `decisoesia` e não sai nenhuma linha `[conversa]` no log → AC-9, AC-10
- [x] Classifique um chamado aberto pela conversa: as decisões de `servico` e `prioridade` ganham `revisadaEm` e `revisadaPorUserId` → AC-9
- [x] Atribua e depois reatribua o técnico de um chamado da conversa: a decisão de `tecnico` fica `corrigida`, com correção de origem `gestao` → AC-9
- [x] Derrube o Mongo e classifique um chamado: a ação ainda devolve sucesso e o erro sai em `[conversa]` sem texto de relato → AC-10
- [x] Na página do chamado, a linha do tempo mostra "IA" e "Sistema" nas entradas `decisao_ia`, sem ficar em "Carregando..." e sem chamar `/api/users/null` → AC-11
- [x] O texto das entradas `decisao_ia` e `correcao_ia` não traz confiança nem motivo, nem para o Preposto → AC-11, AC-12
- [x] Comentário interno aparece para a gestão e para o técnico atribuído, e não aparece para o solicitante → AC-12
- [x] Depois da abertura, mensagem do solicitante pela conversa vira comentário público, com notificação para o técnico atribuído → AC-13
- [x] Outro Solicitante lendo rascunho alheio recebe `sem_permissao`; o Admin lendo rascunho alheio também → AC-14
- [x] Técnico atribuído lê a conversa ligada mas recebe `sem_permissao` em `lerDecisoes`; quem deixou de ser o técnico deixa de ler → AC-14
- [x] Nenhum log do fluxo traz texto de mensagem (LGPD): só id, operação e motivo técnico → AC-10

## Acceptance-criteria coverage

- AC-1 · limites e criação: testes `reparo.db` e `abertura.db`, mais os passos de `previa` e `ultimaMensagemEm`
- AC-2 · expiração e descarte: teste `reparo.db`, mais os índices TTL no banco
- AC-3 · os cinco passos da abertura: teste `abertura.db`, mais `canalAbertura` e `iaSituacao`
- AC-4 · clique duplo e número repetido: teste `reparo.db`, mais o índice único de `conversaId`
- AC-5 · reparo do vínculo e reserva abandonada: teste `reparo.db` (quatro cenários)
- AC-6 · campos da decisão e `ja_existe`: testes `abertura.db` e `decisoes.db`
- AC-7 · conferência de id no banco: teste `decisoes.db`
- AC-8 · correção do solicitante: teste `decisoes.db`
- AC-9 · veredito da gestão: teste `decisoes.db`, mais os passos com o app rodando
- AC-10 · falha do gancho: teste `decisoes.db`, mais o passo com o Mongo derrubado
- AC-11 · histórico da IA sem usuário: testes `abertura.db` e `linha-do-tempo.db`, mais o passo na tela
- AC-12 · leitura combinada e corte: teste `linha-do-tempo.db`
- AC-13 · caminho do comentário: teste `linha-do-tempo.db`
- AC-14 · posse e visibilidade: testes `decisoes.db` e `linha-do-tempo.db`
- AC-15 · `meta.callId`: testes em `lib/llm/__tests__/generate.integration.test.ts`
- AC-16 · testes contra o Mongo em container: os quatro arquivos `*.db.test.ts`, mais os índices na VPS
