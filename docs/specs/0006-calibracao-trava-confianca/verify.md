# Verify: calibração da trava de confiança · spec 0006 · updated 2026-09-23

_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Logado como Preposto, Técnico ou Solicitante, visitar `/configuracoes/ia-confianca` → redireciona para `/dashboard`, igual às demais rotas só de Admin → AC-8
- [x] Logado como Admin, visitar `/configuracoes/ia-confianca` → a página carrega com as duas seções (`servico`, `prioridade`) e o item "Calibração da IA" aparece no menu, grupo Admin → AC-1
- [x] Num campo com menos decisões elegíveis do que a amostra mínima configurada → mostra o total encontrado e o aviso de amostra pequena, sem tabela de cortes nem sugestão → AC-3
- [x] Num campo com amostra suficiente e pelo menos um corte com acurácia ≥ 90% e contagem própria ≥ amostra mínima → mostra a tabela de cortes (com traço nas linhas de contagem zero) e a sugestão aponta o menor corte elegível, não o de maior confiança → AC-2, AC-4
- [x] Sem nenhum corte atingindo 90% de acurácia → tabela aparece, mas sem nenhuma sugestão → AC-4
- [x] A seção `servico` sempre mostra o aviso fixo de viés; a seção `prioridade` nunca mostra → AC-11
- [x] Digitar um limite de confiança fora de 0 a 1 (ex.: 1.5 ou -0.1) e salvar → recusado pela validação, nada é gravado → AC-10
- [x] Deixar o limite de confiança em branco e salvar → grava como "sem limite" (null), sem erro → AC-10
- [x] Digitar amostra mínima 0 e salvar → recusado pela validação → AC-10
- [x] Marcar/desmarcar o interruptor "Autonomia da IA ativa", salvar e recarregar a página → o estado do interruptor persiste → AC-5
- [x] Primeira carga de todas, sem nenhum documento `IaAutonomiaConfig` no banco → a tela mostra os padrões de fábrica (sem limite, amostra mínima 30, autonomia desligada) e cria exatamente um documento → AC-6
- [x] Salvar duas vezes seguidas → sempre existe só um documento `IaAutonomiaConfig` no banco (`db.iaautonomiaconfigs.countDocuments()` deve ser 1) → AC-5, AC-6

## Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/ia-confianca` → passa → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-9
- [x] `npx vitest run shared/ia-confianca "app/(dashboard)/configuracoes/ia-confianca"` → passa → AC-5, AC-8, AC-10
- [x] `npm run typecheck` → limpo
- [x] `npm run lint` → sem erros novos (warnings pré-existentes de outras áreas não contam)
- [x] Busca no repositório por `IaAutonomiaConfig`/`autonomiaAtiva` fora de `lib/ia-confianca/`, `models/IaAutonomiaConfig.ts`, `shared/ia-confianca/` e `app/(dashboard)/configuracoes/ia-confianca/` → nenhum resultado, confirmando que nada além desta fatia lê a configuração ainda → AC-7

## Acceptance-criteria coverage

- AC-1 (decisões elegíveis só as já classificadas) · coberto por `lib/ia-confianca/__tests__/calibragem.db.test.ts` e pelo manual "visitar a rota como Admin"
- AC-2 (tabela de cortes com contagem e porcentagem) · manual "amostra suficiente" + `calibragem.db.test.ts`
- AC-3 (aviso de amostra insuficiente) · manual + `calibragem.db.test.ts`
- AC-4 (sugestão do menor corte elegível) · manual + `calibragem.db.test.ts`
- AC-5 (formulário único, gravação única) · manual "salvar duas vezes" + `app/(dashboard)/configuracoes/ia-confianca/__tests__/actions.test.ts` + `lib/ia-confianca/__tests__/config.db.test.ts`
- AC-6 (padrões de fábrica na primeira carga) · manual "primeira carga" + `config.db.test.ts`
- AC-7 (nada lê a configuração ainda) · busca no repositório (comando acima)
- AC-8 (só Admin acessa e grava) · manual "logado como não Admin" + `actions.test.ts`
- AC-9 (filtro nunca mistura campo/decididoPor/efeito/task/promptVersion/revisadaEm errado) · `calibragem.db.test.ts`
- AC-10 (validação de faixa, em branco vira null) · manual + `actions.test.ts` + `shared/ia-confianca/__tests__/ia-confianca.schemas.test.ts`
- AC-11 (aviso de viés só no serviço) · manual "seção servico sempre mostra"
