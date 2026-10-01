# Análise do export do SICAM — extração de ativos de manutenção

> Fonte: `SICAM.CSV` · 14.611 linhas · 39 colunas · encoding **cp1252** · separador **`;`**
> Data da análise: 01/10/2026

---

## 1. Achados sobre o arquivo

### 🚨 O CSV não tem aspas (quoting)

**948 linhas (6,5%) quebram o parser**, porque `Descrição Material` contém `;` no meio do texto — quase todas de livros (`Tipo Tombo = L`).

Exemplo real (linha 322):

```
L;879;879;5218006001;Controle de Constitucionalidade; aspectos jurídicos e políticos. MENDES...
```

**Reparo determinístico:** os 4 primeiros campos e os 34 últimos são fixos; tudo que sobra no meio pertence à `Descrição Material`.

```ts
if (campos.length > 39) {
  campos = [
    ...campos.slice(0, 4),
    campos.slice(4, campos.length - 34).join(';'),
    ...campos.slice(-34),
  ];
}
```

Isso tem que entrar no importador. Sem isso, 948 registros entram com as colunas deslocadas — e o diff vai acusar alteração em massa a cada importação.

### Outras armadilhas

| Problema                                        | Impacto                                                       |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Encoding **cp1252**, não UTF-8                  | `Manutenção` vira `ManutenÃ§Ã£o` se ler errado                |
| Datas em `DD-MMM-AA` (`16-JAN-26`, `10-JUN-94`) | Ambiguidade de século: corte em 40 → `94` = 1994, `26` = 2026 |
| Decimal com vírgula (`807,11`)                  | Parser numérico precisa trocar `,` por `.`                    |
| `Ind` e `Saída` são redundantes                 | `1` = PRESENTE, `2` = SAIU. Usar `Saída`                      |

---

## 2. Composição da base

| Tipo Tombo | Qtd    | O que é                           |
| ---------- | ------ | --------------------------------- |
| `T`        | 11.301 | Bem permanente                    |
| `L`        | 3.174  | Livro (biblioteca)                |
| `INC`      | 136    | Incorporação (software, licenças) |

| Saída    | Qtd   |
| -------- | ----- |
| PRESENTE | 9.101 |
| SAIU     | 5.506 |

**Universo de trabalho: `Tipo Tombo = T` + `Saída = PRESENTE` → 6.040 bens.**

Livros e software ficam fora: não recebem manutenção predial. Bens com `SAIU` já foram baixados.

---

## 3. Filtro aplicado

Dos **6.040** bens presentes, **5.472 (90,6%) não são ativos de manutenção**: poltronas, mesas, armários, gaveteiros, estantes, monitores, webcams, mastros de bandeira. Nenhum deles tem plano preventivo, laudo ou ciclo de falha que justifique entrar no Sigma.

Sobraram **568 candidatos**, classificados em quatro tiers:

| Tier  | Categoria             | Itens | Entra no Sigma?                                  |
| ----- | --------------------- | ----- | ------------------------------------------------ |
| **A** | climatizacao          | 37    | ✅ sim — núcleo da manutenção predial            |
| **A** | energia_nobreak       | 43    | ✅ sim                                           |
| **A** | controle_acesso       | 13    | ✅ sim                                           |
| **A** | combate_incendio      | 5     | ✅ sim                                           |
| **A** | hidraulica_bomba      | 4     | ✅ sim                                           |
| **A** | exaustao_ventilacao   | 2     | ✅ sim                                           |
| **A** | ar_comprimido         | 2     | ✅ sim                                           |
| **A** | energia_gerador       | 1     | ✅ sim                                           |
| **A** | energia_transformador | 1     | ✅ sim                                           |
| **B** | copa_refrigeracao     | 87    | ⚠️ só corretiva (bebedouro, frigobar, geladeira) |
| **B** | copa_coccao           | 13    | ⚠️ só corretiva                                  |
| **C** | ti_rede               | 174   | ❌ contrato de TI, não predial                   |
| **C** | ti_cftv               | 171   | ❌ contrato de TI                                |
| **C** | ti_telefonia          | 3     | ❌ contrato de PABX                              |
| **D** | veiculo               | 12    | ❌ gestão de frota, outro fluxo                  |

**Recomendação para a Fatia 1: importar apenas o Tier A (108 ativos).** É pouco o bastante para a vistoria terminar em semanas e crítico o bastante para o indicador fazer sentido no primeiro mês.

O Tier B entra na Fatia 2. Tier C e D ficam de fora desta spec — são outros contratos, com outros fiscais.

> **Armadilha de classificação:** a descrição de picape e sedã no SICAM lista "AR CONDICIONADO" como item de série. Classificar por palavra-chave sem ordenar as regras joga 3 veículos dentro de `climatizacao`. No importador, a regra de veículo tem que ser avaliada **antes** da de climatização.

---

## 4. ⚠️ O achado mais importante

### O SICAM não cobre o parque predial

| Sistema predial               | Registros na base inteira | Presentes |
| ----------------------------- | ------------------------- | --------- |
| Elevador                      | **0**                     | 0         |
| Hidrante                      | **0**                     | 0         |
| Sprinkler                     | **0**                     | 0         |
| QGBT / quadro de distribuição | **0**                     | 0         |
| Subestação                    | **0**                     | 0         |
| SPDA / para-raios             | 1                         | **0**     |
| Alarme de incêndio            | 1                         | 1         |

**Isso não é erro de extração — é como a contabilidade pública funciona.** Elevador, subestação, SPDA, rede de hidrantes e quadros elétricos são **benfeitorias incorporadas ao imóvel**, não bens móveis. Nunca vão aparecer num export de patrimônio mobiliário.

E são justamente os ativos com **obrigação legal de inspeção periódica**: NR-10, NR-13, laudo de SPDA, AVCB e inspeção anual de elevador.

**Consequência para a spec:** a importação do SICAM **nunca** será a fonte completa do inventário. Os ativos de maior criticidade terão que ser cadastrados manualmente na vistoria, com código próprio `MNT-####` e `origemCodigo: 'interno'`.

Isso reforça — e não enfraquece — a decisão de ter `origemCodigo` no modelo `Ativo`.

### Ar-condicionado: 208 na base, 37 presentes

171 aparelhos estão como `SAIU`. Duas hipóteses a confirmar na vistoria:

1. Foram baixados mas **continuam fisicamente instalados** (comum em mudança de prédio — há 98 registros com `Estado Físico = MATERIAL BAIXADO DEVIDO À MUDANÇA DO PRÉDIO SEDE`)
2. O parque atual veio por **locação ou comodato**, e por isso não é tombado

Em qualquer dos dois casos, **37 aparelhos não representam o parque real da SJAP**. A vistoria vai encontrar equipamento instalado sem tombo.

---

## 5. Qualidade dos campos (nos 568 extraídos)

| Campo                   | Preenchido       | Leitura                                  |
| ----------------------- | ---------------- | ---------------------------------------- |
| `Data Tombo`            | 100%             | ✅ serve de proxy para idade do ativo    |
| `Nome Setor`            | 88,7%            | ✅ base boa para a árvore de localização |
| `Numero de série`       | 34,7%            | ⚠️ a vistoria completa o resto           |
| `Dt Fim Garantia`       | 15,8%            | ⚠️ pouco aproveitável                    |
| `Estado de Conservação` | 1,8%             | ❌ inutilizável                          |
| `Situação`              | 0% nos extraídos | ❌ inutilizável                          |

**`Situação` e `Estado de Conservação` são campos livres sem padronização.** Na base inteira há `QUEBRADA`, `QUEBRADO`, `quebrado`, `SUCATEADO`, `SUCATEADA`, `sucateado` — a mesma condição escrita de seis formas. Não dá para derivar `status` do ativo a partir deles. O `status` tem que nascer da vistoria.

### Fabricante, modelo e data de instalação não existem

O SICAM só tem `Descrição Material`, um campo livre onde marca e modelo aparecem embutidos no texto:

```
MONITOR TIPO II. MARCA: AOC. MODELO: 24P1U
CENTRAL DE AR CONDICIONADO SPLIT TIPO PISO TETO, CAPACIDADE DE 12000 BTU'S
```

Dá para extrair por regex, mas o resultado é ruidoso. **Confirma a regra de ouro da spec:** esses campos são do Sigma, preenchidos na vistoria, e a importação nunca os sobrescreve.

---

## 6. Árvore de localização

A base entrega **235 pares `Lotação → Setor`** distintos (46 lotações, 222 setores).

Isso **não é** a árvore `Localizacao` da spec. É a estrutura **organizacional** (quem responde pelo bem), não a **física** (onde o bem está). `SECRETARIA DA VARA` não diz andar nem sala.

Dois eixos diferentes, e o modelo precisa dos dois:

- **`Localizacao`** (física): prédio → andar → sala — construída na vistoria
- **`Unit` + responsável** (organizacional): vem do SICAM, já existe no Sigma

Alguns `Nome Setor` já trazem pista física (`Sala de audiência`, `Sala do NUTEC`, `sala da SERPAT`) e servem de ponto de partida, mas 114 registros têm o campo vazio.

---

## 7. Ajustes recomendados na spec 0009

1. **Seção 4.5 `ImportacaoPatrimonial`** — documentar o reparo de delimitador e o corte de século das datas. São as duas armadilhas que silenciosamente corrompem a base.

2. **Seção 4.3 `Ativo`** — acrescentar `tierManutencao` (`A`/`B`/`C`/`D`). É o campo que decide o que entra no escopo do contrato predial e o que é só inventário.

3. **Seção 9, pergunta "quais categorias entram na vistoria inicial"** — resolvida: **Tier A, 108 ativos.**

4. **Nova linha na seção 8 (Riscos):** o SICAM não cobre os sistemas prediais de maior criticidade legal. O inventário desses ativos é 100% manual e é pré-requisito para qualquer indicador de conformidade.

5. **Filtro de importação** — fixar na spec: `Tipo Tombo = 'T'` **e** `Saída = 'PRESENTE'`. Livros, software e bens baixados nunca entram.

---

## 8. Arquivos gerados

- **`ativos_sicam.csv`** — 568 candidatos, com `tierManutencao` e `categoriaSugerida`, datas normalizadas para ISO e campos já renomeados para o modelo `Ativo`
- **`localizacoes_sicam.csv`** — 235 pares lotação/setor, ponto de partida para o seed de `Unit`
