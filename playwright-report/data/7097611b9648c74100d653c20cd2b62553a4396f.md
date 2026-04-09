# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: classificar-chamado.spec.ts >> Classificação de chamado >> fluxo classificação + SLA >> preposto classifica o chamado em /gestao
- Location: e2e\classificar-chamado.spec.ts:39:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /classificar/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /classificar/i }) resolved to 3 elements:
    1) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).first()
    2) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).nth(1)
    3) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).nth(2)

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /classificar/i })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary "Barra lateral de navegação" [ref=e3]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img [ref=e7]
          - generic [ref=e18]:
            - paragraph [ref=e19]: Sigma
            - paragraph [ref=e20]: Gestão de Chamados
          - button "Recolher barra lateral" [expanded] [ref=e22]:
            - img
        - navigation [ref=e26]:
          - generic [ref=e27]:
            - paragraph [ref=e28]: Principal
            - generic [ref=e29]:
              - link "Dashboard" [ref=e31] [cursor=pointer]:
                - /url: /dashboard
                - img [ref=e32]
                - generic [ref=e37]: Dashboard
              - link "Meus Chamados" [ref=e39] [cursor=pointer]:
                - /url: /meus-chamados
                - img [ref=e40]
                - generic [ref=e42]: Meus Chamados
          - generic [ref=e43]:
            - paragraph [ref=e44]: Gestão
            - link "Gestão" [ref=e47] [cursor=pointer]:
              - /url: /gestao
              - img [ref=e48]
              - generic [ref=e51]: Gestão
        - generic [ref=e53]:
          - generic [ref=e54]: P
          - generic [ref=e55]:
            - paragraph [ref=e56]: Preposto
            - paragraph [ref=e57]: Preposto
          - button "Sair" [ref=e59]:
            - img
    - main [ref=e60]:
      - link "Notificações" [ref=e63] [cursor=pointer]:
        - /url: /meus-chamados
        - img
        - generic [ref=e64]: "18"
      - generic [ref=e68]:
        - generic [ref=e70]:
          - heading "Gestão de Chamados" [level=1] [ref=e71]
          - paragraph [ref=e72]: Visualize e classifique chamados. Filtre por texto ou status. Apenas Admin ou Preposto.
        - generic [ref=e73]:
          - generic [ref=e74]:
            - img
            - textbox "Buscar chamados" [ref=e75]:
              - /placeholder: Buscar por número, título...
          - combobox "Filtrar por status" [ref=e77]:
            - generic: Todos os status
            - img
        - generic [ref=e80]:
          - generic [ref=e81]:
            - generic [ref=e82]:
              - generic "Aberto" [ref=e83]
              - generic [ref=e84]: "3"
            - generic [ref=e89]:
              - generic [ref=e92] [cursor=pointer]:
                - img [ref=e95]
                - generic [ref=e97]:
                  - generic [ref=e100]:
                    - generic [ref=e101]:
                      - heading "#CHM-2026-00015" [level=3] [ref=e102]
                      - generic [ref=e103]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e104]: Manutenção Predial
                  - generic [ref=e105]:
                    - button "Manutenção Predial — Sala 202" [ref=e106]:
                      - generic [ref=e107]: Manutenção Predial — Sala 202
                      - img [ref=e108]
                    - paragraph [ref=e110]: Teste classificação 1775680437723
                  - generic [ref=e112]:
                    - generic [ref=e113]:
                      - img [ref=e114]
                      - generic "Sala 202" [ref=e117]
                    - generic [ref=e118]:
                      - img [ref=e119]
                      - generic "08/04/2026, 17:33" [ref=e122]: 08/04/26
                  - generic [ref=e123]:
                    - generic [ref=e124]:
                      - generic [ref=e125]: Normal
                      - generic [ref=e126]:
                        - img
                        - text: Dentro do Prazo 0
                    - group "Ações do chamado" [ref=e127]:
                      - button "Classificar" [ref=e128]:
                        - img
                        - text: Classificar
              - generic [ref=e131] [cursor=pointer]:
                - img [ref=e134]
                - generic [ref=e136]:
                  - generic [ref=e139]:
                    - generic [ref=e140]:
                      - heading "#CHM-2026-00014" [level=3] [ref=e141]
                      - generic [ref=e142]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e143]: Manutenção Predial
                  - generic [ref=e144]:
                    - button "Manutenção Predial — sala" [ref=e145]:
                      - generic [ref=e146]: Manutenção Predial — sala
                      - img [ref=e147]
                    - paragraph [ref=e149]: teste
                  - generic [ref=e151]:
                    - generic [ref=e152]:
                      - img [ref=e153]
                      - generic "sala" [ref=e156]
                    - generic [ref=e157]:
                      - img [ref=e158]
                      - generic "03/02/2026, 14:19" [ref=e161]: 03/02/26
                  - generic [ref=e162]:
                    - generic [ref=e163]:
                      - generic [ref=e164]: Alta
                      - generic [ref=e165]:
                        - img
                        - text: Dentro do Prazo 0
                    - group "Ações do chamado" [ref=e166]:
                      - button "Classificar" [ref=e167]:
                        - img
                        - text: Classificar
              - generic [ref=e170] [cursor=pointer]:
                - img [ref=e173]
                - generic [ref=e175]:
                  - generic [ref=e178]:
                    - generic [ref=e179]:
                      - heading "#CHM-2026-00013" [level=3] [ref=e180]
                      - generic [ref=e181]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e182]: Manutenção Predial
                  - generic [ref=e183]:
                    - button "Manutenção Predial — sala principal" [ref=e184]:
                      - generic [ref=e185]: Manutenção Predial — sala principal
                      - img [ref=e186]
                    - paragraph [ref=e188]: teste
                  - generic [ref=e190]:
                    - generic [ref=e191]:
                      - img [ref=e192]
                      - generic "sala principal" [ref=e195]
                    - generic [ref=e196]:
                      - img [ref=e197]
                      - generic "02/02/2026, 16:51" [ref=e200]: 02/02/26
                  - generic [ref=e201]:
                    - generic [ref=e202]:
                      - generic [ref=e203]: Normal
                      - generic [ref=e204]:
                        - img
                        - text: Dentro do Prazo 0
                    - group "Ações do chamado" [ref=e205]:
                      - button "Classificar" [ref=e206]:
                        - img
                        - text: Classificar
          - generic [ref=e207]:
            - generic [ref=e208]:
              - generic "Validado" [ref=e209]
              - generic [ref=e210]: "0"
            - paragraph [ref=e216]: Nenhum chamado neste status
          - generic [ref=e217]:
            - generic [ref=e218]:
              - generic "Em atendimento" [ref=e219]
              - generic [ref=e220]: "0"
            - paragraph [ref=e226]: Nenhum chamado neste status
          - generic [ref=e227]:
            - generic [ref=e228]:
              - generic "Concluído" [ref=e229]
              - generic [ref=e230]: "0"
            - paragraph [ref=e236]: Nenhum chamado neste status
          - generic [ref=e237]:
            - generic [ref=e238]:
              - generic "Encerrado" [ref=e239]
              - generic [ref=e240]: "12"
            - generic [ref=e245]:
              - generic [ref=e248] [cursor=pointer]:
                - img [ref=e251]
                - generic [ref=e253]:
                  - generic [ref=e256]:
                    - generic [ref=e257]:
                      - heading "#CHM-2026-00004" [level=3] [ref=e258]
                      - generic [ref=e259]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 30/01/2026, 16:38 · Prazo solução: 30/01/2026, 23:38" [ref=e260]': Atrasado
                    - paragraph [ref=e261]: Ar-Condicionado
                  - generic [ref=e262]:
                    - button "Ar-Condicionado — Sala do Diretor [URGENTE]" [ref=e263]:
                      - generic [ref=e264]: Ar-Condicionado — Sala do Diretor [URGENTE]
                      - img [ref=e265]
                    - paragraph [ref=e267]: Realizar limpeza da central.
                  - generic [ref=e269]:
                    - generic [ref=e270]:
                      - img [ref=e271]
                      - generic "Sala do Diretor" [ref=e274]
                    - generic [ref=e275]:
                      - img [ref=e276]
                      - generic "30/01/2026, 15:36" [ref=e279]: 30/01/26
                  - generic [ref=e281]:
                    - generic [ref=e282]: Normal
                    - generic [ref=e283]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e286] [cursor=pointer]:
                - img [ref=e289]
                - generic [ref=e291]:
                  - generic [ref=e294]:
                    - generic [ref=e295]:
                      - heading "#CHM-2026-00010" [level=3] [ref=e296]
                      - generic [ref=e297]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:40 · Prazo solução: 02/02/2026, 19:40" [ref=e298]': No prazo
                    - paragraph [ref=e299]: Manutenção Predial
                  - generic [ref=e300]:
                    - button "Manutenção Predial — Sala principal" [ref=e301]:
                      - generic [ref=e302]: Manutenção Predial — Sala principal
                      - img [ref=e303]
                    - paragraph [ref=e305]: teste
                  - generic [ref=e307]:
                    - generic [ref=e308]:
                      - img [ref=e309]
                      - generic "Sala principal" [ref=e312]
                    - generic [ref=e313]:
                      - img [ref=e314]
                      - generic "02/02/2026, 11:19" [ref=e317]: 02/02/26
                  - generic [ref=e319]:
                    - generic [ref=e320]: Baixa
                    - generic [ref=e321]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e324] [cursor=pointer]:
                - img [ref=e327]
                - generic [ref=e329]:
                  - generic [ref=e332]:
                    - generic [ref=e333]:
                      - heading "#CHM-2026-00009" [level=3] [ref=e334]
                      - generic [ref=e335]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:40 · Prazo solução: 02/02/2026, 19:40" [ref=e336]': No prazo
                    - paragraph [ref=e337]: Manutenção Predial
                  - generic [ref=e338]:
                    - button "Manutenção Predial — Sala principal" [ref=e339]:
                      - generic [ref=e340]: Manutenção Predial — Sala principal
                      - img [ref=e341]
                    - paragraph [ref=e343]: teste
                  - generic [ref=e345]:
                    - generic [ref=e346]:
                      - img [ref=e347]
                      - generic "Sala principal" [ref=e350]
                    - generic [ref=e351]:
                      - img [ref=e352]
                      - generic "02/02/2026, 11:18" [ref=e355]: 02/02/26
                  - generic [ref=e357]:
                    - generic [ref=e358]: Baixa
                    - generic [ref=e359]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e362] [cursor=pointer]:
                - img [ref=e365]
                - generic [ref=e367]:
                  - generic [ref=e370]:
                    - generic [ref=e371]:
                      - heading "#CHM-2026-00011" [level=3] [ref=e372]
                      - generic [ref=e373]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:39 · Prazo solução: 02/02/2026, 19:39" [ref=e374]': No prazo
                    - paragraph [ref=e375]: Manutenção Predial
                  - generic [ref=e376]:
                    - button "Manutenção Predial — Sala principal" [ref=e377]:
                      - generic [ref=e378]: Manutenção Predial — Sala principal
                      - img [ref=e379]
                    - paragraph [ref=e381]: teste
                  - generic [ref=e383]:
                    - generic [ref=e384]:
                      - img [ref=e385]
                      - generic "Sala principal" [ref=e388]
                    - generic [ref=e389]:
                      - img [ref=e390]
                      - generic "02/02/2026, 11:20" [ref=e393]: 02/02/26
                  - generic [ref=e395]:
                    - generic [ref=e396]: Baixa
                    - generic [ref=e397]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e400] [cursor=pointer]:
                - img [ref=e403]
                - generic [ref=e405]:
                  - generic [ref=e408]:
                    - generic [ref=e409]:
                      - heading "#CHM-2026-00012" [level=3] [ref=e410]
                      - generic [ref=e411]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 03/02/2026, 11:38 · Prazo solução: 05/02/2026, 11:38" [ref=e412]': No prazo
                    - paragraph [ref=e413]: Manutenção Predial
                  - generic [ref=e414]:
                    - button "Manutenção Predial — Sala principal" [ref=e415]:
                      - generic [ref=e416]: Manutenção Predial — Sala principal
                      - img [ref=e417]
                    - paragraph [ref=e419]: teste
                  - generic [ref=e421]:
                    - generic [ref=e422]:
                      - img [ref=e423]
                      - generic "Sala principal" [ref=e426]
                    - generic [ref=e427]:
                      - img [ref=e428]
                      - generic "02/02/2026, 11:23" [ref=e431]: 02/02/26
                  - generic [ref=e433]:
                    - generic [ref=e434]: Baixa
                    - generic [ref=e435]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e438] [cursor=pointer]:
                - img [ref=e441]
                - generic [ref=e443]:
                  - generic [ref=e446]:
                    - generic [ref=e447]:
                      - heading "#CHM-2026-00007" [level=3] [ref=e448]
                      - generic [ref=e449]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 03/02/2026, 11:10 · Prazo solução: 05/02/2026, 11:10" [ref=e450]': No prazo
                    - paragraph [ref=e451]: Manutenção Predial
                  - generic [ref=e452]:
                    - button "Manutenção Predial — Sala principal" [ref=e453]:
                      - generic [ref=e454]: Manutenção Predial — Sala principal
                      - img [ref=e455]
                    - paragraph [ref=e457]: Teste
                  - generic [ref=e459]:
                    - generic [ref=e460]:
                      - img [ref=e461]
                      - generic "Sala principal" [ref=e464]
                    - generic [ref=e465]:
                      - img [ref=e466]
                      - generic "02/02/2026, 11:09" [ref=e469]: 02/02/26
                  - generic [ref=e471]:
                    - generic [ref=e472]: Alta
                    - generic [ref=e473]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e476] [cursor=pointer]:
                - img [ref=e479]
                - generic [ref=e481]:
                  - generic [ref=e484]:
                    - generic [ref=e485]:
                      - heading "#CHM-2026-00006" [level=3] [ref=e486]
                      - generic [ref=e487]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: ALTA · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 06:00 · Prazo solução: 02/02/2026, 12:00" [ref=e488]': No prazo
                    - paragraph [ref=e489]: Manutenção Predial
                  - generic [ref=e490]:
                    - button "Manutenção Predial — CSTI" [ref=e491]:
                      - generic [ref=e492]: Manutenção Predial — CSTI
                      - img [ref=e493]
                    - paragraph [ref=e495]: Substituição da lâmpadas queimadas da Sala do Nutec.
                  - generic [ref=e497]:
                    - generic [ref=e498]:
                      - img [ref=e499]
                      - generic "CSTI" [ref=e502]
                    - generic [ref=e503]:
                      - img [ref=e504]
                      - generic "30/01/2026, 15:39" [ref=e507]: 30/01/26
                  - generic [ref=e509]:
                    - generic [ref=e510]: Normal
                    - generic [ref=e511]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e514] [cursor=pointer]:
                - img [ref=e517]
                - generic [ref=e519]:
                  - generic [ref=e522]:
                    - generic [ref=e523]:
                      - heading "#CHM-2026-00005" [level=3] [ref=e524]
                      - generic [ref=e525]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 30/01/2026, 16:39 · Prazo solução: 30/01/2026, 23:39" [ref=e526]': Atrasado
                    - paragraph [ref=e527]: Manutenção Predial
                  - generic [ref=e528]:
                    - button "Manutenção Predial — Nutec [URGENTE]" [ref=e529]:
                      - generic [ref=e530]: Manutenção Predial — Nutec [URGENTE]
                      - img [ref=e531]
                    - paragraph [ref=e533]: Colocar tampinha da tomada.
                  - generic [ref=e535]:
                    - generic [ref=e536]:
                      - img [ref=e537]
                      - generic "Nutec" [ref=e540]
                    - generic [ref=e541]:
                      - img [ref=e542]
                      - generic "30/01/2026, 15:39" [ref=e545]: 30/01/26
                  - generic [ref=e547]:
                    - generic [ref=e548]: Alta
                    - generic [ref=e549]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e552] [cursor=pointer]:
                - img [ref=e555]
                - generic [ref=e557]:
                  - generic [ref=e560]:
                    - generic [ref=e561]:
                      - heading "#CHM-2026-00008" [level=3] [ref=e562]
                      - generic [ref=e563]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 03/02/2026, 11:13 · Prazo solução: 05/02/2026, 11:13" [ref=e564]': No prazo
                    - paragraph [ref=e565]: Manutenção Predial
                  - generic [ref=e566]:
                    - button "Manutenção Predial — Sala principal" [ref=e567]:
                      - generic [ref=e568]: Manutenção Predial — Sala principal
                      - img [ref=e569]
                    - paragraph [ref=e571]: teste
                  - generic [ref=e573]:
                    - generic [ref=e574]:
                      - img [ref=e575]
                      - generic "Sala principal" [ref=e578]
                    - generic [ref=e579]:
                      - img [ref=e580]
                      - generic "02/02/2026, 11:12" [ref=e583]: 02/02/26
                  - generic [ref=e585]:
                    - generic [ref=e586]: Baixa
                    - generic [ref=e587]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e590] [cursor=pointer]:
                - img [ref=e593]
                - generic [ref=e595]:
                  - generic [ref=e598]:
                    - generic [ref=e599]:
                      - heading "#CHM-2026-00003" [level=3] [ref=e600]
                      - generic [ref=e601]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: ALTA · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 06:00 · Prazo solução: 02/02/2026, 12:00" [ref=e602]': No prazo
                    - paragraph [ref=e603]: Manutenção Predial
                  - generic [ref=e604]:
                    - button "Manutenção Predial — Sala principal" [ref=e605]:
                      - generic [ref=e606]: Manutenção Predial — Sala principal
                      - img [ref=e607]
                    - paragraph [ref=e609]: Resolver problema
                  - generic [ref=e611]:
                    - generic [ref=e612]:
                      - img [ref=e613]
                      - generic "Sala principal" [ref=e616]
                    - generic [ref=e617]:
                      - img [ref=e618]
                      - generic "30/01/2026, 15:22" [ref=e621]: 30/01/26
                  - generic [ref=e623]:
                    - generic [ref=e624]: Normal
                    - generic [ref=e625]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e628] [cursor=pointer]:
                - img [ref=e631]
                - generic [ref=e633]:
                  - generic [ref=e636]:
                    - generic [ref=e637]:
                      - heading "#CHM-2026-00002" [level=3] [ref=e638]
                      - generic [ref=e639]:
                        - img
                        - text: Encerrado
                      - generic [ref=e640]:
                        - img
                        - text: Urgente
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Urgente · Prazo resposta: 30/01/2026, 15:39 · Prazo solução: 30/01/2026, 22:39" [ref=e641]': No prazo
                    - paragraph [ref=e642]: Manutenção Predial
                  - generic [ref=e643]:
                    - button "Manutenção Predial — Sala principal [URGENTE]" [ref=e644]:
                      - generic [ref=e645]: Manutenção Predial — Sala principal [URGENTE]
                      - img [ref=e646]
                    - paragraph [ref=e648]: hjfgliyfvh.
                  - generic [ref=e650]:
                    - generic [ref=e651]:
                      - img [ref=e652]
                      - generic "Sala principal" [ref=e655]
                    - generic [ref=e656]:
                      - img [ref=e657]
                      - generic "30/01/2026, 14:39" [ref=e660]: 30/01/26
                  - generic [ref=e662]:
                    - generic [ref=e663]: Alta
                    - generic [ref=e664]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e667] [cursor=pointer]:
                - img [ref=e670]
                - generic [ref=e672]:
                  - generic [ref=e675]:
                    - generic [ref=e676]:
                      - heading "#CHM-2026-00001" [level=3] [ref=e677]
                      - generic [ref=e678]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:00 · Prazo solução: 04/02/2026, 12:00" [ref=e679]': No prazo
                    - paragraph [ref=e680]: Manutenção Predial
                  - generic [ref=e681]:
                    - button "Manutenção Predial — Sala principal [URGENTE]" [ref=e682]:
                      - generic [ref=e683]: Manutenção Predial — Sala principal [URGENTE]
                      - img [ref=e684]
                    - paragraph [ref=e686]: Troca de extensão
                  - generic [ref=e688]:
                    - generic [ref=e689]:
                      - img [ref=e690]
                      - generic "Sala principal" [ref=e693]
                    - generic [ref=e694]:
                      - img [ref=e695]
                      - generic "30/01/2026, 14:25" [ref=e698]: 30/01/26
                  - generic [ref=e700]:
                    - generic [ref=e701]: Normal
                    - generic [ref=e702]:
                      - img
                      - text: Dentro do Prazo 0
          - generic [ref=e703]:
            - generic [ref=e704]:
              - generic "Cancelado" [ref=e705]
              - generic [ref=e706]: "0"
            - paragraph [ref=e712]: Nenhum chamado neste status
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e718] [cursor=pointer]:
    - img [ref=e719]
  - alert [ref=e722]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | import { login } from './fixtures/auth';
  4  | 
  5  | test.describe('Classificação de chamado', () => {
  6  |   // Este teste depende de um chamado com status "aberto" existir.
  7  |   // O seed cria os dados base, mas um chamado precisa ser criado antes.
  8  |   // Usamos test.describe.serial para garantir ordem.
  9  | 
  10 |   let ticketTitle: string;
  11 | 
  12 |   test.describe.serial('fluxo classificação + SLA', () => {
  13 |     test('solicitante cria chamado', async ({ page }) => {
  14 |       await login(page, 'solicitante');
  15 |       await page.goto('/meus-chamados');
  16 | 
  17 |       ticketTitle = `Teste classificação ${Date.now()}`;
  18 | 
  19 |       await page.getByRole('button', { name: /novo chamado/i }).click();
  20 |       const dialog = page.getByRole('dialog');
  21 |       await expect(dialog).toBeVisible();
  22 | 
  23 |       // Seleciona unidade/setor
  24 |       await dialog.getByRole('combobox', { name: /unidade/i }).click();
  25 |       await page.getByRole('option').first().click();
  26 | 
  27 |       await dialog.getByLabel(/local exato/i).fill('Sala 202');
  28 |       await dialog.getByText('Manutenção Predial').click();
  29 |       await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
  30 |       await dialog.getByText('Padrão').first().click();
  31 | 
  32 |       await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
  33 |       await expect(dialog).not.toBeVisible({ timeout: 10000 });
  34 | 
  35 |       // Confirma que apareceu na lista
  36 |       await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 10000 });
  37 |     });
  38 | 
  39 |     test('preposto classifica o chamado em /gestao', async ({ page }) => {
  40 |       await login(page, 'preposto');
  41 |       await page.goto('/gestao');
  42 | 
  43 |       // Aguarda a página carregar e procura o chamado na coluna "aberto"
  44 |       await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  45 | 
  46 |       // Clica no card do chamado para abrir detalhes/ações
  47 |       await page.getByText(ticketTitle).click();
  48 | 
  49 |       // Procura bot��o de classificar
  50 |       const classificarBtn = page.getByRole('button', { name: /classificar/i });
> 51 |       await expect(classificarBtn).toBeVisible({ timeout: 5000 });
     |                                    ^ Error: expect(locator).toBeVisible() failed
  52 |       await classificarBtn.click();
  53 | 
  54 |       // Aguarda dialog de classificação
  55 |       const dialog = page.getByRole('dialog');
  56 |       await expect(dialog).toBeVisible();
  57 | 
  58 |       // Seleciona prioridade ALTA
  59 |       await dialog.getByText('ALTA').click();
  60 | 
  61 |       // Confirma classificação
  62 |       await dialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();
  63 | 
  64 |       // Dialog deve fechar
  65 |       await expect(dialog).not.toBeVisible({ timeout: 10000 });
  66 | 
  67 |       // Chamado deve sair da coluna "aberto" e ir para "validado"
  68 |       // Aguarda o chamado aparecer com indicativo de validado
  69 |       await page.waitForTimeout(1000); // Aguarda revalidação
  70 |       await page.reload();
  71 | 
  72 |       // O chamado não deve mais estar na coluna aberto
  73 |       // (pode estar em validado ou outra coluna)
  74 |     });
  75 |   });
  76 | });
  77 | 
```