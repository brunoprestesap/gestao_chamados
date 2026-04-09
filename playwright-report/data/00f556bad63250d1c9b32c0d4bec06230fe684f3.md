# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fluxo-completo.spec.ts >> Fluxo completo: abrir → classificar → atribuir → executar → encerrar >> 2. Preposto classifica chamado (define prioridade e SLA)
- Location: e2e\fluxo-completo.spec.ts:37:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /classificar/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /classificar/i }) resolved to 5 elements:
    1) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).first()
    2) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).nth(1)
    3) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).nth(2)
    4) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).nth(3)
    5) <button type="button" data-size="sm" data-slot="button" data-variant="default" title="Classificar chamado (prioridade e natureza)" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:r…>…</button> aka getByRole('button', { name: 'Classificar' }).nth(4)

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
        - generic [ref=e64]: "20"
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
              - generic [ref=e84]: "5"
            - generic [ref=e89]:
              - generic [ref=e92] [cursor=pointer]:
                - img [ref=e95]
                - generic [ref=e97]:
                  - generic [ref=e100]:
                    - generic [ref=e101]:
                      - heading "#CHM-2026-00017" [level=3] [ref=e102]
                      - generic [ref=e103]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e104]: Manutenção Predial
                  - generic [ref=e105]:
                    - button "Manutenção Predial — Sala 301 - E2E" [ref=e106]:
                      - generic [ref=e107]: Manutenção Predial — Sala 301 - E2E
                      - img [ref=e108]
                    - paragraph [ref=e110]: E2E completo 1775680447181
                  - generic [ref=e112]:
                    - generic [ref=e113]:
                      - img [ref=e114]
                      - generic "Sala 301 - E2E" [ref=e117]
                    - generic [ref=e118]:
                      - img [ref=e119]
                      - generic "08/04/2026, 17:34" [ref=e122]: 08/04/26
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
                      - heading "#CHM-2026-00016" [level=3] [ref=e141]
                      - generic [ref=e142]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e143]: Manutenção Predial
                  - generic [ref=e144]:
                    - button "Manutenção Predial — Sala 101 - Bloco A" [ref=e145]:
                      - generic [ref=e146]: Manutenção Predial — Sala 101 - Bloco A
                      - img [ref=e147]
                    - paragraph [ref=e149]: Lâmpada queimada no corredor principal
                  - generic [ref=e151]:
                    - generic [ref=e152]:
                      - img [ref=e153]
                      - generic "Sala 101 - Bloco A" [ref=e156]
                    - generic [ref=e157]:
                      - img [ref=e158]
                      - generic "08/04/2026, 17:34" [ref=e161]: 08/04/26
                  - generic [ref=e162]:
                    - generic [ref=e163]:
                      - generic [ref=e164]: Normal
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
                      - heading "#CHM-2026-00015" [level=3] [ref=e180]
                      - generic [ref=e181]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e182]: Manutenção Predial
                  - generic [ref=e183]:
                    - button "Manutenção Predial — Sala 202" [ref=e184]:
                      - generic [ref=e185]: Manutenção Predial — Sala 202
                      - img [ref=e186]
                    - paragraph [ref=e188]: Teste classificação 1775680437723
                  - generic [ref=e190]:
                    - generic [ref=e191]:
                      - img [ref=e192]
                      - generic "Sala 202" [ref=e195]
                    - generic [ref=e196]:
                      - img [ref=e197]
                      - generic "08/04/2026, 17:33" [ref=e200]: 08/04/26
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
              - generic [ref=e209] [cursor=pointer]:
                - img [ref=e212]
                - generic [ref=e214]:
                  - generic [ref=e217]:
                    - generic [ref=e218]:
                      - heading "#CHM-2026-00014" [level=3] [ref=e219]
                      - generic [ref=e220]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e221]: Manutenção Predial
                  - generic [ref=e222]:
                    - button "Manutenção Predial — sala" [ref=e223]:
                      - generic [ref=e224]: Manutenção Predial — sala
                      - img [ref=e225]
                    - paragraph [ref=e227]: teste
                  - generic [ref=e229]:
                    - generic [ref=e230]:
                      - img [ref=e231]
                      - generic "sala" [ref=e234]
                    - generic [ref=e235]:
                      - img [ref=e236]
                      - generic "03/02/2026, 14:19" [ref=e239]: 03/02/26
                  - generic [ref=e240]:
                    - generic [ref=e241]:
                      - generic [ref=e242]: Alta
                      - generic [ref=e243]:
                        - img
                        - text: Dentro do Prazo 0
                    - group "Ações do chamado" [ref=e244]:
                      - button "Classificar" [ref=e245]:
                        - img
                        - text: Classificar
              - generic [ref=e248] [cursor=pointer]:
                - img [ref=e251]
                - generic [ref=e253]:
                  - generic [ref=e256]:
                    - generic [ref=e257]:
                      - heading "#CHM-2026-00013" [level=3] [ref=e258]
                      - generic [ref=e259]:
                        - img
                        - text: Aberto
                    - paragraph [ref=e260]: Manutenção Predial
                  - generic [ref=e261]:
                    - button "Manutenção Predial — sala principal" [ref=e262]:
                      - generic [ref=e263]: Manutenção Predial — sala principal
                      - img [ref=e264]
                    - paragraph [ref=e266]: teste
                  - generic [ref=e268]:
                    - generic [ref=e269]:
                      - img [ref=e270]
                      - generic "sala principal" [ref=e273]
                    - generic [ref=e274]:
                      - img [ref=e275]
                      - generic "02/02/2026, 16:51" [ref=e278]: 02/02/26
                  - generic [ref=e279]:
                    - generic [ref=e280]:
                      - generic [ref=e281]: Normal
                      - generic [ref=e282]:
                        - img
                        - text: Dentro do Prazo 0
                    - group "Ações do chamado" [ref=e283]:
                      - button "Classificar" [ref=e284]:
                        - img
                        - text: Classificar
          - generic [ref=e285]:
            - generic [ref=e286]:
              - generic "Validado" [ref=e287]
              - generic [ref=e288]: "0"
            - paragraph [ref=e294]: Nenhum chamado neste status
          - generic [ref=e295]:
            - generic [ref=e296]:
              - generic "Em atendimento" [ref=e297]
              - generic [ref=e298]: "0"
            - paragraph [ref=e304]: Nenhum chamado neste status
          - generic [ref=e305]:
            - generic [ref=e306]:
              - generic "Concluído" [ref=e307]
              - generic [ref=e308]: "0"
            - paragraph [ref=e314]: Nenhum chamado neste status
          - generic [ref=e315]:
            - generic [ref=e316]:
              - generic "Encerrado" [ref=e317]
              - generic [ref=e318]: "12"
            - generic [ref=e323]:
              - generic [ref=e326] [cursor=pointer]:
                - img [ref=e329]
                - generic [ref=e331]:
                  - generic [ref=e334]:
                    - generic [ref=e335]:
                      - heading "#CHM-2026-00004" [level=3] [ref=e336]
                      - generic [ref=e337]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 30/01/2026, 16:38 · Prazo solução: 30/01/2026, 23:38" [ref=e338]': Atrasado
                    - paragraph [ref=e339]: Ar-Condicionado
                  - generic [ref=e340]:
                    - button "Ar-Condicionado — Sala do Diretor [URGENTE]" [ref=e341]:
                      - generic [ref=e342]: Ar-Condicionado — Sala do Diretor [URGENTE]
                      - img [ref=e343]
                    - paragraph [ref=e345]: Realizar limpeza da central.
                  - generic [ref=e347]:
                    - generic [ref=e348]:
                      - img [ref=e349]
                      - generic "Sala do Diretor" [ref=e352]
                    - generic [ref=e353]:
                      - img [ref=e354]
                      - generic "30/01/2026, 15:36" [ref=e357]: 30/01/26
                  - generic [ref=e359]:
                    - generic [ref=e360]: Normal
                    - generic [ref=e361]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e364] [cursor=pointer]:
                - img [ref=e367]
                - generic [ref=e369]:
                  - generic [ref=e372]:
                    - generic [ref=e373]:
                      - heading "#CHM-2026-00010" [level=3] [ref=e374]
                      - generic [ref=e375]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:40 · Prazo solução: 02/02/2026, 19:40" [ref=e376]': No prazo
                    - paragraph [ref=e377]: Manutenção Predial
                  - generic [ref=e378]:
                    - button "Manutenção Predial — Sala principal" [ref=e379]:
                      - generic [ref=e380]: Manutenção Predial — Sala principal
                      - img [ref=e381]
                    - paragraph [ref=e383]: teste
                  - generic [ref=e385]:
                    - generic [ref=e386]:
                      - img [ref=e387]
                      - generic "Sala principal" [ref=e390]
                    - generic [ref=e391]:
                      - img [ref=e392]
                      - generic "02/02/2026, 11:19" [ref=e395]: 02/02/26
                  - generic [ref=e397]:
                    - generic [ref=e398]: Baixa
                    - generic [ref=e399]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e402] [cursor=pointer]:
                - img [ref=e405]
                - generic [ref=e407]:
                  - generic [ref=e410]:
                    - generic [ref=e411]:
                      - heading "#CHM-2026-00009" [level=3] [ref=e412]
                      - generic [ref=e413]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:40 · Prazo solução: 02/02/2026, 19:40" [ref=e414]': No prazo
                    - paragraph [ref=e415]: Manutenção Predial
                  - generic [ref=e416]:
                    - button "Manutenção Predial — Sala principal" [ref=e417]:
                      - generic [ref=e418]: Manutenção Predial — Sala principal
                      - img [ref=e419]
                    - paragraph [ref=e421]: teste
                  - generic [ref=e423]:
                    - generic [ref=e424]:
                      - img [ref=e425]
                      - generic "Sala principal" [ref=e428]
                    - generic [ref=e429]:
                      - img [ref=e430]
                      - generic "02/02/2026, 11:18" [ref=e433]: 02/02/26
                  - generic [ref=e435]:
                    - generic [ref=e436]: Baixa
                    - generic [ref=e437]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e440] [cursor=pointer]:
                - img [ref=e443]
                - generic [ref=e445]:
                  - generic [ref=e448]:
                    - generic [ref=e449]:
                      - heading "#CHM-2026-00011" [level=3] [ref=e450]
                      - generic [ref=e451]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:39 · Prazo solução: 02/02/2026, 19:39" [ref=e452]': No prazo
                    - paragraph [ref=e453]: Manutenção Predial
                  - generic [ref=e454]:
                    - button "Manutenção Predial — Sala principal" [ref=e455]:
                      - generic [ref=e456]: Manutenção Predial — Sala principal
                      - img [ref=e457]
                    - paragraph [ref=e459]: teste
                  - generic [ref=e461]:
                    - generic [ref=e462]:
                      - img [ref=e463]
                      - generic "Sala principal" [ref=e466]
                    - generic [ref=e467]:
                      - img [ref=e468]
                      - generic "02/02/2026, 11:20" [ref=e471]: 02/02/26
                  - generic [ref=e473]:
                    - generic [ref=e474]: Baixa
                    - generic [ref=e475]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e478] [cursor=pointer]:
                - img [ref=e481]
                - generic [ref=e483]:
                  - generic [ref=e486]:
                    - generic [ref=e487]:
                      - heading "#CHM-2026-00012" [level=3] [ref=e488]
                      - generic [ref=e489]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 03/02/2026, 11:38 · Prazo solução: 05/02/2026, 11:38" [ref=e490]': No prazo
                    - paragraph [ref=e491]: Manutenção Predial
                  - generic [ref=e492]:
                    - button "Manutenção Predial — Sala principal" [ref=e493]:
                      - generic [ref=e494]: Manutenção Predial — Sala principal
                      - img [ref=e495]
                    - paragraph [ref=e497]: teste
                  - generic [ref=e499]:
                    - generic [ref=e500]:
                      - img [ref=e501]
                      - generic "Sala principal" [ref=e504]
                    - generic [ref=e505]:
                      - img [ref=e506]
                      - generic "02/02/2026, 11:23" [ref=e509]: 02/02/26
                  - generic [ref=e511]:
                    - generic [ref=e512]: Baixa
                    - generic [ref=e513]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e516] [cursor=pointer]:
                - img [ref=e519]
                - generic [ref=e521]:
                  - generic [ref=e524]:
                    - generic [ref=e525]:
                      - heading "#CHM-2026-00007" [level=3] [ref=e526]
                      - generic [ref=e527]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 03/02/2026, 11:10 · Prazo solução: 05/02/2026, 11:10" [ref=e528]': No prazo
                    - paragraph [ref=e529]: Manutenção Predial
                  - generic [ref=e530]:
                    - button "Manutenção Predial — Sala principal" [ref=e531]:
                      - generic [ref=e532]: Manutenção Predial — Sala principal
                      - img [ref=e533]
                    - paragraph [ref=e535]: Teste
                  - generic [ref=e537]:
                    - generic [ref=e538]:
                      - img [ref=e539]
                      - generic "Sala principal" [ref=e542]
                    - generic [ref=e543]:
                      - img [ref=e544]
                      - generic "02/02/2026, 11:09" [ref=e547]: 02/02/26
                  - generic [ref=e549]:
                    - generic [ref=e550]: Alta
                    - generic [ref=e551]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e554] [cursor=pointer]:
                - img [ref=e557]
                - generic [ref=e559]:
                  - generic [ref=e562]:
                    - generic [ref=e563]:
                      - heading "#CHM-2026-00006" [level=3] [ref=e564]
                      - generic [ref=e565]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: ALTA · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 06:00 · Prazo solução: 02/02/2026, 12:00" [ref=e566]': No prazo
                    - paragraph [ref=e567]: Manutenção Predial
                  - generic [ref=e568]:
                    - button "Manutenção Predial — CSTI" [ref=e569]:
                      - generic [ref=e570]: Manutenção Predial — CSTI
                      - img [ref=e571]
                    - paragraph [ref=e573]: Substituição da lâmpadas queimadas da Sala do Nutec.
                  - generic [ref=e575]:
                    - generic [ref=e576]:
                      - img [ref=e577]
                      - generic "CSTI" [ref=e580]
                    - generic [ref=e581]:
                      - img [ref=e582]
                      - generic "30/01/2026, 15:39" [ref=e585]: 30/01/26
                  - generic [ref=e587]:
                    - generic [ref=e588]: Normal
                    - generic [ref=e589]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e592] [cursor=pointer]:
                - img [ref=e595]
                - generic [ref=e597]:
                  - generic [ref=e600]:
                    - generic [ref=e601]:
                      - heading "#CHM-2026-00005" [level=3] [ref=e602]
                      - generic [ref=e603]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Padrão · Prazo resposta: 30/01/2026, 16:39 · Prazo solução: 30/01/2026, 23:39" [ref=e604]': Atrasado
                    - paragraph [ref=e605]: Manutenção Predial
                  - generic [ref=e606]:
                    - button "Manutenção Predial — Nutec [URGENTE]" [ref=e607]:
                      - generic [ref=e608]: Manutenção Predial — Nutec [URGENTE]
                      - img [ref=e609]
                    - paragraph [ref=e611]: Colocar tampinha da tomada.
                  - generic [ref=e613]:
                    - generic [ref=e614]:
                      - img [ref=e615]
                      - generic "Nutec" [ref=e618]
                    - generic [ref=e619]:
                      - img [ref=e620]
                      - generic "30/01/2026, 15:39" [ref=e623]: 30/01/26
                  - generic [ref=e625]:
                    - generic [ref=e626]: Alta
                    - generic [ref=e627]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e630] [cursor=pointer]:
                - img [ref=e633]
                - generic [ref=e635]:
                  - generic [ref=e638]:
                    - generic [ref=e639]:
                      - heading "#CHM-2026-00008" [level=3] [ref=e640]
                      - generic [ref=e641]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 03/02/2026, 11:13 · Prazo solução: 05/02/2026, 11:13" [ref=e642]': No prazo
                    - paragraph [ref=e643]: Manutenção Predial
                  - generic [ref=e644]:
                    - button "Manutenção Predial — Sala principal" [ref=e645]:
                      - generic [ref=e646]: Manutenção Predial — Sala principal
                      - img [ref=e647]
                    - paragraph [ref=e649]: teste
                  - generic [ref=e651]:
                    - generic [ref=e652]:
                      - img [ref=e653]
                      - generic "Sala principal" [ref=e656]
                    - generic [ref=e657]:
                      - img [ref=e658]
                      - generic "02/02/2026, 11:12" [ref=e661]: 02/02/26
                  - generic [ref=e663]:
                    - generic [ref=e664]: Baixa
                    - generic [ref=e665]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e668] [cursor=pointer]:
                - img [ref=e671]
                - generic [ref=e673]:
                  - generic [ref=e676]:
                    - generic [ref=e677]:
                      - heading "#CHM-2026-00003" [level=3] [ref=e678]
                      - generic [ref=e679]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: ALTA · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 06:00 · Prazo solução: 02/02/2026, 12:00" [ref=e680]': No prazo
                    - paragraph [ref=e681]: Manutenção Predial
                  - generic [ref=e682]:
                    - button "Manutenção Predial — Sala principal" [ref=e683]:
                      - generic [ref=e684]: Manutenção Predial — Sala principal
                      - img [ref=e685]
                    - paragraph [ref=e687]: Resolver problema
                  - generic [ref=e689]:
                    - generic [ref=e690]:
                      - img [ref=e691]
                      - generic "Sala principal" [ref=e694]
                    - generic [ref=e695]:
                      - img [ref=e696]
                      - generic "30/01/2026, 15:22" [ref=e699]: 30/01/26
                  - generic [ref=e701]:
                    - generic [ref=e702]: Normal
                    - generic [ref=e703]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e706] [cursor=pointer]:
                - img [ref=e709]
                - generic [ref=e711]:
                  - generic [ref=e714]:
                    - generic [ref=e715]:
                      - heading "#CHM-2026-00002" [level=3] [ref=e716]
                      - generic [ref=e717]:
                        - img
                        - text: Encerrado
                      - generic [ref=e718]:
                        - img
                        - text: Urgente
                      - 'generic "Prioridade: EMERGENCIAL · Natureza aprovada: Urgente · Prazo resposta: 30/01/2026, 15:39 · Prazo solução: 30/01/2026, 22:39" [ref=e719]': No prazo
                    - paragraph [ref=e720]: Manutenção Predial
                  - generic [ref=e721]:
                    - button "Manutenção Predial — Sala principal [URGENTE]" [ref=e722]:
                      - generic [ref=e723]: Manutenção Predial — Sala principal [URGENTE]
                      - img [ref=e724]
                    - paragraph [ref=e726]: hjfgliyfvh.
                  - generic [ref=e728]:
                    - generic [ref=e729]:
                      - img [ref=e730]
                      - generic "Sala principal" [ref=e733]
                    - generic [ref=e734]:
                      - img [ref=e735]
                      - generic "30/01/2026, 14:39" [ref=e738]: 30/01/26
                  - generic [ref=e740]:
                    - generic [ref=e741]: Alta
                    - generic [ref=e742]:
                      - img
                      - text: Dentro do Prazo 0
              - generic [ref=e745] [cursor=pointer]:
                - img [ref=e748]
                - generic [ref=e750]:
                  - generic [ref=e753]:
                    - generic [ref=e754]:
                      - heading "#CHM-2026-00001" [level=3] [ref=e755]
                      - generic [ref=e756]:
                        - img
                        - text: Encerrado
                      - 'generic "Prioridade: NORMAL · Natureza aprovada: Padrão · Prazo resposta: 02/02/2026, 12:00 · Prazo solução: 04/02/2026, 12:00" [ref=e757]': No prazo
                    - paragraph [ref=e758]: Manutenção Predial
                  - generic [ref=e759]:
                    - button "Manutenção Predial — Sala principal [URGENTE]" [ref=e760]:
                      - generic [ref=e761]: Manutenção Predial — Sala principal [URGENTE]
                      - img [ref=e762]
                    - paragraph [ref=e764]: Troca de extensão
                  - generic [ref=e766]:
                    - generic [ref=e767]:
                      - img [ref=e768]
                      - generic "Sala principal" [ref=e771]
                    - generic [ref=e772]:
                      - img [ref=e773]
                      - generic "30/01/2026, 14:25" [ref=e776]: 30/01/26
                  - generic [ref=e778]:
                    - generic [ref=e779]: Normal
                    - generic [ref=e780]:
                      - img
                      - text: Dentro do Prazo 0
          - generic [ref=e781]:
            - generic [ref=e782]:
              - generic "Cancelado" [ref=e783]
              - generic [ref=e784]: "0"
            - paragraph [ref=e790]: Nenhum chamado neste status
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e796] [cursor=pointer]:
    - img [ref=e797]
  - alert [ref=e800]
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | import { login } from './fixtures/auth';
  4   | 
  5   | /**
  6   |  * Fluxo completo do ciclo de vida de um chamado:
  7   |  * aberto → validado → em atendimento → concluído → encerrado
  8   |  *
  9   |  * Usa test.describe.serial para garantir ordem dos passos.
  10  |  * IMPORTANTE: requer que o seed tenha sido executado (users, SLA configs, catálogo).
  11  |  */
  12  | test.describe.serial('Fluxo completo: abrir → classificar → atribuir → executar → encerrar', () => {
  13  |   const ticketTitle = `E2E completo ${Date.now()}`;
  14  | 
  15  |   test('1. Solicitante abre chamado', async ({ page }) => {
  16  |     await login(page, 'solicitante');
  17  |     await page.goto('/meus-chamados');
  18  | 
  19  |     await page.getByRole('button', { name: /novo chamado/i }).click();
  20  |     const dialog = page.getByRole('dialog');
  21  |     await expect(dialog).toBeVisible();
  22  | 
  23  |     // Seleciona unidade/setor
  24  |     await dialog.getByRole('combobox', { name: /unidade/i }).click();
  25  |     await page.getByRole('option').first().click();
  26  | 
  27  |     await dialog.getByLabel(/local exato/i).fill('Sala 301 - E2E');
  28  |     await dialog.getByText('Manutenção Predial').click();
  29  |     await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
  30  |     await dialog.getByText('Padrão').first().click();
  31  | 
  32  |     await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
  33  |     await expect(dialog).not.toBeVisible({ timeout: 15000 });
  34  |     await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  35  |   });
  36  | 
  37  |   test('2. Preposto classifica chamado (define prioridade e SLA)', async ({ page }) => {
  38  |     await login(page, 'preposto');
  39  |     await page.goto('/gestao');
  40  | 
  41  |     // Localiza o chamado
  42  |     await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  43  |     await page.getByText(ticketTitle).click();
  44  | 
  45  |     // Abre dialog de classificação
  46  |     const classificarBtn = page.getByRole('button', { name: /classificar/i });
> 47  |     await expect(classificarBtn).toBeVisible({ timeout: 5000 });
      |                                  ^ Error: expect(locator).toBeVisible() failed
  48  |     await classificarBtn.click();
  49  | 
  50  |     const dialog = page.getByRole('dialog');
  51  |     await expect(dialog).toBeVisible();
  52  | 
  53  |     // Seleciona prioridade NORMAL
  54  |     await dialog.getByText('NORMAL').click();
  55  | 
  56  |     // Confirma
  57  |     await dialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();
  58  |     await expect(dialog).not.toBeVisible({ timeout: 10000 });
  59  |   });
  60  | 
  61  |   test('3. Preposto atribui chamado a técnico', async ({ page }) => {
  62  |     await login(page, 'preposto');
  63  |     await page.goto('/gestao');
  64  | 
  65  |     // Aguarda recarregar — chamado deve estar em "validado"
  66  |     await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  67  |     await page.getByText(ticketTitle).click();
  68  | 
  69  |     // Abre dialog de atribuição
  70  |     const atribuirBtn = page.getByRole('button', { name: /atribuir/i });
  71  |     await expect(atribuirBtn).toBeVisible({ timeout: 5000 });
  72  |     await atribuirBtn.click();
  73  | 
  74  |     const dialog = page.getByRole('dialog');
  75  |     await expect(dialog).toBeVisible();
  76  | 
  77  |     // Confirma atribuição (pode ter seleção automática de técnico)
  78  |     await dialog.getByRole('button', { name: /confirmar|atribuir|salvar/i }).click();
  79  |     await expect(dialog).not.toBeVisible({ timeout: 10000 });
  80  |   });
  81  | 
  82  |   test('4. Técnico registra execução', async ({ page }) => {
  83  |     await login(page, 'tecnico');
  84  |     await page.goto('/chamados-atribuidos');
  85  | 
  86  |     // Localiza o chamado atribuído
  87  |     await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  88  |     await page.getByText(ticketTitle).click();
  89  | 
  90  |     // Abre formulário de execução
  91  |     const executarBtn = page.getByRole('button', { name: /registrar|execução|concluir/i });
  92  |     await expect(executarBtn).toBeVisible({ timeout: 5000 });
  93  |     await executarBtn.click();
  94  | 
  95  |     const dialog = page.getByRole('dialog');
  96  |     await expect(dialog).toBeVisible();
  97  | 
  98  |     // Preenche descrição do serviço
  99  |     const descField = dialog.getByPlaceholder(/descreva|serviço|executado/i);
  100 |     if (await descField.isVisible()) {
  101 |       await descField.fill('Lâmpada substituída com sucesso - teste E2E');
  102 |     } else {
  103 |       // Tenta textarea
  104 |       await dialog.locator('textarea').first().fill('Lâmpada substituída com sucesso - teste E2E');
  105 |     }
  106 | 
  107 |     // Confirma execução
  108 |     await dialog.getByRole('button', { name: /confirmar|registrar|salvar|concluir/i }).click();
  109 |     await expect(dialog).not.toBeVisible({ timeout: 10000 });
  110 |   });
  111 | 
  112 |   test('5. Preposto encerra chamado', async ({ page }) => {
  113 |     await login(page, 'preposto');
  114 |     await page.goto('/gestao');
  115 | 
  116 |     // Localiza chamado concluído
  117 |     await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  118 |     await page.getByText(ticketTitle).click();
  119 | 
  120 |     // Abre dialog de encerramento
  121 |     const encerrarBtn = page.getByRole('button', { name: /encerrar/i });
  122 |     await expect(encerrarBtn).toBeVisible({ timeout: 5000 });
  123 |     await encerrarBtn.click();
  124 | 
  125 |     const dialog = page.getByRole('dialog');
  126 |     await expect(dialog).toBeVisible();
  127 | 
  128 |     // Confirma encerramento
  129 |     await dialog.getByRole('button', { name: /confirmar|encerrar|salvar/i }).click();
  130 |     await expect(dialog).not.toBeVisible({ timeout: 10000 });
  131 |   });
  132 | 
  133 |   test('6. Solicitante vê chamado encerrado', async ({ page }) => {
  134 |     await login(page, 'solicitante');
  135 |     await page.goto('/meus-chamados');
  136 | 
  137 |     // Localiza o chamado
  138 |     await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
  139 | 
  140 |     // Verifica que tem indicação de encerrado
  141 |     const ticketCard = page.getByText(ticketTitle).locator('..');
  142 |     await expect(ticketCard.locator('..').getByText(/encerrado/i)).toBeVisible({ timeout: 5000 });
  143 |   });
  144 | });
  145 | 
```