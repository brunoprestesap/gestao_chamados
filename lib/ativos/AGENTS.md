# lib/ativos: gestão de ativos

As regras do módulo de ativos (spec 0011): árvore de locais, categorias, cadastro do ativo com histórico, o seletor do chamado, a ficha, a lista, o vínculo com chamado e a carga do Tier A. As telas estão em `app/(dashboard)/ativos/` e `app/(dashboard)/configuracoes/categorias-ativo/`; as rotas de leitura, em `app/api/ativos/`. Spec: `docs/specs/0011-gestao-ativos/`.

## Arquivos principais

| Arquivo                              | O que tem                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localizacao.ts`                     | Criar, editar, mover e desativar local; `recalcularSubarvore` (idempotente); `idsDaSubarvore` (filtro por prédio); `listarLocaisAtivos` em ordem de árvore |
| `cadastro.ts`                        | `criarAtivo`, `editarAtivo`, `alterarStatusAtivo`, `validarAtivo`, `proximoCodigoInterno` (`MNT-####`)                                                     |
| `categoria.ts`                       | Categorias de ativo (só Admin)                                                                                                                             |
| `seletor.ts`                         | `FILTRO_VINCULAVEL`, a busca do seletor e `buscarAtivoVinculavel`, com o tipo e o subtipo sugeridos                                                        |
| `vinculo.ts`                         | `vincularAtivoAoChamado`, usado por `vincularAtivoChamadoAction` na gestão                                                                                 |
| `ficha.ts`                           | `carregarFicha`, já recortada pelo perfil; `destinoDoChamado`                                                                                              |
| `lista.ts`, `opcoes.ts`, `resumo.ts` | A lista de `/ativos`, as opções dos formulários e o `ativo` do DTO do chamado                                                                              |
| `auditoria.ts`                       | `gravarHistoricoOuDesfazer`                                                                                                                                |
| `codigo.ts`                          | `normalizarCodigo` (sem `server-only`: o cliente também usa)                                                                                               |
| `carga.ts`, `carga-script.ts`        | Parser do CSV e o script mongosh da carga (gerado por `scripts/gerar-carga-ativos.ts`)                                                                     |

## Convenções

- Escrita em ativo e em local é de Admin e Preposto; categoria, só de Admin. As actions usam `verifySession()` e conferem o papel, devolvendo `{ ok: false, error: 'Sem permissão para esta ação.' }`; nunca `requireManager()` dentro de action.
- As funções daqui não lançam erro de regra de negócio: devolvem `Resultado` (`erros.ts`). Erro inesperado sobe e a action transforma em "tente de novo".
- Toda escrita em ativo grava `AtivoHistory`; toda troca de ativo em chamado grava `ChamadoHistory` `vinculo_ativo`. Sem transação no Mongo, o histórico passa por `gravarHistoricoOuDesfazer`: se gravar falhar, a escrita é desfeita, para nenhuma mudança ficar sem registro.
- `codigo`, `origemCodigo` e `tombamento` nunca mudam; a `chave` da categoria também não, porque a carga acha as categorias por ela. Ativo nunca é apagado: o fim é `status: 'baixado'`.
- Só Tier A ou B e não `baixado` recebe chamado, sempre por `FILTRO_VINCULAVEL`/`buscarAtivoVinculavel`. A ficha, a abertura, a reincidência e o vínculo usam a mesma regra.
- `camposPatrimoniais` só sai do servidor para Admin e Preposto (`carregarFicha` recorta antes de devolver).
- `caminho` do local é materializado: depois de mudar nome ou pai, chame `recalcularSubarvore`, que recalcula tudo a partir do banco.
- Arquivos usados pela carga (`carga.ts`, `carga-script.ts`, `codigo.ts`) importam por caminho relativo, sem o alias `@/`, porque rodam pelo `tsx` fora do Next.

## Comandos

```bash
npx tsx scripts/gerar-carga-ativos.ts [csv] [saída]   # gera o script mongosh da carga do Tier A
npm run zxing:wasm                                    # recopia o .wasm da câmera depois de atualizar barcode-detector
MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/ativos   # inclui os testes de banco real
```

## Gotchas

- O CSV do SICAM e o script gerado têm nome e matrícula de pessoas: ficam no `.gitignore` e nunca entram em teste (os testes usam dados fictícios).
- A câmera lê com o polyfill `barcode-detector`, com o motor servido de `public/zxing/zxing_reader.wasm`, nunca de CDN. Um teste compara o arquivo com o do pacote instalado. Fora de HTTPS a câmera some, e a leitura é pelo campo de texto ou leitor USB.
- A lista ordena o código em ordem numérica em memória, sobre só `_id` e `codigo`, para a consulta continuar usando os índices. Serve para centenas de ativos; com dezenas de milhares, vale um campo de ordenação próprio.

_Drafted by /sync from the introducing change, worth a quick human pass._
