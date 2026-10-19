# 0020. Local vago no chamado aberto e atribuído sozinho

**Date**: 2026-10-19
**Status**: Accepted

## Summary

Desde a correção do chat (PR #61), o cartão resumo aparece assim que a IA reconhece o serviço e há algum local, sem esperar o `completo` do modelo (o campo em que a IA diz se já sabe tudo). Com a autonomia e a atribuição automática ligadas, um chamado com local vago pode nascer `validado` e ir direto a um técnico. Hoje, em produção, as duas estão desligadas, então o risco ainda é teórico: todo chamado do chat passa pelo Preposto. Decidimos aceitar esse risco, sem regra nova no portão (a conferência que decide se a IA pode validar sozinha): quem diz onde é o problema é a pessoa, que confere e edita o local no cartão, e o técnico pergunta pela conversa quando precisar. A decisão volta para a mesa se técnicos ou Prepostos relatarem idas ao lugar errado.

## Context

O cartão resumo da conversa (spec 0004) só aparecia quando o modelo marcava `completo: true`. Em produção, o Qwen deixava esse campo `false` com serviço válido e local dado, sobretudo para quem não tem unidade no perfil, e a conversa pedia o endereço sem fim. A correção (PR #61) tirou o `completo` da regra: o cartão sai com serviço válido do catálogo e local preenchido.

O `completo` era o único lugar em que alguém julgava se o local bastava. Sem ele, nada no caminho até a autonomia olha o local. O portão de confiança (spec 0007, `lib/assistente/portao.ts`) olha só a confiança da prioridade e o modo do cartão, e a atribuição automática (spec 0008) roda sempre que o chamado nasce `validado`. Em produção, em 19/10/2026, as duas estão desligadas: `IaAutonomiaConfig` tem `autonomiaAtiva: false`, `prioridade.limiteConfianca: null` e nenhum `atribuicaoAutomaticaAtiva`. Todo chamado do chat nasce `aberto`, com a prioridade só como sugestão, e o Preposto vê o local antes de atribuir. O risco passa a existir quando o Admin salvar a calibração e ligar as duas em `/configuracoes/ia-confianca`.

O risco não nasceu com a correção. O botão `Revisar e abrir` sempre montou cartão em modo `ia` com serviço válido, sem olhar o `completo` (`lib/assistente/cartao.ts`). A correção só tornou esse caminho o mais comum.

Três coisas já protegem o local: a pessoa vê o local no cartão e pode editá-lo antes de confirmar (spec 0004, AC-6 e AC-7), a unidade vem do perfil ou é escolhida no cartão, e o técnico atribuído comenta na mesma conversa (spec 0005).

## Requirements

**User stories**:

- Como solicitante, quero que o resumo apareça assim que eu disse o serviço e o lugar, para abrir o chamado sem a IA insistir numa pergunta.
- Como técnico, quero conseguir perguntar pela conversa quando o local do chamado não basta, para chegar ao lugar certo.

**Acceptance criteria**:

- **AC-1**: O cartão em modo `ia` nasce quando a proposta tem serviço válido do catálogo e local preenchido, seja qual for o `completo` do modelo (substitui a regra de `completo` do AC-4 da spec 0004). Já entregue no PR #61, coberto por `responder.test.ts`, teste "grava cartão com serviço e local mesmo quando o modelo diz que não está completo".
- **AC-2**: O portão de confiança (spec 0007) e a atribuição automática (spec 0008) continuam sem olhar o local: um chamado confirmado com cartão em modo `ia` e confiança acima do limite nasce `validado` e segue para a atribuição, qualquer que seja o texto do local.
- **AC-3**: O local que vale no chamado é sempre o que a pessoa confirmou no cartão, nunca o texto do modelo sem passar pela confirmação (regra que já vale em `confirmarAbertura`).

## Options considered

### Option 1: Aceitar o risco e registrar

Nenhum código novo. A pessoa é a autoridade sobre o lugar e confere o cartão; o técnico pergunta pela conversa.

**Pros**:

- Nada a construir nem a calibrar; a autonomia continua rodando para todo chamado confiante.

**Cons**:

- Um chamado com "minha sala" pode chegar a um técnico sem que ninguém da gestão veja antes.

### Option 2: Regra fixa do local no portão

A autonomia só vale quando o local passa numa regra (tamanho mínimo, uma palavra como sala, andar ou piso, ou um número); senão o chamado nasce `aberto` e vai ao Preposto.

**Pros**:

- Barata, explicável e determinística.

**Cons**:

- Regra de palavras em português erra para os dois lados: "sala do NUTEC" é preciso e não tem número; "sala ao lado" passa e é vago. Tira da autonomia chamados que estavam certos.

### Option 3: Pedir confirmação do local no cartão

O cartão destaca o local e pede que a pessoa confirme ou detalhe antes de abrir.

**Pros**:

- Mexe só na tela e reforça a conferência.

**Cons**:

- A pessoa já vê e edita o local no cartão; mais um passo cansa sem mudar o que ela sabe.

### Option 4: Usar o `completo` do modelo no portão

Com `completo: false` na última volta, o chamado nasce `aberto`.

**Pros**:

- Reaproveita um sinal que já existe.

**Cons**:

- Nos logs de produção o `completo` veio `false` em todas as voltas, com serviço e local certos: a autonomia quase nunca rodaria, e o sinal não reflete o local confirmado se a pessoa o editou no cartão.

## Decision

**Chosen option**: Option 1: Aceitar o risco e registrar

O portão de confiança e a atribuição automática continuam sem olhar o local; a conferência do local é da pessoa, no cartão, e a correção posterior é do técnico, pela conversa.

## Rationale

O único sinal automático que existia, o `completo`, se mostrou errado justamente no caso que importa (serviço e local certos, `completo: false`), então não serve de trava. Uma regra de palavras troca esse erro por outro, porque precisão de local em português depende do contexto do prédio, que o Sigma não tem. Quem tem esse contexto é a pessoa, e ela já confere o cartão antes de abrir.

O custo de errar é baixo e corrigível: o técnico vê o chamado, pergunta pela conversa (spec 0005) e a pessoa responde. O custo de travar é alto e silencioso: chamados certos deixam de ser atribuídos sozinhos e esperam o Preposto, o que fere o SLA de resposta que a spec 0008 quis encurtar. Por isso a decisão espera um sinal real de dano (queixa de técnico ou Preposto) antes de pagar por uma regra.

## Build plan

Nenhuma tarefa de código: a regra do AC-1 já está no PR #61, e os AC-2 e AC-3 descrevem o comportamento que já existe.

1. Atualizar a spec 0004 (AC-4, o campo `completo`, a linha "decidir se grava cartão" e o cenário de teste do cartão que muda) para apontar para esta spec, por `/architect` depois do merge do PR #61, satisfies **AC-1**
2. Registrar no scope os dois itens de acompanhamento abaixo, satisfies **AC-2**

## Consequences

**Positive**:

- O chat abre o chamado sem insistir no local, e a autonomia continua valendo para todo chamado confiante.
- Nenhuma regra nova a manter nem a calibrar.

**Negative / tradeoffs**:

- Um chamado com local vago pode chegar a um técnico sem passar pela gestão; o técnico perde uma ida ou precisa perguntar.
- Não há medição automática: o problema só aparece quando alguém reclama.

**Neutral**:

- O `completo` continua no schema e no log `[assistente] proposta`, só como diagnóstico.
- Enquanto a autonomia estiver desligada em produção, esta decisão não tem efeito prático; ela vale a partir do dia em que o Admin ligar a autonomia e a atribuição automática.
- Mudar a regra depois é local: uma condição a mais em `confiancaSuficienteParaPrioridade` (`lib/assistente/portao.ts`), sem migração.

## Follow-up

- [ ] **Rever a regra do local vago na autonomia**: reabrir esta spec quando técnicos ou Prepostos relatarem idas ao lugar errado ou perguntas frequentes de local em chamados atribuídos sozinhos
- [ ] **Texto do assistente com o cartão na tela**: o modelo às vezes segue perguntando com o cartão já mostrado, ou diz que o chamado foi aberto; corrigir no prompt, com `PROMPT_VERSION` novo (o que também desliga a autonomia até o Admin salvar a calibração de novo)
