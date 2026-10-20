# Review, feat/material-fatia-5, 2026-10-20

**Reviewed by**: Claude Sonnet 5.5 (autor em outro modelo)
**Scope**: ~45 arquivos (24 rastreados com diff real, mais os novos), branch vs main (não commitado)
**Verdict**: Approve with nits

## Summary

A fatia 5 entrega as quatro advertências do ato (fracionamento, reincidência, consumo acima do estimado, item parecido), a projeção de esgotamento no `aprovar`, o registro `CotacaoMaterialTentativa`, os parâmetros editáveis com histórico e o relatório `/relatorios/material`. O código segue a spec (AC-36 a AC-43) e as convenções do projeto: lógica pura separada em `controles.ts`/`projecao.ts`, centavos e milésimos inteiros, Belém no corte da janela, gravação condicional dos parâmetros, visibilidade só TRF1 pelo `CONTROLES[..].ve`, Admin em página e action. Não achei bloqueio nem problema grave; os achados são de desempenho futuro, um texto de estado vazio e arestas pequenas.

## Minor

### 🟡 Estado vazio errado em "Diferença para o SINAPI", `app/(dashboard)/relatorios/material/_components/RelatorioMaterialTela.tsx:174`

**Problem**: o cartão mostra "sem cotações no período" quando `itensComEquivalente === 0`, mas pode haver cotações autorizadas no período, só sem item do Anexo V (ou sem equivalente SINAPI, que aparece no cartão ao lado). Concordo com o item já anotado pelo verify.
**Why it matters**: o Admin lê que não houve cotação quando houve; contradiz o número de "Divergência" e do tempo médio na mesma tela.
**Suggested fix**: usar um texto próprio ("sem itens do Anexo V com equivalente SINAPI no período") ou decidir pela existência de cotações autorizadas no período, e reservar "sem cotações no período" para denominador zero de verdade.

### 🟡 Varreduras sem índice no relatório e no consumo, `lib/material/relatorio.ts:210`, `lib/material/advertencias.ts:175`

**Problem**: `primeiros(CotacaoMaterialEventoModel, { acao: 'enviar' })` agrega todos os eventos `enviar` da história a cada abertura do relatório, e as tentativas idem; `doConsumo` filtra `itens.anexoVItemId $in` sem índice em cada `assumir`, `encaminhar` e `aprovar`. Não há índice por `acao` nem por `itens.anexoVItemId`.
**Why it matters**: cresce com o histórico; hoje o volume é pequeno e a spec aceita a varredura do consumo (Riscos), mas o relatório não tem esse aceite explícito e roda na página, e o `doConsumo` fica no caminho da transição.
**Suggested fix**: limitar o `$match` do relatório às cotações relevantes (por exemplo as com `autorizadoEm` ou evento no período mais um corte de data) ou criar índice parcial `{ acao: 1, cotacaoId: 1, em: 1 }`; para o consumo, registrar o risco ou indexar `itens.anexoVItemId` quando o volume pedir.

### 🟡 Documento legado com percentual acima de 100 trava a tela de parâmetros, `shared/material/cotacao.schemas.ts:422` e `models/MaterialConfig.ts:28`

**Problem**: o teto de `percentualSinapi` caiu de 1000 para 100. Um documento já gravado com valor entre 101 e 1000 volta de `lerParametros` e vai em `lidos`, que o `ParametrosMaterialSchema` recusa; o Admin não consegue salvar nenhuma mudança (nem corrigir o próprio valor) e vê só a mensagem do limite.
**Why it matters**: improvável (padrão 10, e a fatia 3 só entrou em dev), mas sem saída pela UI.
**Suggested fix**: validar `lidos` de forma frouxa (número inteiro, sem os limites) e `novos` com os limites, ou confirmar em prod que nenhum documento passa de 100.

### 🟡 Parcelas do fracionamento sem preço contam como zero, `lib/material/advertencias.ts:117`

**Problem**: no `assumir`, itens ainda sem `precoAplicadoCentavos` entram com `precoParaValor(i) ?? 0`, então a parcela atual é 0 e o fracionamento só aparece no `encaminhar` ou no `aprovar`.
**Why it matters**: coerente com "refeitas em três atos", mas quem espera o aviso já no `assumir` não o vê para itens sem preço.
**Suggested fix**: nenhuma mudança necessária se for intencional; vale uma linha no AGENTS.md do material dizendo que, no `assumir`, só itens já precificados somam.

## Nits

- ⚪ `app/(dashboard)/relatorios/material/page.tsx:22`, com período inválido o formulário continua mostrando as datas inválidas (`pedido`) enquanto os dados são do mês corrente; preencher o formulário com `periodo` quando `erro` existir evita a incoerência visual.
- ⚪ `lib/material/relatorio.ts:219`, a lista de fracionamento inclui a cotação em qualquer período em que algum evento posterior (executar, atestar) ainda carrega a advertência; é o que a spec diz ("algum evento"), mas a descrição da tela ("em algum ato do período") pode surpreender.
- ⚪ `lib/material/relatorio.ts:91`, `primeiros` recebe `typeof Evento | typeof Tentativa` e faz cast para `typeof Evento`; um parâmetro `Model<{ em: Date }>` genérico dispensa o cast.
- ⚪ `lib/material/projecao.ts:491`, `p!` em `calcularProjecaoDoEmpenho`; seguro porque a lista tem um elemento, mas um `?? ` explícito deixaria o tipo honesto.

## Strengths

- Regras novas em funções puras (`itensComFracionamento`, `itensComConsumoAcima`, `calcularProjecao`, `consomeParcelaRelevante`), testadas sem banco, e a parte com Mongo isolada em `advertencias.ts`.
- Gravação dos parâmetros condicional pelos quatro valores lidos, com o campo ausente casando com o padrão, histórico na mesma escrita e tratamento do 11000; falha do recálculo não desfaz a gravação e é avisada.
- `registrarTentativa` com `catch` que só loga: a resposta do `enviar` nunca muda (AC-43); modelo só de inclusão.
- Visibilidade bem amarrada: os cinco códigos novos são `ve: 'trf1'`, o ramo da contratada/técnico não leva `projecao` nem as advertências, e há teste para isso.
- Projeção usa o saldo de antes da reserva, ignora reforço e anulação e diz "histórico insuficiente" com menos de 30 dias; a tela e o PDF reaproveitam `textoProjecao`.

## Test coverage

Boa. `fatia5.test.ts` (21 casos) cobre as contas puras e `fatia5.db.test.ts` (21 casos) cobre: fracionamento (sem ativo, fora da janela, faixa desativada, devolvida pelo `alterar`), reincidência, advertências mantidas na devolução e refeitas nos três atos, consumo em qualquer versão, item parecido, projeção (parcela relevante, histórico insuficiente, ausência abaixo do corte), invisibilidade para contratada e técnico, tentativa (grava, versão desatualizada não grava, falha não muda a resposta, recusa update e delete), parâmetros (histórico por campo, concorrência, documento antigo, recálculo) e relatório (data do fato, denominador zero, `alterar` não conta). Há testes de componente para parâmetros e relatório e para o item de menu. Lacuna pequena: nenhum teste para o estado vazio do cartão "Diferença para o SINAPI" com cotações que não têm Anexo V (o achado acima), nem para o legado de percentual acima de 100.
