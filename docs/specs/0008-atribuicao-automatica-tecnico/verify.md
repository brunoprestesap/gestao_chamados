# Verify: Atribuição automática ao técnico · spec 0008 · updated 2026-09-25

_Passos derivados dos critérios de aceitação da spec 0008. `/check verify` roda estes passos; `/test` trava os duráveis._

## UI / manual

- [x] Em `/configuracoes/ia-confianca` (Admin), com a autonomia da IA ligada e um limite de prioridade definido, ligue "Atribuição automática de técnico", salve e recarregue a página → as duas chaves continuam ligadas, e o texto da nova diz que só vale com a autonomia ligada → AC-5
- [x] No chat (`/conversas`), como Solicitante, relate um problema para um serviço que tenha técnico ativo com a especialidade e carga abaixo do limite, com confiança acima do limite, e confirme o cartão → o chamado nasce `validado` e termina em `em atendimento` com o técnico, e a última mensagem do chat diz "o técnico X já foi designado", sem falar em Preposto → AC-1, AC-12
- [x] Entre como esse técnico → o toast ao vivo diz "Chamado #N atribuído a você automaticamente", o sino guarda a mesma frase e o e-mail (se o SMTP estiver ligado) diz que foi atribuído automaticamente pelo Sigma → AC-11
- [x] Entre como Preposto ou Admin → o aviso do chamado novo diz "validado e atribuído a X" (nunca "falta atribuir um técnico"), e o detalhe em `/gestao` mostra "Atribuição automática: Atribuído automaticamente a X" → AC-13, AC-15
- [x] Como Preposto, reatribua esse chamado a outro técnico com uma justificativa → o detalhe continua dizendo "Atribuído automaticamente a X" (o técnico que a regra escolheu), o técnico atual é o novo, e a decisão de técnico aparece como corrigida para Preposto e Admin → AC-9, AC-15
- [x] Desative todos os técnicos com a especialidade (ou coloque todos no limite de carga) e abra outro chamado pelo chat → o chamado fica `validado` sem técnico, o chat diz "Um Preposto vai designar o técnico" sem revelar o motivo, e o solicitante não vê erro nenhum → AC-3, AC-12
- [x] Como Preposto, veja esse chamado sem técnico → o aviso diz "validado, sem técnico disponível" com o motivo em português, a lista mostra o selo "Sem técnico automático" ao lado do de validado pela IA, e o detalhe mostra "Sem técnico automático: <motivo>" → AC-3, AC-13, AC-15
- [x] Atribua esse chamado à mão → o selo "Sem técnico automático" some da lista, o detalhe continua mostrando o motivo, e a atribuição manual funciona e avisa como sempre ("atribuído a você", "Atribuído por: <Preposto>") → AC-15, AC-18
- [x] Tente corrigir a prioridade de um chamado atribuído sozinho → o botão "Corrigir Prioridade" não aparece e, se a action for chamada direto, ela recusa com a mesma mensagem de um chamado atribuído à mão; um chamado sem técnico automático ainda pode ter a prioridade corrigida → AC-19
- [x] Com a chave da atribuição desligada e a autonomia ligada, abra outro chamado confiante pelo chat → nasce `validado` sem técnico, com a frase e o aviso da spec 0007, sem selo de "Sem técnico automático" e sem `atribuicaoAutomatica` no banco → AC-5, AC-6
- [x] Abra um chamado pelo formulário e outro pelo chat sem confiança suficiente (nasce `aberto`), com a atribuição ligada → nenhum dos dois passa pelo passo automático → AC-6
- [x] Como Solicitante e depois como Técnico, abra a lista e a conversa do chamado atribuído sozinho → aparece o nome do técnico, mas nenhum motivo, nenhum "Sem técnico automático" e nenhum critério de carga em lugar nenhum → AC-16
- [x] Na conversa do solicitante, confira que o nome do técnico aparece sem contradição entre a linha do tempo ("Atribuído automaticamente a X"), a frase final do chat e o aviso ao vivo → AC-10, AC-12
- [x] Repita a confirmação do mesmo cartão (clique duplo) → não atribui de novo, não avisa de novo e não grava outra frase → AC-7
- [x] Varie cada origem de valor do passo e confira quem recebe: troque a especialidade de um técnico; dê 5 chamados ativos a outro (o limite padrão); ponha `maxAssignedTickets: 0` num terceiro; faça o próprio solicitante ser um técnico com a especialidade; empate a carga de dois técnicos com datas diferentes de última atribuição → só recebe quem tem a especialidade, está ativo, abaixo do limite, não é o solicitante, e no empate vence quem está há mais tempo sem receber → AC-2

## Commands

- [x] `npm run typecheck` → 0 erros
- [x] `npm run lint` → 0 erros
- [x] `npm run build` → compila sem erro
- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npm test` → todos os testes passam, inclusive os que dependem do Mongo:
  - `lib/chamados/__tests__/atribuicao-automatica.db.test.ts` (o passo, com falhas, conferência de carga e desfazer)
  - `lib/assistente/__tests__/abertura-chat.db.test.ts` (describe "atribuição automática ao técnico pelo chat")
  - `app/(dashboard)/gestao/__tests__/atribuicao-automatica.db.test.ts` (janela de prioridade, reatribuição e corrida com a atribuição manual)
  - `app/api/__tests__/atribuicao-automatica-visibilidade.db.test.ts` (o campo nunca vaza para solicitante nem técnico)
- [x] `docker logs severino-next-app-1 --tail 200 | grep "\[atribuicao\]"` depois de confirmar um chamado com o passo ligado → uma linha por execução, com `chamadoId`, `resultado`, `motivo`, `tecnicoId`, `candidatos` e `duracaoMs`, e sem texto do relato → AC-17
- [x] Rode a consulta de chamados órfãos que está no cabeçalho de `lib/chamados/atribuicao-automatica.ts` (mongosh, coleções `chamados` e `chamadohistories`) → nenhum chamado atribuído pela regra fica sem a entrada `atribuicao_tecnico` de autor `sistema` → AC-4

## Deploy (uma vez, no rollout desta fatia)

- [ ] Depois do deploy, abra `/configuracoes/ia-confianca` e confira que "Atribuição automática de técnico" aparece desligada (a fatia nasce inerte) → AC-5
- [ ] Antes de ligar, confirme com o fiscal do contrato que a atribuição automática conta como início da resposta no IMR (AC-14), e que o Preposto aceita a janela de correção de prioridade fechada para esses chamados (AC-19) → Follow-up da spec (decisão humana, fora do `/develop`)

## Acceptance-criteria coverage

- AC-1 · chamado validado pelo chat termina em `em atendimento` com técnico, sem autor humano · `atribuicao-automatica.db.test.ts` (caminho feliz) + `abertura-chat.db.test.ts` (do relato ao técnico) + `confirmar.test.ts`
- AC-2 · menor carga, empate por quem está há mais tempo sem receber, solicitante fora, limite 0 nunca recebe · `atribuicao-criterio.test.ts` + `atribuicao-automatica.db.test.ts` (bloco "critério de escolha")
- AC-3 · sem candidato vira `sem_tecnico` com o motivo, sem aviso ao solicitante · `atribuicao-automatica.db.test.ts` (bloco "sem técnico elegível") + `abertura-chat.db.test.ts`
- AC-4 · nenhuma falha impede a abertura; erro antes ou depois da gravação, e o estado órfão · `atribuicao-automatica.db.test.ts` (bloco "falhas nunca impedem a abertura") + `confirmar.test.ts` (passo lançando)
- AC-5 · interruptor próprio, independente de `PROMPT_VERSION` · `config.db.test.ts` + `ia-confianca.schemas.test.ts` + `actions.test.ts` + `IaConfiancaForm.test.tsx` + `atribuicao-automatica.db.test.ts` (bloco "interruptor")
- AC-6 · só o chamado que nasce `validado` pelo chat entra no passo · `confirmar.test.ts` + `abertura-chat.db.test.ts` + `atribuicao-automatica.db.test.ts`
- AC-7 · repetir a confirmação nunca atribui de novo; a corrida com um gestor tem um vencedor só · `confirmar.test.ts` + `abertura-chat.db.test.ts` (clique duplo) + `gestao/__tests__/atribuicao-automatica.db.test.ts` (20 rodadas concorrentes)
- AC-8 · conferência de carga depois de gravar, desfazer, próximo candidato, no máximo 3 · `atribuicao-automatica.db.test.ts` (bloco "conferência de carga depois de gravar")
- AC-9 · `DecisaoIa` de técnico por regra, corrigida pela reatribuição, fora da calibragem · `atribuicao-automatica.db.test.ts` + `gestao/__tests__/atribuicao-automatica.db.test.ts`
- AC-10 · histórico `atribuicao_tecnico` de autor `sistema`, sem id, motivo nem carga · `atribuicao-automatica.db.test.ts` + `abertura-chat.db.test.ts` (linha do tempo do solicitante)
- AC-11 · aviso do técnico e do solicitante, com o texto automático no toast e no e-mail · `notificar-atribuicao.test.ts` + `RealtimeProvider.test.tsx` + `templates.test.ts`
- AC-12 · frase final do chat por resultado · `mensagens.test.ts` + `confirmar.test.ts` + `abertura-chat.db.test.ts`
- AC-13 · aviso `ticket:new` da gestão por resultado, no banco, no e-mail e no socket · `novo-chamado.test.ts` + `templates.test.ts` + `RealtimeProvider.test.tsx` + `abertura-chat.db.test.ts`
- AC-14 · `responseStartedAt` no instante da atribuição e breach pelo mesmo cálculo da manual · `atribuicao-automatica.db.test.ts`
- AC-15 · resultado no detalhe e selo na lista, com o técnico escolhido pela regra · `route.test.ts` (gestão) + `ChamadoDetailSheet.test.tsx` + `SeloSemTecnicoAutomatico.test.tsx` + `gestao/__tests__/atribuicao-automatica.db.test.ts`
- AC-16 · o campo e o motivo nunca chegam a solicitante nem técnico · `atribuicao-automatica-visibilidade.db.test.ts` + `ChamadoDetailSheet.test.tsx` (papel) + `abertura-chat.db.test.ts` (linha do tempo)
- AC-17 · uma linha `[atribuicao]` por execução com a chave ligada, e nenhuma com ela desligada · `atribuicao-automatica.db.test.ts`
- AC-18 · atribuição manual e reatribuição intactas · `gestao/__tests__/actions.test.ts` (inalterado) + `notificar-atribuicao.test.ts` + `gestao/__tests__/atribuicao-automatica.db.test.ts`
- AC-19 · chamado atribuído sozinho recusa a correção de prioridade com a mensagem de hoje · `gestao/__tests__/atribuicao-automatica.db.test.ts`
