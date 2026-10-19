# lib/material: cotação e fornecimento de material

As regras da cotação de material (spec 0019, só a Fatia 1 construída): o técnico registra o material, o responsável técnico da contratada monta a cotação com 3 orçamentos, o fiscal analisa, o aprovador com faixa suficiente aprova e reserva o saldo do empenho, e o técnico registra a execução com evidência. As telas estão em `app/(dashboard)/cotacoes/` e `app/(dashboard)/configuracoes/material/`; as rotas, em `app/api/cotacoes/`, `app/api/chamados/[id]/cotacao-material/` e `app/api/cron/material-conciliacao/`. Spec: `docs/specs/0019-cotacao-material/` (`index.md` é a construção, `funcional.md` as regras de negócio, `verify.md` os passos de verificação).

## Arquivos principais

| Arquivo         | O que tem                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transicoes.ts` | `criarCotacao`, `salvarRascunho` e `transicionar`, a máquina de estados; toda ação de cotação passa por aqui                                                                                     |
| `saldo.ts`      | `reservar`, `liberar`, `ajustar`, `registrarMovimento` e `conciliarReservas`, o saldo do empenho sem transação                                                                                   |
| `papeis.ts`     | `papeisDe` (designações vigentes, memorizado por request), `limiteDoAprovador`, `designadosVigentes`, `aprovadoresQueCobrem`                                                                     |
| `serializar.ts` | `visaoDe` e `serializarCotacao`, o único lugar que decide o que cada um vê (AC-15); `podeBaixar` para os arquivos                                                                                |
| `chamado.ts`    | Os ganchos no ciclo do chamado: pausa e retomada pela cotação, `impedimentoDeConclusao`, `impedimentoDeRetomada`, `cancelarCotacaoPeloChamado` e a rodada `cancelarCotacoesDeChamadosEncerrados` |
| `leitura.ts`    | A fila de `/cotacoes`, o detalhe, o cartão do chamado e `acoesDisponiveis` (os botões de cada papel)                                                                                             |
| `arquivos.ts`   | Upload e download de orçamento, evidência e nota fiscal                                                                                                                                          |
| `avisos.ts`     | `avisarSituacao`: `Notification`, email e Socket.IO para quem age na etapa seguinte                                                                                                              |
| `cadastro.ts`   | Empenhos, faixas e designações do Admin, e o painel do que falta                                                                                                                                 |
| `config.ts`     | `lerMaterialConfig`, os parâmetros copiados para a trilha a cada ato                                                                                                                             |

Constantes, textos e schemas ficam em `shared/material/` (`material.constants.ts`, `mensagens.ts` com todo texto de situação, impedimento e aviso, `valores.ts` com a conta em centavos, `cotacao.schemas.ts`).

## Convenções

- Toda mudança de situação passa por `transicionar`, nesta ordem: confere papel, situação e impedimentos; no `aprovar`, reserva o saldo; grava a cotação de forma condicional por `situacao` e `versao`; grava o evento (e desfaz a cotação e a reserva se ele falhar); só então aplica os efeitos no saldo e no chamado e manda os avisos. Ação nova entra nessa mesma função, nunca escreve a cotação direto.
- Papel vem da `DesignacaoMaterial` vigente (`papeisDe`), nunca do perfil; mas o perfil atual, lido do banco e não do token da sessão, ainda limita o papel (`PERFIS_POR_PAPEL`): quem deixa de ser Admin perde fiscal, gestor e aprovador sem revogar nada. Dois cadastros simultâneos que se sobrepõem deixam só o de menor `_id`; o outro se revoga. Lado TRF1 é fiscal, gestor ou aprovador; o Admin sem designação só lê; contratada é o responsável técnico. O servidor confere papel e situação em toda action; esconder botão é só conforto.
- Toda leitura de cotação passa por `serializarCotacao` com a visão de `visaoDe`. O rascunho não aparece para o lado TRF1 (AC-1), o técnico atribuído só baixa evidência, o solicitante só vê a situação. A rota de arquivos e o link da seção Custo usam a mesma `visaoDe`.
- Dinheiro sempre em centavos inteiros. A linha é `valorDaLinhaCentavos` (quantidade em milésimos vezes o preço, um único arredondamento), a mesma regra de `shared/chamados/custo.ts`. O preço do caminho 3 é o menor entre os orçamentos que cotaram o item, e só é congelado no envio.
- Saldo sem transação: reservar é um update condicional no empenho, idempotente pela cotação. `liberar` e `ajustar` exigem o `empenhoId`, para uma aprovação nunca desfazer a reserva de outra feita em outro empenho. Quem perde a gravação condicional libera só a própria reserva. Aprovar de novo depois de uma queda entre a reserva e a gravação passa por `conciliarReservas` só da cotação: reserva com mais de 10 minutos é solta e a aprovação segue; mais nova devolve `MSG_APROVACAO_EM_ANDAMENTO`.
- A conciliação diária (`/api/cron/material-conciliacao`, 06:00 UTC no container `cron`) primeiro cancela a cotação em trâmite de chamado já cancelado ou recusado (a nova tentativa do gancho, que roda uma vez só) e depois libera reserva com mais de 10 minutos cuja cotação não está autorizada, executada ou atestada, ou que está num empenho diferente do gravado na cotação. Uma falha na primeira rodada não impede a segunda. Reserva de cotação que nem existe é liberada sem evento na trilha, só com `console.warn`.
- Toda ação que leva o chamado a `concluído`, `cancelado` ou `recusado` passa por `lib/material/chamado.ts`: a conclusão é recusada com cotação em trâmite, cancelar e recusar cancelam a cotação. `__tests__/varredura-chamado.test.ts` varre `app/` e `lib/` e quebra com escrita nova desses status fora do gancho, conferindo o gancho certo para cada status gravado no arquivo (`impedimentoDeConclusao` para `concluído`, `cancelarCotacaoPeloChamado` com o motivo fixo para `cancelado` e `recusado`).
- A pausa por cotação só nasce do envio da cotação (`pauseLogId` na cotação) e só sai pela cotação: a retomada manual é recusada enquanto essa pausa estiver aberta. O motivo `falta_peca_aprovacao_cliente` não aparece no `PauseTicketDialog`.
- Trilha, designações, faixas e emissões de PDF são só de inclusão: `models/_somente-inclusao.ts` recusa update, delete, replace, `save` de documento existente e `bulkWrite`. As únicas escritas são `revogarDesignacao` e `desativarFaixa`, com a opção `OPCAO_ESCRITA_PROPRIA` e `$set` só nos próprios campos.
- Avisos nunca levam valor, em nenhum canal. O título sai de `tituloAvisoCotacao` (`shared/material/mensagens.ts`). O evento `material:cotacao_situacao` entra nas mesmas listas que os outros eventos do Socket.IO.
- Nenhuma função daqui lança erro de regra: devolve `{ ok: false, error, impedimentos? }`. Ids repetidos no rascunho (item, orçamento, arquivo, preço) são recusados no schema e de novo em `salvarRascunho`.

## Comandos

```bash
MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material   # inclui corrida de saldo, queda, conciliação e o fio completo no banco real
```

## Gotchas

- Sem empenho elegível (ativo, do exercício corrente e na vigência, em Belém), faixas e designações cadastrados em `/configuracoes/material`, a cotação é montada e analisada, mas não é encaminhada nem aprovada. O painel "O que falta" da página mostra o que falta.
- Fatias 2 a 5 da spec 0019 (ateste e PDF, Anexo V e SINAPI, controles do caminho 3, advertências e relatório) ainda não existem. Os campos delas já estão nos modelos, sem uso.
- O E2E `e2e/cotacao-flow.spec.ts` prepara empenho, faixa e designações pelo `e2e/fixtures/material.ts`, de forma idempotente, no banco do `MONGODB_URI`.

_Drafted by /sync from the introducing change, worth a quick human pass._
