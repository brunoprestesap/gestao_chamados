# Verify: custo acumulado por ativo · spec 0018 · updated 2026-10-08 · verificado em 2026-10-08

_Passos tirados dos critérios de aceite da spec 0018. O `/check verify` roda estes passos; o `/test` tranca os que valem para sempre._

## UI / manual

Prepare um ativo Tier A com `valorHistorico` de R$ 2.000,00 (pelo importador ou direto no banco de dev), um corretivo `em atendimento` vinculado a ele e uma cotação aprovada de R$ 300,00 nesse chamado.

- [x] Como Preposto, abra `/gestao`, clique no chamado → a seção "Custo" aparece abaixo de "Material Necessário", com a cotação aprovada (estimado R$ 300,00, conta R$ 300,00) e o texto "Lance só o material que não passou por cotação aprovada." → AC-1, AC-7
- [x] Lance "Cabo", quantidade `2,5`, unitário `10` → o item aparece como "2,5 × R$ 10,00 = R$ 25,00 · lançado por <seu nome>" e o total do chamado vira R$ 325,00, sem recarregar a página → AC-1, AC-7, AC-9
- [x] Lance com quantidade `0`, depois com unitário `1,005`, depois com descrição `ab` → "Quantidade inválida.", "Valor unitário inválido.", "Descrição do material inválida." → AC-1
- [x] Edite o item para quantidade `3` e unitário `45,50` → total do item R$ 136,50; quem lançou continua o mesmo → AC-2
- [x] Remova o item (Remover → Remover) → o item some e o total volta → AC-2
- [x] Na cotação, informe valor final `280` e salve → "conta R$ 280,00 · valor final por <seu nome>"; limpe o campo e salve → volta a contar R$ 300,00; informe `0` → conta R$ 0,00 → AC-5
- [x] Na aba Histórico do mesmo chamado → aparecem "Material lançado", "Material editado", "Material removido" e "Valor final da cotação", com os textos de/para → AC-6
- [x] Entre como o solicitante do chamado e abra `/meus-chamados/<id>` e a conversa do chamado → nenhuma das quatro entradas de custo aparece, e a cotação mostra só o estimado → AC-6, AC-18
- [x] Conclua o chamado → a seção continua editável; encerre → a seção fica só leitura e qualquer tentativa devolve "O custo deste chamado não pode mais ser alterado." → AC-3
- [x] Abra um chamado sem ativo → a seção mostra a nota "Este chamado não tem ativo; o custo passa a contar para o equipamento quando ele for vinculado." e aceita lançamento; vincule um ativo → o custo aparece na ficha desse ativo → AC-8
- [x] Troque o ativo de um chamado com custo → o custo sai da ficha do ativo antigo e entra na do novo → AC-8
- [x] Na ficha do ativo (`/ativos/<id>`), como Admin ou Preposto → bloco "Custo de manutenção" com corretivo, preventiva e total em 12 meses, total desde sempre e a lista de chamados com link → AC-11
- [x] A mesma ficha como Técnico → sem bloco de custo; corretivos, MTBF e MTTR continuam → AC-18
- [x] Ativo sem nenhum custo → "Nenhum custo registrado para este ativo." → AC-11
- [x] `/relatorios/imr`, aba Ativos, período que cobre o chamado → coluna "Custo no período" no ranking e a tabela "Mais caros no período" com o ativo; troque o seletor de tipo → as duas seguem o filtro → AC-12
- [x] O valor da ficha (12 meses), o do IMR (mesmo período) e o motivo de substituição batem para o mesmo ativo → AC-14
- [x] `/relatorios/contrato`, contrato de Ar-Condicionado e o mês do chamado → coluna "Custo" por ativo, "Custo corretivo" e "Custo preventiva" por categoria e "Custo total do mês" no resumo, com "custos lançados até …" → AC-13
- [x] Gere o PDF → as mesmas colunas e a frase "Custos lançados até dd/mm/aaaa hh:mm (horário de Belém)." no resumo → AC-13
- [x] Ativo com R$ 1.000,00 de corretivo em 12 meses e `valorHistorico` R$ 2.000,00 → selo de candidato na ficha com "Custo em 12 meses: R$ 1.000,00 (50% do valor histórico; limite 50%)"; o mesmo motivo nos candidatos do IMR e no filtro "Substituição" de `/ativos` → AC-15
- [x] Ativo sem `valorHistorico` → a ficha mostra "Custo não avaliado: o ativo não tem valor histórico." → AC-15
- [x] Em `/configuracoes/categorias-ativo`, defina 20% para a categoria → o ativo de R$ 400,00 de custo em R$ 2.000,00 vira candidato; limpe o campo → volta ao padrão de 50%; tente `1000` → "Limite de custo inválido." → AC-16
- [x] Ativo dispensado antes desta spec por corretivos, que agora bate por custo → volta à lista de candidatos → AC-17
- [x] Derrube a leitura de custo (renomear a coleção não basta, o Mongo devolve lista vazia; troque `cotacaos` por uma view que falha, como `$divide` por zero, num banco descartável) → a ficha e o IMR mostram "Não foi possível calcular o custo agora." e o resto da página aparece; o relatório por contrato falha inteiro → AC-19

## Commands

- [x] `npx vitest run shared/chamados/__tests__/custo.test.ts` → a conta em centavos, os formatos e a validação passam → AC-1, AC-9
- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/chamados/__tests__/custo.db.test.ts lib/ativos/__tests__/custo.db.test.ts` → o teto com duas gravações simultâneas, o status travado, a ordem das mensagens e a paridade passam → AC-2a, AC-3, AC-4, AC-14
- [x] `npx vitest run "app/(dashboard)/gestao/__tests__/custo.actions.test.ts" "app/api/chamados/[id]/cotacoes" "app/(dashboard)/gestao/_components/__tests__/ChamadoDetailSheet.test.tsx"` → técnico e solicitante recusados, valor final só para a gestão, seção só para gestão → AC-18

## Fontes de valor (uma checagem por linha da tabela)

- [x] `criadoPorUserId` e `criadoEm`: lance como Preposto A e edite como Preposto B → continua "lançado por A" → fonte: sessão e relógio
- [x] Status no filtro da gravação: abra o chamado em duas abas, encerre numa e lance na outra → recusa com a mensagem de status travado
- [x] Teto na gravação: coberto pelo teste de banco das gravações simultâneas
- [x] Item removido no histórico: o texto da remoção mostra o item como estava antes, não o vazio
- [x] Valor anterior no histórico do valor final: troque de 280 para 250 → "Valor final de R$ 280,00 para R$ 250,00"
- [x] Valor da cotação: só `aprovada` soma; uma cotação recusada de R$ 999,00 no mesmo chamado não muda o total
- [x] Total do item: 0,333 × R$ 0,15 dá R$ 0,05 (arredonda uma vez); três de 0,1 × R$ 0,10 mais um de R$ 0,20 somam R$ 0,23
- [x] Corretivo ou preventiva: um chamado gerado pelo recorrente soma em "Preventiva" na ficha e no IMR
- [x] Período pela abertura: um chamado aberto no dia 31 e com material lançado no dia 2 do mês seguinte conta no mês da abertura, no IMR e no relatório
- [x] Janela de 12 meses: um chamado de 400 dias atrás entra só no "Total desde sempre"
- [x] Período e tipo do IMR: chamado de Manutenção Predial não aparece no filtro de Ar-Condicionado
- [x] Mês do contrato: chamado do mês anterior (dentro da janela de reincidência) não soma custo no mês escolhido
- [x] "Custos lançados até": o horário do PDF bate com a hora de Belém da geração, não com UTC
- [x] Percentual da substituição: 999,99 de custo em 2.000,00 não bate; 1.000,00 bate (só inteiros)
- [x] Limite da categoria: `null` usa 50; 20 troca o padrão
- [x] Nomes: o nome de quem lançou e de quem informou o valor final vêm do cadastro atual do usuário
- [x] Formato do dinheiro: valores aparecem como `R$ 1.234,56` em todas as telas e no PDF

## Acceptance-criteria coverage

- AC-1 · lançar, validar · AC-2 · editar, remover · AC-2a · ordem das mensagens · AC-3 · status travado e reabertura · AC-4 · teto com corrida · AC-5 · valor final · AC-6 · histórico só da gestão · AC-7 · seção e totais · AC-8 · sem ativo e troca de ativo · AC-9 · conta em centavos · AC-10 · corretivo, preventiva, cancelado · AC-11 · ficha · AC-12 · IMR · AC-13 · relatório e PDF · AC-14 · paridade · AC-15 · critério de custo · AC-16 · limite da categoria · AC-17 · dispensa antiga · AC-18 · quem vê · AC-19 · falha isolada
