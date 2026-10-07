# 0015. Candidatos à substituição de ativo

**Date**: 2026-10-06
**Status**: Accepted

## Summary

Esta é a primeira parte da fatia 5 da gestão de ativos (spec 0011). O Sigma passa a apontar sozinho os equipamentos que valem uma conversa sobre troca: os que já passaram da vida útil da categoria, os que tiveram corretivos demais em 12 meses e os que voltaram a quebrar várias vezes em 90 dias. Basta um desses critérios para o ativo virar candidato, e a tela sempre diz qual bateu. Nada é gravado para dizer "é candidato": a conta é refeita a cada leitura, a partir dos mesmos números que a ficha já mostra (spec 0014). O Admin vê a lista no IMR, o Preposto filtra na lista de ativos, os dois veem um selo na ficha e podem dispensar um candidato por 6 meses com um motivo. O ativo dispensado volta antes do prazo se surgir um critério que não valia na dispensa.

## Requirements

**User stories**:

- Como Admin, quero ver quais equipamentos já passaram da hora de trocar, e por quê, para levar a substituição ao planejamento de compras com números em vez de impressão.
- Como Preposto, quero filtrar na lista de ativos os candidatos à substituição e abrir a ficha de cada um, para conferir no local antes de propor a troca.
- Como Admin ou Preposto, quero dispensar um candidato que já avaliei, com o motivo, para a lista mostrar só o que ainda pede atenção, sem perder o rastro da decisão.
- Como Admin, quero ajustar por categoria quantos corretivos contam como "demais", porque um elevador e uma copa não quebram no mesmo ritmo.

**Acceptance criteria**:

_A regra_

- **AC-1**: Quem pode ser candidato. Só ativo de `tierManutencao` em `TIERS_VINCULAVEIS` (`A` e `B`, a constante que já existe) com `status` fora de `baixado` e `aguardando_baixa` (constante nova `STATUS_FORA_DA_SUBSTITUICAO`). `em_operacao`, `em_manutencao` e `inoperante` entram. Ativo fora disso nunca aparece em nenhuma das três telas, nem com dispensa gravada.
- **AC-2**: Critério de idade. A data de referência é `dataInstalacao` quando preenchida, senão `camposPatrimoniais.dataTombo`. A vida útil é `CategoriaAtivo.vidaUtilAnos`. A data de referência vira dia em Belém por `hojeEmBelem(data)` (o mesmo apoio aplicado à data gravada, para uma data salva às 21:00 de Belém não cair no dia seguinte). O critério bate quando `hojeEmBelem()` é igual ou posterior a `somarAnos(diaDeReferencia, vidaUtilAnos)` (29 de fevereiro somado vira 28 de fevereiro), comparando só o dia, nunca a hora. `vidaUtilAnos` já é inteiro pelo schema da categoria. Sem data de referência ou sem `vidaUtilAnos`, o critério não é avaliado (não bate), e a ficha diz o que falta ("Idade não avaliada: a categoria não tem vida útil" ou "Idade não avaliada: o ativo não tem data de instalação nem de tombo"). A idade mostrada é a quantidade de anos completos até hoje (`anosCompletos`). Os rótulos usam singular e plural ("1 ano", "14 anos", "1 corretivo", "5 corretivos"), por um apoio único em `shared/ativos/substituicao.constants.ts`.
- **AC-3**: Critério de corretivos. Bate quando os corretivos dos últimos 12 meses são iguais ou maiores que o limite da categoria (AC-6). O número é o mesmo `corretivos12m` da linha de indicadores da ficha (spec 0014, AC-20): corretivo é chamado com o ativo, sem `originTemplateId` e fora de `STATUS_FORA_DO_CORRETIVO`, contado por `createdAt` numa janela de 365 dias corridos (não 12 meses de calendário) que termina em `fimDoDiaEmBelem()`. A janela sai de um apoio novo `janelaDeHoje(agora)` em `indicadores.ts`, que `indicadoresDoAtivo` passa a usar também, para a ficha e a leitura em lote nunca divergirem.
- **AC-4**: Critério de reincidência. Bate quando os corretivos dos últimos 90 dias (o mesmo `corretivos90d` da ficha, a janela de reincidência de `janelaDoPeriodo`, terminando em `fimDoDiaEmBelem()`) são iguais ou maiores que o limite de reincidência da categoria (AC-6).
- **AC-5**: Combinação. Qualquer critério que bata faz o ativo candidato. Cada candidato leva a lista dos critérios que bateram (`idade`, `corretivos`, `reincidencia`) com os números de cada um: idade e vida útil; corretivos e limite; reincidências e limite. As listas ordenam por quantidade de critérios (mais primeiro), depois por `corretivos12m` (mais primeiro), depois pelo `codigo` em ordem numérica (o mesmo comparador de `lista.ts`, exportado). Isso vale para o IMR; a lista `/ativos` filtrada mantém a ordem por código de sempre.
- **AC-6**: Limites por categoria. `CategoriaAtivo` ganha `limiteCorretivos12m` e `limiteReincidencia90d`, inteiros de 1 a 99, opcionais. Vazio usa o padrão do sistema: 4 corretivos em 12 meses e 3 em 90 dias (`LIMITE_CORRETIVOS_12M_PADRAO`, `LIMITE_REINCIDENCIA_90D_PADRAO`). Só o Admin edita, na tela `/configuracoes/categorias-ativo`, ao lado da vida útil, e o formulário mostra o padrão como dica quando o campo está vazio. Campo vazio grava `null` (nunca 0), inclusive ao limpar um valor na edição; valor fora de 1 a 99 ou não inteiro devolve "Limite de corretivos inválido." ou "Limite de reincidência inválido.". A lista de categorias mostra os dois limites (ou "padrão"). Mudar um limite muda a lista na próxima leitura, sem migração.
- **AC-7**: Sempre até hoje. A janela de 12 meses e 90 dias e a data de "hoje" nunca dependem do período escolhido no IMR. A lista do IMR, o filtro da lista de ativos e o selo da ficha dão o mesmo resultado para o mesmo ativo no mesmo dia.

_Onde aparece_

- **AC-8**: IMR. Na aba Ativos do IMR (só Admin, como o resto do relatório), uma seção "Candidatos à substituição" depois do ranking. Ela segue o seletor de tipo da aba: "Todos" mostra todos os candidatos; cada tipo mostra os candidatos cuja categoria tem `serviceSubTypeId` de um subtipo daquele tipo (o nome do `ServiceType` passa por `tipoServicoDoNomeDoTipo`). Categoria sem subtipo aparece só em "Todos". Cada linha mostra código (link para a ficha), descrição, categoria, caminho do local (ou "Sem local"), os motivos em texto curto ("14 anos, vida útil 10", "5 corretivos em 12 meses, limite 4", "3 em 90 dias, limite 3") e o botão Dispensar (AC-11). O servidor manda uma lista plana, cada linha com seu `tipoServico` (ou `null`), e o cliente filtra pelo seletor, como o resto da aba. Abaixo da tabela, "N dispensados" (contados no mesmo recorte do seletor) com link para a lista de ativos filtrada por dispensados (AC-9); com zero, a linha não aparece. Sem candidatos, a seção mostra "Nenhum equipamento sinalizado para substituição." Uma falha na leitura dos candidatos não derruba o IMR: a seção mostra "Não foi possível calcular os candidatos agora." e o erro vai para `console.error`, como os indicadores da 0014.
- **AC-9**: Lista de ativos. O filtro da lista `/ativos` ganha o campo "Substituição" com as opções "Candidatos à substituição" e "Candidatos dispensados" (parâmetro `substituicao=candidatos|dispensados`), visível só para Admin e Preposto. O filtro se combina com os outros (busca, local, categoria, status, cadastro) e com a paginação de hoje. Para técnico o parâmetro é ignorado no servidor, mesmo digitado na URL: a página confere `canManage(sessao.role)` antes de calcular qualquer coisa, e `listarAtivos` ganha a opção `ids?: string[]` (vira `_id: { $in }` no filtro de sempre). "Candidatos dispensados" lista só quem está na situação dispensado; ativo com dispensa vencida ou derrubada aparece em "Candidatos".
- **AC-10**: Ficha. Para Admin e Preposto, a ficha mostra a situação de substituição: candidato (selo âmbar "Candidato à substituição" com os motivos), dispensado (selo neutro "Substituição dispensada até dd/mm/aaaa", com motivo, quem e quando) ou nada quando não é candidato. Se a idade não foi avaliada, a nota do AC-2 aparece junto, mesmo sem selo. Para técnico e solicitante a ficha não mostra nada disso, e o objeto `substituicao` não sai do servidor (recortado em `carregarFicha`, como `camposPatrimoniais`). A ficha não consulta os chamados de novo: `carregarFicha` passa os `indicadores` que já calculou para `avaliarSubstituicao`, então o selo e a linha de indicadores usam os mesmos números por construção. Se os indicadores falharam (`null`), a seção mostra "Não foi possível avaliar a substituição agora." e não mostra os botões.

_A dispensa_

- **AC-11**: Dispensar. Admin e Preposto dispensam pela ficha; o Admin também pela linha do IMR. Um diálogo pede o motivo, texto obrigatório de 10 a 500 caracteres depois de tirar os espaços das pontas. A dispensa grava em `Ativo.dispensaSubstituicao`: `ate` (hoje em Belém mais 6 meses de calendário por `somarMeses`, que leva ao último dia do mês de destino quando o dia não existe nele, como 30 de agosto para 28 de fevereiro; gravado como dia sem hora em meia noite UTC), `motivo`, `porUserId`, `em` e `motivosNaDispensa` (os critérios que batiam no momento, recalculados no servidor). A escrita grava `AtivoHistory` `dispensa_substituicao` com `observacao` no formato "Até dd/mm/aaaa · critérios: idade, corretivos" (e "· substitui a dispensa até dd/mm/aaaa" quando sobrescreve uma que não valia mais), sem o texto do motivo: o histórico é visível ao técnico, e o motivo só sai do servidor para a gestão. Passa por `gravarHistoricoOuDesfazer`. Depois, a ficha, a lista e o IMR são revalidados. O mesmo componente `DialogoDispensaSubstituicao` serve à ficha e ao IMR.
- **AC-12**: Dispensa vigente. A dispensa vale enquanto `hojeEmBelem()` é anterior a `paraYmd(ate)` e todos os critérios que batem hoje estão em `motivosNaDispensa`. Um critério novo (por exemplo, dispensado só por idade e agora com corretivos acima do limite) devolve o ativo à lista de candidatos no mesmo dia; mais corretivos no mesmo critério não devolvem, e um critério que estava na dispensa, deixou de bater e voltou a bater antes do prazo também não devolve (risco aceito: o critério já tinha sido avaliado). Vencido o prazo, o ativo que ainda bate algum critério volta a ser candidato. A dispensa que deixou de valer continua gravada até ser substituída por outra ou desfeita, e a ficha do candidato mostra "Dispensado antes até dd/mm/aaaa" quando ela existe.
- **AC-13**: Conferência no servidor. Ao confirmar a dispensa, o servidor recalcula a situação. Se o ativo não é mais candidato (saiu do AC-1, um corretivo saiu da janela, o limite mudou) ou já tem dispensa vigente, nada é gravado e a ação devolve "Este ativo não é mais candidato à substituição." ou "Este ativo já foi dispensado por <nome>." (`<nome>` é o `User.name` do `porUserId` gravado), e a tela recarrega. Uma dispensa gravada que não vale mais (vencida, ou derrubada por critério novo) não impede: a nova a sobrescreve.
- **AC-14**: A primeira dispensa vale. Duas dispensas ao mesmo tempo no mesmo ativo: a escrita é condicional à dispensa lida, com um filtro só, escolhido pelo que foi lido: sem dispensa lida, `{ _id, dispensaSubstituicao: { $exists: false } }`; com dispensa lida (uma que não vale mais), `{ _id, 'dispensaSubstituicao.em': emLido }` (o `em` exatamente como veio do banco). Só a primeira grava. Um `$or` com as duas condições não serve: deixaria gravar depois de alguém desfazer a dispensa no meio, o caso que precisa devolver "O ativo mudou". Com `matchedCount` zero, o servidor relê o ativo: com dispensa, devolve "Este ativo já foi dispensado por <nome>."; sem dispensa (alguém desfez no meio), devolve "O ativo mudou enquanto você confirmava. Tente de novo.". Em nenhum dos dois casos um `AtivoHistory` a mais é criado. Se o histórico falhar depois da escrita, o desfazer devolve o subdocumento anterior (ou `$unset`, se não havia), com a condição `'dispensaSubstituicao.em': emNovo`, para nunca apagar a dispensa de outra pessoa.
- **AC-15**: Voltar a sinalizar. Admin e Preposto desfazem uma dispensa vigente pela ficha (botão "Voltar a sinalizar", com confirmação). A ação apaga `dispensaSubstituicao` (`$unset`, condicional ao `em` lido) e grava `AtivoHistory` `dispensa_substituicao_desfeita` (`observacao` "Dispensa até dd/mm/aaaa desfeita"). Se o histórico falhar, o desfazer grava o subdocumento anterior de volta com a condição `dispensaSubstituicao: { $exists: false }`. Sem dispensa vigente, devolve "Este ativo não tem dispensa em vigor." sem gravar nada.
- **AC-16**: Só informativo. Ser candidato, dispensar ou voltar a sinalizar nunca muda `status`, categoria, criticidade, tier nem qualquer outro campo do ativo além de `dispensaSubstituicao`, nunca mexe em chamado e não cria `Notification`, e-mail nem evento do Socket.IO.
- **AC-17**: Permissão. As ações de dispensar e de voltar a sinalizar conferem `canManage(sessao.role)` (nunca uma lista de papéis escrita à mão) e recusam técnico e solicitante com `{ ok: false, error: 'Sem permissão para esta ação.' }`, e o Preposto que chama a ação pelo IMR passa (a regra é do papel, não da tela). A edição dos limites recusa quem não é Admin, como o resto da categoria.

## Decision

**Chosen option**: Option 1: Regra calculada na leitura, com dispensa gravada no ativo

Os candidatos são calculados a cada leitura por uma função pura sobre os números que a ficha já usa e os limites da categoria, e a única coisa gravada é a dispensa, como subdocumento do próprio `Ativo`, com histórico e escrita condicional.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

| Entidade         | Campo                   | Tipo                                                | Regra                                                                    |
| ---------------- | ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `CategoriaAtivo` | `limiteCorretivos12m`   | `Number`, default `null`, `min: 1`, `max: 99`       | `null` usa `LIMITE_CORRETIVOS_12M_PADRAO` (4)                            |
| `CategoriaAtivo` | `limiteReincidencia90d` | `Number`, default `null`, `min: 1`, `max: 99`       | `null` usa `LIMITE_REINCIDENCIA_90D_PADRAO` (3)                          |
| `Ativo`          | `dispensaSubstituicao`  | subdocumento, `default: undefined`, `_id: false`    | só a dispensa mais recente; as anteriores ficam no `AtivoHistory`        |
| ↳                | `ate`                   | `Date`, obrigatório                                 | dia sem hora (meia noite UTC), `em` mais 6 meses de calendário em Belém  |
| ↳                | `motivo`                | `String`, obrigatório, `trim`, 10 a 500             |                                                                          |
| ↳                | `porUserId`             | `ObjectId` → `User`, obrigatório                    |                                                                          |
| ↳                | `em`                    | `Date`, obrigatório                                 | instante da gravação; serve de versão para a escrita condicional (AC-14) |
| ↳                | `motivosNaDispensa`     | `[String]` em `CRITERIOS_SUBSTITUICAO`, ao menos um | `idade`, `corretivos`, `reincidencia`                                    |
| `AtivoHistory`   | `acao`                  | duas entradas novas em `ATIVO_HISTORY_ACOES`        | `dispensa_substituicao`, `dispensa_substituicao_desfeita`, com rótulos   |

Relações: `Ativo` N:1 `CategoriaAtivo` (já existe); `dispensaSubstituicao.porUserId` N:1 `User`. Nenhum índice novo: a leitura parte dos ativos Tier A e B (centenas) e dos corretivos de 12 meses, que já usam os índices de `Chamado` por `ativoId` e `createdAt` da 0014. Nada guarda "é candidato" (valor derivado, sempre calculado).

Constantes novas em `shared/ativos/substituicao.constants.ts` (sem `server-only`, a tela usa): `CRITERIOS_SUBSTITUICAO`, `LIMITE_CORRETIVOS_12M_PADRAO = 4`, `LIMITE_REINCIDENCIA_90D_PADRAO = 3`, `MESES_DISPENSA_SUBSTITUICAO = 6`, `STATUS_FORA_DA_SUBSTITUICAO = ['baixado', 'aguardando_baixa']`, os rótulos dos critérios e `MOTIVO_DISPENSA_MIN = 10`, `MOTIVO_DISPENSA_MAX = 500`.

**State transitions** (situação calculada na leitura, nunca gravada):

```
fora ──(algum critério bate)──▶ candidato
candidato ──(dispensar)──▶ dispensado
dispensado ──(prazo vence e algum critério bate)──▶ candidato
dispensado ──(critério fora de motivosNaDispensa passa a bater)──▶ candidato
dispensado ──(voltar a sinalizar)──▶ candidato (ou fora, se nada bate)
candidato | dispensado ──(nenhum critério bate, ou sai do AC-1)──▶ fora
```

Uma dispensa gravada cujo ativo saiu para `fora` continua gravada; se, antes do prazo, o ativo voltar a bater só critérios que estão em `motivosNaDispensa`, ele volta direto para dispensado, sem decisão nova (aceito, AC-12).

A situação é calculada por `avaliarSubstituicao` em `lib/ativos/substituicao.ts`, pura e testável sem banco:

```ts
type CriterioSubstituicao = 'idade' | 'corretivos' | 'reincidencia';
type EntradaAvaliacao = {
  ativo: {
    tierManutencao: TierManutencao;
    status: AtivoStatus;
    dataInstalacao: Date | null;
    dataTombo: Date | null; // de camposPatrimoniais
    dispensa: { ate: Date; em: Date; motivosNaDispensa: CriterioSubstituicao[] } | null;
  };
  categoria: {
    vidaUtilAnos: number | null;
    limiteCorretivos12m: number | null;
    limiteReincidencia90d: number | null;
  };
  corretivos12m: number;
  corretivos90d: number;
  hoje: string; // hojeEmBelem(agora), YYYY-MM-DD
};
type MotivoSubstituicao =
  | { criterio: 'idade'; anos: number; vidaUtilAnos: number }
  | { criterio: 'corretivos'; quantidade: number; limite: number }
  | { criterio: 'reincidencia'; quantidade: number; limite: number };
type ResultadoAvaliacao = {
  situacao: 'fora' | 'candidato' | 'dispensado';
  motivos: MotivoSubstituicao[]; // os que batem hoje, na ordem idade, corretivos, reincidencia
  idadeNaoAvaliada: 'sem_vida_util' | 'sem_data' | null;
  dispensaVigente: boolean;
  dispensaGravadaAte: string | null; // YYYY-MM-DD, existe gravada (vigente ou não)
};
```

`LinhaCandidato` (lote) = `{ ativoId, codigo, descricao, categoria: string, caminho: string | null, tipoServico: TipoServico | null, motivos, corretivos12m }`. `SituacaoSubstituicao` (ficha) = `ResultadoAvaliacao` mais, quando há dispensa gravada, `dispensa: { ate, motivo, porNome, em }` (só para gestão).

**API surface**:

| Ponto                                                                    | Tipo            | Entradas principais                                                                        | Saída                                                                                                   | Quem                                      | Erros principais                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listarSituacoesSubstituicao({ agora? })` (`lib/ativos/substituicao.ts`) | função servidor | `agora: Date` (opcional, para teste)                                                       | `{ candidatos: LinhaCandidato[], dispensados: LinhaCandidato[] }`, cada linha com `tipoServico \| null` | quem chama confere o papel                | lança só erro inesperado; a página isola                                                                                                                                                                                                |
| `situacaoSubstituicaoDaFicha({ ativo, categoria, indicadores, agora? })` | função servidor | o ativo e a categoria já lidos por `carregarFicha`, e os `indicadores` que ela já calculou | `SituacaoSubstituicao`, com o nome de quem dispensou                                                    | `carregarFicha` para gestão               | sem consulta a `Chamado`                                                                                                                                                                                                                |
| `dispensarSubstituicaoAction`                                            | Server Action   | `ativoId: string` (req), `motivo: string` (req, 10 a 500)                                  | `{ ok: true }` ou `{ ok: false, error }`                                                                | Admin, Preposto                           | `Sem permissão para esta ação.` · `Este ativo não é mais candidato à substituição.` · `Este ativo já foi dispensado por <nome>.` · `O ativo mudou enquanto você confirmava. Tente de novo.` · `Motivo deve ter de 10 a 500 caracteres.` |
| `desfazerDispensaSubstituicaoAction`                                     | Server Action   | `ativoId: string` (req)                                                                    | `{ ok: true }` ou `{ ok: false, error }`                                                                | Admin, Preposto                           | `Sem permissão para esta ação.` · `Este ativo não tem dispensa em vigor.`                                                                                                                                                               |
| `/ativos?substituicao=candidatos\|dispensados`                           | página (RSC)    | parâmetro de busca, no `FiltrosListaAtivosSchema` com `.catch(undefined)`                  | `listarAtivos({ ...filtros, ids })` com os ids de `listarSituacoesSubstituicao`                         | Admin, Preposto (ignorado para os demais) |                                                                                                                                                                                                                                         |
| `/relatorios/imr` aba Ativos                                             | página (RSC)    | nenhuma nova                                                                               | prop `substituicao` de `ImrAtivos`, ou `null` em falha                                                  | Admin (`requireAdmin`)                    | falha isolada (AC-8)                                                                                                                                                                                                                    |
| `criarCategoriaAtivoAction`, `editarCategoriaAtivoAction` (existentes)   | Server Action   | `limiteCorretivos12m?`, `limiteReincidencia90d?` (1 a 99)                                  | igual a hoje                                                                                            | Admin                                     | `Limite de corretivos inválido.` · `Limite de reincidência inválido.`                                                                                                                                                                   |

As actions moram em `app/(dashboard)/ativos/actions.ts` e seguem o padrão do módulo: `verifySession()`, conferência do papel, `safeParse` do schema em `shared/ativos/substituicao.schemas.ts`, chamada à regra em `lib/ativos/substituicao.ts` (que devolve `Resultado`), `revalidatePath` de `/ativos`, `/ativos/[id]` e `/relatorios/imr`. A action recebe só o `ativoId`; o `em` da dispensa lida vem do banco na mesma chamada, não do cliente.

`listarSituacoesSubstituicao` lê os ativos elegíveis (AC-1) com `categoriaId`, `localizacaoId`, `dataInstalacao`, `camposPatrimoniais.dataTombo` e `dispensaSubstituicao`; as categorias deles; os corretivos da janela de `janelaDeHoje` com `ativoId: { $in: ids }` (nunca todos os chamados do sistema); agrupa por ativo e chama `numerosDoAtivo` para cada um, inclusive os de zero corretivos; e passa tudo por `avaliarSubstituicao`. Para isso, `filtroCorretivo`, `PROJECAO_CORRETIVO`, `paraCorretivo` e `dentro` de `indicadores.ts` passam a ser exportados, sem mudar o comportamento da 0014.

**Value sourcing**:

| Ação                | Valor produzido ou mostrado       | Fonte                                                                                                                                                                              |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| avaliar             | hoje                              | `hojeEmBelem(agora)` (`lib/ativos/documentos/situacao.ts`)                                                                                                                         |
| avaliar             | fim da janela                     | `fimDoDiaEmBelem(agora)`                                                                                                                                                           |
| avaliar             | data de referência da idade       | `Ativo.dataInstalacao`, senão `Ativo.camposPatrimoniais.dataTombo`, convertida em dia por `hojeEmBelem(data)`                                                                      |
| avaliar             | vida útil                         | `CategoriaAtivo.vidaUtilAnos` (inteiro pelo schema)                                                                                                                                |
| avaliar             | data em que a vida útil vence     | `somarAnos(ymd, anos)`, novo em `documentos/situacao.ts` (29/02 vira 28/02)                                                                                                        |
| avaliar             | idade em anos completos           | `anosCompletos(ymdInicio, ymdHoje)`, novo em `documentos/situacao.ts`                                                                                                              |
| ficha               | `corretivos12m`, `corretivos90d`  | os `indicadores` que `carregarFicha` já calculou (`indicadoresDoAtivo`)                                                                                                            |
| lote                | `corretivos12m`, `corretivos90d`  | `numerosDoAtivo` sobre os corretivos lidos com `filtroCorretivo` na janela de `janelaDeHoje(agora)`, a mesma de `indicadoresDoAtivo`                                               |
| lote                | categoria (nome)                  | `CategoriaAtivo.nome`                                                                                                                                                              |
| rótulos             | textos de motivo e plural         | apoio em `shared/ativos/substituicao.constants.ts`                                                                                                                                 |
| ordem               | código numérico                   | o comparador de `lista.ts`, exportado                                                                                                                                              |
| avaliar             | limites                           | `CategoriaAtivo.limiteCorretivos12m ?? LIMITE_CORRETIVOS_12M_PADRAO`, idem reincidência                                                                                            |
| avaliar             | dispensa vigente                  | `Ativo.dispensaSubstituicao` mais hoje (AC-12)                                                                                                                                     |
| IMR                 | tipo de serviço da linha          | `CategoriaAtivo.serviceSubTypeId` → `ServiceSubType.typeId` → `ServiceType.name` → `tipoServicoDoNomeDoTipo`                                                                       |
| IMR, lista          | caminho do local                  | `Localizacao.caminho` do `localizacaoId`                                                                                                                                           |
| ficha, ações        | nome de quem dispensou            | `User.name` do `porUserId`                                                                                                                                                         |
| dispensar           | `ate`                             | `dataSemHora(somarMeses(hojeEmBelem(), MESES_DISPENSA_SUBSTITUICAO))`, `somarMeses` novo em `documentos/situacao.ts` junto de `somarDias`, levando ao último dia do mês de destino |
| histórico           | `observacao`                      | `ate`, `motivosNaDispensa` e a `ate` da dispensa substituída, nos formatos do AC-11 e do AC-15 (nunca o motivo)                                                                    |
| dispensar           | `motivosNaDispensa`               | critérios de `avaliarSubstituicao` recalculados no servidor na hora (nunca do cliente)                                                                                             |
| dispensar           | `porUserId`, `em`                 | sessão (`verifySession()`), `new Date()`                                                                                                                                           |
| dispensar, desfazer | versão para a escrita condicional | `dispensaSubstituicao.em` lido do banco na mesma chamada                                                                                                                           |

**Key invariants**:

- O número de corretivos usado no selo é o mesmo da linha de indicadores da ficha por construção (a ficha passa os `indicadores` para a regra). O lote usa a mesma janela (`janelaDeHoje`), e um teste prova que lote e ficha dão o mesmo número para o mesmo ativo e o mesmo `agora`.
- Nenhum valor de "é candidato" é gravado. Só `dispensaSubstituicao` é escrita, e só pelas duas actions desta spec.
- `motivosNaDispensa` nunca é vazio: só se dispensa candidato (AC-13).
- No máximo uma dispensa por ativo no documento; a escrita condicional garante que duas dispensas simultâneas não gravam duas vezes (AC-14).
- Toda escrita de dispensa tem `AtivoHistory`; se o histórico falhar, o desfazer passado a `gravarHistoricoOuDesfazer` restaura o estado anterior com a condição do AC-14 ou do AC-15, nunca sem condição.
- O texto do motivo nunca vai para o `AtivoHistory` (o técnico vê o histórico).
- A leitura em lote (`listarSituacoesSubstituicao`) e a da ficha (`situacaoSubstituicaoDaFicha`) usam a mesma `avaliarSubstituicao`; nenhuma tela refaz a regra.
- As três páginas (ficha, lista, IMR) são dinâmicas, sem `use cache`, porque dependem de "hoje".
- A importação do SICAM e a vistoria nunca escrevem `dispensaSubstituicao` (regra de quem escreve o quê da 0012 continua valendo).

**Security model**:

- Ler candidatos, dispensados e a situação da ficha: Admin e Preposto (`canManage`). O IMR continua só do Admin. Técnico e solicitante não recebem o objeto `substituicao` em nenhuma resposta.
- Dispensar e voltar a sinalizar: Admin e Preposto, conferido na action pelo papel da sessão, nunca pela tela de origem.
- Editar limites da categoria: só Admin, como o resto da categoria.
- Dado pessoal: a idade usa `camposPatrimoniais.dataTombo`, que é dado patrimonial e só sai para Admin e Preposto; as telas mostram só a idade em anos, nunca a data, o nome nem a matrícula do responsável. Nada de `camposPatrimoniais` entra no `AtivoHistory` nem nas linhas do IMR.
- Auditoria: dispensar e desfazer gravam `AtivoHistory` com o autor. O motivo da dispensa é texto livre e fica só no subdocumento, que sai do servidor apenas para Admin e Preposto; o histórico, visível ao técnico, leva só a data e os critérios.

**Configuration required**: nenhuma variável nova.

**Critical test scenarios**:

- Caminho feliz: ativo Tier A com categoria de vida útil 10 e tombo de 14 anos atrás, e 5 corretivos em 12 meses com limite padrão, aparece no IMR (Todos e no tipo da categoria), no filtro da lista e com selo na ficha, com os dois motivos; verifica **AC-2**, **AC-3**, **AC-5**, **AC-8**, **AC-9**, **AC-10**.
- Bordas da regra: aniversário da vida útil exatamente hoje bate; ontem não; 29/02 somado; data de tombo gravada às 21:00 de Belém conta no dia certo; `somarMeses` de 30/08 dá 28/02 (ou 29/02); "1 ano" e "1 corretivo" no singular; sem vida útil ou sem data não bate e mostra a nota; `aguardando_baixa` e Tier C nunca aparecem; limite da categoria 2 bate onde o padrão 4 não; verifica **AC-1**, **AC-2**, **AC-6**.
- Paridade: `corretivos12m` e `corretivos90d` do lote iguais aos de `indicadoresDoAtivo` para o mesmo ativo e o mesmo `agora`, inclusive um ativo sem corretivo; verifica **AC-3**, **AC-4**, **AC-7**.
- Dispensa e volta: dispensado por idade some da lista e entra em dispensados; um quinto corretivo que faz bater `corretivos` o devolve no mesmo dia; vencido o prazo, volta; voltar a sinalizar devolve na hora; verifica **AC-11**, **AC-12**, **AC-15**.
- Corrida (banco real): duas dispensas simultâneas no mesmo ativo, uma grava e a outra recebe "já foi dispensado", com um único `AtivoHistory`; dispensa de ativo que deixou de ser candidato é recusada sem escrita; dispensa vencida é sobrescrita; histórico que falha depois da escrita deixa o ativo como estava e não apaga a dispensa de outra pessoa; verifica **AC-13**, **AC-14**, **AC-15**.
- Vazamento: o `AtivoHistory` das duas ações não contém o texto do motivo, e a ficha do técnico mostra a entrada sem ele; verifica **AC-10**, **AC-11**.
- Permissão: técnico chamando as duas actions recebe "Sem permissão para esta ação."; técnico com `?substituicao=candidatos` vê a lista sem filtro; a ficha do técnico não traz `substituicao`; Preposto não salva limite; verifica **AC-9**, **AC-10**, **AC-17**.
- Efeito colateral nenhum: depois de dispensar, `status` e demais campos do ativo iguais, nenhuma `Notification` nova; verifica **AC-16**.
- Falha isolada: `listarSituacoesSubstituicao` lançando erro deixa o resto do IMR de pé com a mensagem da seção; verifica **AC-8**.

## Build plan

Tracer Bullet: o primeiro passo leva a regra do banco até uma tela (a ficha, só leitura) com os limites padrão; depois o fio engrossa com os limites por categoria, a dispensa e as outras duas telas.

1. O fio, só leitura: constantes, rótulos com plural e schema em `shared/ativos/substituicao.*`, `somarMeses`, `somarAnos` e `anosCompletos`, `janelaDeHoje` usada por `indicadoresDoAtivo`, `avaliarSubstituicao` pura com testes de borda, `situacaoSubstituicaoDaFicha` sobre os `indicadores` da ficha, `carregarFicha` devolvendo `substituicao` só para gestão (tipos `FichaAtivo` e o lean com `dataInstalacao`, `dataTombo` e `dispensaSubstituicao`), e o selo com motivos, a nota de idade e a mensagem de falha na ficha; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-7**, **AC-10**
2. Limites por categoria: os dois campos em `CategoriaAtivo`, o schema de categoria, `lib/ativos/categoria.ts` e o formulário de `GerirCategorias` com o padrão como dica, e a regra lendo o limite; satisfies **AC-6**, **AC-17**
3. Leitura em lote e IMR: exportar os apoios de `indicadores.ts` e o comparador de `lista.ts`, `listarSituacoesSubstituicao` (ativos elegíveis, categorias, tipo de serviço, corretivos da janela com `ativoId: { $in }`, agrupamento por ativo, caminho do local), a seção em `imr-ativos.tsx` seguindo o seletor de tipo, a contagem de dispensados e a falha isolada em `relatorios/imr/page.tsx`; satisfies **AC-5**, **AC-7**, **AC-8**
4. Dispensa: subdocumento em `Ativo`, as duas ações novas de `AtivoHistory` com rótulos, `dispensarSubstituicao` e `desfazerDispensaSubstituicao` em `lib/ativos/substituicao.ts` com o filtro condicional, a releitura e o desfazer condicional, `observacao` sem o motivo, as duas actions, o `DialogoDispensaSubstituicao` (ficha e linha do IMR, com `useTransition` e recarga) e o botão "Voltar a sinalizar" na ficha, e o estado dispensado na ficha; satisfies **AC-11**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-16**, **AC-17**
5. Filtro da lista: `substituicao` no `FiltrosListaAtivosSchema`, campo "Substituição" em `FiltrosAtivos` só para gestão, `listarAtivos` com a opção `ids`, a página conferindo `canManage` antes de calcular; satisfies **AC-9**
6. Testes de banco real (`*.db.test.ts`) para a corrida da dispensa e a paridade com a ficha, e testes de permissão das actions e do recorte da ficha; satisfies **AC-3**, **AC-14**, **AC-17**

## Consequences

**Positive**:

- A conversa sobre trocar um equipamento passa a partir de números que todos veem iguais, sem custo de GPU, sem job e sem estado novo para manter em dia.
- `vidaUtilAnos`, que existia na categoria sem uso, passa a servir para alguma coisa, e o Admin ganha motivo para preenchê-la.
- A dispensa deixa rastro (quem, quando, por quê) e não esconde um equipamento para sempre.

**Negative / tradeoffs**:

- Sem custo de conserto, a regra não responde "custa mais consertar do que trocar"; ela aponta idade e frequência de falha. Um equipamento que quebra pouco mas caro nunca aparece por isso. O custo acumulado continua em Deferred.
- A idade depende da data do tombo do SICAM quando falta a de instalação, e a data do tombo pode ser a da compra ou a de uma reincorporação, não a da instalação. A vistoria que preenche `dataInstalacao` melhora isso aos poucos.
- Os corretivos só contam chamados com ativo vinculado. Enquanto o vínculo for baixo, a lista subestima a frequência de falha (o mesmo limite da 0014).
- A leitura em lote faz a conta para todos os ativos Tier A e B a cada abertura do IMR ou do filtro. Com centenas de ativos é barato; com dezenas de milhares, pede cache ou campo gravado.
- Cada consumidor novo de `Ativo` precisa saber que `dispensaSubstituicao` existe e não deve ser copiado nem escrito fora das duas actions.

**Neutral**:

- Sem migração: as categorias existentes ficam com limites vazios (padrão) e nenhum ativo tem dispensa.
- O selo da ficha e a linha de indicadores podem divergir por segundos se um chamado for criado entre as duas leituras da mesma página; as duas leem a mesma janela, então a diferença some na próxima carga.

## Follow-up

- [ ] Relatório mensal por contrato com ativo (linha 28 do escopo, a outra metade da fatia 5) pode reaproveitar `listarSituacoesSubstituicao` para listar os candidatos do mês.
- [ ] Quando o custo acumulado por ativo sair do Deferred, avaliar um quarto critério de custo (soma de cotações aprovadas contra `valorHistorico`).
- [ ] Se a vistoria passar a preencher `dataInstalacao` em massa, revisar se a data do tombo ainda deve servir de reserva.

## Rationale

Raciocínio e opções: veja [rationale.md](rationale.md).
