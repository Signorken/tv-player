# Sfondi per il tema chiaro (toni decisi: magenta e viola su fondo chiaro) + miniature di tutti gli sfondi.
# uso: python3 scripts/gen-wallpapers-light.py   (richiede rsvg-convert e Pillow)
import random, math, subprocess, os
from PIL import Image
W, H = 1920, 1080
OUT = 'www/wallpapers'
def head(bg1, bg2):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><defs>'
            f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient>'
            '<filter id="b80" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter>'
            '<filter id="b40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter></defs>'
            f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')
def blob(x, y, r, c, o=.5, f='b80'): return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}" opacity="{o}" filter="url(#{f})"/>'
def veil(): return '<defs><radialGradient id="vg" cx=".5" cy=".5" r=".8"><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#f6cfe8" stop-opacity=".55"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#vg)"/>'
def waves(n, seed, c1, c2, y0, amp, op=.5, sw=2):
    r = random.Random(seed); o = ''
    for i in range(n):
        y = y0 + i * (amp / n) * 1.6; p = f'M-50 {y:.0f}'
        for k in range(5): p += f' C {k*520+150} {y-amp*r.uniform(.4,1):.0f}, {k*520+380} {y+amp*r.uniform(.4,1):.0f}, {k*520+520} {y:.0f}'
        t = i / max(1, n - 1)
        o += f'<path d="{p}" fill="none" stroke="{c1 if t < .5 else c2}" stroke-width="{sw}" opacity="{op*(0.4+0.6*(1-abs(t-.5)*2)):.2f}"/>'
    return o
S = {}
S['l1-alba'] = head('#fff7fc', '#ffd6ee') + blob(1450, 280, 380, '#ff4fb8', .45) + blob(800, 850, 420, '#a46bff', .35) + blob(1750, 900, 280, '#ff9a6b', .25) + waves(22, 1, '#d6248f', '#7a3bd6', 380, 200, .45) + veil() + '</svg>'
S['l2-petali'] = head('#fffafd', '#fbe1f1') + blob(1350, 540, 430, '#ff4fb8', .35) + ''.join(
    f'<circle cx="1350" cy="540" r="{r}" fill="none" stroke="#c2168a" stroke-width="{3 if i % 3 else 5}" opacity="{.45-i*.035:.2f}"/>' for i, r in enumerate(range(120, 900, 70))) + blob(1350, 540, 140, '#ff4fb8', .6, 'b40') + veil() + '</svg>'
S['l3-onde'] = head('#fdf3fa', '#f2d4f5') + blob(300, 900, 420, '#a46bff', .35) + blob(1600, 200, 360, '#ff4fb8', .4) + waves(40, 7, '#c2168a', '#6b3bd6', 300, 320, .5, 1.8) + veil() + '</svg>'
r = random.Random(6); s = head('#fff8fc', '#f9d9ee'); cw, chh = 160, 140
for yy in range(-1, 9):
    for xx in range(-1, 14):
        x = xx * cw + (cw / 2 if yy % 2 else 0); y = yy * chh
        for tri in ((x, y, x + cw, y, x + cw / 2, y + chh), (x + cw, y, x + cw * 1.5, y + chh, x + cw / 2, y + chh)):
            l = r.uniform(0, 1) * .5 + (xx / 13 * .5 + yy / 8 * .5) * .5
            hue = ['#fde8f4', '#f9cfe7', '#f3a9d6', '#e872bd', '#d6249a'][min(4, int(l * 5))]
            s += f'<polygon points="{tri[0]:.0f},{tri[1]:.0f} {tri[2]:.0f},{tri[3]:.0f} {tri[4]:.0f},{tri[5]:.0f}" fill="{hue}" opacity="{r.uniform(.3,.75):.2f}" stroke="#fff" stroke-opacity=".5"/>'
S['l4-geometrie'] = s + blob(400, 250, 300, '#ffffff', .6) + veil() + '</svg>'
os.makedirs('/tmp/wl', exist_ok=True)
for k, v in S.items():
    open(f'/tmp/wl/{k}.svg', 'w').write(v)
    for q, w, hh in (('1080', 1920, 1080), ('4k', 3840, 2160)):
        subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(hh), '-o', f'/tmp/wl/{k}-{q}.png', f'/tmp/wl/{k}.svg'], check=True)
        Image.open(f'/tmp/wl/{k}-{q}.png').convert('RGB').save(f'{OUT}/{k}-{q}.jpg', quality=86 if q == '1080' else 82, optimize=True, progressive=True)
# miniature (per la scelta dello sfondo): 320×180, pochi KB
os.makedirs(f'{OUT}/thumbs', exist_ok=True)
for f in sorted(os.listdir(OUT)):
    if f.endswith('-1080.jpg'):
        Image.open(f'{OUT}/{f}').resize((320, 180), Image.LANCZOS).save(f'{OUT}/thumbs/{f.replace("-1080", "")}', quality=80, optimize=True)
print('ok')
