# lib/ativos: gestão de ativos

As regras do módulo de ativos (spec 0011): árvore de locais, categorias, cadastro do ativo com histórico, o seletor do chamado, a ficha, a lista, o vínculo com chamado e a carga do Tier A. As telas estão em `app/(dashboard)/ativos/` e `app/(dashboard)/configuracoes/categorias-ativo/`; as rotas de leitura, em `app/api/ativos/`. Specs: `docs/specs/0011-gestao-ativos/` (com a proposta completa em `proposta.md`), para vistoria e importador `docs/specs/0012-importador-sicam-vistoria/`, para documentos, `docs/specs/0013-documentos-preventiva-ativo/` e, para candidatos à substituição, `docs/specs/0015-candidatos-substituicao/`.

## Arquivos principais

| Arquivo                              | O que tem                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `localizacao.ts`                     | Criar, editar, mover e desativar local; `recalcularSubarvore` (idempotente); `idsDaSubarvore` (filtro por prédio); `listarLocaisAtivos` em ordem de árvore                                                         |
| `cadastro.ts`                        | `criarAtivo`, `editarAtivo`, `alterarStatusAtivo`, `validarAtivo`, `proximoCodigoInterno` (`MNT-####`)                                                                                                             |
| `categoria.ts`                       | Categorias de ativo (só Admin)                                                                                                                                                                                     |
| `seletor.ts`                         | `FILTRO_VINCULAVEL`, a busca do seletor e `buscarAtivoVinculavel`, com o tipo e o subtipo sugeridos                                                                                                                |
| `vinculo.ts`                         | `vincularAtivoAoChamado`, usado por `vincularAtivoChamadoAction` na gestão                                                                                                                                         |
| `ficha.ts`                           | `carregarFicha`, já recortada pelo perfil; `destinoDoChamado`                                                                                                                                                      |
| `lista.ts`, `opcoes.ts`, `resumo.ts` | A lista de `/ativos`, as opções dos formulários e o `ativo` do DTO do chamado                                                                                                                                      |
| `auditoria.ts`                       | `gravarHistoricoOuDesfazer`                                                                                                                                                                                        |
| `codigo.ts`                          | `normalizarCodigo` (sem `server-only`: o cliente também usa)                                                                                                                                                       |
| `carga.ts`, `carga-script.ts`        | Parser do CSV e o script mongosh da carga (gerado por `scripts/gerar-carga-ativos.ts`)                                                                                                                             |
| `indicadores.ts`                     | MTBF, MTTR, reincidência e ranking (spec 0014): `calcularIndicadoresAtivos` para a aba Ativos do IMR e `indicadoresDoAtivo` para a ficha                                                                           |
| `substituicao.ts`                    | Candidatos à substituição (spec 0015): `avaliarSubstituicao` (a regra, pura), `listarSituacoesSubstituicao` (IMR e lista), `situacaoSubstituicaoDaFicha`, `idsDoFiltroSubstituicao` e as duas escritas da dispensa |
| `importacao/`                        | Importador do CSV do SICAM (spec 0012): `parse.ts` (cp1252 e reparos), `classificacao.ts`, `diferenca.ts`, `revisao.ts`, `aplicar.ts`, `pendente.ts`, `enxugar.ts`                                                 |
| `documentos/`                        | Documentos do ativo e do local (spec 0013): `gravar.ts` (cadastro com substituição, correção, exclusão), `situacao.ts` (datas e limites), `ficha.ts`, `painel.ts`, `alerta-job.ts`, `aviso.ts`, `tipos.ts`         |

## Convenções

- Escrita em ativo e em local é de Admin e Preposto; categoria, só de Admin. As actions usam `verifySession()` e conferem o papel, devolvendo `{ ok: false, error: 'Sem permissão para esta ação.' }`; nunca `requireManager()` dentro de action.
- As funções daqui não lançam erro de regra de negócio: devolvem `Resultado` (`erros.ts`). Erro inesperado sobe e a action transforma em "tente de novo".
- Toda escrita em ativo grava `AtivoHistory`; toda troca de ativo em chamado grava `ChamadoHistory` `vinculo_ativo`. Sem transação no Mongo, o histórico passa por `gravarHistoricoOuDesfazer`: se gravar falhar, a escrita é desfeita, para nenhuma mudança ficar sem registro.
- `codigo`, `origemCodigo` e `tombamento` nunca mudam; a `chave` da categoria também não, porque a carga acha as categorias por ela. Ativo nunca é apagado: o fim é `status: 'baixado'`.
- Só Tier A ou B e não `baixado` recebe chamado, sempre por `FILTRO_VINCULAVEL`/`buscarAtivoVinculavel`. A ficha, a abertura, a reincidência e o vínculo usam a mesma regra.
- `camposPatrimoniais` só sai do servidor para Admin e Preposto (`carregarFicha` recorta antes de devolver).
- `caminho` do local é materializado: depois de mudar nome ou pai, chame `recalcularSubarvore`, que recalcula tudo a partir do banco.
- Arquivos usados pela carga (`carga.ts`, `carga-script.ts`, `codigo.ts`) importam por caminho relativo, sem o alias `@/`, porque rodam pelo `tsx` fora do Next.
- Documento (spec 0013): no máximo um `vigente` por tipo e alvo, garantido pelos índices únicos parciais de `DocumentoAtivo`. Sem transação, a substituição marca o anterior pelo `_id` lido e desfaz a marca se o novo não entrar. Documento nunca é apagado do banco nem do disco: o fim é `excluido`.
- Datas de documento são dia sem hora, gravadas como meia noite UTC; "hoje" é sempre `hojeEmBelem()` e os dias saem de `diasRestantes`/`situacaoDoDocumento` (`documentos/situacao.ts`), nunca de `validadeAte - new Date()`. A situação (vencido, vence em N dias) é calculada na leitura, nunca gravada.
- O aviso de vencimento marca cada limite (`90`, `60`, `30`, `vencido`) em `alertasEnviados` por atualização condicional; só quem grava a marca cria a `Notification` e manda o e-mail. Sem Admin ou Preposto ativo o job não grava a marca e conta erro, para o aviso sair na rodada seguinte. Corrigir a validade apaga as marcas que a data nova ainda não alcança.
- Documento herdado sobe a árvore pelo `parentId` (`ancestraisDe` no banco, `subirArvore` com `mapaDeLocais` em memória); o prédio de um local é ele mesmo ou o ancestral `predio` mais próximo (`predioDaCadeia`). Nada reimplementa esse percurso.
- Ler documento e baixar o arquivo: Admin, Preposto e Técnico (`podeVerDocumentos`); escrever: Admin e Preposto; tipo de documento: só Admin. O download responde `Cache-Control: no-store`, para a checagem valer a cada pedido.
- `TipoDocumento.chave` nunca muda (categorias e documentos guardam a chave). Ao salvar a categoria, `exigeDocumento` guarda só chaves que existem em `TipoDocumento`, ativas ou não.
- O upload de documento é a rota `POST /api/ativos/documentos` (multipart, até 20 MB), nunca Server Action, e fica fora do matcher do `proxy.ts`. A checagem de tipo e o nome em disco vêm de `lib/uploads/arquivo.ts`, o mesmo apoio dos anexos de chamado.
- Indicadores de ativo (spec 0014) são só informativos, nunca entram nos números contratuais do IMR. Corretivo é chamado com ativo, sem `originTemplateId` e fora de `STATUS_FORA_DO_CORRETIVO`; o MTTR usa `tempoDeReparoMs` de `lib/imr-service.ts`, a mesma conta do tempo médio do IMR (um teste prova a paridade). A janela da ficha termina em `fimDoDiaEmBelem()`, e `carregarFicha` só calcula para quem passa em `podeVerDocumentos`.
- Candidato à substituição (spec 0015) nunca é gravado: `avaliarSubstituicao` refaz a conta a cada leitura, e a ficha, o IMR e a lista usam a mesma função. A ficha passa os `indicadores` que já calculou e o lote usa a mesma janela (`janelaDeHoje`, em `indicadores.ts`), então os números nunca divergem. Limite vazio na categoria grava `null` (nunca 0) e usa o padrão de `shared/ativos/substituicao.constants.ts`.
- O relatório por contrato (spec 0016, `lib/contratos/`) reaproveita `calcularFiltro`, `numerosDoAtivo` e `lerInfoDosAtivos` (exportada, com `categoriaId` em `InfoDoAtivo`) para bater com a aba Ativos do IMR: mudança nessas funções muda os dois relatórios, e `lib/contratos/__tests__/relatorio.db.test.ts` confere a paridade.
- Só `dispensarSubstituicao` e `desfazerDispensaSubstituicao` escrevem `Ativo.dispensaSubstituicao`. A escrita é condicional ao `em` lido, com um filtro só (sem dispensa lida, `$exists: false`; com dispensa lida, o mesmo `em`), nunca um `$or` das duas condições; o desfazer do histórico também é condicional, para não apagar a dispensa de outra pessoa. O texto do motivo nunca vai para o `AtivoHistory`, que o técnico vê: só a data e os critérios.
- Falha na conta dos candidatos fica na seção: o IMR e a ficha mostram aviso, e o filtro "Substituição" da lista (`idsDoFiltroSubstituicao`) devolve lista vazia com aviso, nunca a lista inteira.
- Quem escreve o quê no ativo (spec 0012): o importador só escreve `camposPatrimoniais` (e cria o ativo novo); a vistoria só escreve `localizacaoId`, `fabricante`, `modelo`, `numeroSerie` e `statusCadastro`. Nenhum dos dois muda `status`, `categoriaId`, `criticidade` ou `tierManutencao` de ativo existente, e os dois escrevem por `$set`/`$unset` por caminho, nunca trocando `camposPatrimoniais` inteiro. A regra de "só criar" vale só para a carga do Tier A.
- Nome e matrícula do responsável nunca vão para o pacote da vistoria nem para o `AtivoHistory`, e só ficam na importação enquanto ela está pendente (`enxugar.ts` apaga ao aplicar ou descartar).
- A busca do seletor com `escopo=documentos` usa `FILTRO_RECEBE_DOCUMENTO` (qualquer tier, nunca `baixado`); para chamado continua só `FILTRO_VINCULAVEL`.

## Comandos

```bash
npx tsx scripts/gerar-carga-ativos.ts [csv] [saída]   # gera o script mongosh da carga do Tier A (na máquina de dev; o passo a passo na VPS está no AGENTS.md raiz, seção Deploy)
mongosh manutencao < scripts/carga-tipos-documento.js   # cria os cinco tipos de documento que faltarem (idempotente); a lista bate com seed.js e com TIPOS_DOCUMENTO_INICIAIS por teste
npm run zxing:wasm                                    # recopia o .wasm da câmera depois de atualizar barcode-detector
MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/ativos   # inclui os testes de banco real
```

## Gotchas

- O CSV do SICAM e o script gerado têm nome e matrícula de pessoas: ficam no `.gitignore` e nunca entram em teste (os testes usam dados fictícios).
- A câmera lê com o polyfill `barcode-detector`, com o motor servido de `public/zxing/zxing_reader.wasm`, nunca de CDN. Um teste compara o arquivo com o do pacote instalado. Fora de HTTPS a câmera some, e a leitura é pelo campo de texto ou leitor USB.
- `listarSituacoesSubstituicao` faz a conta para todos os ativos Tier A e B a cada abertura do IMR ou do filtro da lista. Serve para centenas de ativos; com dezenas de milhares, pede cache ou campo gravado (spec 0015, Consequences).
- A lista ordena o código em ordem numérica em memória, sobre só `_id` e `codigo`, para a consulta continuar usando os índices. Serve para centenas de ativos; com dezenas de milhares, vale um campo de ordenação próprio.

_Drafted by /sync from the introducing change, worth a quick human pass._
