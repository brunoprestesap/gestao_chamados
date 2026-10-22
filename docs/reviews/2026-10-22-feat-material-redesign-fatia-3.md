# Review, feat/material-redesign-fatia-3, 2026-10-22

**Reviewed by**: Claude Sonnet 5.5 (revisor sem acesso de escrita ao código)
**Scope**: 9 arquivos, branch contra main (PR #82)
**Verdict**: Approve with nits

## Summary

A fatia 3 troca o ateste antigo por três etapas com estado, prazo e atraso, uma tabela do autorizado contra o aplicado por item e a lista de evidências com ícone. Os registros agora abrem direto do painel "Sua vez". O código é limpo, respeita a visão por perfil (prazo e atraso só para o TRF1, nome de quem recebeu só para o TRF1) e mantém a regra da nota fiscal (conferência, anexo solto removido). Não achei bloqueio nem problema grande. Ficam alguns pontos menores: texto fixo fora de `mensagens.ts`, total autorizado que pode diferir do valor autorizado gravado, e o `scope.md` marcado como feito antes de o E2E rodar.

## Minor

### 🟡 Texto fixo na conferência da nota fiscal, `app/(dashboard)/cotacoes/_components/ateste/DialogNotaFiscal.tsx:133`

**Problem**: A frase "Confira antes de registrar: nota nº ..., emitida em ..., arquivo ..." está escrita direto no componente.
**Why it matters**: O AC-27 e a regra do módulo mandam todo texto ficar em `shared/material/mensagens.ts`. O resto do arquivo já usa `TEXTO_ATESTE`, então esta frase destoa e escapa de qualquer revisão de texto feita num lugar só.
**Suggested fix**: Criar uma função em `TEXTO_ATESTE` (por exemplo `conferencia(numero, data, arquivo)`) e usá-la aqui. O teste que confere "nota nº 4321, emitida em 18/10/2026, arquivo nf.pdf" continua valendo.

### 🟡 Total autorizado calculado na tela pode divergir do valor autorizado gravado, `app/(dashboard)/cotacoes/_components/ateste/TabelaAplicado.tsx:47`

**Problem**: O total autorizado do rodapé soma `quantidade × precoAplicadoCentavos` dos itens e trata item sem preço como zero. A cotação já traz `valorAutorizadoCentavos` (gravado na aprovação), que não é usado aqui.
**Why it matters**: Se algum item estiver sem preço, ou se o autorizado gravado considerar algo além da soma das linhas, o rodapé mostra um número diferente do que o gestor aprovou, sem aviso. É o número que o leitor compara com o "aplicado".
**Suggested fix**: Mostrar `valorAutorizadoCentavos` no rodapé quando existir, ou deixar claro (texto ou marca) quando houver item "sem preço" que ficou fora da soma. Vale um teste com item sem preço.

### 🟡 Diferença de quantidade só aparece por cor e peso, `app/(dashboard)/cotacoes/_components/ateste/TabelaAplicado.tsx:98`

**Problem**: A quantidade aplicada que difere da autorizada fica em índigo e negrito, sem nenhuma pista em texto.
**Why it matters**: Quem não distingue cor ou usa leitor de tela não percebe a diferença (WCAG 1.4.1, AC-26). O axe não pega isso.
**Suggested fix**: Acrescentar um texto curto escondido para leitor de tela e/ou um marcador visível (por exemplo "diferente do autorizado"), vindo de `mensagens.ts`.

### 🟡 O diálogo abre pelo estado local, sem conferir `acoes`, `app/(dashboard)/cotacoes/_components/AtesteCotacao.tsx:253` e `:279`

**Problem**: Os diálogos de recebimento e de nota fiscal ficam abertos enquanto `pedido` estiver preenchido, mesmo que, depois de um `router.refresh()`, a ação deixe de estar liberada (por exemplo, outro gestor registrou antes). O componente antigo recebia `acoes` e escondia os botões.
**Why it matters**: O servidor recusa a ação, então não há risco de segurança, mas o usuário vê um diálogo para algo que já não é dele e só descobre pelo toast de erro. No caminho de erro de `receber` o diálogo também fica aberto (só chama `onAlterado`).
**Suggested fix**: Em `DetalheCotacaoView`, limpar `pedidoAteste` quando a ação correspondente de `acoes` virar falsa, ou fechar o diálogo no erro depois do refresh.

### 🟡 `scope.md` marcado como feito antes do E2E rodar, `docs/scope/scope.md:415`

**Problem**: A linha das fatias 1 a 3 foi marcada `[x]`, mas em `verify.md` o passo do `npm run test:e2e -- cotacao-flow` e todos os passos de UI/manual da fatia 3 ainda estão sem marca.
**Why it matters**: O escopo passa a dizer que a entrega está verificada quando só os testes unitários, o tipo e o lint passaram.
**Suggested fix**: Marcar `[x]` só depois do `/check verify` (E2E e passos manuais), ou deixar a linha pendente até lá.

## Nits

- ⚪ `app/(dashboard)/cotacoes/_components/AtesteCotacao.tsx:36`, `dataHora` e `dataCurta` estão repetidos aqui, em `ateste/TabelaAplicado.tsx:20` e em `ateste/DialogNotaFiscal.tsx:29`; vale mover para `apoio.tsx`.
- ⚪ `app/(dashboard)/cotacoes/_components/AtesteCotacao.tsx:22`, `diaEmBelem` é exportado do arquivo do diálogo e importado pelo pai; é um utilitário de data e ficaria melhor em `apoio.tsx`.
- ⚪ `app/(dashboard)/cotacoes/_components/AtesteCotacao.tsx:257`, durante a animação de fechar o diálogo de recebimento, `recebimento` vira `null` e o título troca para "provisório"; guardar o último valor evita o piscar.
- ⚪ `app/(dashboard)/cotacoes/_components/ateste/TabelaAplicado.tsx:104`, quantidade aplicada nula aparece como 0 e R$ 0,00; em cotação executada isso não deve ocorrer, mas um traço seria mais honesto.

## Strengths

- A visão por perfil está certa: prazo e atraso só saem de `prazoAteste` (TRF1), a contratada vê "Aguardando o TRF1." e as datas sem o nome de quem recebeu.
- A regra da nota fiscal foi preservada na troca de tela: conferência antes de gravar, anexo solto removido ao trocar ou desistir, reaproveitamento do mais recente ao reabrir, limites de data por Belém.
- A mudança de `ancoraPrincipal` para abrir o diálogo direto do painel é pequena e mantém `acoesDisponiveis` como fonte do que aparece.
- `CaixaRolavel` com foco por teclado e rótulo, `aria-current` na etapa da vez e lista com nome acessível; o E2E ganhou checagem de axe e o fluxo do provisório pelo painel.

## Test coverage

`AtesteCotacao.test.tsx` cobre etapa atrasada, ocultação antes da execução, confirmação do provisório, conferência da nota, limites de data (incluindo fuso de Belém), a contratada sem nome de quem recebeu, e a remoção e reaproveitamento de anexos. Pelo que li, falta teste direto de `TabelaAplicado` com item sem preço e com quantidade diferente (ligado ao ponto do total autorizado), e do estado "Atrasado 1 dia". O E2E novo cobre o provisório pelo painel, mas não o definitivo nem a nota fiscal; o próprio `verify.md` deixa o E2E desta fatia sem marca.
