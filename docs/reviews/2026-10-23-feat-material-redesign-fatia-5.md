# Review, feat/material-redesign-fatia-5, 2026-10-23

**Reviewed by**: Claude Sonnet 5.5 (revisor independente; autor em outro modelo)
**Scope**: 22 arquivos, branch vs main (merge base c7e6805, PR #86)
**Verdict**: Changes requested

## Summary

A fatia 5 troca o editor da contratada por 4 passos, move os controles puros para `shared/material/controles.ts` e roda no navegador o mesmo adaptador (`montarEntrada`), o mesmo `SalvarRascunhoSchema` e o mesmo `impedimentosDeEnvio` do envio. A mudança é limpa, sem vazamento de código de servidor para o cliente e com a paridade bem fechada para os controles de orçamento. Pontos principais: a lista "Pronta para enviar?" não confere a justificativa da urgência (o servidor recusa), e a raiz do CNPJ ausente degrada em silêncio para "passa".

## Major

### 🟠 A lista diz "pronta" com urgência pedida e justificativa vazia ou curta, `app/(dashboard)/cotacoes/_components/EditorContratada.tsx:97` (e `editor/formulario.ts:238`)

**Problem**: `emUrgencia` vira `true` quando `pedirUrgencia` está marcado, mas nenhuma linha da lista confere a justificativa. No servidor, o schema de envio exige `textoCurto('Justifique a urgência')` (10 a 500 caracteres) e `transicionar` ainda recusa justificativa vazia. Com 1 orçamento por item e o campo em branco, todas as linhas ficam verdes e o envio é recusado.
**Why it matters**: o objetivo declarado (AC-15) é o navegador dar o mesmo veredito do envio, e este é o caso em que diverge, justamente o da urgência. Além disso `salvar('enviar')` já gravou o rascunho (a versão sobe) antes de a recusa chegar.
**Suggested fix**: acrescentar à lista uma linha "Justificativa da urgência" quando `pedirUrgencia` e `podePedirUrgencia`, validada com o mesmo schema do envio (reaproveitar o `EnviarSchema`/`textoCurto` de `shared/material/cotacao.schemas.ts`), e impedir ou avisar antes de salvar. Cobrir com teste em `formulario.test.ts`.

## Minor

### 🟡 Raiz do CNPJ ausente vira `''` e a conferência de CNPJ da contratada some em silêncio, `app/(dashboard)/cotacoes/_components/EditorContratada.tsx:102` e `lib/material/leitura.ts:321`

**Problem**: `raizCnpjContratada` só vai ao DTO com `visao === 'contratada' && acoes.montar`. `acoes.montar` depende só do papel `responsavel_tecnico`, e `visaoDe` devolve `trf1` para quem também é lado TRF1 ou leitor Admin fora do rascunho (situação devolvida). Nesse caso o editor aparece, o campo vem `undefined`, `?? ''` entra e `cnpj_contratada` nunca é acusado. O mesmo ocorre com o parâmetro ainda vazio.
**Why it matters**: a lista fica verde para um CNPJ que o servidor recusa. É raro, mas é falha silenciosa de controle.
**Suggested fix**: se a raiz faltar, a linha de CNPJ deve dizer que só o envio confere (como `prontaServidor`), em vez de passar; ou expor a raiz para qualquer visão que monte.

### 🟡 Urgência e justificativa digitadas se perdem quando o envio é recusado, `EditorContratada.tsx:176` e `DetalheCotacaoView.tsx:292`

**Problem**: `pedirUrgencia` e `justificativaUrgencia` são estado do editor. O envio salva (versão sobe), recebe a recusa, chama `onAlterado()` e a tela remonta o editor por `key={c.versao}`; o passo sobrevive (foi elevado), a urgência não. O comentário do código trata só do texto de erro.
**Why it matters**: a contratada refaz a justificativa a cada recusa do envio.
**Suggested fix**: elevar `pedirUrgencia` e a justificativa para o `DetalheCotacaoView` junto com o passo.

### 🟡 Lista monta primeiro inline e depois no portal, `EditorContratada.tsx:262`

**Problem**: `slotLateral` começa `null` (ref por state), então o primeiro render põe `lista` no fluxo do editor e só depois vai ao `aside`; no remonte por `key` (a cada salvar) o salto se repete. Em tela estreita o `aside` fica depois do conteúdo, longe do botão de envio.
**Suggested fix**: não renderizar a lista enquanto `slotLateral` for `null` fora do passo `revisar`; avaliar versão compacta do resultado perto dos botões em telas estreitas.

### 🟡 Troca de passo sem gestão de foco nem anúncio, `editor/PassosMontagem.tsx:34`

**Problem**: os botões dos passos e "Continuar para..." trocam o conteúdo sem mover o foco nem anunciar o passo novo para leitor de tela.
**Suggested fix**: mover o foco para o `h2` do passo novo (`tabIndex={-1}`) ou usar região `aria-live` com o nome do passo.

### 🟡 Hierarquia de títulos e rótulos repetidos, `editor/BuscaPrecoNoItem.tsx:123`, `editor/PassoOrcamentos.tsx:292`

**Problem**: a busca usa `h4` sob `h2` (pula `h3`); a lista lateral abre com `h2` fora de seção. Na grade, `precoDaCelula` junta descrição e fornecedor, e itens com a mesma descrição, ou fornecedores sem nome, geram rótulos idênticos.
**Suggested fix**: usar `h3` na busca e incluir o número do item/orçamento no rótulo quando repetir.

### 🟡 Cobertura da paridade com o servidor, `editor/__tests__/formulario.test.ts`

**Problem**: não há teste que passe a mesma entrada pelo adaptador e pelo `impedimentosDeEnvio` do servidor comparando o veredito, nem o caso da urgência. `prontaParaEnviar` assume `valorUnitarioCentavos ?? 1` para SINAPI nova e `retiradaEm: r.retirada ? r.data : null`; só a nulidade importa, mas o código sugere uma data que não é a da retirada.
**Suggested fix**: teste de paridade com a mesma fixture e trocar `r.data` por marcador explícito (por exemplo `new Date(0)`), com comentário.

## Nits

- ⚪ `editor/formulario.ts:1`, `import type` de `@/lib/material/serializar` num módulo carregado pelo navegador: some no build, mas vale um comentário para ninguém trocar por import de valor.
- ⚪ `editor/PassoRevisar.tsx:134`, ids fixos `pedir-urgencia` e `urg-just`; usar `useId` como no resto.
- ⚪ `editor/PassoPrecoTabela.tsx:15`, `mesBr` duplicada em `BuscaPrecoNoItem.tsx:16` (retornos diferentes, `''` e `null`); extrair.
- ⚪ `EditorContratada.tsx:178`, `toast.error` mais `onImpedimentos` podem mostrar o mesmo aviso duas vezes; confirmar.

## Strengths

- `shared/material/controles.ts` fica puro (só importa `shared/`), e `lib/material/controles.ts` virou re-export `server-only` sem quebrar importadores.
- O campo novo `raizCnpjContratada` só sai na visão da contratada que monta, nunca para TRF1, técnico ou solicitante.
- O navegador reaproveita de fato `montarEntrada` + `SalvarRascunhoSchema` + `impedimentosDeEnvio`, e o que só o servidor sabe está declarado na tela (`prontaServidor`).
- Passo elevado ao pai resolve o remonte por `key={versao}`; a busca de preço tem rótulos, `aria-expanded` e nomes acessíveis que contêm o texto visível. O comportamento do `DialogClassificar` removido foi preservado, e o `RadioGroup` do shadcn substitui rádios soltos.

## Test coverage

Boa: `formulario.test.ts` (258 linhas) cobre adaptador, linhas e total; `EditorContratada.test.tsx` cresceu e o E2E foi atualizado (vitest 4291, módulo com banco 647, E2E 121 passando). Faltam o teste de paridade com o veredito do envio e o caso da urgência com justificativa (achado maior).
