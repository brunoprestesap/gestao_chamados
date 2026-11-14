# Escopo: Material

Parte do escopo do Sigma. Tabela geral, Deferred e legenda em [index.md](index.md).

## Material

Fornecimento de material sob demanda do contrato 01/2022 (empenho específico, fora do valor do contrato), que vence em 28/02/2027.

### 31. Cotação e fornecimento de material · done

O pedido de material sai do e-mail e da planilha: o técnico registra, a contratada cota (Anexo V, SINAPI ou três orçamentos), o fiscal analisa, o aprovador competente autoriza com saldo do empenho, o técnico aplica e o gestor atesta, com trilha que não se apaga.
**Done when:** nenhum material é autorizado sem designação vigente, faixa suficiente e saldo reservado no empenho; a execução só ocorre depois da autorização; o lado TRF1 vê as bases de preço e as advertências, a contratada e o solicitante não; o custo do ativo inclui o material executado; o PDF da trilha é legível por terceiro.
spec [0019](../specs/0019-cotacao-material/index.md) · code in `lib/material/`, `shared/material/`, `app/(dashboard)/cotacoes/`, `app/(dashboard)/configuracoes/material/`, `app/(dashboard)/relatorios/material/`, `app/api/cotacoes/`, `app/api/material/importacoes/`

- [x] Design it (spec): `/architect cotação e fornecimento de material`
- [x] Build it: `/develop cotação e fornecimento de material`
  - [x] Fatia 1, o fio: rascunho do técnico, caminho 3, análise, aprovação por designação e faixa, reserva no empenho com conciliação, execução, trilha, avisos, custo e fechamento do envio antigo · AC-1 a AC-20
  - [x] Fatia 2: recebimento provisório e definitivo, nota fiscal e PDF da trilha · AC-21, AC-22, AC-23
  - [x] Ajustes da revisão de 19/10 (passo 13a): data e aviso da NF, NF pendente sempre visível à contratada, selo só no TRF1, papel na emissão do PDF · AC-15, AC-16, AC-21, AC-22, AC-23
  - [x] Fatia 3: importação do Anexo V e do SINAPI, caminhos 1 e 2, duas bases, lista de anomalia · AC-24 a AC-30
  - [x] Fatia 4: controles de CNPJ, referência (SINAPI ou livre, com a do fiscal), variação e validade, e a urgência com complemento da pesquisa (decisões e regras finas de 20/10) · AC-31 a AC-35
  - [x] Fatia 5: fracionamento, reincidência, projeção, consumo, item parecido, parâmetros, tentativas barradas e relatório · AC-36 a AC-43
- [x] Verify it: `/check verify cotação e fornecimento de material`
- [x] Test it: `/test cotação e fornecimento de material`

### 32. IMR do contrato: indicadores 3 e 4 · done

Os indicadores 3 (tempo de resposta, até o dia útil seguinte) e 4 (fornecimento de material) do IMR do contrato, com pontuação, soma de quatro indicadores em 100 pontos e efeito na glosa. from spec 0019
**Done when:** o fiscal vê por mês as ocorrências de cada indicador e a pontuação, com o defeito aritmético do TR corrigido (RN-50 do funcional da 0019).
spec [0023](../specs/0023-imr-contrato-indicadores/index.md) · code in `lib/imr-contrato/`, `shared/imr-contrato/`, `app/(dashboard)/relatorios/imr-contrato/`

- [x] Design it (spec): `/architect IMR do contrato indicadores 3 e 4`
- [x] Build it: `/develop IMR do contrato indicadores 3 e 4`
  - [x] Indicador 3 em prévia de ponta a ponta: prazo, base, tela, acesso e menu · AC-1, AC-2, AC-3, AC-4, AC-14, AC-16
  - [x] Indicador 4: parâmetro N, `fornecimentoAte` na autorização e cartão · AC-5, AC-6
  - [x] Marcações do fiscal e do gestor · AC-7, AC-8, AC-9 (a recusa com o mês fechado e os intervalos fechados vêm com o fechamento)
  - [x] Fechamento, reabertura, indicadores 1 e 2, soma, faixa e reincidência · AC-10, AC-11, AC-12, AC-15, AC-17, AC-18
  - [x] PDF do fechamento e testes de banco real e axe · AC-13, AC-14, AC-18
- [x] Verify it: `/check verify IMR do contrato indicadores 3 e 4`
- [x] Test it: `/test IMR do contrato indicadores 3 e 4`

### 33. Repaginação das telas da cotação de material · done

As 11 telas da cotação de material redesenhadas sobre o visual do Sigma: a ação de cada papel no topo, a fila com busca e paginação, o editor da contratada em passos e o cartão do chamado por perfil, sem mudar as regras de `lib/material`. from spec 0019
**Done when:** cada papel vê a sua próxima ação no topo do detalhe e do cartão; a fila busca, filtra e pagina pelo endereço e mede o tempo na etapa pela trilha; a contratada monta em passos com a lista do que falta ao vivo; nenhum campo só do TRF1 chega a outra visão; todas as telas funcionam a 390 px; as regras e os testes de `lib/material` seguem iguais.
spec [0021](../specs/0021-redesign-cotacao-material/index.md) · code in `app/(dashboard)/cotacoes/`, `app/(dashboard)/configuracoes/material/`, `app/(dashboard)/relatorios/material/`, `lib/material/leitura.ts`, `lib/material/serializar.ts`, `shared/material/`

- [x] Design it (spec): `/architect repaginação das telas da cotação de material`
- [x] Build it: `/develop repaginação das telas da cotação de material`
  - [x] Peças compartilhadas, fila, detalhe e ateste (fatias 1 a 3) · AC-1 a AC-9, AC-24 a AC-29
  - [x] Diálogos e editor da contratada em passos (fatias 4 e 5) · AC-10 a AC-15
  - [x] Cartão no chamado e cadastro de material (fatias 6 e 7) · AC-16 a AC-22
  - [x] Relatório de material (fatia 8) · AC-23
- [x] Verify it: `/check verify repaginação das telas da cotação de material`
- [x] Test it: `/test repaginação das telas da cotação de material`

### 34. Motivo e histórico no cadastro de material · done

Revogar designação, desativar faixa e inativar empenho passam a pedir motivo e a deixar histórico; hoje a confirmação da 0021 evita o clique errado, mas não registra o porquê. Muda schemas e actions de `lib/material`, por isso spec própria. from spec 0021
**Done when:** cada um dos três atos exige motivo; o histórico mostra quem fez, quando e por quê, só para o lado TRF1; nada já gravado muda de sentido.
spec [0022](../specs/0022-motivo-historico-cadastro-material/index.md) · code in `lib/material/cadastro.ts`, `models/DesignacaoMaterial.ts`, `models/FaixaCompetencia.ts`, `models/Empenho.ts`, `app/(dashboard)/configuracoes/material/`, `shared/material/`

- [x] Design it (spec): `/architect motivo e histórico no cadastro de material`
- [x] Build it: `/develop motivo e histórico no cadastro de material`
  - [x] Designação de ponta a ponta: motivo no diálogo, na escrita e na linha, com a revogação automática (fatia 1) · AC-1, AC-4, AC-5, AC-6, AC-7
  - [x] Faixa com data, autor e motivo (fatia 2) · AC-2, AC-4, AC-6, AC-7
  - [x] Empenho com histórico protegido, corrida e linha do tempo única (fatia 3) · AC-3, AC-4, AC-5, AC-6, AC-7
  - [x] Varredura de visibilidade, permissão e axe (fechamento) · AC-8, AC-9
- [x] Verify it: `/check verify motivo e histórico no cadastro de material`
  - [ ] Dois passos manuais ainda abertos no `verify.md`: o nome do Admin desativado no histórico (AC-6) e nenhum ato do cadastro na cotação, no cartão, na fila e no PDF (AC-8)
- [x] Test it: `/test motivo e histórico no cadastro de material`

### 35. Decisões do contrato para operar a cotação

O código da cotação está pronto, mas o uso real depende de respostas do gestor e do fiscal e do cadastro inicial. Sem código novo, salvo se a pendência 5 pedir o ato único (ver Deferred). As pendências estão na seção 18 do [funcional da 0019](../specs/0019-cotacao-material/funcional.md). from spec 0019, spec 0023
**Done when:** empenho, faixas e designações estão cadastrados em produção e uma cotação real pode ser aprovada; o Anexo V foi importado depois de conferidos o item 74 e a repactuação; cada decisão do gestor está registrada no processo.

- [ ] Cadastro em `/configuracoes/material`, para aprovar a primeira cotação
  - [ ] Pendência 3: faixas de alçada e titulares da delegação (sem isso, nada é aprovado)
  - [ ] Pendência 4: número, valor e saldo do empenho do exercício (sem empenho elegível, a cotação não é encaminhada nem aprovada)
- [ ] Antes da primeira importação do Anexo V
  - [ ] Pendência 2: conferir o item 74 (R$ 432,00/m contra R$ 3,54/m estimados), ou marcá-lo na lista de anomalia
  - [ ] Pendência 7: confirmar se houve repactuação dos preços nos aditivos
- [ ] Decisões do gestor e do fiscal
  - [ ] Pendência 1: qual base prevalece, Anexo V ou SINAPI (enquanto não houver, o fiscal escolhe e justifica)
  - [ ] Pendência 9: confirmar a regra de urgência antes de usar em produção (é proposta da spec, não do TR)
  - [ ] Pendência 5: análise e aprovação em ato único nos caminhos 1 e 2, ou manter as duas etapas
  - [ ] Pendências 6 e 8: confirmar o percentual sobre o SINAPI (hoje 10%) e a janela de fracionamento (hoje 90 dias)
  - [ ] Comunicar ao gestor a divergência aritmética do TR (RN-50) e o N = 5 do indicador 4, para constar do processo
- [ ] Próxima contratação (o contrato vence em 28/02/2027)
  - [ ] Pendência 10: estágio da instrução da nova contratação, que decide se o fluxo segue no próximo contrato
  - [ ] Levar ao novo TR o prazo de fornecimento explícito e o marco de início do atendimento
- [ ] Checagem do almoxarifado em uso real (from spec 0024)
  - [ ] Trocar a conta do `sicam-gateway` pela conta de serviço do DBA, com `SELECT` só nas duas tabelas (hoje roda com a conta do frequenciajus)
  - [ ] Validar com o almoxarifado, numa linha real, que `VL_ATU / QT_SALDO_ATU` é o preço médio e o que significa `ALMX_QT_RESERVADA`
  - [ ] Levar a etapa nova às regras do `funcional.md` da 0019 e o desenho ao fiscal e ao gestor

### 36. Checagem do almoxarifado antes da cotação · done

O material pedido pelo técnico é conferido contra o estoque do almoxarifado do SICAM antes de seguir para a cotação da contratada, para não cotar o que já existe na casa.
**Done when:** todo pedido de material do técnico passa pela checagem antes da etapa de cotação; o que tem saldo no almoxarifado não segue para cotar sem uma decisão registrada; o resultado da checagem e a data do saldo consultado ficam na trilha da cotação.
spec [0024](../specs/0024-checagem-almoxarifado-cotacao/index.md) · code in `sicam-gateway/`, `lib/material/checagem.ts`, `lib/material/sicam.ts`, `shared/material/checagem.ts`, `app/(dashboard)/cotacoes/_components/checagem/`

- [x] Design it (spec): `/architect checagem do almoxarifado antes da cotação`
- [x] Build it: `/develop checagem do almoxarifado antes da cotação`
  - [x] O fio inteiro: serviço `sicam-gateway`, interruptor, papel `almoxarifado`, etapa `em_checagem`, liberação automática e decisão simples (fatia 1) · AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-9, AC-10, AC-11, AC-14, AC-25, AC-26, AC-27, AC-29
  - [x] Decisão completa, situação final e pausa de SLA (fatia 2) · AC-6, AC-7, AC-8, AC-11, AC-18, AC-19, AC-27
  - [x] Falhas e item novo: registro manual, fiscal, prazo, avisos e `reenviar_checagem` (fatias 3 e 4) · AC-4, AC-12, AC-13, AC-15, AC-16, AC-17, AC-20
  - [x] Custo nos quatro lugares (fatia 5) · AC-21, AC-22, AC-23
  - [x] Visões, PDF, relatório, E2E e implantação (fatias 6 e 7) · AC-1, AC-24, AC-25, AC-27, AC-28, AC-29
- [x] Verify it: `/check verify checagem do almoxarifado antes da cotação`
  - [ ] Um passo manual ainda aberto no `verify.md`: o Oracle real com a conta de serviço do DBA, a partir da VPS (AC-29), acompanhado na 35. O AC-20 (e-mail e socket sem valor) e o AC-21 (recusa zera a parte) ficaram cobertos por teste
- [x] Test it: `/test checagem do almoxarifado antes da cotação`

### 37. Pausa do chamado que fica aberta quando a retomada falha

Quando `retomarPelaCotacao` devolve falso, o `pauseLogId` da cotação é limpo mesmo assim e o `PauseLog` do chamado fica aberto, congelando o SLA. Já existia, e a etapa de checagem da 0024 deixa mais frequente (chamado cancelado durante `em_checagem`). from spec 0024
**Done when:** nenhuma transição da cotação limpa o `pauseLogId` sem a pausa do chamado ter sido fechada; o chamado cancelado ou recusado durante `em_checagem` não deixa pausa aberta; um teste de banco real prova o caso.
code in `lib/material/chamado.ts` (`retomarPelaCotacao`, `soltarPausaDaCotacao`) e `lib/material/transicoes.ts`

- [x] Build it: `/develop pausa aberta quando a retomada pela cotação falha`
- [x] Verify it: `/check verify pausa aberta quando a retomada pela cotação falha`
- [x] Test it: `/test pausa aberta quando a retomada pela cotação falha`
