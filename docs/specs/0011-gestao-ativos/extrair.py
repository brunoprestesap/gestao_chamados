# -*- coding: utf-8 -*-
"""Extrai do export do SICAM apenas o que pode ser tratado como ATIVO DE MANUTENCAO."""
import csv, re, json
from collections import Counter, defaultdict

SRC='/mnt/user-data/uploads/SICAM.CSV'
N_HEAD, N_TAIL = 4, 34

def carregar(path):
    with open(path, encoding='cp1252', newline='') as f:
        r=csv.reader(f, delimiter=';'); hdr=next(r); n=len(hdr); out=[]; reparadas=0
        for row in r:
            if len(row)>n:
                row=row[:N_HEAD]+[';'.join(row[N_HEAD:len(row)-N_TAIL])]+row[len(row)-N_TAIL:]; reparadas+=1
            elif len(row)<n:
                row=row+['']*(n-len(row)); reparadas+=1
            out.append(dict(zip(hdr,row)))
    return out, reparadas

# ordem importa: a primeira regra que casar vence
REGRAS = [
 # veiculo PRIMEIRO: a descricao de picape/sedan cita "ar condicionado" como item de serie
 ('D','veiculo',             r'(VE.CULO|AUTOM.VEL|CAMINH.O|MOTOCICLETA|EMBARCA..O|LANCHA|VOADEIRA|\bPICAPE\b|PICK.?UP)'),
 ('A','climatizacao',        r'(AR[ -]CONDICIONADO|CONDICIONADOR DE AR|\bSPLIT\b|CASSETE|EVAPORADOR|CONDENSAD|CHILLER|FAN ?COIL|SELF ?CONTAINED|\bVRF\b)'),
 ('A','energia_nobreak',     r'(NO ?-?BREAK|NOBREAK|\bUPS\b|SISTEMA ELETRONICO DE TENS)'),
 ('A','energia_gerador',     r'(GRUPO.{0,12}GERADOR|GERADOR.{0,15}(ENERGIA|DIESEL)|GRUPO DIESEL)'),
 ('A','energia_transformador',r'(TRANSFORMADOR|SUBESTA|\bQGBT\b|QUADRO DE DISTRIBUI|CABINE PRIM)'),
 ('A','hidraulica_bomba',    r'((BOMBA|MOTOBOMBA)\b(?!.*ODONTOL)|PRESSURIZADOR)'),
 ('A','exaustao_ventilacao', r'(EXAUSTOR|CLIMATIZADOR(?! DE AR CONDICIONADO)|COIFA|CORTINA DE AR|VENTILADOR DE (COLUNA|PAREDE|TETO))'),
 ('A','combate_incendio',    r'(EXTINTOR|HIDRANTE|ALARME DE INC|DETECTOR DE FUMA|SPRINKLER)'),
 ('A','controle_acesso',     r'(CATRACA|PORT.O AUTOM|CANCELA|DETECTOR DE METAIS|P.RTICO DETECTOR|PORTA GIRAT)'),
 ('A','ar_comprimido',       r'(COMPRESSOR DE AR(?!.*ODONTOL)|CALDEIRA|VASO DE PRESS)'),
 ('B','copa_refrigeracao',   r'(BEBEDOURO|PURIFICADOR DE .GUA|FRIGOBAR|GELADEIRA|REFRIGERADOR|FREEZER)'),
 ('B','copa_coccao',         r'(MICRO ?-?ONDAS|FOG.O|FORNO EL)'),
 ('C','ti_rede',             r'(\bSWITCH\b|ACCESS ?POINT|ACESS ?POINT|ROTEADOR|FIREWALL|\bSTORAGE\b|\bRACK\b)'),
 ('C','ti_cftv',             r'(C.MERA|\bCFTV\b|\bDVR\b|\bNVR\b|MINI ?DOME|\bBULLET\b)'),
 ('C','ti_telefonia',        r'(\bPABX\b|CENTRAL TELEF)'),
]
RUIDO = r'^(SUPORTE|CABO|FONTE|BATERIA|CONTROLE REMOTO|KIT |ADAPTADOR|CAPA |LICEN.A|SOFTWARE|PE.A)'

def classificar(desc):
    d = desc.upper()
    if re.search(RUIDO, d.strip()):
        return None, None
    for tier, cat, pat in REGRAS:
        if re.search(pat, d):
            return tier, cat
    return None, None

def norm_data(s):
    m = {'JAN':'01','FEV':'02','MAR':'03','ABR':'04','MAI':'05','JUN':'06','JUL':'07',
         'AGO':'08','SET':'09','OUT':'10','NOV':'11','DEZ':'12',
         'FEB':'02','APR':'04','MAY':'05','AUG':'08','SEP':'09','OCT':'10','DEC':'12'}
    s=s.strip()
    mt=re.match(r'^(\d{2})-([A-Z]{3})-(\d{2})$', s.upper())
    if not mt: return ''
    d,mo,y = mt.groups()
    if mo not in m: return ''
    yy = int(y); ano = 1900+yy if yy>40 else 2000+yy
    return f'{ano}-{m[mo]}-{d}'

rows, reparadas = carregar(SRC)
pres = [r for r in rows if r['Tipo Tombo']=='T' and r['Saída'].strip().upper()=='PRESENTE']

selecionados=[]; por_cat=Counter(); por_tier=Counter()
for r in pres:
    tier, cat = classificar(r['Descrição Material'])
    if not tier: continue
    por_cat[cat]+=1; por_tier[tier]+=1
    selecionados.append({
        'codigo': r['Número Tombo'].strip(),
        'origemCodigo': 'patrimonio',
        'tombamento': r['Número Tombo'].strip(),
        'descricao': re.sub(r'\s+',' ', r['Descrição Material']).strip(),
        'tierManutencao': tier,
        'categoriaSugerida': cat,
        'codigoMaterial': r['Código Material'].strip(),
        'numeroSerie': r['Numero de série'].strip(),
        'lotacao': r['Descrição Lotação'].strip(),
        'setor': r['Nome Setor'].strip(),
        'responsavelMatricula': r['Matrícula Responsável Termo'].strip(),
        'responsavelNome': r['Nome Responsável Termo'].strip(),
        'dataTombo': norm_data(r['Data Tombo']),
        'garantiaInicio': norm_data(r['Dt Ini Garantia']),
        'garantiaFim': norm_data(r['Dt Fim Garantia']),
        'valorHistorico': r['Valor Histórico'].strip(),
        'situacaoSicam': r['Situação'].strip(),
        'estadoConservacao': r['Estado de Conservação'].strip(),
        'classificacaoSicam': r['Classificação'].strip(),
        'fornecedor': r['Nome Fornecedor'].strip(),
    })

selecionados.sort(key=lambda x:(x['tierManutencao'], x['categoriaSugerida'], x['codigo']))
campos=list(selecionados[0].keys())
with open('/home/claude/ativos_sicam.csv','w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f, fieldnames=campos, delimiter=';'); w.writeheader(); w.writerows(selecionados)

print(f'linhas no export .............. {len(rows)}')
print(f'linhas reparadas (delimitador)  {reparadas}')
print(f'Tipo T + PRESENTE ............. {len(pres)}')
print(f'ATIVOS DE MANUTENCAO extraidos  {len(selecionados)}')
print()
print(f'{"tier":5} {"categoria":24} {"itens":>6}')
print('-'*38)
for tier,cat,_ in REGRAS:
    if por_cat[cat]: print(f'{tier:5} {cat:24} {por_cat[cat]:6}')
print('-'*38)
for t in sorted(por_tier): print(f'tier {t} ................... {por_tier[t]:6}')

# cobertura por campo
print()
print('--- qualidade dos campos nos extraidos ---')
for c in ['numeroSerie','dataTombo','garantiaFim','setor','situacaoSicam','estadoConservacao']:
    n=sum(1 for x in selecionados if x[c])
    print(f'  {c:20} {n:4}/{len(selecionados)}  ({n/len(selecionados)*100:5.1f}%)')
