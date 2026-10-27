# Review, feat/material-redesign-fatia-6, 2026-10-23

**Reviewed by**: Claude Sonnet 5.5 (autor em outro modelo)
**Scope**: 32 arquivos, branch contra main (merge base e585840)
**Verdict**: Approve with nits

## Resumo

A branch entrega o cartão da cotação no chamado por visão (fatia 6), o cadastro de material em seções no endereço com lista da primeira cotação, cartões de empenho, designações por papel, escada de faixas, confirmações, revisão de importação e parâmetros com unidade (fatia 7), e o relatório com atalhos de período, quatro números, barras e pontos de atenção (fatia 8), mais o desempate do atalho pelo endereço. O código é limpo, os textos vão para `shared/material/mensagens.ts`, a escolha da visão sai de `cotacao.visao` e as regras de `lib/material` não mudaram. Não achei bloqueio nem problema grave. Os pontos abaixo são menores e vão do contrato de dados do solicitante a detalhes de acabamento.

Eu li o ESLint nos arquivos tocados: zero erros, só avisos de `set-state-in-effect` que já eram o padrão do projeto.

## Os quatro pontos da verificação em tempo de execução

- (a) Confirmado, menor. Veja "Solicitante recebe mais do que a fase" abaixo.
- (b) Confirmado, menor. O botão de fechar vem de `components/ui/dialog.tsx` e diz "Close" em inglês.
- (c) Não consegui confirmar sem rodar a tela. Veja "Sheet da gestão mais largo que o painel". Tratei como menor.
- (d) Descartado. `?secao=` passa por `secaoDoCadastro`, que só aceita as seis seções e cai em `empenhos`. `?inicio=` e `?fim=` passam por `PeriodoRelatorioMaterialSchema.safeParse`. `?atalho=` só é comparado com a lista fixa dos três atalhos em `atalhoDoPeriodo`, nunca entra em consulta nem em texto. As duas páginas continuam atrás de `requireAdmin()`.

## Menores

### 🟡 Solicitante recebe mais do que a fase, `lib/material/serializar.ts:453`

**Problema**: para o solicitante, `serializarCotacao` devolve o bloco base inteiro mais `fase`. O bloco base traz `id`, `numero`, `chamadoId`, `situacao` crua, `emTramite`, `versao`, `criadaEm` e `atualizadaEm`. O AC-24 diz que o solicitante recebe só a fase e a frase, e o invariante da spec diz que nenhum componente esconde dado só na tela. Hoje `CartaoSolicitante` simplesmente não usa o número, e o E2E confere que o número não aparece na tela, mas ele está no JSON da rota `/api/chamados/[id]/cotacao-material`.
**Por que importa**: a `situacao` crua desfaz a regra de agrupamento da spec (devolvida some dentro de "Pedido", reprovada e cancelada viram "encerrada" sem diferença). Não é dado sensível e é do próprio chamado do solicitante, então não é grave. Mas a spec promete o contrário, e a frase "a visibilidade de hoje não muda" na mesma spec cria a ambiguidade.
**Suggested fix**: decidir qual das duas frases vale. Se vale "só a fase e a frase", o ramo do solicitante devolve só `{ visao, fase }` (mais `id` se a tela precisar) e o teste de `serializar.test.ts` passa a afirmar que `situacao`, `numero` e `versao` não vêm. Se vale "como hoje", ajustar o texto do AC-24.

### 🟡 Botão de fechar dos diálogos se anuncia em inglês, `components/ui/dialog.tsx:67`

**Problema**: o `DialogContent` do shadcn tem `<span className="sr-only">Close</span>`. Todos os diálogos do módulo (execução, material, confirmações, empenho, designação, revisão) herdam isso, então o leitor de tela diz "Close" no meio de uma tela em português, ao lado de um botão "Cancelar".
**Por que importa**: AC-11 e AC-27 pedem rótulos padronizados em português. O axe não pega isso, e o E2E só roda o axe no cartão do chamado e nas telas, não dentro dos diálogos abertos.
**Suggested fix**: trocar o texto para "Fechar" no componente (afeta o app inteiro, de forma correta), ou passar `showCloseButton={false}` nos diálogos do módulo, já que todos têm o botão "Cancelar".

### 🟡 Sheet da gestão mais largo que o painel (a 1280 px), `app/(dashboard)/gestao/_components/ChamadoDetailSheet.tsx:495`

**Problema**: a verificação mediu o conteúdo 49 px mais largo que o sheet (720 contra 671). Não rodei a tela, então a causa abaixo é hipótese. O conteúdo fica dentro do `ScrollArea` do Radix, cujo viewport embrulha tudo num `display: table`, e nesse caso um filho com `truncate` (texto sem quebra) alarga o contêiner em vez de cortar. O cartão do técnico tem `<span className="min-w-0 truncate">` na lista de itens (`CartaoCotacaoMaterial.tsx`, `CorpoTecnico`), e o bloco recolhido da cotação antiga também mexe nesse espaço.
**Por que importa**: no sheet o texto pode vazar para a direita ou gerar rolagem horizontal, o oposto do AC-25.
**Suggested fix**: reproduzir a 1280 px com um item de descrição longa e achar o filho que alarga. Se for o `table` do viewport, dar `[&>div]:!block` ao `ScrollArea` do sheet ou um `max-w-full` no cartão.

### 🟡 Bloco "Histórico: sistema anterior" some e volta a cada recarga, `app/(dashboard)/gestao/_components/CotacaoApprovalCard.tsx:157` e `:349`

**Problema**: com `recolhido`, `if (loading && recolhido) return null` desmonta o bloco inteiro em toda recarga (depois de aprovar ou recusar, `fetchCotacoes` põe `loading` em `true`). Além disso, `onToggle` grava `aberto` com o estado do elemento; o navegador dispara `toggle` também quando o `open` inicial vem do `active != null`, então `aberto` pode ficar preso em `true` sem ninguém ter clicado. Aí, depois de aprovar a única cotação `enviada`, o bloco não volta a recolher sozinho, contra o AC-17.
**Por que importa**: é só acabamento, mas o comportamento "abre sozinho só quando há `enviada`" deixa de valer depois da primeira interação.
**Suggested fix**: só gravar `aberto` quando o toggle vier de ação do usuário (por exemplo, comparar `e.currentTarget.open` com o valor padrão atual antes de gravar), e manter o bloco montado durante a recarga em vez de devolver `null`.

### 🟡 Teste de lib/material teve a expectativa mudada, `lib/material/__tests__/fatia3.db.test.ts:824`

**Problema**: o AC-29 diz que os testes de `lib/material` passam sem alteração de expectativa. Aqui os testes do painel mudaram porque `lerPendenciasMaterial` perdeu `faltando` e ganhou `primeiraCotacao`, `notas`, `contratosSemAnexo` e `sinapiAtrasado`. A própria tabela da spec (linha de `lerPendenciasMaterial`) e a fatia 7 pedem essa ampliação, então o código está de acordo com a spec, e o AC-29 é que está estreito demais.
**Por que importa**: quem ler o AC-29 depois vai achar que a fatia 7 o quebrou.
**Suggested fix**: registrar no `verify.md` ou no AC-29 que a leitura do painel é a exceção prevista. Nenhuma mudança de código.

### 🟡 Textos fixos que ficaram nos componentes (AC-27), `app/(dashboard)/configuracoes/material/_components/GerirMaterial.tsx:469`, `:749`, `:999`; `TabelasPreco.tsx`

**Problema**: arquivos reescritos mantêm literais dentro do JSX e das chamadas: toasts "Empenho cadastrado.", "Designação registrada.", "Faixa criada.", "Informe o valor em reais, como 12.345,67.", descrições dos diálogos de novo empenho e nova designação, o "Layout do arquivo" e as frases do envio de CSV em `TabelasPreco.tsx`, e os rótulos "Número", "Exercício", "Cadastrar", "Designar", "Registrar". O AC-27 pede todo texto novo ou reescrito em `mensagens.ts`.
**Por que importa**: o texto fica espalhado e foge da regra do módulo. Nada quebra.
**Suggested fix**: levar esses literais para `TEXTO_CADASTRO` e `TEXTO_CADASTRO_TABELAS`.

### 🟡 Formulários de novo empenho e nova designação não zeram depois de gravar, `app/(dashboard)/configuracoes/material/_components/GerirMaterial.tsx:455` e `:738`

**Problema**: `criar()` fecha o diálogo no sucesso, mas `form` fica com os valores digitados. Ao abrir de novo, o número, o valor e a pessoa do cadastro anterior continuam lá. A faixa já zera (`setForm({ nome: '', limite: '' })`), então o comportamento é inconsistente entre as seções.
**Por que importa**: dá para cadastrar o mesmo empenho duas vezes por descuido (o servidor deve recusar o número repetido, mas o usuário vê a repetição antes).
**Suggested fix**: zerar o estado no callback de sucesso, como a faixa faz.

### 🟡 O cadastro lê todos os dados em toda seção, `app/(dashboard)/configuracoes/material/page.tsx:24`

**Problema**: com seções no endereço, cada navegação é uma renderização do servidor, mas a página continua chamando `lerPainelMaterial`, `lerTabelasPreco` e `lerParametros` juntas, mesmo na seção Empenhos. `lerTabelasPreco` lê os itens de todos os contratos do Anexo V. `lerPainelMaterial` agora também faz duas consultas extras de projeção.
**Por que importa**: era assim com abas (tudo de uma vez, uma carga só). Agora cada clique na lateral paga a leitura inteira de novo. É só Admin e o volume é pequeno, por isso fica em menor.
**Suggested fix**: ler `tabelas` só nas seções `anexo-v` e `sinapi`, e `parametros` só em `parametros`, usando a `secao` que a página já tem.

### 🟡 Textos e diálogos novos sem teste de componente, `app/(dashboard)/cotacoes/_components/DialogMaterial.tsx`, `DialogExecucao.tsx`

**Problema**: a rota, o serializador, o cartão nas quatro visões, a lista da primeira cotação, a escada, as confirmações, a revisão de importação e o relatório têm testes. `DialogMaterial` e `DialogExecucao` foram reescritos (cartão por item, ícone do tipo de evidência, limite de itens com texto no lugar do botão) e só o teste antigo de anexar evidência os cobre. O ramo `linhas.length >= MAX_ITENS_COTACAO` e o ícone PDF contra foto não têm teste.
**Por que importa**: é lógica de renderização simples, mas é ramo novo.
**Suggested fix**: um teste curto para o limite de itens e outro para a evidência em PDF.

## Nits

- ⚪ `app/(dashboard)/relatorios/material/_components/RelatorioMaterialTela.tsx:54`, o comentário "A largura de uma barra em relação à maior" ficou grudado em cima do `ehNumero` e longe da função `largura`, que é a que ele descreve.
- ⚪ `app/(dashboard)/relatorios/material/_components/RelatorioMaterialTela.tsx:56`, `ehNumero` decide o tamanho da fonte olhando o início do texto formatado (`R$`, `-`, dígito). Funciona, mas quebra se um texto de vazio um dia começar por número. Passar um `vazio: boolean` para `Numero` seria mais firme.
- ⚪ `e2e/cotacao-flow.spec.ts:117`, o JSDoc `O cartão "Material" da tela do chamado` ficou duplicado e solto acima da constante `CARTAO_MATERIAL`.
- ⚪ `app/(dashboard)/cotacoes/_components/DialogMaterial.tsx:83`, aviso do ESLint de `_id` sem uso (se já era assim antes, deixar).

## Strengths

- A escolha da versão do cartão sai de `cotacao.visao`, com `fase` montada no serializador a partir de um `Record<SituacaoCotacao, FaseSolicitante>` completo. Se alguém criar uma situação nova, o TypeScript trava. Os testes cobrem as dez situações e a ausência de `fase` nas outras visões.
- O teste de banco de `cartaoDoChamado` (fatia4.db) confere o caso difícil: o Preposto que é responsável técnico recebe o cartão da contratada, sem o nome do fiscal, e o solicitante não recebe `quemAgeAgora`, `itens` nem `montadoPorNome`.
- `shared/material/cadastro.ts` e `shared/material/relatorio.ts` são funções puras pequenas (`secaoDoCadastro`, `escadaDeFaixas`, `periodosDosAtalhos`, `atalhoDoPeriodo`) com testes diretos, inclusive o desempate do atalho no primeiro mês do trimestre e em janeiro, que era o defeito encontrado na verificação.
- A escada de faixas calcula o teto como o maior limite entre faixas que têm aprovador vigente, não o maior limite absoluto, e o teste prova a diferença.
- A lista "Para aprovar a primeira cotação" vem de um único `lerPendenciasMaterial` no servidor, com a seção de cada item, e os textos de "caminho 1" e "caminho 2" saíram de verdade (há teste de varredura nos textos do cadastro).
- Os componentes novos cuidam de acessibilidade: texto só para leitor de tela junto do ícone de pronto e falta, `aria-current` na navegação e nos atalhos, `del` e `sr-only` para "de X para Y" na revisão, alvos de 44 px.

## Test coverage

Com o sinal `configured`, a cobertura é boa. Há teste de componente (Testing Library com jsdom) para o cartão nas quatro visões, para o bloco recolhido (aberto com `enviada`, fechado só com histórico, vazio sem nada), para GerirMaterial (lista, navegação, empenho, designação, escada, as três confirmações), para a revisão de importação (filtros, valor riscado, avisos) e para o relatório (atalhos, período inválido, barras, pontos de atenção, vazio). Há teste unitário das funções puras novas, teste de serializador por visão, teste de banco do cartão por visão e do painel, e E2E com axe nas seis seções e no relatório, no desktop e a 390 px. O que falta é pequeno: `DialogMaterial` e `DialogExecucao` sem teste do que mudou, e o axe do E2E não abre os diálogos, por isso o "Close" em inglês passou.
