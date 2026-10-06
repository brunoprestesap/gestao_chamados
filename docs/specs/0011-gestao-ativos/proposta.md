# 0009 — Gestão de Ativos

> Status: proposta
> Fatia inicial (Tracer Bullet): cadastrar ativo → ler etiqueta → abrir chamado vinculado → ver histórico do ativo
> Revisão de 01/10/2026: incorpora a análise do export real do SICAM (`docs/specs/0011-gestao-ativos/analise-sicam.md`)

## 1. Problema

O Sigma sabe **que serviço** foi pedido (`ServiceCatalog` → `ServiceType` → `ServiceSubType`), mas não sabe **em qual objeto**.

Um chamado de "Ar-Condicionado" não diz se é o split da sala 302 ou a central do 3º andar. Consequências:

- Não dá para saber quantas vezes o mesmo equipamento quebrou no ano
- A preventiva (`RecurringTicket`) é por template genérico, não por equipamento real
- O IMR mede o desempenho da contratada, mas não mede o desempenho do parque
- A decisão entre consertar e substituir é feita por percepção, não por custo acumulado
- Não existe inventário técnico: o sistema patrimonial tem o bem, mas não tem fabricante, data de instalação, criticidade nem laudo — e **não tem** elevador, QGBT, SPDA nem hidrante, que são os ativos com inspeção obrigatória por lei

## 2. Objetivo

Introduzir a entidade **Ativo** como o objeto sobre o qual os serviços de manutenção acontecem, ligando `Chamado → Ativo → Contrato → Custo`, sem substituir o sistema patrimonial oficial.

**Fora de escopo nesta spec:** tombamento, depreciação e baixa contábil continuam no sistema patrimonial. O Sigma é a camada **operacional de manutenção**.

## 3. Premissas levantadas

| Premissa                                                     | Decisão                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Sistema patrimonial (**SICAM**) não tem API, só exporta CSV  | Importador manual com diff e revisão                                               |
| Contrato atual **não tem IMR claro** para manutenção predial | Indicadores de ativo nascem **informativos** (`efeitoContratual: false`)           |
| Vistoria inicial será **híbrida** (servidor + contratada)    | Campanha de vistoria com rastreio de quem validou                                  |
| Técnico da contratada **tem login próprio**                  | Execução por ativo é rastreável por pessoa                                         |
| Existe **etiqueta patrimonial com código de barras**         | Reaproveitar; QR só para ativos sem tombamento                                     |
| O SICAM **não cobre o parque predial** (ver 3.1)             | `origemCodigo: 'interno'` com código `MNT-####` é caminho obrigatório, não exceção |

### 3.1 O que o export do SICAM entrega de fato

Análise de 14.611 linhas do export real (01/10/2026):

|                                           |         |
| ----------------------------------------- | ------- |
| Linhas no export                          | 14.611  |
| `Tipo Tombo = T` e `Saída = PRESENTE`     | 6.040   |
| Candidatos a ativo de manutenção          | 568     |
| **Tier A — escopo da manutenção predial** | **108** |

Os outros 5.472 bens presentes são móveis, monitores, webcams e mastros de bandeira: não têm plano preventivo, laudo nem ciclo de falha que justifique entrar aqui.

**O achado que muda o desenho:** elevador, hidrante, sprinkler, QGBT e subestação têm **zero registros** na base inteira, e o único SPDA está baixado. Não é falha de extração — são benfeitorias incorporadas ao imóvel, que nunca aparecem num export de bem móvel. E são justamente os ativos com inspeção obrigatória por lei (NR-10, NR-13, AVCB, laudo de SPDA, inspeção anual de elevador).

Logo: **a importação nunca será a fonte completa do inventário.** Os ativos de maior criticidade legal serão cadastrados manualmente na vistoria.

Segundo achado: ar-condicionado tem 208 registros na base, mas só **37 presentes** — 171 estão como `SAIU`. Ou foram baixados na mudança do prédio sede e continuam instalados, ou o parque atual é locado. Em qualquer dos casos, 37 não é o parque real da SJAP.

## 4. Modelos (Mongoose)

Seguem os padrões de `models/AGENTS.md`.

### 4.1 `Localizacao`

Árvore autorreferenciada, ancorada em `Unit`.

| Campo      | Tipo      | Obs                                             |
| ---------- | --------- | ----------------------------------------------- |
| `nome`     | string    | "3º andar", "Sala 302"                          |
| `tipo`     | enum      | `predio` \| `andar` \| `sala` \| `area_tecnica` |
| `parentId` | ObjectId? | null na raiz                                    |
| `unitId`   | ObjectId  | ref `Unit`                                      |
| `caminho`  | string    | materializado: `Sede/3º andar/Sala 302`         |
| `ativo`    | boolean   | soft delete                                     |

Índices: `{ unitId, parentId }`, `{ caminho }` (texto, para busca).

> `caminho` é materializado para evitar `$graphLookup` em toda listagem. Recalculado em cascata quando o pai muda de nome.

**O SICAM não entrega esta árvore.** Ele traz 235 pares `Lotação → Setor` (46 lotações, 222 setores), que são estrutura **organizacional** — quem responde pelo bem —, não **física**. `SECRETARIA DA VARA` não diz andar nem sala.

São dois eixos, e o modelo precisa dos dois:

- **`Localizacao`** (física): prédio → andar → sala — construída na vistoria
- **`Unit` + responsável** (organizacional): vem do SICAM, já existe no Sigma

Alguns `Nome Setor` já trazem pista física (`Sala de audiência`, `Sala do NUTEC`, `sala da SERPAT`) e servem de semente, mas 114 registros têm o campo vazio.

### 4.2 `CategoriaAtivo`

| Campo                         | Tipo     | Obs                                                                  |
| ----------------------------- | -------- | -------------------------------------------------------------------- |
| `nome`                        | string   | "Split 12.000 BTU", "Elevador", "Gerador"                            |
| `serviceSubTypeId`            | ObjectId | ref `ServiceSubType` — **liga categoria à especialidade do técnico** |
| `criticidadePadrao`           | enum     | `baixa` \| `media` \| `alta` \| `critica`                            |
| `periodicidadePreventivaDias` | number?  | null = sem preventiva obrigatória                                    |
| `exigeDocumento`              | string[] | `['PMOC']`, `['AVCB']`, `['ART']`                                    |
| `vidaUtilAnos`                | number?  | referência para substituição                                         |

> O vínculo com `ServiceSubType` é o que permite a **atribuição automática (spec 0008)** continuar funcionando: ao abrir chamado por ativo, o subtipo sai da categoria.

### 4.3 `Ativo`

| Campo                                 | Tipo             | Obs                                                                                 |
| ------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `codigo`                              | string           | único; tombamento ou `MNT-0001` para não patrimoniados                              |
| `origemCodigo`                        | enum             | `patrimonio` \| `interno`                                                           |
| `tombamento`                          | string?          | espelho do patrimonial, read-only                                                   |
| `descricao`                           | string           |                                                                                     |
| `categoriaId`                         | ObjectId         | ref `CategoriaAtivo`                                                                |
| `localizacaoId`                       | ObjectId         | ref `Localizacao`                                                                   |
| `fabricante`, `modelo`, `numeroSerie` | string?          | preenchidos na vistoria                                                             |
| `dataInstalacao`                      | Date?            |                                                                                     |
| `criticidade`                         | enum             | herda da categoria, editável                                                        |
| `tierManutencao`                      | enum             | `A` \| `B` \| `C` \| `D` — ver 4.3.1                                                |
| `status`                              | enum             | `em_operacao` \| `em_manutencao` \| `inoperante` \| `aguardando_baixa` \| `baixado` |
| `statusCadastro`                      | enum             | `importado` \| `em_vistoria` \| `validado`                                          |
| `validadoPor`, `validadoEm`           | ObjectId?, Date? | quem confirmou em campo                                                             |
| `camposPatrimoniais`                  | object           | bloco read-only vindo do CSV                                                        |

Índices: `{ codigo }` único, `{ categoriaId, status }`, `{ localizacaoId }`, `{ statusCadastro }`, `{ tierManutencao, status }`.

**Regra de ouro:** a importação CSV só escreve dentro de `camposPatrimoniais`. Fabricante, modelo, criticidade, data de instalação e categoria são **do Sigma** e nunca são sobrescritos.

Motivo concreto: o SICAM não tem campo de fabricante, modelo nem data de instalação. Marca e modelo vêm embutidos no texto livre de `Descrição Material` (`MONITOR TIPO II. MARCA: AOC. MODELO: 24P1U`). Extrair por regex é possível e ruidoso — esses campos nascem da vistoria.

#### 4.3.1 `tierManutencao` — o que está no escopo do contrato predial

| Tier  | O que é                                                                                                                              | Entra no Sigma                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **A** | Climatização, energia (nobreak, gerador, transformador), hidráulica, exaustão, combate a incêndio, controle de acesso, ar comprimido | ✅ Fatia 1 — preventiva + corretiva |
| **B** | Copa: bebedouro, frigobar, geladeira, micro-ondas                                                                                    | ⚠️ Fatia 2 — só corretiva           |
| **C** | TI: switch, access point, CFTV, PABX                                                                                                 | ❌ outro contrato, outro fiscal     |
| **D** | Veículos                                                                                                                             | ❌ gestão de frota                  |

O tier decide o que entra na medição do contrato predial. C e D podem existir como inventário, mas nunca entram nos indicadores desta spec.

### 4.4 `AtivoHistory`

Espelha `ChamadoHistory`: `ativoId`, `acao`, `autorId`, `de`, `para`, `em`, `observacao`. Toda mudança de status, localização ou categoria gera registro.

### 4.5 `ImportacaoPatrimonial`

`arquivoNome`, `autorId`, `em`, `linhasLidas`, `linhasReparadas`, `novos`, `alterados`, `sumidos`, `aplicadoEm?`, `resumo` (array do diff).

Importação em **duas etapas**: parse/diff → tela de revisão → aplicar. Nunca aplica direto.

#### 4.5.1 Layout do arquivo (SICAM)

39 colunas, separador `;`, encoding **cp1252**, **sem aspas**.

Colunas aproveitadas: `Tipo Tombo`, `Número Tombo`, `Código Material`, `Descrição Material`, `Nome Fornecedor`, `Data Tombo`, `Código/Descrição Lotação`, `Código/Nome Setor`, `Matrícula/Nome Responsável Termo`, `Numero de série`, `Saída`, `Dt Ini/Fim Garantia`, `Valor Histórico`.

**Filtro de entrada, fixo:** `Tipo Tombo === 'T'` **e** `Saída === 'PRESENTE'`.
Livros (`L`), software (`INC`) e bens baixados nunca entram.

#### 4.5.2 Armadilhas do parse — todas obrigatórias

**1. O arquivo não tem quoting.** 948 linhas (6,5%) trazem `;` dentro de `Descrição Material`, quase todas de livros. Um parser padrão desalinha as colunas sem erro visível. Reparo determinístico: 4 campos fixos à esquerda, 34 à direita, tudo que sobra no meio é a descrição.

```ts
const N_HEAD = 4; // Tipo Tombo, Número Tombo, Vínculo Tombo, Código Material
const N_TAIL = 34; // tudo depois de "Descrição Material"

function repararLinha(campos: string[], total = 39): string[] {
  if (campos.length > total) {
    return [
      ...campos.slice(0, N_HEAD),
      campos.slice(N_HEAD, campos.length - N_TAIL).join(';'),
      ...campos.slice(-N_TAIL),
    ];
  }
  return campos.length < total ? [...campos, ...Array(total - campos.length).fill('')] : campos;
}
```

Sem isso, o diff acusa alteração em massa a cada importação.

**2. Encoding cp1252.** Ler como UTF-8 produz `ManutenÃ§Ã£o`. Decodificar explicitamente.

**3. Datas em `DD-MMM-AA` com mês em português** (`16-JAN-26`, `10-JUN-94`). Corte de século em 40: `94` → 1994, `26` → 2026. A base tem registros de 1994, então o corte não é teórico.

**4. Decimal com vírgula** (`807,11`).

**5. Ordem das regras de categoria importa.** A descrição de picape e sedã lista "AR CONDICIONADO" como item de série — a regra de veículo tem que ser avaliada **antes** da de climatização, ou 3 veículos caem em `climatizacao`.

**6. `Situação` e `Estado de Conservação` são inutilizáveis.** Campo livre sem padronização: a mesma condição aparece como `QUEBRADA`, `QUEBRADO`, `quebrado`, `SUCATEADO`, `SUCATEADA`, `sucateado`. Preenchimento de 1,8% nos ativos de interesse. **O `status` do ativo nasce da vistoria, nunca da importação.**

#### 4.5.3 Cobertura dos campos (nos 568 candidatos)

| Campo                   | Preenchido | Uso                             |
| ----------------------- | ---------- | ------------------------------- |
| `Data Tombo`            | 100%       | proxy de idade do ativo         |
| `Nome Setor`            | 88,7%      | ponto de partida da localização |
| `Numero de série`       | 34,7%      | a vistoria completa             |
| `Dt Fim Garantia`       | 15,8%      | pouco aproveitável              |
| `Estado de Conservação` | 1,8%       | descartar                       |
| `Situação`              | 0%         | descartar                       |

### 4.6 `Vistoria`

`responsavelId`, `tipoResponsavel` (`servidor` \| `contratada`), `localizacaoId`, `iniciadaEm`, `concluidaEm?`, `status`, `ativosValidados` (contador).

### 4.7 `DocumentoAtivo`

`ativoId` ou `localizacaoId`, `tipo` (`PMOC`, `AVCB`, `ART`, `laudo_SPDA`, `garantia`), `arquivo`, `emitidoEm`, `validadeAte`, `emitidoPor`.

Job de alerta em 90/60/30 dias antes do vencimento.

## 5. Alterações em modelos existentes

### `Chamado`

- **novo** `ativoId: ObjectId?` (ref `Ativo`)
- Opcional durante a transição. Obrigatório para `tipoServico` com categoria mapeada, depois que a vistoria passar de 80% de cobertura
- `atribuicaoAutomatica` continua igual; muda só a **origem** do subtipo quando o chamado nasce de um ativo

### `RecurringTicket`

- **novo** `escopo: 'template' | 'categoria_ativo'`
- Quando `categoria_ativo`: o cron gera **um chamado por ativo** daquela categoria com status `em_operacao`, respeitando `periodicidadePreventivaDias`
- `originTemplateId` no `Chamado` continua servindo de rastro

### `lib/imr-service.ts`

Novos facets agrupando por `ativoId`:

- **MTBF** — tempo médio entre chamados corretivos do mesmo ativo
- **MTTR** — reaproveita `sla.resolvedAt − createdAt − pausas` (já calculado)
- **Reincidência** — nº de corretivos do mesmo ativo em 90 dias
- **Top 10 ativos problemáticos**

Todos nascem com `efeitoContratual: false` (informativos). Viram base para o IMR do **próximo** termo de referência.

### `lib/assistente/`

A extração passa a incluir **ativo**, além de serviço, prioridade e local:

- Se o usuário cita local + categoria reconhecível → resolve o ativo
- Se há **um só** ativo candidato → preenche
- Se há vários → o cartão resumo pede a escolha
- Se nenhum → abre sem ativo (modo atual), e o Preposto vincula na classificação

O cartão (`lib/assistente/cartao.ts`) ganha a linha de ativo. O portão de confiança (spec 0007) **não** considera o ativo: ativo errado não deve bloquear a abertura.

## 6. Telas

| Rota                               | Perfil                   | Conteúdo                                               |
| ---------------------------------- | ------------------------ | ------------------------------------------------------ |
| `/ativos`                          | todos (leitura)          | lista com filtro por localização, categoria, status    |
| `/ativos/[id]`                     | todos                    | ficha: dados, histórico de chamados, custo, documentos |
| `/ativos/importar`                 | Admin                    | upload CSV → diff → revisão → aplicar                  |
| `/ativos/vistoria`                 | Admin, Preposto, Técnico | campanha + cobertura por prédio                        |
| `/ativos/vistoria/[localizacaoId]` | idem                     | tela de campo, mobile-first                            |
| `/configuracoes/localizacoes`      | Admin                    | árvore de localizações                                 |
| `/configuracoes/categorias-ativo`  | Admin                    | categorias + vínculo com subtipo                       |

Guards em `lib/dal.ts`: reaproveitar `requireSession`, `requireManager`, `requireAdmin`. Adicionar `/ativos/importar` e `/configuracoes/*` ao `protectedPrefixes` do `proxy.ts`.

### Leitura de etiqueta

- `BarcodeDetector` API com fallback para **ZXing** (`@zxing/browser`)
- Fluxo: escanear → `GET /api/ativos/por-codigo/[codigo]` → ficha
- Botão "Abrir chamado deste ativo" leva ao `/conversas` com o ativo pré-selecionado

### Tela de campo (vistoria)

- Mobile-first, **tolerante a offline**: rascunho em IndexedDB, sincroniza depois
- Sala de máquinas e subsolo não têm sinal — isso não é opcional
- Fotos vão para storage S3-compatível (MinIO em container), **nunca no MongoDB**

## 7. Fatias (Tracer Bullet)

### Fatia 1 — o fio passa

1. `Localizacao` + `CategoriaAtivo` + `Ativo` + `AtivoHistory`
2. CRUD mínimo de ativo e árvore de localizações
3. Leitura de código de barras → ficha do ativo
4. `ativoId` no `Chamado` + seleção manual no formulário
5. Histórico de chamados na ficha do ativo

**Escopo de dados:** os **108 ativos do Tier A**. Pequeno o bastante para a vistoria fechar em semanas, crítico o bastante para o indicador significar algo no primeiro mês.

**Entrega:** dá para apontar um chamado a um equipamento e ver o que já aconteceu com ele.

### Fatia 2 — o fio engrossa

- Importador CSV com diff, revisão e os reparos de 4.5.2
- Campanha de vistoria + cobertura + modo offline
- Cadastro manual dos ativos `MNT-` (elevador, QGBT, SPDA, hidrante) — **pré-requisito de qualquer indicador de conformidade legal**
- Tier B (copa) entra como inventário com corretiva
- Fotos no storage

### Fatia 3

- `DocumentoAtivo` + alertas de vencimento
- `RecurringTicket` com escopo por categoria de ativo

### Fatia 4

- Extração de ativo pela IA no `/conversas`
- Custo acumulado por ativo
- Facets de ativo no IMR + Top 10 problemáticos

### Fatia 5

- Sinalização automática de candidatos à substituição
- Relatório mensal por contrato com dimensão de ativo

## 8. Riscos

| Risco                                                                                                  | Severidade | Mitigação                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **O SICAM não cobre os sistemas prediais de maior criticidade legal** (elevador, QGBT, SPDA, hidrante) | 🔴 alta    | Cadastro 100% manual com `MNT-####`. É pré-requisito de qualquer indicador de conformidade, não um complemento                         |
| Cadastro inicial incompleto                                                                            | 🔴 alta    | A vistoria é o maior esforço **não técnico**. Dashboard de cobertura e meta por prédio. Começar pelos 108 do Tier A                    |
| **Parque instalado ≠ parque tombado** (171 ares como `SAIU`)                                           | 🟠 média   | A vistoria vai achar equipamento sem tombo. O fluxo de cadastro em campo precisa aceitar ativo sem `Número Tombo` desde o primeiro dia |
| Parse silencioso do CSV desalinhando colunas                                                           | 🟠 média   | Reparo de 4.5.2 + `linhasReparadas` no log de importação + teste unitário com as linhas de livro                                       |
| Contratada não usa o sistema                                                                           | 🟠 média   | Incluir o uso como obrigação no próximo termo de referência                                                                            |
| Duplicidade com o patrimonial                                                                          | 🟠 média   | `camposPatrimoniais` isolado e read-only; fonte da verdade declarada por campo                                                         |
| IA vincula o ativo errado                                                                              | 🟡 baixa   | Ativo fora do portão de confiança; Preposto corrige na classificação                                                                   |
| Equipamento sem tombamento                                                                             | 🟡 baixa   | Código interno `MNT-` + etiqueta QR complementar                                                                                       |

## 9. Perguntas abertas

**Resolvidas pela análise do export (01/10/2026):**

- ~~Qual o layout exato do CSV do patrimonial?~~ → seção 4.5.1 e 4.5.2
- ~~Quais categorias entram na vistoria inicial?~~ → **Tier A, 108 ativos**

**Em aberto:**

- Os 171 ares com `SAIU` ainda estão instalados, ou o parque atual é locado? (define o tamanho real da vistoria de climatização)
- Qual a criticidade mínima para exigir plano preventivo?
- O MinIO entra no `docker-compose.yml` ou as fotos vão para o filesystem do volume?
- Quem imprime as etiquetas `MNT-` dos ativos não patrimoniados?
- Com que frequência o SERPAT consegue gerar o export do SICAM? (define a cadência da importação)

## 10. Testes

- **Unitários (Vitest):** reparo de linha sem quoting (fixture com as linhas de livro reais), corte de século das datas, decimal com vírgula, ordem das regras de categoria (picape não cai em `climatizacao`), filtro `T`+`PRESENTE`, materialização de `caminho`, resolução de ativo pela IA, cálculo de MTBF/MTTR
- **Banco real (`*.db.test.ts`):** unicidade de `codigo`, cascata do `caminho`, índice parcial de `statusCadastro`
- **E2E (Playwright):** escanear código → abrir chamado → ver na ficha do ativo; importar CSV → revisar → aplicar
- Arrange-Act-Assert, cobertura de `lib/**` e `shared/**`

## 11. Material de apoio

- `analise-sicam.md` — análise completa do export (14.611 linhas)
- `ativos_sicam.csv` — 568 candidatos com `tierManutencao` e `categoriaSugerida`, datas em ISO e campos renomeados para o modelo `Ativo`
- `localizacoes_sicam.csv` — 235 pares lotação/setor, semente para `Unit`
- `extrair.py` — parser de referência com todos os reparos de 4.5.2; base para portar o importador para TypeScript
