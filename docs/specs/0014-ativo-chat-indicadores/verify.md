# Verify: Ativo sugerido no chat e indicadores de ativo no IMR · spec 0014 · updated 2026-10-03

_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Antes de começar, recomendo ter no banco: uma categoria de ativo com `serviceSubTypeId` de um subtipo de Ar-Condicionado, um prédio com `unitId` da unidade do solicitante, salas filhas (sem `unitId` próprio) como "Sala 302" e "Sala 303", e ativos Tier A nessas salas (um na 302, dois na 303), mais um ativo `baixado` e um `MNT-` sem local.

## UI / manual

### Ativo no chat

- [x] Como Solicitante, em `/conversas`, escrever "o ar de tombo 11997 pinga" (11997 Tier A) até o cartão aparecer → linha Equipamento com 11997, descrição e caminho, já marcado → AC-1, AC-5
- [x] Escrever "ramal 11997" sem palavra de código e usar "Revisar e abrir" → cartão sem linha Equipamento (a não ser que a regra ache um candidato) → AC-1
- [x] Digitar "código MNT-0012" e forçar o cartão manual (sem serviço reconhecido, "Revisar e abrir") → candidato MNT-0012 aparece, caminho "—" → AC-1, AC-4
- [x] Cartão manual sem código digitado → nenhuma linha Equipamento → AC-4
- [x] Digitar o tombamento de um ativo `baixado` ou Tier C → nenhum candidato, sem erro → AC-1
- [x] Ar-Condicionado na unidade, local "sala 302" → um candidato de regra; local "sala 303" → dois candidatos com "Não sei" já marcado; local sem casar ("perto da janela") → os três → AC-2, AC-5
- [x] Unidade com mais de 5 aparelhos da categoria e local sem desempate → cartão sem linha Equipamento, chamado abre sem ativo → AC-3
- [x] Unidade do perfil vazia, ou relato de outro lugar (`localForaDoPerfil`) → nenhum candidato de regra → AC-4
- [x] Com candidato de regra, trocar a unidade no cartão → a linha some; voltar à unidade original → reaparece com a escolha anterior → AC-6
- [x] Com candidato de código, trocar a unidade → a linha continua → AC-6
- [x] Depois do primeiro cartão (sem ativo), mandar outra mensagem só com "tombo 11997" → cartão novo com o ativo, o antigo vira "Substituído" com a linha desabilitada → AC-5, AC-7
- [x] A frase de texto do cartão (mensagem lida por leitor de tela) não cita o equipamento → AC-5
- [x] Confirmar com o candidato marcado → chamado nasce com `ativoId`; no histórico, "Chamado aberto pela conversa · Equipamento 11997" → AC-8
- [x] Clicar "Não é este" e confirmar → chamado sem ativo, sem decisão `ativo` → AC-5, AC-10
- [x] Mesmo relato com e sem ativo, autonomia ligada → mesmo status (`aberto`/`validado`), mesmo SLA e mesma atribuição → AC-9
- [x] Com o chamado aberto com ativo, abrir a Revisão da IA da gestão → o chamado não aparece por causa do ativo, e o painel "Serviço, prioridade e técnico" não mostra linha de equipamento → AC-11
- [x] Como Preposto, trocar o ativo do chamado e depois remover → o histórico mostra dois `vinculo_ativo`; nenhuma `correcao_ia`; `iaSituacao` igual a antes → AC-12

### Indicadores

- [x] Como Admin, `/relatorios/imr` → aba "Ativos" com o selo "Informativo, sem efeito contratual"; o Resumo Geral e as abas por tipo continuam com os mesmos números de antes → AC-15
- [x] Na aba Ativos, alternar Todos, Manutenção Predial, Ar-Condicionado, Elevador → números e tabela mudam sem recarregar a página → AC-15
- [x] Período com corretivos com ativo → topo com corretivos com equipamento, percentual, equipamentos afetados, MTBF médio, MTTR médio e reincidentes → AC-16
- [x] Tabela com até 10 linhas, código com link para `/ativos/[id]`, ordenada por corretivos, depois tempo total de reparo, depois código; ativo `baixado` presente quando tiver corretivo → AC-18
- [x] Filtro sem corretivo com ativo (ex.: Elevador) → texto de vazio no lugar do topo e da tabela → AC-19
- [x] Ativo com um corretivo só → MTBF "—" na linha; chamado nunca classificado → MTTR "—", nunca zero → AC-19
- [x] Como Técnico e como Preposto, abrir `/ativos/[id]` → linha com corretivos em 12 meses, MTBF, MTTR médio e corretivos em 90 dias → AC-20
- [x] Como Solicitante, abrir a mesma ficha → sem a linha, e o payload da página não traz `indicadores` → AC-20

## Commands

- [x] `npx tsc --noEmit -p .` → sem erro
- [x] `npm run lint` → 0 erros
- [x] `npx vitest run` → tudo verde
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/__tests__/imr-tempo-reparo.db.test.ts` → paridade `tempoDeReparoMs` × `tempoPorTipo`, com pausa e corte em zero → AC-17
- [x] Mandar `confirmarAberturaAction` com `ativoId: "xyz"` → chamado abre sem ativo, sem `dados_invalidos` → AC-8
- [x] Mandar `confirmarAberturaAction` com um `ativoId` válido que não estava nos candidatos → chamado sem ativo e uma linha `[abertura]` com `aviso: ativo_fora_dos_candidatos` e o `conversaId` → AC-8
- [x] Baixar o ativo entre o cartão e a confirmação → chamado abre sem ativo, sem erro → AC-8
- [x] Ler os logs depois de uma abertura com ativo → `[assistente] proposta` e `[abertura]` com `ativoOrigem` e `ativoCandidatos`, nunca o código digitado nem o local → AC-13
- [x] Simular falha ao gravar a `DecisaoIa` `ativo` (ex.: derrubar o Mongo só nesse passo num teste) → chamado com ativo e sem decisão, `console.error` com `chamadoId` → AC-10
- [x] `DecisaoIa` gravada para um chamado com ativo → `campo: 'ativo'`, `decididoPor: 'regra'`, `confianca: null`, `efeito: 'aplicado'`, `valorIa` = `valorFinal` = `{ ativoId, rotulo: codigo }` → AC-10
- [x] Chamado com só a decisão `ativo` → `iaSituacao: 'sem_ia'`; nenhuma entrada `decisao_ia` no histórico, nem depois do reparo da conversa → AC-11

## Value sourcing

- [x] Texto para achar código: escrever o código numa mensagem e a palavra "tombo" em outra → não conta (cada mensagem do relato é lida sozinha); mensagens de autor `ia` com código não contam → AC-1
- [x] Categoria esperada: trocar o `serviceSubTypeId` da categoria para outro subtipo → a regra deixa de achar o ativo → AC-2
- [x] Unidade: cartão com unidade do perfil diferente da do prédio → nenhum candidato de regra → AC-2
- [x] Locais da unidade: desativar a "Sala 302" → o ativo dela some dos candidatos; sala filha sem `unitId` herda a unidade do prédio → AC-2
- [x] Palavras do local: "Sala 302" e "sala 302" e "SALA 302" dão o mesmo resultado; "sala" sozinha não desempata → AC-2
- [x] `codigo`, `descricao`, `caminho`: renomear a sala e recalcular a subárvore → cartão novo mostra o caminho novo → AC-5
- [x] Ativo aceito: `ativoId` de regra com unidade trocada → ignorado no servidor → AC-6, AC-8
- [x] Rótulo da decisão: remover o ativo pela gestão → `valorFinal.rotulo` "Nenhum equipamento" → AC-12
- [x] Período da aba: corretivo aberto às 22h de Belém no último dia do período → cai no dia seguinte, como no resto do IMR (diferença aceita) → AC-14
- [x] Janela de reincidência: período de 1 a 31/01 com corretivos em 20/12 e 05/01 → o ativo conta como reincidente → AC-17
- [x] Janela da ficha: rodar com `agora` às 01:00 UTC de um dia (ainda o dia anterior em Belém) → a janela termina no fim do dia de Belém, não no UTC → AC-20

## Acceptance-criteria coverage

- AC-1: chat (tombo, ramal, MNT, baixado), value sourcing (texto) · AC-2: chat (sala 302/303), value sourcing (categoria, unidade, locais, palavras) · AC-3: chat (mais de 5) · AC-4: chat (manual, sem unidade) · AC-5: chat (linha, Não sei, frase, substituído) · AC-6: chat (troca de unidade), value sourcing · AC-7: chat (código numa mensagem nova) · AC-8: chat (confirmar), commands (xyz, fora dos candidatos, baixado) · AC-9: chat (mesmo status e SLA) · AC-10: commands (decisão gravada, falha simulada) · AC-11: chat (revisão), commands (sem_ia, sem decisao_ia) · AC-12: chat (troca e remoção), value sourcing (rótulo) · AC-13: commands (logs) · AC-14: value sourcing (período) · AC-15: indicadores (aba, seletor) · AC-16: indicadores (topo) · AC-17: commands (paridade), value sourcing (reincidência) · AC-18: indicadores (tabela) · AC-19: indicadores (vazio, "—") · AC-20: indicadores (ficha por perfil), value sourcing (janela de Belém)
