# Verify: Candidatos à substituição · spec 0015 · updated 2026-10-06 (verificado em 06/10/2026 e 07/10/2026)

_Passos tirados dos critérios de aceite da spec 0015. O `/check verify` roda estes passos; o `/test` fixa os que valem para sempre._

Preparação sugerida: uma categoria com vida útil 10 e subtipo de Ar-Condicionado; um ativo Tier A dessa categoria com data de tombo de 14 anos atrás e 5 corretivos nos últimos 12 meses (3 deles nos últimos 90 dias); um ativo Tier A de outra categoria, sem subtipo, só velho; um ativo Tier C velho; um ativo `aguardando_baixa` velho.

## UI / manual

- [x] Entre como Admin, abra `/relatorios/imr`, aba Ativos → a seção "Candidatos à substituição" aparece depois do ranking, com o ativo de 14 anos e os motivos "14 anos, vida útil 10", "5 corretivos em 12 meses, limite 4" e "3 em 90 dias, limite 3" → AC-2, AC-3, AC-4, AC-5, AC-8
- [x] Na mesma seção, o ativo com mais critérios vem primeiro; no empate, o de mais corretivos; depois o código em ordem numérica → AC-5
- [x] Clique em "Ar-Condicionado" no seletor → só os candidatos daquela categoria; a categoria sem subtipo some e volta em "Todos" → AC-8
- [x] Troque o período do IMR para um mês antigo → a lista de candidatos não muda → AC-7
- [x] O ativo Tier C e o `aguardando_baixa` nunca aparecem no IMR, no filtro da lista nem com selo na ficha → AC-1
- [x] Abra a ficha do candidato como Preposto → selo âmbar "Candidato à substituição" com os mesmos motivos; o número de corretivos do selo é igual ao "Corretivos em 12 meses" da linha de indicadores → AC-10
- [x] Ficha de ativo cuja categoria não tem vida útil → a nota "Idade não avaliada: a categoria não tem vida útil" aparece, mesmo sem selo → AC-2, AC-10
- [x] Ficha de ativo sem data de instalação nem de tombo → a nota "Idade não avaliada: o ativo não tem data de instalação nem de tombo" → AC-2
- [x] Abra a mesma ficha como Técnico e como Solicitante → nenhuma seção de substituição; no DevTools, a resposta da página não tem `substituicao` → AC-10
- [x] Em `/configuracoes/categorias-ativo`, edite a categoria: os campos de limite mostram "padrão: 4" e "padrão: 3" vazios; grave 2 em corretivos → um ativo com 2 corretivos passa a aparecer na próxima leitura → AC-6
- [x] Limpe o limite e salve → a lista da categoria volta a mostrar "padrão" (no banco, `null`, nunca 0) → AC-6
- [x] Digite 0, 100 ou 2,5 no limite → "Limite de corretivos inválido." (ou "Limite de reincidência inválido.") → AC-6
- [x] Na ficha, clique em Dispensar, escreva um motivo de menos de 10 caracteres → o botão fica desligado; com um motivo válido, confirme → selo neutro "Substituição dispensada até dd/mm/aaaa" (hoje mais 6 meses), com motivo, nome e data → AC-11
- [x] Depois de dispensar, a linha do tempo do cadastro mostra "Substituição dispensada" com "Até dd/mm/aaaa · critérios: ...", sem o texto do motivo; o Técnico vê a mesma entrada, também sem o motivo → AC-11
- [x] O ativo dispensado sai da seção do IMR e conta em "1 dispensado"; o link leva a `/ativos?substituicao=dispensados` com ele na lista → AC-8, AC-9
- [x] Dispensado só por idade, abra mais corretivos até passar do limite → no mesmo dia ele volta para candidatos, com "Dispensado antes até dd/mm/aaaa" na ficha → AC-12
- [x] Dispense pela linha do IMR com um Admin → o mesmo diálogo, a tela recarrega e a linha sai → AC-11
- [x] Abra a mesma ficha em duas abas, dispense na primeira e depois tente na segunda → a segunda recebe "Este ativo já foi dispensado por <nome>." e recarrega → AC-13, AC-14
- [x] Clique em "Voltar a sinalizar" e confirme → o ativo volta a candidato, e a linha do tempo mostra "Dispensa de substituição desfeita" com "Dispensa até dd/mm/aaaa desfeita" → AC-15
- [x] Depois de dispensar e de voltar a sinalizar, o status, a categoria, a criticidade e o tier do ativo continuam iguais, nenhum chamado mudou e o sino não ganhou aviso → AC-16
- [x] Em `/ativos`, como Preposto, o filtro "Substituição" aparece; "Candidatos à substituição" combinado com o filtro de local e com a paginação mostra só os candidatos daquele prédio → AC-9
- [x] Como Técnico, abra `/ativos?substituicao=candidatos` → a lista aparece inteira, sem filtro, e o campo "Substituição" não aparece → AC-9, AC-17

## Commands

- [x] `npx vitest run lib/ativos/__tests__/substituicao.test.ts shared/ativos/__tests__/substituicao.schemas.test.ts "app/(dashboard)/ativos/__tests__/actions.test.ts" "app/(dashboard)/relatorios/imr/_components/__tests__/imr-ativos.test.tsx"` → tudo verde → AC-1 a AC-8, AC-11, AC-15, AC-17
- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/ativos/__tests__/substituicao.db.test.ts` → 9 testes verdes (paridade com a ficha, corrida, recusa, sobrescrita, histórico que falha) → AC-3, AC-4, AC-7, AC-10, AC-12 a AC-16

## Origem de cada valor (um passo por linha da tabela Value sourcing)

- [x] hoje: perto da meia noite de Belém (por exemplo 22:00 de Belém, já 01:00 UTC do dia seguinte), um ativo cuja vida útil vence amanhã ainda não aparece → a conta usa `hojeEmBelem`, não o dia UTC
- [x] fim da janela: um corretivo aberto hoje às 23:00 de Belém conta nos 12 meses e nos 90 dias → `fimDoDiaEmBelem`
- [x] data de referência: ativo com instalação de 2 anos e tombo de 20 anos, vida útil 10 → não é candidato por idade (a instalação vence o tombo); apague a instalação → passa a ser
- [x] data gravada às 21:00 de Belém (meia noite UTC do dia seguinte) conta como o dia de Belém
- [x] vida útil: mude a vida útil da categoria de 10 para 20 → o ativo de 14 anos sai na próxima leitura
- [x] data em que a vida útil vence: tombo em 29/02/2016, vida útil 10 → candidato a partir de 28/02/2026, com "10 anos"
- [x] idade em anos completos: tombo há 14 anos e 1 dia → "14 anos"; vida útil 1 e 1 ano exato → "1 ano, vida útil 1"
- [x] corretivos da ficha e do lote: para o mesmo ativo, o número da seção do IMR, o do selo e o "Corretivos em 12 meses" da ficha são iguais; um corretivo de 366 dias atrás, um cancelado e uma preventiva não contam em nenhum dos três
- [x] categoria (nome) e caminho do local: a linha do IMR mostra o nome da categoria e o caminho do local; ativo sem local mostra "Sem local"
- [x] rótulos e plural: "1 corretivo em 12 meses", "5 corretivos em 12 meses", "1 ano", "14 anos"
- [x] código numérico: dois candidatos empatados, 9003 vem antes de 10698
- [x] limites: categoria com limite 2 sinaliza com 2 corretivos; outra, vazia, só com 4
- [x] dispensa vigente: no dia de `ate` o ativo já volta para candidatos; na véspera, ainda dispensado
- [x] tipo de serviço da linha: categoria ligada a um subtipo de "Ar Condicionado" aparece em "Ar-Condicionado"; sem subtipo, só em "Todos"
- [x] nome de quem dispensou: o selo e a mensagem "já foi dispensado por <nome>" usam o nome do usuário, não o login
- [x] `ate`: dispensar em 30/08 grava `ate` 28/02 (ou 29/02 em ano bissexto), meia noite UTC
- [x] observação do histórico: tem a data e os critérios, e "· substitui a dispensa até dd/mm/aaaa" quando sobrescreve uma vencida; nunca o motivo
- [x] `motivosNaDispensa`: mesmo que a tela esteja velha, os critérios gravados são os que o servidor recalculou na hora
- [x] `porUserId` e `em`: vêm da sessão e do relógio do servidor; o cliente só manda `ativoId` e o motivo
- [x] versão para a escrita condicional: com outra pessoa desfazendo a dispensa no meio da confirmação, a tela recebe "O ativo mudou enquanto você confirmava. Tente de novo." e nada a mais entra no histórico

## Acceptance-criteria coverage

- AC-1: IMR e ficha com Tier C e `aguardando_baixa`; `substituicao.test.ts`; `substituicao.db.test.ts`
- AC-2: notas de idade, datas de Belém, 29/02; `substituicao.test.ts`
- AC-3, AC-4: paridade lote e ficha; `substituicao.db.test.ts`
- AC-5: ordem e motivos no IMR; `substituicao.test.ts`
- AC-6: limites na tela de categorias; `substituicao.schemas.test.ts`
- AC-7: troca de período no IMR; paridade
- AC-8: seção do IMR, filtro por tipo, dispensados, falha isolada; `imr-ativos.test.tsx`
- AC-9: filtro da lista para gestão e técnico; `substituicao.schemas.test.ts`
- AC-10: ficha por perfil; `substituicao.db.test.ts`
- AC-11: diálogo, histórico sem motivo; `actions.test.ts`, `substituicao.db.test.ts`
- AC-12: critério novo, prazo vencido; `substituicao.test.ts`, `substituicao.db.test.ts`
- AC-13, AC-14: duas abas, corrida, ativo que mudou; `substituicao.db.test.ts`
- AC-15: voltar a sinalizar; `substituicao.db.test.ts`, `actions.test.ts`
- AC-16: nada além da dispensa muda, nenhum aviso; `substituicao.db.test.ts`
- AC-17: permissão pelo papel; `actions.test.ts`
