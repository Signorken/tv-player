import random,math
W,H=1920,1080
def head(bg1,bg2,extra=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="3840" height="2160"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient><filter id="b80" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter><filter id="b40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter><filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>{extra}</defs><rect width="{W}" height="{H}" fill="url(#bg)"/>'
def blob(x,y,r,c,o=.6,f='b80'): return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}" opacity="{o}" filter="url(#{f})"/>'
def vignette(): return f'<defs><radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#05020a" stop-opacity=".7"/></radialGradient></defs><rect width="{W}" height="{H}" fill="url(#vg)"/>'
def waves(n,seed,c1,c2,y0,amp,op=.5,sw=2):
    r=random.Random(seed);o=''
    for i in range(n):
        y=y0+i*(amp/n)*1.6
        p=f'M-50 {y:.0f}'
        for k in range(0,5):
            p+=f' C {k*520+150} {y-amp*r.uniform(.4,1):.0f}, {k*520+380} {y+amp*r.uniform(.4,1):.0f}, {k*520+520} {y:.0f}'
        t=i/max(1,n-1)
        col=c1 if t<.5 else c2
        o+=f'<path d="{p}" fill="none" stroke="{col}" stroke-width="{sw}" opacity="{op*(0.4+0.6*(1-abs(t-.5)*2))}"/>'
    return o
S={}
# 1 Aurora
s=head('#0b0414','#2a0b3d')+blob(1450,300,380,'#ff4fb8',.55)+blob(900,800,420,'#7a2bd6',.5)+blob(1700,850,300,'#ff8a5a',.25)+waves(22,1,'#ff9bd8','#b78bff',380,200,.55)+vignette()+'</svg>'
S['01-aurora']=s
# 2 Orbita
s=head('#08030f','#1c0a2e')+blob(1300,540,420,'#c21f8f',.5)+''.join(f'<circle cx="1300" cy="540" r="{r}" fill="none" stroke="#ff7fd0" stroke-width="{2 if i%3 else 4}" opacity="{.5-i*.04:.2f}"/>' for i,r in enumerate(range(140,900,80)))+'<circle cx="1300" cy="540" r="60" fill="#ffd0ee"/>'+blob(1300,540,150,'#ff4fb8',.8,'b40')+vignette()+'</svg>'
S['02-orbita']=s
# 3 Dune
s=head('#12041f','#5a1255')
s+=blob(1500,260,260,'#ff7fc8',.55)+'<circle cx="1500" cy="260" r="70" fill="#ffd9ef" opacity=".9"/>'
cols=['#7a1a72','#5a1259','#3d0f46','#27082f','#150519']
for i,c in enumerate(cols):
    y=520+i*120
    s+=f'<path d="M0 {y} C 400 {y-160+i*20}, 800 {y+80}, 1200 {y-60} S 1700 {y-120}, 1920 {y-40} V1080 H0Z" fill="{c}"/>'
s+=vignette()+'</svg>'
S['03-dune']=s
# 4 Nebula
r=random.Random(4)
s=head('#06020c','#1a0830')
for i in range(9): s+=blob(r.randint(200,1800),r.randint(100,950),r.randint(160,380),r.choice(['#ff4fb8','#7a2bd6','#3a1a8a','#c21f8f']),r.uniform(.25,.55))
for i in range(180):
    s+=f'<circle cx="{r.randint(0,W)}" cy="{r.randint(0,H)}" r="{r.choice([1,1,1.5,2])}" fill="#fff" opacity="{r.uniform(.3,.9):.2f}"/>'
s+=vignette()+'</svg>'
S['04-nebula']=s
# 5 Griglia
s=head('#0a0212','#2d0a45')+blob(960,560,500,'#ff4fb8',.35)
s+='<rect y="560" width="1920" height="520" fill="#0a0212" opacity=".55"/>'
for i in range(-20,21):
    s+=f'<line x1="{960+i*50}" y1="560" x2="{960+i*260}" y2="1080" stroke="#ff4fb8" stroke-width="2" opacity=".5"/>'
y=560;d=8
while y<1080:
    s+=f'<line x1="0" y1="{y:.0f}" x2="1920" y2="{y:.0f}" stroke="#ff4fb8" stroke-width="2" opacity="{min(.6,.15+(y-560)/700):.2f}"/>';d*=1.28;y+=d
s+=f'<circle cx="960" cy="520" r="150" fill="#ff7fc8"/><rect y="520" width="1920" height="40" fill="#0a0212" opacity=".0"/>'+vignette()+'</svg>'
S['05-griglia']=s
# 6 Prisma
r=random.Random(6)
s=head('#0c0416','#220a38')
cw,chh=160,140
for yy in range(-1,9):
    for xx in range(-1,14):
        x=xx*cw+(cw/2 if yy%2 else 0);y=yy*chh
        for tri in ((x,y,x+cw,y,x+cw/2,y+chh),(x+cw,y,x+cw*1.5,y+chh,x+cw/2,y+chh)):
            t=(xx/13*.5+yy/8*.5)
            l=r.uniform(0,1)*.5+t*.5
            hue=['#2a0b3d','#4a1560','#7a1a72','#a02486','#c21f8f'][min(4,int(l*5))]
            s+=f'<polygon points="{tri[0]:.0f},{tri[1]:.0f} {tri[2]:.0f},{tri[3]:.0f} {tri[4]:.0f},{tri[5]:.0f}" fill="{hue}" opacity="{r.uniform(.25,.7):.2f}" stroke="#ff7fc8" stroke-opacity=".08"/>'
s+=blob(1400,300,300,'#ff4fb8',.35)+vignette()+'</svg>'
S['06-prisma']=s
# 7 Onde
s=head('#0b0316','#3a0f4a')+blob(300,900,420,'#7a2bd6',.5)+blob(1600,200,350,'#ff4fb8',.45)+waves(40,7,'#ff7fc8','#8a6bff',300,320,.6,1.6)+vignette()+'</svg>'
S['07-onde']=s
# 8 Notte
r=random.Random(8)
s=head('#05020c','#4a0f5a')+blob(960,1080,700,'#ff4fb8',.5)+blob(960,1060,300,'#ffb0dd',.5,'b40')
for i in range(260):
    y=r.randint(0,800);s+=f'<circle cx="{r.randint(0,W)}" cy="{y}" r="{r.choice([1,1,1.4,2])}" fill="#fff" opacity="{r.uniform(.2,.9)*(1-y/900):.2f}"/>'
pts=[(0,1080)];x=0
while x<=1920:
    pts.append((x,880-abs(math.sin(x/260))*140-r.randint(0,60)));x+=60
pts.append((1920,1080))
s+=f'<polygon points="{" ".join(f"{a:.0f},{b:.0f}" for a,b in pts)}" fill="#07020d"/>'+vignette()+'</svg>'
S['08-notte']=s
for k,v in S.items(): open(f'svg/{k}.svg','w').write(v)
print(len(S))
