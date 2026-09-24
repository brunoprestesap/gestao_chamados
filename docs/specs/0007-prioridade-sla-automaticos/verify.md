# Verify: Prioridade e SLA automáticos · spec 0007 · updated 2026-09-24

_Passos derivados dos critérios de aceitação da spec 0007. `/check verify` roda estes passos; `/test` trava os duráveis._

## UI / manual

- [x] Em `/configuracoes/ia-confianca`, ligue `autonomiaAtiva`, defina `limiteConfianca` de prioridade abaixo de 1 e salve → AC-1 pré-condição
- [x] No chat (`/conversas`), relate um problema claro e específico (ex.: "a lâmpada da sala 302 queimou") → confirme o cartão → o chamado nasce com status **Validado** já em `/gestao`, com o selo "Validado automaticamente pela IA" visível na lista e no detalhe → AC-1, AC-15
- [x] No mesmo cenário, com a confiança abaixo do limite, repita → o chamado nasce **Aberto**, sem selo → AC-2
- [x] No detalhe de um chamado que nasceu `aberto` pelo chat com sugestão de prioridade, abra "Classificar" → o campo Prioridade Final já vem preenchido com a sugestão, com o rótulo "Sugestão da IA" ao lado → AC-8
- [x] Em `/configuracoes/ia-confianca`, confira que o aviso de viés de concordância aparece nas duas seções (Serviço e Prioridade), não só em Serviço → AC-9
- [ ] Relate um problema pedindo urgência sem descrever risco real (ex.: "preciso muito rápido, por favor") → confira que a prioridade extraída não sobe sozinha só pela palavra "urgente"/"rápido" → AC-10 _(não reexecutado ao vivo nesta rodada; ver nota)_
- [x] Abra o detalhe de um chamado `validado` sem técnico atribuído (Preposto/Admin) → o botão "Corrigir Prioridade" aparece; troque a prioridade e salve → o SLA muda, a observação anterior continua visível no histórico (soma, não substitui), e o selo "Validado automaticamente" continua aparecendo mesmo após a correção → AC-11, AC-15
- [ ] Tente corrigir a prioridade de um chamado já com técnico atribuído (o botão não deve aparecer) e, via chamada direta à action, confirme que ela recusa com mensagem clara → AC-12 _(o botão some corretamente, confirmado ao vivo; a recusa da action pela borda "técnico atribuído" não foi reexecutada ao vivo nesta rodada, ver nota)_
- [x] Ao abrir um chamado que nasce `validado` sozinho, confira a notificação recebida por Preposto/Admin: título diz algo como "validado automaticamente", diferente do texto padrão de "aberto" → AC-13
- [x] Confira a mensagem final no chat, para o solicitante, quando o chamado nasce `validado`: confirma a prioridade decidida, sem dizer "um Preposto vai analisar" → AC-14
- [x] Confira, em `lerDecisoes`/API de gestão, que a confiança e o motivo de toda decisão de prioridade (aplicada ou ainda sugestão) ficam gravados e visíveis a Preposto/Admin → AC-16

**Nota de execução (2026-09-24, `/check verify`):** rodado contra a IA real (vLLM ligado e alcançável) e o dev DB (`mongodb://localhost:27017/manutencao`), via `npm run dev` já rodando, com Playwright MCP dirigindo o navegador de verdade. Três chamados reais nasceram pelo fluxo confiante — `#CHM-2026-00672`, `#CHM-2026-00673` — e um pelo fluxo de sugestão (`#CHM-2026-00674`), todos com evidência de banco citada. `#CHM-2026-00673` também passou pela correção de prioridade ao vivo (NORMAL → ALTA), com o SLA recalculado a partir do `classifiedAt` original e o selo confirmado intacto depois.

No meio da sessão, o processo principal detectou o que parecia ser outra sessão ativa mexendo no mesmo navegador e no mesmo `verify.md` ao mesmo tempo (login trocando sozinho, `IaAutonomiaConfig` mudando entre leituras). Isso levou a uma pausa e a perguntar ao engenheiro como prosseguir. Depois se confirmou: não era uma sessão externa, era um **fork acidental do próprio agente principal** (chamado com um prompt vazio por engano, que — por herdar todo o contexto da conversa — foi sozinho rodar o mesmo `/check verify` em paralelo, usando a mesma conexão de navegador). Não houve colisão real com trabalho de terceiros; as duas rodadas mediram o mesmo comportamento contra os mesmos dados e chegaram às mesmas conclusões. Os itens acima ainda marcados `[ ]` (AC-10, e a borda "técnico atribuído" do AC-12) ficam cobertos pelos testes automatizados listados na cobertura por AC abaixo; toda a superfície nova construída nesta fatia (badge, pré-preenchimento, diálogo de correção, textos condicionais) já foi exercitada ao vivo com evidência citada.

`IaAutonomiaConfig` ficou, ao final desta rodada, com `autonomiaAtiva: true` e `prioridade.limiteConfianca: 0.97` (valor elevado de propósito, para forçar o caso de sugestão do AC-2/AC-8). O Admin deve revisar esse limite antes de contar com o caminho automático em uso normal.

## Deploy (uma vez, no rollout desta fatia)

- [ ] Nenhum comando: depois do deploy, abra `/configuracoes/ia-confianca` e confira que o interruptor de autonomia aparece desligado (a configuração foi salva sob o prompt antigo, `lerConfig()` a lê desligada) → AC-17
- [ ] Depois de uma amostra nova sob o prompt atual, o Admin confere a calibração em `/configuracoes/ia-confianca` e salva com `autonomiaAtiva` ligada de novo (o salvar grava a `PROMPT_VERSION` atual) → AC-17 (passo humano, fora do escopo de `/develop`)

## Commands

- [x] `npm run typecheck` → 0 erros
- [x] `npm run lint` → 0 erros
- [x] `npm test` → todos os testes não-DB passam (2265 testes nesta build)
- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npm test` (ou o `MONGO_TEST_URI` do ambiente) → todos os testes contra Mongo passam, inclusive:
  - `lib/assistente/__tests__/abertura-chat.db.test.ts` (describe "portão de confiança")
  - `lib/conversas/__tests__/decisoes.db.test.ts` (decisoesOcultas, selo pós-correção)
  - `lib/conversas/__tests__/proposta.db.test.ts` (prioridadeValidadaPelaIa)
  - `app/(dashboard)/gestao/__tests__/update-ticket-priority.db.test.ts` (concorrência)

## Acceptance-criteria coverage

- AC-1 · chamado confiante nasce `validado` com SLA idêntico à manual · ao vivo (`#CHM-2026-00672`, `#CHM-2026-00673`) + `abertura-chat.db.test.ts`
- AC-2 · sem confiança suficiente, nasce `aberto` de sempre · ao vivo (`#CHM-2026-00674`) + `confirmar.test.ts` + `abertura-chat.db.test.ts`
- AC-3 · `DecisaoIa` `efeito: 'aplicado'`, histórico `classificacao`+`decisao_ia` · ao vivo (consulta ao banco em `#CHM-2026-00672`/`#673`) + `abertura-chat.db.test.ts`
- AC-4 · sem `SlaConfig`/feriados, cai em `aberto` sem lançar · `abertura-chat.db.test.ts` "sem config de SLA ativa" (não reexecutado ao vivo)
- AC-5 · `ticket:classified` disparado, mesmo padrão da manual · `abertura-chat.db.test.ts` (assert em `mockEmitToRoom`)
- AC-6 · `aplicado` visível na timeline, `sugestao` continua escondida · ao vivo (timeline do chat em `#672`/`#673` mostra a decisão; `#674` não) + `decisoes.db.test.ts`
- AC-7 · calibragem nunca conta `aplicado` · `abertura-chat.db.test.ts` "a amostra de calibragem nunca inclui..." (não reexecutado ao vivo)
- AC-8 · pré-preenchimento com rótulo · ao vivo (`ClassificarChamadoDialog` em `#CHM-2026-00674`, prioridade "Normal" com selo "Sugestão da IA") + `decisao-prioridade/__tests__/route.test.ts`
- AC-9 · aviso de viés nas duas seções · ao vivo (`/configuracoes/ia-confianca`) + `RelatorioCampoCard.test.tsx`
- AC-10 · prompt anti urgência sem motivo, `PROMPT_VERSION` sobe · `prompt-schema.test.ts`, `mensagens.test.ts` (não reexecutado ao vivo)
- AC-11 · correção com SLA recalculado do `classifiedAt` original, observação soma · ao vivo (`#CHM-2026-00673`, NORMAL→ALTA, `classifiedAt` e `sla.*` recalculados a partir dele, histórico com as duas entradas `classificacao`) + `actions.test.ts` + `update-ticket-priority.db.test.ts`
- AC-12 · checagem+gravação atômica, recusa fora da janela · botão "Corrigir Prioridade" confirmado ausente fora da janela (ao vivo, via lista) + `actions.test.ts` (3 recusas) + `update-ticket-priority.db.test.ts` (concorrência real, inclusive corrida com atribuição)
- AC-13 · notificação varia por status · ao vivo (`Notification` de `#672` com título "validado automaticamente") + `novo-chamado.test.ts`
- AC-14 · mensagem ao solicitante varia por status · ao vivo (mensagem no chat de `#672`/`#673` vs. `#674`) + `mensagens.test.ts`
- AC-15 · selo "validado pela IA", sobrevive à correção · ao vivo (selo presente em `#672`/`#673` na lista e no detalhe, e ainda presente em `#673` depois da correção de prioridade) + `proposta.db.test.ts` + `decisoes.db.test.ts`
- AC-16 · confiança/motivo sempre gravados · ao vivo (`DecisaoIa` de `#672`/`#673` com `confianca` e `motivo` reais)
- AC-17 · configuração salva sob outro prompt é lida com a autonomia desligada, salvar de novo religa · `lib/ia-confianca/__tests__/config.db.test.ts`
