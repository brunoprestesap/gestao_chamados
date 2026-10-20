# Review, feat/material-fatia-3 (Fatia 4 da cotação de material), 2026-10-20

**Reviewed by**: Sonnet 5.5 (read-only review; author model not stated)
**Scope**: 31 tracked files + 5 untracked new files (Fatia 4), uncommitted vs HEAD
**Verdict**: Changes requested

## Summary

A Fatia 4 adiciona CNPJ/raiz, referências de preço (SINAPI e livre, contratada e fiscal), variação acima da referência, orçamento vencido com marca, urgência (pedido, aceite, recusa, complemento da pesquisa) e a pendência da contratada com os dois ramos. Tudo passa por `transicionar` com escrita condicional por `versao`, o dinheiro segue em centavos, a trilha continua só de inclusão e as ações novas validam com Zod e nunca lançam. A lógica central (controles puros, `pesquisaCompleta`, paridade `visaoDe`/filtro Mongo, limpeza da urgência na devolução) está correta. O ponto de atenção é uma divergência de visibilidade do técnico em relação à tabela do spec, mais uma assimetria de autorização no `encaminhar`.

## Major

### 🟠 O técnico recebe o motivo da recusa da urgência e os rótulos da decisão, `lib/material/serializar.ts:322-340` e `:405-417`

**Problem**: `ACOES_COM_MOTIVO` inclui `urgencia_recusada`, e a trilha do técnico (`visao === 'tecnico'`) devolve `motivo` e `acao` desse evento; `ultimoMotivo` (linha 372, para qualquer visão que não seja solicitante) também carrega o motivo. A tabela "Visibilidade dos campos novos" do spec diz que `urgencia.justificativa`, `motivoRecusa` e `decisao` não vão ao técnico (só a marca de urgência). O mesmo vale para os eventos `referencia_acrescentada`, `referencia_retirada` e `pesquisa_completada`: o técnico recebe a `acao` deles, e a tela mostra o rótulo ("Referência de preço acrescentada pelo fiscal", "Urgência recusada"), que revela a pesquisa de preços e a decisão do fiscal. Nenhum dos campos de valor vaza, mas o texto livre do fiscal sim.
**Why it matters**: é o vazamento que o AC-15 e o cenário "Vazamento" existem para impedir; o teste de visibilidade da Fatia 4 (`fatia4.db.test.ts:703`) cobre só contratada e solicitante, então nada pegaria isso.
**Suggested fix**: na trilha do técnico e em `ultimoMotivo` para a visão `tecnico`, tratar `urgencia_recusada` como devolução comum (motivo permitido só se o spec decidir que o motivo da devolução é suficiente; senão, omitir) e filtrar da trilha do técnico os eventos `referencia_*`, `pesquisa_completada` e o rótulo da recusa (mostrar como "Devolvida"). Acrescentar o técnico ao teste de vazamento por campo.

## Minor

### 🟡 Qualquer fiscal designado aceita a urgência e confirma os vencidos, não só o que assumiu, `lib/material/transicoes.ts:1085` e `lib/material/leitura.ts:112`

**Problem**: `encaminhar` é liberado para `fiscal && em_analise` (qualquer fiscal vigente). A checagem de "fiscal que assumiu" só roda quando há item na lista de conferência (linha 1085). Na Fatia 4 isso passa a decidir coisas novas: o aceite da urgência (grava `decididaPorUserId`) e as marcas do vencido, enquanto recusar a urgência, acrescentar e retirar referência exigem `ehOFiscalQueAssumiu`. Um segundo fiscal pode aceitar a urgência que o primeiro estava por recusar.
**Why it matters**: assimetria de autorização na mesma decisão (aceitar vs recusar). O spec fala só em "o fiscal aceita ou recusa" e não manda amarrar o aceite ao que assumiu, então pode ser intencional.
**Suggested fix**: confirmar com o dono do spec; se a decisão é do fiscal que assumiu, exigir `ehOFiscalQueAssumiu` no `encaminhar` quando houver `aceitarUrgencia`, `confirmacoes` ou urgência pedida, e refletir isso em `acoesDisponiveis.encaminhar`.

### 🟡 Corrida entre remover arquivo e completar pesquisa, `app/(dashboard)/cotacoes/actions.ts:271-305`

**Problem**: `removerArquivoAction` lê `orcamentos.arquivoId`, decide e depois faz `updateOne({_id, removidoEm: null})` sem reconferir. Se um `pesquisa_completada` ligar o arquivo entre a leitura e a escrita (duas abas do mesmo responsável técnico), o orçamento do complemento fica ligado a um arquivo removido; o envio valida arquivo ativo, o complemento valida na hora, mas nada reconfere depois.
**Why it matters**: perde a evidência de um orçamento que já está na trilha; janela curta e só autoinfligida.
**Suggested fix**: no `updateOne` do remover, condicionar a escrita (por exemplo, rechecar que nenhuma cotação tem `orcamentos.arquivoId` igual) ou aceitar e documentar a janela, como as outras já documentadas em `lib/material/AGENTS.md`.

### 🟡 `visaoDe` da rota do chamado não recebe `urgencia`, `app/api/chamados/[id]/cotacoes/route.ts:99-128`

**Problem**: o `select` e o objeto passado a `visaoDe` não incluem `urgencia`, então o ramo novo de `pendenciaDaContratada` (urgência pendente) fica cego aqui. O tipo aceita porque o campo é opcional.
**Why it matters**: hoje sem efeito prático (autorizada e executada são em trâmite e já visíveis), mas é a divergência que o teste de paridade existe para evitar; basta mudar uma regra de janela para aparecer.
**Suggested fix**: incluir `urgencia` no `select` e no objeto, ou tornar o campo obrigatório no `Pick` de `visaoDe`.

### 🟡 Lacunas de teste em caminhos de autorização e limite, `lib/material/__tests__/fatia4.db.test.ts`

**Problem**: prometidos no spec (Critical test scenarios) e sem teste visível: o 11º orçamento no complemento é recusado; arquivo de complemento já ligado não é removido; `recusarUrgenciaAction` por fiscal que não assumiu; `completarPesquisa` por quem não é responsável técnico; o definitivo recusado até a 3ª raiz (aparece só dentro do teste de fio); visibilidade do técnico.
**Why it matters**: são os ramos de autorização e de limite da fatia, justo onde o caminho feliz do verify não passa.
**Suggested fix**: acrescentar esses casos ao db test (e o do técnico ao teste de vazamento).

## Nits

- ⚪ `lib/material/transicoes.ts:1062` o complemento aceita o mesmo CNPJ de orçamento já gravado sem aviso; conta uma raiz (correto), mas a tela `CompletarPesquisa` não mostra isso ao digitar além da contagem "N de 3 empresas".
- ⚪ `app/(dashboard)/cotacoes/_components/DetalheCotacaoView.tsx` a lista `vencidos` vem do carregamento da página; se a virada do dia em Belém passar com o diálogo aberto, o servidor recusa (correto) mas a mensagem é genérica ("Há pontos que impedem o encaminhamento"). Já coberto em parte pelo item conhecido do verify.
- ⚪ `lib/material/AGENTS.md` ainda diz Fatias 1 a 3 e "Fatias 4 e 5 ainda não existem" (stale, não é achado de código; /sync resolve).

## Strengths

- Toda ação nova entra em `transicionar` (tabelas `DE`/`PARA`/`MANTEM_SITUACAO`), com escrita condicional, evento com `itensNoAto` e rollback; a guarda `de !== para` em `aplicarEfeitos` evita retomar pausa no complemento.
- Controles puros e pequenos em `controles.ts`, com `raizesDoItem`/`menorReferencia` compartilhados entre cliente e servidor; o preço SINAPI nunca vem da entrada e é recopiado no envio; as do fiscal sobrevivem ao salvar, à reclassificação e à devolução.
- Pendência da contratada com as duas formas lado a lado em `pendencia.ts`, e `FILTRO_NOTA_FISCAL_PENDENTE` separado para a aba Ateste sem regredir o AC-21.
- Limpeza da urgência na devolução (comum, recusa e `alterar`) e conversão do complemento em `envio` no mesmo update; `pesquisaCompletaEm` recalculado a cada envio.

## Test coverage

Boa para a lógica pura (`fatia4.test.ts`: CNPJ, envio, urgência, variação, vencido, divergência, pendência, data de Belém, schemas) e para o fio completo no banco (`fatia4.db.test.ts`: CNPJ, referências SINAPI e do fiscal, vencido com devolução, urgência de ponta a ponta com avisos, recusa, `alterar`, urgência já completa, PDF, visibilidade da contratada e do solicitante; mais paridade em `pendencia.db.test.ts`). Faltam os casos listados no item Minor acima, principalmente a visibilidade do técnico, que é onde está o achado principal.
