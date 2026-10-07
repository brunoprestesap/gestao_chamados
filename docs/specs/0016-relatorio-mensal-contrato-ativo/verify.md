# Verify: Relatório mensal por contrato com ativo · spec 0016 · updated 2026-10-07

_Passos derivados dos critérios de aceite da spec 0016. O `/check verify` roda estes passos; o `/test` tranca os que valem para sempre._

## UI / manual

- [x] Como Admin, abra `/configuracoes/contratos` → a lista aparece do contrato de `vigenciaInicio` mais recente para o mais antigo, sem botão de apagar → AC-1
- [x] Como Preposto, abra `/configuracoes/contratos` e `/relatorios/contrato` → redireciona para `/dashboard` → AC-1, AC-20
- [x] Crie um contrato com CNPJ `11.222.333/0001-82` → "CNPJ inválido."; troque para `...-81` → grava, e a lista mostra `11.222.333/0001-81` → AC-2
- [x] Crie outro contrato com número igual em outra caixa (`teste-1` e `TESTE-1`) → "Já existe um contrato com o número …" → AC-2
- [x] Crie um contrato de Ar-Condicionado que cruza a vigência de outro, mesmo inativo → mensagem "O contrato <numero> já cobre Ar-Condicionado de dd/mm/aaaa a dd/mm/aaaa." → AC-3
- [x] Gere um PDF de um mês, depois edite o contrato tirando um tipo, ou movendo o início para depois desse mês → "Já há relatório emitido para mm/aaaa; …"; estender o fim passa → AC-3
- [x] Inative um contrato → ele continua no seletor de `/relatorios/contrato` com "(inativo)" e gera relatório e PDF → AC-4
- [x] Em `/relatorios/contrato`, troque o contrato no seletor → os meses mudam e vão do mês atual (ou do fim da vigência) até o primeiro mês, do mais recente → AC-5
- [x] Contrato com vigência futura → "Este contrato ainda não tem meses para relatar." → AC-5
- [x] Sem contratos cadastrados → texto de vazio com link para `/configuracoes/contratos` → AC-5
- [x] Edite a URL para `mes=2020-01` ou um `contratoId` inexistente → "Escolha um contrato e um mês da vigência." sem números → AC-5
- [x] Contrato com vigência começando no dia 15 → o cabeçalho diz "Período de 15/mm/aaaa a fim do mês" e um chamado do dia 10 não conta → AC-6, AC-7
- [x] Mês atual → selo "Mês em andamento, números parciais" na tela e no PDF → AC-6, AC-17
- [x] Cabeçalho mostra número, empresa, CNPJ formatado, processo SEI, objeto e fiscal quando preenchidos, tipos, vigência, "Gerado em dd/mm/aaaa hh:mm" em Belém e o nome de quem gerou → AC-8
- [x] Compare os seis números do topo com a aba Ativos do IMR, mesmo mês, filtro do tipo do contrato → iguais → AC-10
- [x] Tabela por categoria lista as categorias do escopo mesmo sem chamado (ativos no escopo > 0, com chamado 0) e "Sem categoria" por último → AC-11
- [x] Tabela por ativo mostra todos os ativos (mais de 10), com "reincidente" em quem tem 2 ou mais em 90 dias, e o código abre a ficha → AC-12
- [x] Mês sem chamado do contrato → "Nenhum chamado deste contrato no período." e "—" no lugar de MTBF, MTTR e percentuais → AC-14
- [x] Nenhum nome de responsável patrimonial aparece na tela nem no PDF; só o fiscal e quem gerou → AC-15
- [x] Clique em "Gerar PDF" → botão "Gerando…", baixa `relatorio-contrato-<numero>-<YYYY-MM>.pdf`, e a lista de emissões ganha uma linha com data, nome, código e 12 caracteres do hash (hash inteiro no `title`) → AC-16, AC-19
- [x] Abra o PDF → A4 paisagem, cabeçalho da tabela repetido em cada página, rodapé "Sigma · Emissão <id> · Gerado em … · Página X de Y", selo "Indicadores informativos, sem efeito contratual", acentos certos → AC-17
- [x] O SHA-256 do arquivo baixado é igual ao `hashSha256` da emissão, e o código do rodapé é o `_id` dela → AC-16

## Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/contratos` → passa (paridade com o IMR, janela cortada, sobreposição, número único, trava dos meses, PDF com hash, falha da emissão sem PDF) → AC-3, AC-6, AC-7, AC-10, AC-11, AC-16, AC-18
- [x] `npx vitest run shared/contratos app/api/relatorios` → passa → AC-2, AC-5, AC-6, AC-20
- [x] `curl -X POST http://localhost:3000/api/relatorios/contrato/pdf` sem cookie → 401; com cookie de Preposto → 403; com Admin e `{"contratoId":"x"}` → 400; contrato inexistente → 404; mês fora → 422 "Mês fora da vigência do contrato." → AC-20
- [x] Dois POSTs ao mesmo tempo com Admin → um responde 429 "Outro relatório está sendo gerado. Tente em alguns segundos." e a tela mostra o toast → AC-16
- [x] Com a gravação da emissão falhando (por exemplo, Mongo parado logo depois da leitura) → 500, nenhum PDF entregue, toast "Não foi possível gerar o PDF. Tente de novo.", log só com `contratoId`, `mes` e a mensagem → AC-18
- [x] `npx npm@11.19.0 ci --dry-run --ignore-scripts --os=linux --cpu=x64 --libc=musl` → sem erro (lock serve para a imagem Alpine) → Follow-up
- [x] `npm run build` e `node .next/standalone/server.js` → a rota gera o PDF no build de produção → AC-16, AC-17

## Origem de cada valor (Value sourcing)

- [x] Meses permitidos: rode com o relógio em 31/10 às 22h de Belém (já 01/11 em UTC) → novembro ainda não aparece → `mesesPermitidos` com `hojeEmBelem`
- [x] Janela: mês de fevereiro em ano bissexto (2028) → fim em 29/02 → `janelaDoMes`
- [x] Selo parcial: o mês escolhido é o de `hojeEmBelem(agora)`, não o de UTC → vire o dia perto da meia noite e confira
- [x] Chamados do contrato: um chamado de Elevador no mesmo mês não entra num contrato só de Ar-Condicionado; um `cancelado` ou `recusado` também não → `tipoServico`, `status`
- [x] Corretivos com ativo, MTBF, MTTR, reincidência: um corretivo de 80 dias antes do fim conta em "Em 90 dias" mas não em "Corretivos" → `calcularFiltro`/`numerosDoAtivo`
- [x] SLA: corretivo aberto com prazo vencido → fora; em `aguardando_terceiros` com prazo vencido → em andamento; sem `resolutionDueAt` → sem SLA → `sla.resolutionDueAt`, `sla.resolvedAt`, `status`, `agora`
- [x] Categoria de cada ativo e ativos no escopo: categoria ligada a subtipo do `ServiceType` "AR CONDICIONADO" entra no contrato de Ar-Condicionado; ativo `baixado` não conta em "ativos no escopo" mas aparece na tabela por ativo → `tipoServicoDoNomeDoTipo`, `FILTRO_VINCULAVEL`
- [x] Preventivas concluídas: preventiva com `sla.resolvedAt` → concluída; sem → só gerada → `sla.resolvedAt`
- [x] Código, descrição, local: ativo sem localização → "—" → `lerInfoDosAtivos`
- [x] Cabeçalho do contrato: CNPJ gravado sem máscara aparece formatado → `formatarCnpj`
- [x] "Gerado em" e quem gerou: troque o nome do usuário depois de gerar → a emissão antiga continua com o nome antigo → `geradoPorNome`
- [x] Meses com emissão (trava da edição): emissão de outro contrato não trava este → `RelatorioContratoEmissao.mes` do contrato
- [x] Trava de uma geração por vez: vale por processo; com duas instâncias do Next não vale (aceito na spec) → `lib/contratos/pdf/trava.ts`
- [x] Código da emissão: o `_id` no rodapé existe na coleção `relatoriocontratoemissoes` → `new Types.ObjectId()` antes do render
- [x] Página X de Y: relatório com mais de 40 ativos tem várias páginas e o total certo → `render` do `@react-pdf/renderer`
- [x] Hash: `sha256sum` do arquivo baixado é igual ao gravado → `crypto.createHash('sha256')`
- [x] Nome do arquivo: número `12/2025 Ar` vira `relatorio-contrato-12-2025-Ar-<mes>.pdf` → `nomeDoArquivoPdf`

## Acceptance-criteria coverage

- AC-1: UI 1, 2 · AC-2: UI 3, 4, comando 2 · AC-3: UI 5, 6, comando 1 · AC-4: UI 7 · AC-5: UI 8 a 11, comando 2 · AC-6: UI 12, 13, comando 1 · AC-7: UI 12, comando 1 · AC-8: UI 14 · AC-9: UI 15 a 17 (topo) · AC-10: UI 15, comando 1 · AC-11: UI 16 · AC-12: UI 17 · AC-13: origem SLA · AC-14: UI 18 · AC-15: UI 19 · AC-16: UI 20, 22, comandos 4, 7 · AC-17: UI 13, 21 · AC-18: comando 5 · AC-19: UI 20 · AC-20: UI 2, comando 3
