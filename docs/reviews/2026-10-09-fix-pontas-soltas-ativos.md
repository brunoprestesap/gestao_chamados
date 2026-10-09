# Review, fix/pontas-soltas-ativos, 2026-10-09

**Reviewed by**: Sonnet 5.5 (autor no mesmo modelo, sem contexto da escrita)
**Scope**: 13 arquivos, branch vs main (PR #55)
**Verdict**: Approve with nits

## Summary

A mudança esconde as duas ações de dispensa de substituição do histórico da ficha para quem não é gestão, filtrando já na consulta do Mongo. Também troca três formatadores de moeda duplicados por `formatarReais(centavos(...))` e acerta textos de AGENTS.md e specs. O código está correto e pequeno. Não achei bloqueio nem problema maior; só observações menores.

## Minor

### 🟡 Outras ações do histórico continuam visíveis e podem insinuar a troca, `shared/ativos/ativo.constants.ts:93`

**Problem**: A lista `ATIVO_HISTORY_ACOES_SO_DA_GESTAO` cobre só as duas ações da dispensa. Um ativo que passa a `baixado` por substituição aparece como `alteracao_status` para todos, o que é esperado e não é vazamento da regra. Mas a lista é um array solto: uma ação nova de gestão no futuro precisa ser lembrada aqui à mão.
**Why it matters**: Risco de regressão silenciosa, não bug hoje.
**Suggested fix**: Um comentário junto de `ATIVO_HISTORY_ACOES` avisando que ação nova ligada à substituição entra nesta lista, ou um teste que liste as ações com "substituicao" no nome e confira que estão na lista.

### 🟡 Teste cobre só a ação `dispensa_substituicao`, `lib/ativos/__tests__/substituicao.db.test.ts:246`

**Problem**: As asserções novas olham `dispensa_substituicao` para Técnico, Solicitante e Admin. A ação `dispensa_substituicao_desfeita` (também filtrada) não é verificada na ficha. Há um teste que cria essa entrada (linha ~297), mas não passa por `carregarFicha`.
**Why it matters**: Se alguém tirar a segunda ação da lista, nenhum teste falha.
**Suggested fix**: Depois do desfazer, carregar a ficha do Técnico e conferir que nenhuma das duas ações aparece; opcionalmente conferir que o limite de 100 conta só o que é visível.

## Nits

- ⚪ `lib/ativos/ficha.ts:226`, o comentário diz "fica fora do filtro", o que lê ao contrário; algo como "é excluída da consulta" fica mais claro.
- ⚪ `lib/ativos/ficha.ts:230`, `...(!gestao && {...})` funciona, mas o estilo `gestao ? {} : {...}` evita espalhar `false` e já é o padrão em outros pontos do arquivo.

## Strengths

- O filtro está na consulta, não depois dela, então o `limit(100)` conta só o que a pessoa vê e nada some do meio por corte posterior.
- Verifiquei os outros caminhos de leitura: `AtivoHistoryModel.find` só existe em `carregarFicha` (fora testes). `app/api/ativos`, o pacote da vistoria e o IMR não leem `AtivoHistory`, então não há outro vazamento. `canManage` (`lib/dal.ts:48`) é Admin + Preposto, igual a "gestão" da spec 0015.
- A troca de formatadores é equivalente: `Intl.NumberFormat` de BRL já usa 2 casas, então `minimumFractionDigits: 2` era redundante, e `centavos` só altera valores com mais de 2 casas (arredonda para o centavo, que o formato já faria). `shared/chamados/custo.ts` é puro, sem imports de servidor, então é seguro no componente cliente `CotacaoApprovalCard`. Há um detalhe de formato: o espaço entre "R$" e o número é o mesmo (NBSP) nos dois caminhos.
- As specs 0014/0015/0016/0018 e os AGENTS.md ficaram coerentes com o código (envio de cotação só Preposto, aprovação só Admin, conferido em `cotacao.actions.ts`).

## Test coverage

`substituicao.db.test.ts` ganhou asserções para Técnico, Solicitante e Admin sobre a ação de dispensa, contra Mongo real. A troca de formatadores não tem teste novo, mas `formatarReais` já é usada e testada na spec 0018. Lacuna: a ação `dispensa_substituicao_desfeita` na ficha (ver Minor acima).
