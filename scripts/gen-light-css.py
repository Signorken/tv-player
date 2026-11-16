# Tema chiaro: genera le regole "body.light ..." a partire dai colori del tema scuro in www/css/app.css.
# Il player (sopra al video) resta scuro. Rilancia dopo aver cambiato colori nel CSS: python3 scripts/gen-light-css.py
import re
P = 'www/css/app.css'
css = open(P).read()
B, E = '/* ==== TEMA CHIARO (generato da scripts/gen-light-css.py) ==== */', '/* ==== FINE TEMA CHIARO ==== */'
if B in css: css = css[:css.index(B)].rstrip() + '\n'
src = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
TXT = {'#f8f2f6': '#2a0f2e', '#f1e6ef': '#2a0f2e', '#f3e6f2': '#2a0f2e', '#f1e8f0': '#2a0f2e',
       '#b3a2b8': '#6a4f72', '#cdb8d6': '#5e4466', '#d9cad9': '#4e3556', '#e0d3df': '#4e3556', '#c9b8cc': '#6a4f72', '#d9c7e0': '#4e3556',
       '#9c86a8': '#7d6587', '#8f7a9c': '#8a7294', '#7d6c86': '#8a7294', '#6f7d93': '#6a4f72', '#cdbfca': '#6a4f72',
       '#ff7fd0': '#b3127f', '#ff4fb8': '#b3127f', '#ffc2e8': '#a0106f', '#ff9ad6': '#a0106f', '#ffc83d': '#b07800', '#ff9f43': '#b85c00'}
BG = {'#0d0610': '#fbeef6', 'rgba(29,12,40,.74)': 'rgba(255,255,255,.78)', '#1d0c28': 'rgba(255,255,255,.85)', '#24102f': '#f6e3f0',
      '#22102e': '#ffffff', '#1a0c26': '#fff8fc', '#16091f': '#fff4fa', '#16071f': '#fff4fa', 'rgba(22,7,31,.6)': 'rgba(255,255,255,.7)',
      '#101725': '#f3dcec', '#2a1238': '#f3dcec', '#2a1038': '#ecc9e2', '#2a1540': '#ecc9e2', '#3a1d55': '#ecc9e2', '#3a1650': '#ecc9e2',
      '#3a2150': '#e8cce0', '#4a2f62': '#dcb6d1', '#2a3550': '#ead4e5', 'rgba(10,4,14,.84)': 'rgba(250,236,246,.86)',
      'rgba(13,6,16,.40)': 'rgba(255,246,251,.30)', 'rgba(13,6,16,.80)': 'rgba(255,246,251,.70)', '#371545': '#f8d5ec',
      'rgba(255,255,255,.08)': 'rgba(120,20,90,.08)', 'rgba(255,255,255,.25)': 'rgba(120,20,90,.18)', 'rgba(0,0,0,.65)': 'rgba(255,255,255,.88)'}
BD = {'#3a2150': '#e2c2d9', '#2a1238': '#ecd3e5', '#241031': '#f0dbe9', '#160720': '#ecd3e5', '#2a1540': '#ecd3e5', '#4a2f62': '#d9b3cf', 'rgba(29,12,40,.74)': 'rgba(255,255,255,.78)'}
# parti dell'interfaccia sopra al video: restano scure
SKIP = re.compile(r'\.player|\.pinfo|\.pseek|\.pmsg|\.pdrawer|\.mini|\.pnext|#hud|\.psub|\.pnow|\.ptime|\.pdesc|\.dbar|\.pclose|\.cbtn|\.pbar|\.pfill|\.pclock|\.pspin|\.pstat|\.pch|\.plogo|\.ph\b|\.pt\b|\.pe\b|\.pet\b|\.pbadge|\.pseekbar|\.mbtn|\.vslide|#loading|\.qr|#dropov|\.focused|\.kbadge|\.cfill|\.hk\.(red|green|yellow|blue)|\.primary|::-webkit|:hover')
out = []; focout = []
for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}', src):
    sels = [x.strip() for x in m.group(1).split(',') if x.strip()]
    # stati selezionati: stessi colori del tema scuro, ma ripetuti con "body.light" per non essere coperti dalle regole chiare
    foc = [x for x in sels if '.focused' in x and not SKIP.search(x.replace('.focused', ''))]
    if foc:
        keep = [pm.group(1) + ':' + pm.group(2).strip() for pm in re.finditer(r'(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)', m.group(2)) if pm.group(1) in ('background', 'background-color', 'color', 'border-color', 'border', 'box-shadow')]
        if keep: focout.append(','.join('body.light ' + x for x in foc) + '{' + ';'.join(keep) + '}')
    sels = [x for x in sels if not SKIP.search(x) and not x.startswith('@') and not x.startswith('from') and not x.startswith('to') and not re.match(r'^\d', x)]
    if not sels: continue
    decl = []
    for pm in re.finditer(r'(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)', m.group(2)):
        prop, val = pm.group(1), pm.group(2).strip()
        mp = TXT if prop == 'color' else BG if prop in ('background', 'background-color') else BD if prop.startswith('border') else None
        if not mp: continue
        nv = re.sub(r'#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)', lambda c: mp.get(c.group(0).lower().replace(' ', ''), c.group(0)), val)
        if nv != val: decl.append(prop + ':' + nv)
    if not decl: continue
    def pre(x):
        if x in ('html', 'body'): return 'body.light'
        if x.startswith('body'): return 'body.light' + x[4:] if x[4:5] in ('.', ' ', ':') else None
        if x.startswith('html'): return None
        return 'body.light ' + x
    ps = [y for y in (pre(x) for x in sels) if y]
    if ps: out.append(','.join(ps) + '{' + ';'.join(decl) + '}')
extra = '''html.light{background:#fbeef6}
body.light .hk{background:#ead4e5;color:#5a1050}
body.light .cbadge{color:#9a6400}
body.light .hd-t,body.light .gdt,body.light .hero .hn{color:#2a0f2e}
body.light .gprog.focused,body.light .row.focused,body.light .ccard.focused,body.light .cell.focused .cin{color:#fff}
body.light #rail{box-shadow:none}
body.light .xcard .cthumb{border-color:#d9b3cf}
body.light .cpbox,body.light .cthumb{background:#f3dcec}
body.light .screen.player,body.light #hud,body.light #loading{color:#f8f2f6}
body.light .wpc .wpn{color:#4e3556}
body.light .wpc.focused .wpn{color:#fff}'''
css += '\n' + B + '\n' + '\n'.join(out + focout) + '\n' + extra + '\n' + E + '\n'
open(P, 'w').write(css)
print(len(out), 'regole')
