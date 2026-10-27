# 0022. Motivo e histórico no cadastro de material

**Date**: 2026-10-27
**Status**: Accepted

## Summary

Hoje o Admin revoga uma designação, desativa uma faixa ou inativa um empenho em `/configuracoes/material` sem dizer por quê, e a faixa e o empenho nem guardam quem fez nem quando. Esta spec faz os quatro atos (revogar, desativar, inativar e reativar) pedirem um motivo de 10 a 500 caracteres e guardarem quem, quando e por quê no próprio documento, sem coleção nova. Cada linha do cadastro mostra o seu histórico, e o empenho junta movimentos e mudanças de situação numa linha do tempo só. Os atos antigos aparecem com "Motivo não registrado", e nada já gravado muda de sentido.

## Requirements

**User stories**:

- Como Admin, quero escrever o motivo ao revogar uma designação, desativar uma faixa ou inativar ou reativar um empenho, para quem auditar o contrato entender cada decisão.
- Como Admin, quero ver na própria linha quem fez cada ato, quando e por quê, para não depender da memória de quem estava no cargo.

**Acceptance criteria**:

- **AC-1**: Revogar designação exige motivo de `TEXTO_CURTO_MIN` a `TEXTO_CURTO_MAX` (10 a 500) caracteres, depois do `trim`. `revogarDesignacao` grava `revogadaMotivo` na mesma escrita condicional que grava `revogadaEm` e `revogadaPorUserId`. Sem motivo válido, o servidor recusa pelo schema e nada é gravado. A revogação automática de `criarDesignacao` (dois cadastros simultâneos com período sobreposto) grava o motivo fixo `MOTIVO_REVOGACAO_AUTOMATICA` ("Revogada automaticamente: cadastro simultâneo com período sobreposto.") na mesma escrita.
- **AC-2**: Desativar faixa exige o mesmo motivo. `desativarFaixa` passa a receber o Admin e grava `ativa: false`, `desativadaEm`, `desativadaPorUserId` e `desativadaMotivo` numa só escrita condicional (`ativa: true` no filtro). A faixa já desativada continua recusada com a mensagem de hoje.
- **AC-3**: Inativar e reativar empenho exigem o mesmo motivo. `alterarSituacaoEmpenho` passa a receber o Admin e faz um só `updateOne({ _id, ativo: !novo }, { $set: { ativo: novo }, $push: { historicoSituacao: { ativo: novo, motivo, porUserId, em } } })`. Com `matchedCount === 0`, um `EmpenhoModel.exists({ _id })` escolhe a mensagem: se o empenho existe, ele já está na situação pedida (outro Admin chegou antes), nada é gravado e a resposta é "O empenho já está inativo. Recarregue." ou "O empenho já está ativo. Recarregue.". Empenho inexistente continua "Empenho não encontrado.".
- **AC-4**: O motivo é definitivo. Nenhuma ação edita nem apaga `revogadaMotivo`, os três campos `desativada*` ou um item de `historicoSituacao`. O `somenteInclusao` da designação e da faixa passa a aceitar os campos novos só pela escrita própria (`OPCAO_ESCRITA_PROPRIA`). O `Empenho` não usa `somenteInclusao` (reservas e movimentos precisam de `$pull` e `$inc`), então ganha um hook `pre` próprio em `updateOne`, `updateMany` e `findOneAndUpdate` que lança `EscritaProibidaError` quando `$set`, `$unset`, `$pull`, `$pullAll`, `$pop` ou `$rename` tocam uma chave que começa por `historicoSituacao`, e recusa sempre `replaceOne` e `findOneAndReplace`. `historicoSituacao` só recebe `$push`.
- **AC-5**: O `DialogConfirmacao` continua dizendo o efeito antes de agir (AC-21 da 0021) e ganha o campo de motivo: rótulo visível, contador "N de 500", o mínimo escrito embaixo do campo e o erro no próprio campo (ligado por `aria-describedby`). O rótulo é um só, "Motivo", nos quatro atos; o texto mora no estado local do diálogo (montado só enquanto aberto, então zera a cada abertura) e o campo tem `maxLength` 500. Confirmar não envia com motivo abaixo do mínimo e põe o foco no campo. Recusa do servidor vai por `toast.error`, o diálogo fica aberto com o texto digitado e a tela não recarrega; se a recusa for do motivo, o erro aparece no campo e o foco volta para ele. O toast de sucesso diz o que aconteceu ("Designação revogada.", "Faixa desativada.", "Empenho inativado.", "Empenho reativado."). Todo texto novo fica em `shared/material/mensagens.ts`.
- **AC-6**: Cada linha mostra o seu histórico ao abrir, só em `/configuracoes/material`. A designação revogada mostra data, nome de quem revogou e motivo. A faixa desativada mostra o mesmo. O empenho mostra uma linha do tempo única com movimentos (reforço e anulação, com ato) e mudanças de situação (Inativado ou Reativado, com motivo), do mais novo ao mais antigo, cada item com tipo, data e hora no fuso de Belém e nome de quem fez. Designação e faixa mostram a data e a hora do mesmo jeito.
- **AC-7**: Os atos feitos antes desta spec continuam como estão, sem migração. Motivo ausente é `null`, campo ausente ou texto vazio (teste falsy, nunca `=== null`). A designação revogada sem motivo mostra quem e quando, com "Motivo não registrado" no lugar do motivo. A faixa com `ativa === false` e sem `desativadaEm` mostra "Desativada antes do registro do motivo", sem data nem autor. O empenho ganha o item "Inativado antes do registro do motivo", sem data nem autor e no fim da linha do tempo (o mais antigo), em dois casos: inativo com `historicoSituacao` vazio, ou com o primeiro item do histórico sendo uma reativação (`ativo: true`). Em todo outro caso não há item extra; o empenho que nunca mudou de situação mostra só os movimentos, sem item de criação.
- **AC-8**: Os campos novos só saem por `lerPainelMaterial`, que só o Admin lê. Nenhuma leitura da cotação (`serializarCotacao`, trilha, PDF, diálogo Aprovar, fila, relatório, avisos) lê ou devolve motivo, autor ou data dos quatro atos. Quem não é Admin recebe `ERRO_SEM_PERMISSAO` nas três actions, como hoje.
- **AC-9**: Nada já gravado muda de sentido. A vigência da designação (`filtroVigente`), a faixa ativa, o empenho elegível (`filtroElegivel`), o saldo e as notas do cadastro são calculados como hoje. Os testes atuais de `lib/material` seguem verdes. Só mudam as chamadas e expectativas que dependem das três assinaturas e dos três schemas: `app/(dashboard)/configuracoes/material/__tests__/actions.test.ts` (o `toHaveBeenCalledWith` da revogação), `_components/__tests__/GerirMaterial.test.tsx` (as actions agora levam `motivo`), `lib/material/__tests__/cadastro.db.test.ts` e `fatia3.db.test.ts` (chamadas às três funções). Os testes de permissão sem motivo continuam valendo, porque a sessão é conferida antes do `safeParse`.

## Decision

**Chosen option**: Option 1: campos no próprio documento.

Cada ato guarda o motivo, o autor e a data no documento que ele muda, na mesma escrita condicional que já existe: campos únicos na designação e na faixa (o ato acontece uma vez só) e um array só de inclusão no empenho (o ato vai e volta).

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (sem coleção nova, sem migração; campo ausente é lido como `null` ou `[]`):

| Coleção (modelo)                             | Campo novo            | Tipo                                                                                               | Regra                                                                                                |
| -------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `designacoesmaterial` (`DesignacaoMaterial`) | `revogadaMotivo`      | string, `trim`, até 500, padrão `null`                                                             | gravado só junto com `revogadaEm`; entra na lista de escrita própria do `somenteInclusao`            |
| `faixascompetencia` (`FaixaCompetencia`)     | `desativadaEm`        | Date, padrão `null`                                                                                | gravado só junto com `ativa: false`                                                                  |
|                                              | `desativadaPorUserId` | ObjectId → `User`, padrão `null`                                                                   | idem                                                                                                 |
|                                              | `desativadaMotivo`    | string, `trim`, até 500, padrão `null`                                                             | idem; os três entram na lista do `somenteInclusao`, ao lado de `ativa`                               |
| `empenhosmaterial` (`Empenho`)               | `historicoSituacao[]` | `{ ativo: boolean, motivo: string (até 500), porUserId → User, em: Date }`, sem `_id`, padrão `[]` | só `$push`, no mesmo update que troca `ativo`; um hook `pre` próprio barra as outras escritas (AC-4) |

O mínimo de 10 caracteres vale no schema Zod da action, não no Mongoose, como no `motivo` de anomalia (`tabelas.ts`). O máximo fica nos dois.

**State transitions**:

- Designação: vigente ou futura → revogada (uma vez, `revogadaEm: null` no filtro).
- Faixa: ativa → inativa (uma vez, `ativa: true` no filtro). Não há reativação de faixa.
- Empenho: ativo ⇄ inativo, cada volta com um item em `historicoSituacao`.

**API surface** (Server Actions de `app/(dashboard)/configuracoes/material/actions.ts`, todas com `sessaoAdmin()`):

| Action                         | Key inputs                                                     | Key outputs    | Auth  | Key errors                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------- | -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `revogarDesignacaoAction`      | `designacaoId` (objectId), `motivo` (10 a 500)                 | `{ ok: true }` | Admin | `ERRO_SEM_PERMISSAO`; motivo fora do limite; "Designação não encontrada ou já revogada."                                                    |
| `desativarFaixaAction`         | `faixaId` (objectId), `motivo` (10 a 500)                      | `{ ok: true }` | Admin | `ERRO_SEM_PERMISSAO`; motivo fora do limite; "Faixa não encontrada ou já desativada."                                                       |
| `alterarSituacaoEmpenhoAction` | `empenhoId` (objectId), `ativo` (boolean), `motivo` (10 a 500) | `{ ok: true }` | Admin | `ERRO_SEM_PERMISSAO`; motivo fora do limite; "Empenho não encontrado."; "O empenho já está inativo. Recarregue." ou "...ativo. Recarregue." |

`desativarFaixaAction` e `alterarSituacaoEmpenhoAction` passam a guardar a sessão de `sessaoAdmin()` (hoje descartam) para passar `sessao.userId`; a sessão continua conferida antes do `safeParse`. Os schemas `RevogarDesignacaoSchema`, `DesativarFaixaSchema` e `SituacaoEmpenhoSchema` (`shared/material/cotacao.schemas.ts`) ganham `motivo: textoCurto('Escreva o motivo')`. As funções de `lib/material/cadastro.ts` mudam de assinatura: `revogarDesignacao(adminId, id, motivo)`, `desativarFaixa(adminId, id, motivo)`, `alterarSituacaoEmpenho(adminId, id, ativo, motivo)`. O `_id` vai sempre por `new Types.ObjectId`, como nas outras duas.

Leitura: `lerPainelMaterial` acrescenta, por linha:

- `DesignacaoLinha`: `revogadaPorNome: string | null`, `revogadaMotivo: string | null`.
- `FaixaLinha`: `desativadaEm: string | null`, `desativadaPorNome: string | null`, `desativadaMotivo: string | null`.
- `EmpenhoLinha`: `movimentos[]` ganha `porNome`, e entra `situacoes: { ativo: boolean; motivo: string; porNome: string; em: string }[]`. A tela monta a linha do tempo única juntando as duas listas por `em`.

Os nomes saem da busca que já completa `nomeUser` em `lerPainelMaterial` (a de `faltaUser`), estendida a todos os ids de autor do painel, sem filtro de `isActive`: autor desligado continua aparecendo pelo nome. Id sem documento em `User` mostra "Usuário removido" (diferente do "—" que a tela usa para campo vazio). A leitura das designações segue limitada às 500 mais recentes (`limit(500)`), e o histórico vale para elas; aceito no volume do contrato.

**Value sourcing**:

| Action                    | Value produced / displayed                                    | Source                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| os três atos              | motivo                                                        | input `motivo` (Zod `textoCurto`); na revogação automática, `MOTIVO_REVOGACAO_AUTOMATICA`                                                                                                                                                                                                                                                                                                              |
| os três atos              | autor                                                         | `sessao.userId` de `sessaoAdmin()`                                                                                                                                                                                                                                                                                                                                                                     |
| os três atos              | data do ato                                                   | `new Date()` no servidor, na escrita                                                                                                                                                                                                                                                                                                                                                                   |
| inativar ou reativar      | situação nova                                                 | input `ativo`; o filtro usa `!ativo` como situação de antes                                                                                                                                                                                                                                                                                                                                            |
| histórico na linha        | nome do autor                                                 | `UserModel.name` pelos ids `revogadaPorUserId`, `desativadaPorUserId`, `historicoSituacao[].porUserId`, `movimentos[].porUserId`                                                                                                                                                                                                                                                                       |
| histórico na linha        | data e hora exibidas                                          | `em` em ISO, formatada por `dataHoraDoCadastro(iso)` em `shared/material/cadastro.ts`: um `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })` criado uma vez, com opções fixas para servidor e navegador darem o mesmo texto; o `toLocaleDateString` atual dos movimentos passa a usar a mesma função |
| ato antigo                | "Motivo não registrado" e as duas frases de antes do registro | derivado pelas regras do AC-7 (motivo falsy; faixa inativa sem `desativadaEm`; empenho inativo com histórico vazio ou com primeiro item `ativo: true`); textos em `mensagens.ts`                                                                                                                                                                                                                       |
| linha do tempo do empenho | ordem                                                         | derivado de `em`, do mais novo ao mais antigo                                                                                                                                                                                                                                                                                                                                                          |

**Key invariants**:

- Motivo, autor e data de um ato saem na mesma escrita que muda a situação. Não existe ato gravado sem motivo depois desta spec, nem motivo gravado sem ato.
- `historicoSituacao` só cresce (`$push` sem `$slice`, de propósito). Desde esta spec, depois de cada ato, o último item tem `ativo` igual ao `ativo` do empenho; documentos antigos podem não cumprir isso e caem nas regras do AC-7.
- Nenhuma regra de leitura (vigência, faixa ativa, elegibilidade, saldo) olha os campos novos.

**Security model**: só o Admin escreve e lê (`sessaoAdmin()` nas actions; `/configuracoes` barrado pelo `proxy.ts` para quem não é Admin). Os campos novos ficam fora de todo serializador da cotação. O motivo é texto livre escrito pelo Admin, sem dado pessoal esperado; a tela mostra como texto (sem HTML).

**Configuration required**: nenhuma.

**Critical test scenarios**:

- Happy path, no banco (`*.db.test.ts`): revogar, desativar, inativar e reativar gravam motivo, autor e data; `lerPainelMaterial` devolve os nomes e a ordem; verifica **AC-1**, **AC-2**, **AC-3**, **AC-6**.
- Corrida: dois `alterarSituacaoEmpenho` para inativar o mesmo empenho em paralelo; um passa, o outro recebe "já está inativo", e `historicoSituacao` tem um item só; verifica **AC-3**.
- Motivo com 9 caracteres (ou só espaços) recusado pelas três actions, nada gravado; verifica **AC-1**, **AC-2**, **AC-3**.
- Escrita direta em `revogadaMotivo` ou `desativadaMotivo` sem a opção própria lança `EscritaProibidaError`; `$set`, `$pull` e `$pop` em `historicoSituacao` lançam o mesmo erro, enquanto reservar, liberar e movimentar o empenho seguem passando; verifica **AC-4**.
- A revogação automática do cadastro simultâneo grava `MOTIVO_REVOGACAO_AUTOMATICA`; verifica **AC-1**.
- Documento antigo aparece com as frases fixas: designação revogada sem motivo (e com motivo `""`), faixa inativa sem data, empenho inativo sem histórico, empenho com primeiro item de reativação; o empenho ativo sem histórico não ganha item extra; verifica **AC-7**.
- Componente: o diálogo não envia abaixo do mínimo, mostra o erro no campo, conta "N de 500", e numa recusa do servidor fica aberto com o texto; verifica **AC-5**.
- Varredura: um teste de banco grava os quatro atos com um motivo conhecido, lê uma cotação aprovada por `serializarCotacao` nas visões do fluxo, por `lerDetalhe` e pelos dados do PDF, e confere que o texto do motivo e as chaves `revogadaMotivo`, `desativadaMotivo` e `historicoSituacao` não aparecem no `JSON.stringify` de nenhuma delas; Preposto recebe `ERRO_SEM_PERMISSAO` nas três actions; verifica **AC-8**.
- Os testes atuais de `lib/material` seguem verdes; verifica **AC-9**.

## Build plan

Tracer Bullet: a designação passa primeiro por todas as camadas (modelo, schema, função, action, diálogo, leitura e tela); faixa e empenho repetem o fio, e o empenho acrescenta a corrida e a linha do tempo. Um PR, três fatias em commits separados.

1. **Fatia 1, designação de ponta a ponta.** `revogadaMotivo` no modelo e no `somenteInclusao`; `motivo` no `RevogarDesignacaoSchema`; `revogarDesignacao(adminId, id, motivo)` e `MOTIVO_REVOGACAO_AUTOMATICA` em `criarDesignacao`; `dataHoraDoCadastro` em `shared/material/cadastro.ts`; o campo de motivo no `DialogConfirmacao` (contador, mínimo, erro no campo, recusa por toast); `revogadaPorNome` e `revogadaMotivo` em `lerPainelMaterial`; o histórico na linha da designação, com "Motivo não registrado" para a antiga; textos em `mensagens.ts`. Satisfaz **AC-1**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
2. **Fatia 2, faixa.** `desativadaEm`, `desativadaPorUserId` e `desativadaMotivo` no modelo e no `somenteInclusao`; `motivo` no `DesativarFaixaSchema`; `desativarFaixa(adminId, id, motivo)` e a sessão guardada em `desativarFaixaAction`; leitura e histórico na linha, com "Desativada antes do registro do motivo". Satisfaz **AC-2**, **AC-4**, **AC-6**, **AC-7**.
3. **Fatia 3, empenho.** `historicoSituacao` no modelo e o hook `pre` que barra as outras escritas nele; `motivo` no `SituacaoEmpenhoSchema`; `alterarSituacaoEmpenho` com o update condicional, o `exists` da resposta da corrida e a sessão guardada na action; `porNome` nos movimentos e `situacoes` na leitura; a linha do tempo única na linha do empenho, com "Inativado antes do registro do motivo". Satisfaz **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
4. **Fechamento.** Teste de varredura dos serializadores e do PDF; teste de permissão das três actions; os testes atuais de `lib/material` rodados com `MONGO_TEST_URI`, só com as mudanças de assinatura listadas no AC-9; o passo do cadastro em `e2e/cotacao-flow.spec.ts` (que já abre `/configuracoes/material`) abre um diálogo com motivo e passa no `semViolacaoNoAxe`. Depois do merge, o `/sync` registra em `lib/material/AGENTS.md` e `models/AGENTS.md` os campos novos, o hook do empenho e que `criarDesignacao` também revoga. Satisfaz **AC-8**, **AC-9**.

## Consequences

**Positive**:

- Cada decisão do cadastro passa a ter dono, data e justificativa, legíveis por quem audita o contrato.
- Nenhuma coleção nova e nenhuma escrita fora do documento: o ato continua uma escrita condicional só, sem precisar de transação (o MongoDB roda sem replica set).
- A corrida do empenho deixa de gravar uma troca que não aconteceu.

**Negative / tradeoffs**:

- Não há uma visão única de "tudo o que o Admin fez no cadastro"; para isso seria preciso juntar três coleções na leitura.
- A faixa e o empenho antigos não têm autor nem data, e isso não pode ser recuperado.
- Motivo errado não se corrige: o Admin explica no ato seguinte, se houver.
- O `DialogConfirmacao` passa a exigir motivo em todos os seus usos; uma confirmação futura sem motivo precisa de uma prop para desligar o campo.

**Neutral**:

- `historicoSituacao` cresce sem limite (sem `$slice`, de propósito), mas um empenho muda de situação poucas vezes por exercício, longe do limite de 16 MB do documento.
- A criação da designação, da faixa e do empenho já guarda autor e data e não muda.

## Follow-up

- [ ] A spec 0019 (AC-15) ainda diz que o solicitante vê "só a situação"; a 0021 (AC-24) mudou para "só a fase". Fica registrado aqui porque a 0019 não é desta spec.
- [ ] Se a auditoria pedir uma visão única do cadastro, avaliar uma seção Histórico que junte as três leituras (opção 2 do rationale), sem mudar o que esta spec grava.
