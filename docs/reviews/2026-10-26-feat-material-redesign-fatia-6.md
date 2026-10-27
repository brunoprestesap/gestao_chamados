# Review, feat/material-redesign-fatia-6, 2026-10-26

**Reviewed by**: Claude Sonnet 5.5 (autor em outro modelo)
**Scope**: 29 arquivos rastreados mais 9 novos (sem `docs/manuais/**`), branch contra main (merge base e585840)
**Verdict**: Approve with nits

## Resumo

A branch entrega o cartão da cotação no chamado por visão (fatia 6), o cadastro de material em seções no endereço (fatia 7) e o relatório com atalhos de período (fatia 8), além do texto "Fechar" nos botões de fechar e os testes e o E2E. Li o código primeiro e só depois abri a revisão de 23/10. Não achei bloqueio nem problema grave. As regras de `lib/material` (transições, saldo, schemas, actions) não mudaram; as únicas mudanças em `lib/` são de leitura e serialização (`cadastro.ts`, `serializar.ts`). A visibilidade continua decidida no servidor por `cotacao.visao`. Sobram pontos pequenos, e o mais relevante é o contrato de dados do solicitante.

## Pontos da revisão anterior (23/10)

Já corrigidos:

- Botão de fechar em inglês: `components/ui/dialog.tsx` e `components/ui/sheet.tsx` agora dizem "Fechar".
- Formulários de novo empenho e nova designação não zeravam: agora `criar()` zera pelo callback de sucesso em `GerirMaterial.tsx`.
- Textos fixos no cadastro: os toasts e rótulos principais do `GerirMaterial.tsx` agora vêm de `TEXTO_FORMULARIOS_CADASTRO` e `TEXTO_CADASTRO_SECOES`. Sobram poucos literais (veja Minor abaixo).
- Teste de `DialogEncaminhar` com preço vazio foi acrescentado em `DialogosCotacao.test.tsx`.

Ainda abertos:

- Solicitante recebe mais do que a fase (veja Minor 1).
- Bloco "Histórico: sistema anterior" (veja Minor 2).
- Página do cadastro lê tudo em toda seção (veja Minor 3).
- AC-29 e o teste `fatia3.db.test.ts` com expectativa mudada (veja Minor 4).
- Largura do sheet da gestão a 1280 px: não consegui confirmar sem rodar a tela. O arquivo `ChamadoDetailSheet.tsx` só mudou de ordem os dois cartões, então o risco é o mesmo de antes.
- `DialogMaterial` e `DialogExecucao` seguem sem teste do que mudou (limite de itens, ícone de evidência em PDF).
- Os dois nits de comentário solto (veja Nits).

## Minor

### 🟡 Solicitante recebe mais do que a fase, `lib/material/serializar.ts:453`

**Problema**: para o solicitante, `serializarCotacao` devolve o bloco base inteiro mais `fase`: `id`, `numero`, `chamadoId`, `situacao` crua, `emTramite`, `versao`, `criadaEm` e `atualizadaEm`. O AC-24 diz que o solicitante recebe só a fase e a frase, e que nenhum componente esconde dado só na tela. O teste novo em `serializar.test.ts` e o de banco confirmam que `quemAgeAgora`, `itens`, `valor` e `montadoPorNome` não vêm, mas não dizem nada sobre `situacao`, `numero` e `versao`.
**Por que importa**: a `situacao` crua desfaz o agrupamento do AC-16 (devolvida some dentro de "Pedido", reprovada e cancelada viram "encerrada"). Não é dado sensível e é do próprio chamado dele, mas a spec promete o contrário e o JSON da rota `/api/chamados/[id]/cotacao-material` mostra mais do que a tela.
**Suggested fix**: decidir qual frase vale. Se vale "só a fase", devolver só `{ id, visao, fase }` para o solicitante e fazer o teste afirmar a ausência de `situacao`, `numero` e `versao`. Se vale "como hoje", ajustar o texto do AC-24.

### 🟡 Bloco "Histórico: sistema anterior" pode ficar preso aberto e some a cada recarga, `app/(dashboard)/gestao/_components/CotacaoApprovalCard.tsx:158` e `:355`

**Problema**: com `recolhido`, `if (loading && recolhido) return null` desmonta o bloco em toda recarga (depois de aprovar ou recusar). Além disso, `onToggle` grava `aberto` com o estado do elemento, e o navegador pode disparar `toggle` quando o `open` inicial vem de `active != null`. Se isso acontecer, `aberto` fica em `true` sem clique de ninguém, e depois de aprovar a única cotação `enviada` o bloco não volta a recolher (AC-17). Não rodei a tela; é hipótese baseada no comportamento de `<details>`.
**Por que importa**: acabamento, mas o "abre sozinho só quando há `enviada`" deixa de valer depois da primeira interação.
**Suggested fix**: só gravar `aberto` quando o valor do elemento for diferente do padrão atual, e manter o bloco montado durante a recarga.

### 🟡 Página do cadastro lê tudo em toda seção, `app/(dashboard)/configuracoes/material/page.tsx:24`

**Problema**: com seções no endereço, cada clique na lateral é uma renderização do servidor, e a página chama `lerPainelMaterial`, `lerTabelasPreco` e `lerParametros` juntas, mesmo em Empenhos. `lerTabelasPreco` lê os itens do Anexo V de todos os contratos, e `lerPainelMaterial` agora faz duas consultas a mais de projeção.
**Por que importa**: com abas era uma carga só. Agora cada clique paga a leitura inteira. É só Admin e o volume é pequeno, por isso fica em menor.
**Suggested fix**: ler `tabelas` só em `anexo-v` e `sinapi`, e `parametros` só em `parametros`, usando a `secao` que a página já tem.

### 🟡 AC-29 está estreito demais para a fatia 7, `lib/material/__tests__/fatia3.db.test.ts`

**Problema**: `lerPendenciasMaterial` perdeu `faltando` e ganhou `primeiraCotacao`, `notas`, `contratosSemAnexo` e `sinapiAtrasado`, então os testes do painel mudaram de expectativa. A mudança segue o AC-19 e o AC-18, mas o AC-29 diz que os testes de `lib/material` passam sem alteração de expectativa.
**Por que importa**: quem ler o AC-29 depois vai achar que a fatia 7 o quebrou.
**Suggested fix**: registrar no `verify.md` ou no AC-29 que a leitura do painel é a exceção prevista. Nenhuma mudança de código.

### 🟡 Poucos textos fixos ainda no JSX do cadastro (AC-27), `app/(dashboard)/configuracoes/material/_components/GerirMaterial.tsx:849`, `:919`, `:938`, `:1063`

**Problema**: restaram literais: `` `${D.revogar} a designação de ${d.nome}` `` e `"Escada de limites"` nos `aria-label`, `({u.role})` e `(até ...)` nos itens dos selects, e `placeholder` de exemplo ("2026NE000123", "50.000,00", "Diretor do Foro").
**Por que importa**: foge da regra do AC-27 (todo texto novo em `mensagens.ts`). Nada quebra.
**Suggested fix**: levar esses textos para `TEXTO_CADASTRO` e `TEXTO_FORMULARIOS_CADASTRO`.

### 🟡 Dialogs reescritos sem teste do que mudou, `app/(dashboard)/cotacoes/_components/DialogMaterial.tsx`, `DialogExecucao.tsx`

**Problema**: o ramo "limite de itens no lugar do botão" e o ícone de evidência em PDF contra foto não têm teste.
**Por que importa**: é lógica de renderização simples, mas é ramo novo.
**Suggested fix**: um teste curto para cada um.

### 🟡 Troca de papel no formulário de designação mantém a faixa antiga, `app/(dashboard)/configuracoes/material/_components/GerirMaterial.tsx:893`

**Problema**: ao mudar o papel, o `userId` zera, mas `faixaId` não. Escolher aprovador com faixa, voltar para fiscal e depois para aprovador mantém a faixa antiga escolhida sem o usuário ver o que mudou. O envio já descarta `faixaId` fora do aprovador (`:756`), então não grava errado.
**Por que importa**: só estado visual confuso.
**Suggested fix**: zerar `faixaId` junto com `userId` na troca de papel.

## Nits

- ⚪ `app/(dashboard)/relatorios/material/_components/RelatorioMaterialTela.tsx:54`, o comentário "A largura de uma barra em relação à maior" ficou em cima de `ehNumero`, longe de `largura`.
- ⚪ `app/(dashboard)/relatorios/material/_components/RelatorioMaterialTela.tsx:56`, `ehNumero` decide a fonte olhando o começo do texto formatado; quebra se um texto de vazio um dia começar por dígito. Um `vazio: boolean` em `Numero` seria mais firme.
- ⚪ `e2e/cotacao-flow.spec.ts:117`, dois JSDoc seguidos acima de `CARTAO_MATERIAL`; fica só o segundo.
- ⚪ `app/(dashboard)/relatorios/material/page.tsx:27`, `atalho` do endereço é passado como veio; hoje só é comparado com a lista fixa, então é seguro, mas vale tipar como `AtalhoPeriodo | null` na página.

## Strengths

- A versão do cartão sai de `cotacao.visao`, e a `fase` vem de um `Record<SituacaoCotacao, FaseSolicitante>` completo: situação nova quebra o TypeScript. O teste de banco cobre o caso difícil do Preposto que é responsável técnico (recebe a visão da contratada, sem o nome do fiscal).
- O nome do fiscal só sai na visão TRF1 (`serializar.ts:493`), o papel vai a todos; a regra está no servidor, como pede o AC-24.
- `shared/material/cadastro.ts` e `shared/material/relatorio.ts` são funções puras pequenas, com teste direto, inclusive o desempate do atalho no primeiro mês do trimestre e em janeiro.
- `secaoDoCadastro` e o `safeParse` do período protegem os parâmetros do endereço; as duas páginas seguem atrás de `requireAdmin()`.
- A escada de faixas usa como teto o maior limite entre faixas com aprovador vigente, não o maior limite absoluto.
- "Ano atual" cabe no limite de 366 dias do schema mesmo em ano bissexto, e o dia de hoje vem de `hojeEmBelem`.
- Acessibilidade cuidada: texto para leitor de tela junto dos ícones, `aria-current` na navegação e nos atalhos, `del` com "para" oculto na revisão, alvos de 44 px.

## Test coverage

Boa. Há teste de componente para o cartão nas quatro visões, para o bloco recolhido, para `GerirMaterial` (lista, navegação, empenho, designação, escada e as três confirmações), para `TabelasPreco` e para o relatório. Há teste unitário das funções puras novas, do serializador por visão e teste de banco do cartão e do painel, mais E2E com axe nas seis seções, no relatório e a 390 px. Faltam os dois diálogos reescritos (`DialogMaterial`, `DialogExecucao`) e um teste que prove quais campos o solicitante não recebe além dos hoje conferidos.
