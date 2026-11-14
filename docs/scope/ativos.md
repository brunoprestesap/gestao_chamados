# Escopo: Gestão de ativos

Parte do escopo do Sigma. Tabela geral, Deferred e legenda em [index.md](index.md).

## Gestão de ativos

Proposta completa em `docs/specs/0011-gestao-ativos/proposta.md`. Cada fatia da proposta vira uma funcionalidade.

### 23. Gestão de ativos: cadastro, etiqueta e vínculo · done

O chamado passa a apontar para o equipamento: árvore de locais, categorias, ativo, carga dos 108 do Tier A, leitura de etiqueta e vínculo no formulário e na gestão.
**Done when:** os 108 ativos estão carregados; ler ou digitar o tombamento abre a ficha; dá para abrir chamado a partir dela, e o chamado aparece no histórico da ficha; a gestão vincula ou corrige o ativo de qualquer chamado aberto.
spec [0011](../specs/0011-gestao-ativos/index.md) · code in `lib/ativos/`, `app/(dashboard)/ativos/`, `models/Ativo.ts`

- [x] Design it (spec): `/architect gestão de ativos fatia 1`
- [x] Build it: `/develop gestão de ativos fatia 1`
  - [x] O fio: modelos, carga do Tier A, leitura digitada, ficha e chamado com ativo · AC-4, AC-8, AC-9, AC-11, AC-13, AC-14, AC-15
  - [x] Cadastro de verdade: árvore de locais, categorias, CRUD do ativo, status e validação · AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
  - [x] Uso diário: lista com filtros, câmera, atalho de cadastro e vínculo na gestão · AC-10, AC-11, AC-12, AC-16
  - [x] Testes de banco real, de permissão e E2E do fio · AC-2, AC-4, AC-5, AC-17
- [x] Verify it: `/check verify gestão de ativos fatia 1`
- [x] Test it: `/test gestão de ativos fatia 1`

### 24. Importador SICAM e vistoria em campo · done

Importar o CSV bruto do SICAM com diferença e revisão, e conduzir a vistoria pelo celular, inclusive sem sinal. from spec 0011
**Done when:** o Admin sobe o CSV, revisa novos, alterados e sumidos e aplica; a vistoria mostra cobertura por prédio; o cadastro em campo funciona offline e sincroniza; os ativos `MNT-` (elevador, QGBT, SPDA, hidrante) estão cadastrados.
spec [0012](../specs/0012-importador-sicam-vistoria/index.md) · code in `lib/vistoria/`, `lib/vistoria-offline/`, `app/(dashboard)/ativos/vistoria/`, `app/api/vistoria/`, `lib/ativos/importacao/`, `app/(dashboard)/ativos/importar/`, `app/api/ativos/importacoes/`

- [x] Design it (spec): `/architect importador SICAM e vistoria`
- [x] Build it: `/develop importador SICAM e vistoria`
  - [x] Vistoria, o fio e sem sinal: campanha, pacote, fila no IndexedDB, sincronização em lote, primeira que chega · AC-1, AC-3 a AC-10, AC-15
  - [x] Vistoria, cadastro em campo e cobertura: cadastro patrimoniado e MNT offline, local em campo, cobertura por prédio, ficha · AC-2, AC-11 a AC-14
  - [x] Importador, parse e diferença: CSV bruto cp1252, classificação, novos, alterados e sumidos · AC-17 a AC-20, AC-26
  - [x] Importador, revisão e aplicação: seleção, categorias, aplicação repetível, enxugamento LGPD, permissões · AC-21 a AC-25, AC-27
  - [x] Operação: categorias novas e cadastro dos MNT em campo · AC-16
- [x] Verify it: `/check verify importador SICAM e vistoria` (câmera aceita como coberta, ver `verify.md`)
- [x] Test it: `/test importador SICAM e vistoria`

### 25. Documentos do ativo e preventiva por categoria · done

Laudos e certificados com alerta de vencimento, e chamados preventivos gerados por ativo. from spec 0011
**Done when:** PMOC, AVCB, ART e laudos têm validade e alerta em 90, 60 e 30 dias; o recorrente por categoria gera um chamado por ativo em operação.
spec [0013](../specs/0013-documentos-preventiva-ativo/index.md) · code in `lib/ativos/documentos/`, `app/(dashboard)/ativos/documentos/`, `app/api/ativos/documentos/`, `lib/chamados/preventiva-categoria.ts`, `app/(dashboard)/gestao/recurring/`

- [x] Design it (spec): `/architect documentos e preventiva por ativo`
- [x] Build it: `/develop documentos e preventiva por ativo`
  - [x] Documentos, o fio: modelos, carga dos tipos, upload, download, seção na ficha, nginx · AC-1, AC-3, AC-8, AC-10, AC-15
  - [x] Documentos, ciclo e cobertura: substituição, correção, exclusão, histórico, documento de local e herança, tipos e exigência, painel com Faltando · AC-2, AC-4 a AC-9
  - [x] Documentos, alerta: job diário, marca por limite, sino e e-mail · AC-11 a AC-14
  - [x] Preventiva por categoria: escopo novo, lote validado com SLA, pulados, reserva, pausa, aviso de lote e tela · AC-16 a AC-25
- [x] Verify it: `/check verify documentos e preventiva por ativo` (nginx de 21M aceito para conferir depois do deploy, ver `verify.md`)
- [x] Test it: `/test documentos e preventiva por ativo`

### 26. Ativo pela IA no chat e indicadores no IMR · done

A IA reconhece o equipamento na conversa, e o IMR ganha MTBF, MTTR, reincidência e os ativos mais problemáticos. from spec 0011
**Done when:** a conversa sugere o ativo (ou pede a escolha entre candidatos) sem passar pelo portão de confiança; o IMR mostra os indicadores de ativo como informativos.
spec [0014](../specs/0014-ativo-chat-indicadores/index.md) · code in `lib/assistente/ativo-do-cartao.ts`, `lib/ativos/indicadores.ts`, `app/(dashboard)/conversas/_components/LinhaEquipamento.tsx`, `app/(dashboard)/relatorios/imr/_components/imr-ativos.tsx`

- [x] Design it (spec): `/architect ativo no chat e indicadores`
- [x] Build it: `/develop ativo no chat e indicadores`
  - [x] O fio pelo código digitado: cartão com o ativo, confirmação conferida e log · AC-1, AC-4, AC-5, AC-7, AC-8, AC-9, AC-13
  - [x] Decisão `ativo` fora da IA: registro, exclusões e correção pela gestão · AC-10, AC-11, AC-12
  - [x] A regra por categoria, unidade e local, com até 5 candidatos e troca de unidade · AC-2, AC-3, AC-4, AC-5, AC-6
  - [x] Aba Ativos no IMR: MTBF, MTTR, reincidência e ranking · AC-14, AC-15, AC-16, AC-17, AC-18, AC-19
  - [x] Linha de indicadores na ficha do ativo · AC-20
- [x] Verify it: `/check verify ativo no chat e indicadores`
- [x] Test it: `/test ativo no chat e indicadores`

### 27. Candidatos à substituição · done

O Sigma aponta sozinho os equipamentos que passaram da vida útil ou quebram demais (corretivos em 12 meses, reincidência em 90 dias), usando os números da 0014, e a gestão dispensa por 6 meses com motivo. from proposta da spec 0011, fatia 5
**Done when:** o Admin vê a lista de ativos sinalizados com o motivo de cada um; a regra que sinaliza é conhecida e ajustável; a sinalização é só informativa e nunca muda o ativo nem um chamado sozinha.
spec [0015](../specs/0015-candidatos-substituicao/index.md) · code in `lib/ativos/substituicao.ts`, `app/(dashboard)/ativos/_components/SubstituicaoAtivo.tsx`, `app/(dashboard)/relatorios/imr/_components/imr-ativos.tsx`

- [x] Design it (spec): `/architect candidatos à substituição`
- [x] Build it: `/develop candidatos à substituição`
  - [x] O fio, só leitura: regra pura, datas em Belém, janela de hoje e selo na ficha para a gestão · AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-10
  - [x] Limites por categoria na tela do Admin · AC-6, AC-17
  - [x] Leitura em lote e seção no IMR seguindo o seletor de tipo · AC-5, AC-7, AC-8
  - [x] Dispensa: subdocumento, escrita e desfazer condicionais, histórico sem o motivo, diálogo na ficha e no IMR, voltar a sinalizar · AC-11 a AC-17
  - [x] Filtro "Substituição" na lista de ativos e testes de banco real · AC-3, AC-9, AC-14, AC-17
- [x] Verify it: `/check verify candidatos à substituição`
- [x] Test it: `/test candidatos à substituição`

### 28. Relatório mensal por contrato com ativo · done

Um relatório por mês e por contrato que mostra, por equipamento, os chamados, o tempo de reparo e a reincidência, para acompanhar a empresa contratada. from proposta da spec 0011, fatia 5
**Done when:** o Admin escolhe o mês e o contrato e vê os números por ativo e por categoria; os números batem com o IMR do mesmo período; o relatório sai em formato que dá para anexar ao processo.
spec [0016](../specs/0016-relatorio-mensal-contrato-ativo/index.md) · code in `lib/contratos/`, `app/(dashboard)/relatorios/contrato/`, `app/(dashboard)/configuracoes/contratos/`

- [x] Design it (spec): `/architect relatório mensal por contrato com ativo`
- [x] Build it: `/develop relatório mensal por contrato com ativo`
  - [x] O fio: modelos, janela do mês, topo por `calcularFiltro` e PDF com emissão gravada · AC-6, AC-7, AC-8, AC-10, AC-16, AC-18, AC-20
  - [x] Cadastro de contratos com sobreposição e trava de meses emitidos · AC-1, AC-2, AC-3, AC-4
  - [x] Tela do relatório com seletores, vazios e botão de PDF · AC-5, AC-6, AC-14, AC-16, AC-18
  - [x] SLA, preventivas e tabelas por ativo e por categoria, na tela e no PDF; lista de emissões · AC-9, AC-11, AC-12, AC-13, AC-15, AC-17, AC-19
  - [x] Testes de banco real, paridade com o IMR e conferência do build com a rota real · AC-3, AC-10, AC-16, AC-17
- [x] Verify it: `/check verify relatório mensal por contrato com ativo`
- [x] Test it: `/test relatório mensal por contrato com ativo`

### 30. Custo acumulado por ativo · done

Quanto cada equipamento custou em manutenção: cotações aprovadas (com valor final) mais o material fora de cotação lançado pela gestão, somados na hora. from spec 0014, spec 0015
**Done when:** a gestão lança o material e o valor final no chamado; a ficha, o IMR e o relatório por contrato mostram o mesmo custo para o mesmo ativo e período, só para Admin e Preposto; o custo corretivo em 12 meses acima de um percentual do valor histórico vira candidato à substituição.
spec [0018](../specs/0018-custo-acumulado-ativo/index.md) · code in `shared/chamados/custo*.ts`, `lib/chamados/custo.ts`, `lib/ativos/custo.ts`, `app/(dashboard)/gestao/custo.actions.ts`, `app/(dashboard)/gestao/_components/CustoChamadoSecao.tsx`, `app/(dashboard)/ativos/_components/CustoAtivo.tsx`

- [x] Design it (spec): `/architect custo acumulado por ativo`
- [x] Build it: `/develop custo acumulado por ativo`
  - [x] O fio: item de material lançado na seção "Custo" da gestão até o bloco de custo da ficha, com a conta em centavos · AC-1, AC-3, AC-4, AC-7, AC-8, AC-9, AC-10, AC-11, AC-18, AC-19
  - [x] Editar, remover e valor final da cotação, com histórico só da gestão · AC-2, AC-2a, AC-5, AC-6, AC-18
  - [x] Custo no IMR e no relatório por contrato (tela e PDF) · AC-12, AC-13, AC-14, AC-19
  - [x] Critério de custo na substituição e limite por categoria · AC-15, AC-16, AC-17
  - [x] Testes de banco real do teto e da paridade, e testes de permissão · AC-4, AC-14, AC-18
- [x] Verify it: `/check verify custo acumulado por ativo`
- [x] Test it: `/test custo acumulado por ativo`
