# 0012. Importador SICAM e vistoria em campo

**Date**: 2026-10-02
**Status**: Accepted

## Summary

Esta é a fatia 2 da gestão de ativos (spec 0011). Ela tem duas partes que se constroem separadas. A vistoria leva a equipe a campo pelo celular para dar local aos ativos, conferir os dados técnicos e cadastrar o que o SICAM não tem (elevador, QGBT, SPDA, hidrante), inclusive no subsolo sem sinal. O importador deixa o Admin subir o CSV bruto do SICAM, ver o que é novo, o que mudou e o que sumiu, e aplicar só o que ele marcar. A vistoria vem primeiro, porque os 108 do Tier A já estão no banco e esperam local.

## Structure

- [0001-vistoria-campo.md](0001-vistoria-campo.md): campanha de vistoria, tela de campo com fila offline no IndexedDB (banco local do navegador), cadastro em campo e cobertura por prédio. Decide como o trabalho sem sinal chega ao servidor sem duplicar nem sobrescrever. AC-1 a AC-16.
- [0002-importador-sicam.md](0002-importador-sicam.md): upload do CSV bruto, parse com os reparos do export, diferença em três grupos, revisão item a item e aplicação que só escreve em `camposPatrimoniais`. Decide como o Sigma acompanha o SICAM sem perder o que nasceu em campo. AC-17 a AC-27.

## Requirements

**User stories**:

- Como vistoriador (servidor ou contratada), quero conferir e cadastrar equipamentos na sala onde estou, mesmo sem sinal, para não ter que anotar em papel e digitar depois.
- Como Preposto, quero ver quanto de cada prédio já foi conferido, para saber onde mandar a equipe.
- Como Admin, quero subir o export do SICAM e ver antes o que vai mudar, para manter o inventário em dia sem estragar o que a vistoria já acertou.

**Acceptance criteria**: cada parte traz os seus, com numeração única no conjunto (AC-1 a AC-16 na vistoria, AC-17 a AC-27 no importador). Eles são o contrato do `/develop` e do `/check verify`.

## Decision

**Chosen option**: vistoria com campanha leve e fila offline sem service worker; importador em duas etapas (diferença guardada, aplicação item a item) por rota POST com multipart.

- Vistoria: o celular baixa um pacote com tudo que é vistoriável, confere e cadastra gravando numa fila no IndexedDB (pela biblioteca `idb`) e sobe a fila em lote por `POST /api/vistoria/sincronizar`, com um identificador por operação para reenviar sem duplicar. A primeira conferência que chega vence.
- Importador: `POST /api/ativos/importacoes` lê o CSV em cp1252, repara as linhas, classifica, compara com o banco (com os mesmos normalizadores da carga) e grava uma `ImportacaoPatrimonial` pendente. O Admin revisa e aplica por Server Action, item a item, com escritas condicionais que podem ser repetidas. Depois de aplicada ou descartada, a importação perde os dados pessoais.

Reasoning and options: see [rationale.md](rationale.md).

## Cross part contract

Regras que as duas partes respeitam juntas:

- **Quem escreve o quê no `Ativo`.** O importador escreve só em `camposPatrimoniais` (e cria o ativo novo). A vistoria escreve `localizacaoId`, `fabricante`, `modelo`, `numeroSerie` e `statusCadastro`. Nenhuma das duas muda `status`, `categoriaId`, `criticidade` ou `tierManutencao` de ativo existente. Assim, importar de novo nunca desfaz uma conferência, e conferir nunca apaga dado patrimonial. O `numeroSerie` de cima é da vistoria; o importador só mexe em `camposPatrimoniais.numeroSerie` (e preenche o de cima apenas ao criar o ativo, como a carga). As duas partes escrevem por `updateOne` com `$set` e `$unset` por caminho, nunca com `save()` de um documento carregado nem trocando `camposPatrimoniais` inteiro.
- **Vistoriável** = `tierManutencao` A ou B e `status` diferente de `baixado`. A cobertura, o pacote do campo e a lista de esperados na sala usam a mesma regra, numa constante só (`FILTRO_VISTORIAVEL` em `lib/vistoria/`).
- **Marca de ausente.** `camposPatrimoniais.ausenteNoSicamDesde` é escrita só pelo importador. O pacote do campo leva só um booleano `ausenteNoSicam` (sem data, sem dado pessoal), para o vistoriador ver o selo.
- **Dado pessoal.** Nome e matrícula do responsável nunca saem do servidor para o celular, nunca vão para o `AtivoHistory` (a linha do tempo da ficha é vista pelos quatro perfis) e só ficam na importação enquanto ela está pendente.
- **Histórico.** Toda escrita em ativo, das duas partes, grava `AtivoHistory` pelo `gravarHistoricoOuDesfazer` de `lib/ativos/auditoria.ts`, como na 0011.
- **Novas ações de `AtivoHistory`** (em `shared/ativos/ativo.constants.ts`, com rótulo): `conferencia` (Conferido na vistoria), `importacao_patrimonial` (Dados do SICAM atualizados), `ausente_sicam` (Ausente do SICAM), `retorno_sicam` (Voltou ao SICAM).

## Build plan

Tracer Bullet, vistoria primeiro. Cada passo funciona de ponta a ponta antes do próximo. Os detalhes de cada passo estão na parte correspondente.

**Parte 1: vistoria** ([0001-vistoria-campo.md](0001-vistoria-campo.md), seção _Build plan_, passos V1 a V6)

**Parte 2: importador** ([0002-importador-sicam.md](0002-importador-sicam.md), seção _Build plan_, passos I1 a I4)

**Operação** (depois de V3 em produção): o Admin cria as categorias `elevador`, `spda`, `copa_refrigeracao` e `copa_coccao` em `/configuracoes/categorias-ativo`, e a equipe abre a campanha "Vistoria inicial" e cadastra em campo os ativos MNT de elevador, QGBT, SPDA e hidrante; satisfies **AC-16**.

## Consequences

**Positive**:

- Os 108 do Tier A ganham local e dados técnicos, e o filtro por prédio e a sugestão de `localExato` da 0011 passam a valer.
- O Sigma passa a ter os ativos de maior criticidade legal, que o SICAM nunca vai trazer.
- O inventário acompanha o SICAM sem script manual na VPS e sem passar o CSV pela máquina de desenvolvimento.
- Reenviar, repetir e recarregar não duplicam nada: a fila e a aplicação são seguras para repetir.

**Negative / tradeoffs**:

- Sem service worker, a tela de campo não abre do zero sem sinal: precisa ser aberta com sinal antes de descer. A fila sobrevive, a tela não.
- Sem HTTPS a câmera continua fora; em campo a leitura é por digitação ou leitor USB.
- A primeira conferência vence: se a primeira estiver errada, a correção é pela edição do ativo na ficha, não por outra conferência na mesma campanha.
- O CSV passa pelo navegador e pelo servidor do Sigma com nome e matrícula; o limite de 10 MB do nginx vale também aqui.
- Duas dependências novas no cliente e nos testes (`idb`, `fake-indexeddb`), com a conferência do lock para o Alpine.

**Neutral**:

- O gerador da carga da 0011 (`scripts/gerar-carga-ativos.ts`) fica como está; o importador não o substitui no código, só na operação.
- O Técnico ganha escrita em ativo, mas só pela sincronização da vistoria; as actions da 0011 continuam recusando.

## Follow-up

- [ ] Ligar TLS na produção (já pedido na 0011 e na auditoria de 25/05/2026). Libera a câmera em campo e abre caminho para um service worker que reabra a tela sem sinal, numa spec futura.
- [ ] Quem imprime as etiquetas `MNT-` e em que formato (QR com o código). A tela só mostra o código para etiquetar.
- [ ] Com que frequência o SERPAT gera o export do SICAM. O desenho não depende disso.
- [ ] Os 171 ares com `SAIU`: a vistoria vai responder se estão instalados. Se estiverem, entram pelo cadastro em campo como patrimoniados.
- [ ] Reabrir campanha encerrada não existe nesta fatia.
- [ ] `/sync`: a regra "carga e importação só criam" da 0011 e de `lib/ativos/AGENTS.md` passa a valer só para a carga; o importador escreve em `camposPatrimoniais` (ver o contrato acima).
- [ ] `/sync`: registrar no `AGENTS.md` raiz e em `lib/ativos/AGENTS.md` os modelos novos, as rotas, a fila offline e a recusa de Agent Skill para `idb` na linha `Declined:`.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
