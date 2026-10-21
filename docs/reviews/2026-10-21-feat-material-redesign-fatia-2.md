# Review, feat/material-redesign-fatia-2, 2026-10-21

**Reviewed by**: Claude Sonnet 5.5 (autor na mesma família de modelos; revisão independente, sem contexto da escrita)
**Scope**: 22 files, branch vs main (PR #80, merge base f2725ce)
**Verdict**: Approve with nits

## Summary

A fatia 2 refaz a página de detalhe da cotação: cabeçalho com jornada datada, abas (Itens, Orçamentos, Trilha), painel "Sua vez", bloco Empenho com barra de saldo (só TRF1) e link do chamado para `/conversas/[id]`. A regra de visibilidade foi respeitada: tudo novo sai de `serializarCotacao` por visão (nome do fiscal e `empenho` só no TRF1, `etapas` e `montadoPorNome` não chegam ao técnico), e nenhum componente decide permissão (botões vêm de `acoesDisponiveis`). Não achei blocker nem major. Há três textos/comportamentos confirmados que a verificação em tela já apontou (dois são desta PR) e alguns pontos menores.

## Minor

### 🟡 Painel repete "a vez" para quem já é o dono da vez, `app/(dashboard)/cotacoes/_components/compartilhado/PainelSuaVez.tsx:~160`

**Problem**: Confirmado o item (b). Quando existe ação principal e `quemAge.nome` veio preenchido (só acontece para o fiscal que assumiu, em `em_analise`), o painel mostra, logo abaixo do título "Analisar e encaminhar", a frase "Agora é a vez de: Fiscal (seu próprio nome)". O próprio fiscal lê o próprio nome como se fosse outra pessoa, e a frase redundante com "Você atua como Fiscal".
**Why it matters**: Ruído na tela principal do fiscal e leitura confusa; o texto só faz sentido para quem NÃO é o dono da vez.
**Suggested fix**: Mostrar a linha "Agora é a vez de" só quando não há ação principal (ou quando o nome é de outra pessoa). Se for preciso saber se o nome é do próprio leitor, o servidor pode mandar um indicador "é você" em vez de o componente comparar nomes.

### 🟡 Título e texto da advertência começam com a mesma palavra, `app/(dashboard)/cotacoes/_components/compartilhado/PainelSuaVez.tsx:~48` e `shared/material/mensagens.ts:384`

**Problem**: Confirmado o item (c). `Ponto` mostra `TITULO_CONTROLE[codigo]` em negrito e depois `CONTROLES[codigo].texto`. Os textos de `CONTROLES` já nascem com o rótulo na frente ("Reincidência: este equipamento já teve..."), então sai "Reincidência Reincidência: ...". O mesmo deve ocorrer em outros controles cujo texto começa com o nome.
**Why it matters**: Texto duplicado e sem pontuação em toda advertência/impedimento sem `detalhe`; visível todo dia para o fiscal.
**Suggested fix**: Ou tirar o prefixo "Nome:" dos textos de `CONTROLES` usados no painel (mantendo a forma completa onde o texto é usado sozinho, como toast), ou criar um texto sem prefixo para o painel. Cobrir com um teste em `detalhe-pecas.test.ts` que falha se `texto` começar com o título.

### 🟡 Técnico vê "Orçamentos (0)" e "Nenhum orçamento nesta cotação", `app/(dashboard)/cotacoes/_components/DetalheCotacaoView.tsx` (aba) e `detalhe/AbaOrcamentos.tsx:42`

**Problem**: Para a visão do técnico, `serializarCotacao` devolve a cotação sem `orcamentos` (retorna antes). A view usa `(c.orcamentos ?? []).length` e a aba diz que não há orçamentos, o que é falso: eles existem, só não são dele.
**Why it matters**: Informação errada na tela do técnico; ele pode concluir que a contratada não enviou orçamento.
**Suggested fix**: Não renderizar a aba Orçamentos quando `c.orcamentos` for `undefined` (visão sem acesso), mantendo "nenhum orçamento" só para lista realmente vazia. Hoje nenhum teste cobre a aba na visão do técnico.

### 🟡 Projeção do empenho é calculada em toda leitura TRF1, `lib/material/leitura.ts:~283`

**Problem**: `projecoesDosEmpenhos(naBarra.empenhos)` agora roda sempre (antes só em `em_aprovacao`), em qualquer situação, inclusive rascunho, cancelada e reprovada, e faz um aggregate mais um find em `CotacaoMaterialEvento` por leitura. Em modo `elegiveis` a projeção aparece na barra mesmo quando a cotação ainda não consome parcela relevante.
**Why it matters**: Custo extra de banco em toda abertura do detalhe, e informação de projeção em telas onde ela não ajuda (e que a regra de "parcela relevante" antes filtrava). Não é grave com o volume atual.
**Suggested fix**: Calcular só quando o bloco vai mostrar projeção (aprovação e, se a spec quiser, elegíveis na análise), ou filtrar a projeção exibida pela mesma regra de `consomeParcelaRelevante`. Confirmar com a spec (AC-8) qual é a intenção.

## Nits

- ⚪ `app/(dashboard)/cotacoes/_components/DetalheCotacaoView.tsx` (`<aside aria-label={TEXTO_SUA_VEZ.rotuloOutros}>`): o rótulo do `aside` é sempre "Próximo passo", mesmo quando o painel diz "Sua vez". Usar um rótulo neutro.
- ⚪ `dataHora` está copiada em `DetalheCotacaoView.tsx`, `AbaOrcamentos.tsx` e `AbaTrilha.tsx` com o mesmo corpo; extrair para `shared/material` ou `apoio`.
- ⚪ (a) Campo de busca da fila estreito a 390 px: confirmado que o código existe (`fila/BarraFila.tsx`, `div ... min-w-0 flex-1 sm:w-64` dentro de `form flex-1` com dois botões ao lado e o botão "Urgente" na mesma linha com `flex-wrap`), mas o arquivo NÃO foi alterado nesta PR (é da fatia 1). Não bloqueia; tratar à parte (por exemplo dar `basis-full` ao formulário no celular).
- ⚪ `shared/material/jornada.ts` usa `findLast`/`findLastIndex`, que rodam no navegador (o cabeçalho é importado por componente client). Suportado nos navegadores atuais; só vale checar o alvo de navegadores do projeto.

## Strengths

- Visibilidade por campo bem feita: o nome do fiscal só é resolvido quando `visao === 'trf1'`, `empenho` só entra na visão TRF1 e `etapas`/`montadoPorNome` ficam depois do retorno antecipado do técnico. Existe teste de banco para isso (`detalhe.db.test.ts`, AC-24).
- A conta da barra de saldo é feita no servidor, com os três modos (`elegiveis`, `aprovacao`, `da_cotacao`) e sem descontar a reserva duas vezes; testada com banco real. Dinheiro em centavos inteiros, de acordo com o AGENTS do módulo.
- `etapasDaTrilha` trata devolução e reenvio, e ignora `conciliar`, com testes de unidade.
- Sem decisão de permissão nos componentes: ação principal e secundárias vêm de `acoesDisponiveis`, e as âncoras (`#ateste`, `#pesquisa`, `#montagem`) existem exatamente quando a ação que leva a elas está liberada.
- Boa atenção a acessibilidade: tabela rolável com região rotulada e foco por teclado, barra com `role="img"` e rótulo, axe no E2E a 390 px e desktop.

## Test coverage

Cobertura boa para a parte nova: `DetalheCotacaoView.test.tsx` (cabeçalho, link do chamado, painel por perfil, empenho, abas), `detalhe.db.test.ts` (barras por situação, jornada, visibilidade por visão), `detalhe-pecas.test.ts` (jornada e textos) e um E2E novo com axe. Lacunas: não há teste da aba Orçamentos na visão do técnico (ver Minor acima); não há teste que impeça título e texto de controle repetirem a primeira palavra; não há teste do painel para o fiscal que assumiu mostrando ou não a linha "Agora é a vez de" (item (b)).
