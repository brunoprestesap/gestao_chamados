# AGENTS.md — Calibração da confiança da IA

A tela `/configuracoes/ia-confianca` (Admin), que mede se a sugestão da IA (serviço e prioridade, escondida desde a spec 0004) bate com o que o Preposto decidiu de verdade, e guarda o limite de confiança e os interruptores de autonomia e de atribuição automática, que as fatias 15 (spec 0007) e 16 (spec 0008) já leem. Spec: [0006](../../docs/specs/0006-calibracao-trava-confianca/index.md).

## Arquivos

| Arquivo                                                                               | O que faz                                                                                                                                          |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`                                                                           | `lerConfig()`/`salvarConfig()`: o documento único (`chave: 'global'`), upsert com os padrões de fábrica na primeira leitura                        |
| `calibragem.ts`                                                                       | `medirCalibragem()`: lê `DecisaoIa` direto e calcula, na hora, a tabela de cortes de confiança, a sugestão automática e o total elegível por campo |
| `../../models/IaAutonomiaConfig.ts`                                                   | O model Mongoose do documento único (`servico`, `prioridade`, `autonomiaAtiva`, `atribuicaoAutomaticaAtiva`, `promptVersion`, `updatedByUserId`)   |
| `../../shared/ia-confianca/ia-confianca.schemas.ts`                                   | `IA_CONFIANCA_CAMPOS`, `salvarIaAutonomiaConfigSchema` (Zod)                                                                                       |
| `../../app/(dashboard)/configuracoes/ia-confianca/page.tsx`                           | Server Component: `requireAdmin()`, chama `lerConfig()` + `medirCalibragem()`                                                                      |
| `../../app/(dashboard)/configuracoes/ia-confianca/actions.ts`                         | `salvarIaAutonomiaConfigAction` (`requireAdmin()` dentro do `try`, mesmo padrão de `gestao/actions.ts`)                                            |
| `../../app/(dashboard)/configuracoes/ia-confianca/_components/RelatorioCampoCard.tsx` | Tabela de cortes por campo, traço quando a linha não tem decisão, aviso de viés só em `servico`                                                    |
| `../../app/(dashboard)/configuracoes/ia-confianca/_components/IaConfiancaForm.tsx`    | Formulário único (os dois campos + os dois interruptores), botão "Usar sugestão"                                                                   |

## Regras que valem aqui

- **O relatório é sempre calculado na hora, nunca lido de um retrato gravado.** Mesmo padrão do IMR (`lib/imr-service.ts`): uma agregação sob demanda, sem job nem coleção de snapshot.
- **A amostra é filtrada estritamente**: `campo` (`servico`/`prioridade`, nunca `tecnico`), `decididoPor: 'ia'`, `efeito: 'sugestao'`, `task === ABERTURA_TASK`, `promptVersion === PROMPT_VERSION` (ambos de `lib/assistente/prompt.ts`), `confianca` não nula e `revisadaEm` preenchido (já passou pela classificação). Mudar o prompt (nova `PROMPT_VERSION`) reseta a amostra.
- **`CORTES_CONFIANCA` é uma lista literal fixa** (1.00 a 0.50, passo 0.05); nunca gerar por soma de ponto flutuante. `META_ACURACIA = 0.9` é constante de código, não editável pelo Admin.
- **A sugestão exige as duas condições no mesmo corte**: acurácia acumulada ≥ `META_ACURACIA` **e** contagem própria do corte ≥ `amostraMinima` do campo; sem corte que bata as duas, nenhuma sugestão aparece.
- **`limiteConfianca: null` significa autonomia impossível para aquele campo.** Quem lê a configuração trata `null` como limite inatingível; desde a spec 0007, o portão da abertura pelo chat (`lib/assistente/portao.ts`) lê `autonomiaAtiva` e o limite de `prioridade`.
- **A autonomia vale só para o prompt em que foi calibrada** (spec 0007, AC-17). `salvarConfig()` grava a `PROMPT_VERSION` atual em `promptVersion`, e `lerConfig()` devolve `autonomiaAtiva: false` quando ela difere (ou falta). Subir `PROMPT_VERSION` desliga a autonomia no deploy, sem migração; o Admin religa salvando de novo na tela.
- **A atribuição automática tem interruptor próprio** (spec 0008): `atribuicaoAutomaticaAtiva`, padrão `false`, no mesmo documento e na mesma tela. Só vale com `autonomiaAtiva` ligada e é lida por `tentarAtribuicaoAutomatica` (`lib/chamados/atribuicao-automatica.ts`) no instante da confirmação, então ligar ou desligar depois não afeta chamado já criado. Não depende de `PROMPT_VERSION` (a escolha é por regra, não por confiança do modelo): subir a versão desliga só a autonomia. Documento antigo sem o campo vale `false`, e o campo é obrigatório no schema Zod de propósito, para um formulário antigo falhar alto em vez de desligar a chave sem avisar.
- **Existe sempre exatamente um `IaAutonomiaConfig`** (`chave: 'global'`, índice único); `lerConfig`/`salvarConfig` sempre fazem upsert, nunca `create`.
- **Só servidor.** `config.ts` e `calibragem.ts` importam `server-only`.
- **Viés conhecido em `servico`**: o Preposto vê a sugestão de serviço pré preenchida antes de classificar, então aquele número mede concordância, não acerto independente; só `prioridade` é medido às cegas (é o único campo em `CAMPOS_OCULTOS`, `lib/conversas/decisoes.ts`). O aviso fixo aparece só na seção `servico`.

_Drafted by /sync from the introducing change, worth a quick human pass._
