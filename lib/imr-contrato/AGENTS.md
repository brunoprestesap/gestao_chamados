# lib/imr-contrato: IMR do contrato, indicadores 3 e 4

Os indicadores 3 (tempo de resposta: atribuição até o fim do expediente do primeiro dia útil depois da abertura) e 4 (fornecimento de material: execução até o N-ésimo dia útil depois da autorização) do IMR do contrato, com as marcações do fiscal e do gestor, o fechamento mensal com foto imutável, a reabertura com motivo e o PDF do fechamento para o SEI. A soma é sempre de quatro indicadores em 100 pontos (I1 até 40, I2 até 20, I3 e I4 até 20); I1 e I2 são lançados à mão no fechamento. A tela é `app/(dashboard)/relatorios/imr-contrato/` e a rota do PDF `app/api/relatorios/imr-contrato/pdf/`. Spec: `docs/specs/0023-imr-contrato-indicadores/` (`index.md` é a construção, `verify.md` os passos de verificação).

## Arquivos principais

| Arquivo                     | O que tem                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apuracao.ts`               | `apurarMes`, pura: a única função que calcula pontos; a prévia e o fechamento chamam a mesma (AC-15). Também `marcacoesVigentes` e `prazoDeFornecimento` |
| `leitura.ts`                | `montarPreviaImr`: lê contrato, chamados, cotações, marcações e calendário uma vez e chama `apurarMes`                                                   |
| `fechamento.ts`             | `fecharMesImr` e `reabrirMesImr`; nunca lançam para a action                                                                                             |
| `fechamento.regras.ts`      | Regras puras do fechamento: estado do mês, soma e faixa, reincidência e `mesTerminou`                                                                    |
| `estado.ts`                 | Versões, reaberturas, fotos, pontos vigentes e emissões de um mês                                                                                        |
| `acesso.ts`                 | `papelNoImr`: `fiscal` vence `gestor`; Admin sem designação devolve null (só lê)                                                                         |
| `prazo.ts`, `calendario.ts` | O prazo de resposta e os limites do mês em Belém; a conta em dias úteis e a leitura do calendário vêm de `lib/dias-uteis/`, que só reexportam            |
| `pdf/`                      | `gerarPdfImr` (`gerar.tsx`) e o documento (`ImrFechamentoPdf.tsx`), feitos só da foto gravada                                                            |

Constantes, textos, schemas e tipos ficam em `shared/imr-contrato/`. Os modelos são `ImrMarcacao`, `ImrFechamento`, `ImrReabertura` e `ImrFechamentoPdfEmissao`, todos só de inclusão (`models/_somente-inclusao.ts`) e com nome de coleção explícito (`imr_*`).

## Convenções

- Nenhum ponto é calculado fora de `apurarMes`. O fechamento grava a mesma apuração da prévia, e a tela e o PDF de um mês fechado leem só a foto (`ImrFechamento`), nunca recalculam: mudar feriado, expediente, nome de usuário ou número do contrato depois não muda a foto.
- O mês está fechado quando existe fechamento e a maior versão não tem `ImrReabertura`. Fechar grava `versao = maior + 1`; os índices únicos (`{ contratoId, competencia, versao }` e `{ contratoId, competencia, versaoReaberta }`) resolvem a corrida, e a chave duplicada vira a mensagem do AC-18.
- O mês só fecha depois do último dia dele, no dia de Belém (`mesTerminou` com `hojeEmBelem`), conferido no servidor.
- A tela manda no fechamento os pontos do I3 e do I4 que a pessoa viu (`pontosVistos`, obrigatório no schema); `fecharMesImr` recusa com `previaMudou` se a apuração mudou, sem gravar. O `fechadoEm` é tomado logo antes da gravação, nunca antes do `agora` da apuração.
- Marcação é evento: desfazer grava outro evento. O estado de um alvo é o último evento da família (desconsiderar ou não atendimento), por `em` e depois `_id`. Marcação com `em` dentro de um intervalo fechado (do `fechadoEm` da versão até a reabertura dela) é ignorada para sempre (AC-9). Nada vai para `ChamadoHistory`.
- Escreve (marca, fecha, reabre) só quem tem designação vigente de `fiscal` ou `gestor` (`papelNoImr`, por `papeisDe`); Admin sem designação vê a tela sem ações e pode emitir o PDF, com o papel `admin` na emissão. Toda action confere de novo no servidor; esconder botão é só conforto.
- O prazo do I4 é `CotacaoMaterial.fornecimentoAte`, gravado pela cotação de material na primeira autorização (`lib/material/fornecimento.ts`). Cotação autorizada sem ele (anterior à spec 0023, ou com falha na leitura do calendário) entra com o prazo estimado com N = 5 e `prazoEstimado: true`.
- O PDF divide com o relatório por contrato e com a cotação de material a trava de um PDF por vez (`lib/contratos/pdf/trava.ts`): com ela ocupada, a rota responde 429. Mês aberto responde 409. A emissão grava o SHA-256 dos bytes antes de entregar.

## Comandos

```bash
npx vitest run lib/imr-contrato shared/imr-contrato
MONGO_TEST_URI=mongodb://localhost:27017 npx vitest run lib/imr-contrato   # inclui fechamento.db, leitura.db e pdf.db (índices únicos e corridas)
E2E_BASE_URL=<servidor num banco próprio> npx playwright test e2e/imr-contrato.spec.ts   # tela, fechamento, PDF e axe
```

## Gotchas

- A apuração lê em JavaScript os chamados de cerca de seis semanas por contrato, fora do `$facet` do `imr-service.ts`. Serve ao volume atual, mas não escala como uma aggregation.
- As linhas da foto e do PDF guardam o nome do solicitante (LGPD, como o PDF da spec 0016).
- O prazo de resposta usa o calendário do SLA (`getBusinessCalendarConfig` e feriados ativos), com Belém em UTC-3 fixo.

_Drafted by /sync from the introducing change, worth a quick human pass._
