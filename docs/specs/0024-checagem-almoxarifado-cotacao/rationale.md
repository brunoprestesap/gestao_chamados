# 0024. Checagem do almoxarifado antes da cotação: razões

## Context

> ⚠️ Premise note: a varredura de 04/11/2026 mostra que o almoxarifado tem saldo em só 132 de 9.691 materiais, quase todos de escritório. Na busca por itens comuns de manutenção (lâmpada, disjuntor, torneira, reator e outros), 214 materiais estão no catálogo e só 1 tem saldo. Os acertos devem ser raros, embora possam valer bastante (placa do VRF a R$ 8.783). O contrato vence em 28/02/2027, com material estimado em R$ 12.000 por ano, e esta spec soma um container, um papel e duas situações. Uma alternativa mais leve (consulta humana no SICAM, sem integração) teria o mesmo efeito de controle nesse volume. A integração foi escolhida com esse dado à vista, e por isso a spec pede uma revisão do valor depois de 3 meses.

Hoje o técnico registra o material em texto livre, e a cotação nasce `rascunho`, já na mão da contratada. Ninguém olha o estoque antes. Um item que existe na prateleira pode ser pesquisado, cotado, aprovado e pago de novo. O lado TRF1 só vê a cotação depois do envio (AC-1 da spec 0019), então o controle precisa nascer antes disso, ou a contratada já terá gastado o trabalho.

O Sigma não tinha dado de estoque, e a spec 0011 partiu da premissa de que o SICAM só exporta CSV. O `simap` provou o contrário: lê o Oracle direto. Essa leitura vem com duas restrições: o Oracle exige o modo Thick do driver por causa da senha no formato 10G, e o Instant Client precisa de glibc, enquanto o `next-app` roda em Alpine com um lock sensível ao musl.

A etapa nova encosta em regras delicadas do módulo: a máquina de estados única, a pausa de SLA que nasce só no envio, a regra de que os quatro lugares mostram o mesmo custo, e a de que a contratada não vê dado interno do TRF1.

## Options considered

### Fonte do saldo

**Opção 1: consulta humana no SICAM, com registro no Sigma.** Saldo do momento, sem casar texto e sem infraestrutura. Contra: depende de digitação em todo pedido, sem prova de que o número veio do SICAM, e sem preço confiável para o custo.

**Opção 2: CSV importado.** Reaproveita o padrão de importação. Contra: o saldo envelhece entre as cargas, e ninguém sabe se o SICAM exporta o estoque.

**Opção 3: leitura direta do Oracle (escolhida).** Saldo e preço do momento, sem digitação, e permite a liberação automática. Contra: dependência de um sistema legado sem contrato, mais infraestrutura e uma credencial a guardar.

### Como conectar

**Opção 1: serviço próprio em Debian (escolhida).** Isola o driver, o Instant Client e a senha, como o `socket-server` já isola o Socket.IO. Contra: sexto container.

**Opção 2: trocar o Next para Debian.** Sem container novo. Contra: muda a base da aplicação inteira por causa de uma consulta, e o histórico do lock já quebrou deploy duas vezes.

**Opção 3: rota no `simap`.** Nada a instalar. Contra: liga a disponibilidade e o deploy de dois sistemas, e o `simap` não tem rotas de API como padrão.

**Opção 4: conta nova em modo Thin.** A versão do Oracle permite, então o driver puro em JavaScript poderia rodar no Alpine, sem Instant Client. Contra: depende do DBA gerar a senha em formato novo, e isso não está garantido. O serviço escolhido já deixa essa porta aberta: sem o diretório do Instant Client, roda em Thin.

### Quando ler

**Opção 1: ao vivo (escolhida).** Sem cópia para envelhecer, e a data do saldo é a da decisão. Contra: depende do Oracle no momento, o que o registro manual cobre.

**Opção 2: cópia diária.** Busca rápida e independente. Contra: saldo de até um dia, e uma coleção a manter. O volume não pede.

### Item sem candidato

**Opção 1: libera sozinho e registra (escolhida).** A fila humana só existe quando há o que decidir. Contra: sinônimos passam.

**Opção 2: sempre passa por pessoa.** Leitura mais estrita do escopo. Contra: com 132 materiais em estoque, quase toda checagem responderia "não tem", atrasando o reparo.

### Situação final quando o estoque atende tudo

**Opção 1: cancelada com motivo fixo.** Menos listas para mudar. Contra: mistura com cancelamento de verdade, e o relatório precisa separar.

**Opção 2: situação nova (escolhida).** Clara na fila e no relatório. Contra: mexe em jornada, desvios, filtros, cartão e PDF.

## Rationale

O desenho segue a ordem do risco. A leitura direta só é aceitável porque nunca decide sozinha o que tem saldo e nunca prende o pedido: se o Oracle cair, uma pessoa registra o que viu, e a origem fica marcada. O serviço separado mantém a falha contida: o pior caso é a checagem cair para o registro manual, sem tocar no resto do Sigma. O interruptor deixa o código subir antes da conta de serviço e das designações, como já foi feito na atribuição automática da spec 0008.

A etapa fica antes do rascunho porque o escopo pede para não cotar o que existe, e qualquer ponto depois disso já gastou o trabalho da contratada. Pausar só durante a checagem mantém o IMR honesto: a espera pelo TRF1 não conta contra a contratada, e o tempo de montar segue contando como hoje.

Quatro escolhas foram contra a minha recomendação inicial, e vale deixar os custos à vista. A integração direta e o novo papel somam infraestrutura e cadastro para um volume pequeno, e eu havia sugerido consulta humana e o fiscal. A sugestão automática por palavras pede a regra de `palavrasDaBusca`, e em troca permitiu a liberação automática, que na prática é o que torna a etapa suportável. A situação final nova mexe em mais listas que um cancelamento marcado. O custo com o preço do SICAM muda números que já foram apresentados e os candidatos à substituição, e assume que o preço médio é confiável, ponto que o Follow-up pede para validar. Todas funcionam; a primeira a rever, se os números de 3 meses forem fracos, é a integração.

Sobre a confirmação da retirada: como o custo conta na conclusão do chamado, e não há registro da entrega, um item decidido e não retirado entra no custo. Aceito, porque confirmar a entrega criaria uma pendência a mais por item, e o SICAM continua sendo quem controla a saída.

## Varredura do SICAM (04/11/2026)

Feita com consultas somente de leitura, a partir desta estação, usando a configuração do `simap` a pedido do engenheiro. Só estrutura, agregados e descrições de material; nenhuma tabela com matrícula foi lida.

**Banco**: Oracle, schema `SICAM`.

**`SICAM.MATERIAL`** (9.691 linhas, sem índice de texto, chave `CO_MAT`):

| Coluna           | Uso aqui               | O que a varredura mostrou                                                |
| ---------------- | ---------------------- | ------------------------------------------------------------------------ |
| `CO_MAT`         | Código                 | Chave; números de 10 dígitos                                             |
| `DE_MAT`         | Descrição              | VARCHAR2(4000), obrigatória, com quebras de linha no texto               |
| `CO_UNID_MEDIDA` | Unidade                | Texto curto: UN (109 dos com saldo), CX, PAR, PCT, FL, RES, RO, BOB, CTO |
| `QT_SALDO_ATU`   | Saldo                  | 132 linhas acima de zero; nenhuma negativa                               |
| `VL_ATU`         | Valor total em estoque | Nenhum material com saldo está sem valor                                 |
| `QT_RESERVADA`   | Não usada              | Zero em todas as linhas                                                  |
| `FG_DESUSO`      | Filtro                 | Null ou `S`; 860 em desuso, nenhum com saldo                             |

`QT_SALDO_MES_ANT + QT_ENTR_MES - QT_SAIDA_MES_MAT = QT_SALDO_ATU` fecha em todas as 9.691 linhas, então o saldo é mantido em dia. A última movimentação em `ALMOXARIFADO_MOVIMENTACAO` é de 03/11/2026, com 518 nos últimos 12 meses.

**`SICAM.ALMOXARIFADO_MATERIAL`** (12.342 linhas): `ALMX_CODIGO`, `ALMX_CO_MAT`, `ALMX_QT_ENTR`, `ALMX_QT_SAIDA`, `ALMX_QT_SALDO`, `ALMX_QT_RESERVADA`. Dos 4.114 materiais que têm linha, em 4.113 a soma bate com `QT_SALDO_ATU`. Uma linha diverge, e 9 materiais com saldo na `MATERIAL` não têm saldo positivo aqui. 15 linhas têm reserva acima de zero.

**`SICAM.ALMOXARIFADO_CADASTRO`**: 501 Principal (123 materiais com saldo), 502 Laranjal do Jarí (nenhum) e 503 Oiapoque (nenhum).

**O que há em estoque de interesse da manutenção** (cerca de 20 dos 132): placas de controle Mitsubishi do VRF (R$ 8.783, 8 unidades), válvulas de expansão Mitsubishi (R$ 1.781 a R$ 2.176, 24 unidades), válvulas esféricas Danfoss (R$ 93 a R$ 96, 106 unidades), joelho, T e união galvanizados, mola de piso, fechadura biométrica, alavancas de inox, abraçadeiras, conector RJ-45 e pilhas. O restante é papelaria, toner, copa, bandeiras e mobiliário.

Os scripts ficaram só na pasta temporária da sessão. Os números são desta data, e o saldo muda a cada dia.
