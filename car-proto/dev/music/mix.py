# Hybrid render: synth layers (bass, arp, lead, pad) from our own analog-style synth, drums/guitars/orchestra from samples,
# balanced stem by stem against pink noise in layers (front / middle / back), with sidechain pumping and a gated snare.
import numpy as np, wave, sys, tinysoundfont
from scipy import signal
exec(open('score.py').read())
SF='/tmp/sf/gu/GeneralUser-GS.sf2'; N=int(END*SR); rng=np.random.default_rng(3)
wave_like=lambda st: st.startswith('wave'); metal=lambda st: st.startswith('metal') or st=='fin'
def stem_of(n):
    c,st,m=n['ch'],n['style'],n['m']
    if c==9:
        kit='e'
        part='kick' if m==36 else 'snare' if m==38 else 'toms' if m in (41,45,47,50) else 'cym'
        return part+'_'+kit
    return {0:'pluck',1:'sbass',2:'lead',3:'arp',4:'riff',5:None,6:'sbass',7:'pad',8:None,10:'stab'}[c]      # everything melodic is our own synth
for n in NOTES: n['stem']=stem_of(n)
for n in NOTES:
    if n['stem']=='pad' and n['style'].startswith('pizz'): n['stem']='ipad'
NOTES=[n for n in NOTES if n['stem'] and not (n['style'].startswith('pizz') and n['ch']==9)]      # no hats or toms in the intro
stems={}; SYN=('sbass','arp','lead','pad','pluck','riff','stab','ipad')
# ---------- sampled stems ----------
def render_sf(notes, kit=None):
    syn=tinysoundfont.Synth(samplerate=SR); sf=syn.sfload(SF)
    for c,p in PROG.items(): syn.program_select(c,sf,0,p)
    syn.program_select(9,sf,0,{'e':24,'m':16,'a':0}.get(kit,0),True)
    for c,p in PAN.items(): syn.control_change(c,10,p)
    e=[]
    for n in notes: e.append((n['t'],1,n)); e.append((n['t']+n['dur'],0,n))
    e.sort(key=lambda x:(x[0],x[1])); out=[]; pos=0
    for (tt,k,n) in e:
        d=int(tt*SR)-pos
        if d>0: out.append(np.frombuffer(syn.generate(d),dtype=np.float32).copy()); pos+=d
        (syn.noteon(n['ch'],n['m'],n['vel']) if k else syn.noteoff(n['ch'],n['m']))
    out.append(np.frombuffer(syn.generate(N-pos),dtype=np.float32).copy())
    return np.concatenate(out).reshape(-1,2)[:N].astype(np.float64)
for name in sorted(set(n['stem'] for n in NOTES)):
    ns=[n for n in NOTES if n['stem']==name]
    if name in SYN: continue
    stems[name]=render_sf(ns, name.split('_')[1] if '_' in name else None)
# ---------- our synth ----------
hz=lambda m: 440*2**((m-69)/12)
def saws(f, n, cents, vib=0):
    t=np.arange(n)/SR; out=np.zeros(n)
    for c in cents:
        ff=f*2**(c/1200)*(1+vib*np.sin(2*np.pi*5.5*t)) if vib else f*2**(c/1200)
        ph=(np.cumsum(np.full(n,ff)/SR) if not vib else np.cumsum(ff/SR))+rng.random()
        out+=2*(ph%1)-1
    return out/len(cents)
def env(n, a, d, s, r, hold):
    e=np.zeros(n); A=int(a*SR); H=int(hold*SR); t=np.arange(n)
    e=np.where(t<A, t/max(1,A), s+(1-s)*np.exp(-(t-A)/max(1,d*SR)))
    rel=t>=H; e=np.where(rel, e[min(H,n-1)]*np.exp(-(t-H)/max(1,r*SR)), e); return e
def lp(x, fc, q=0.9):
    b,a=signal.iirfilter(2, min(fc,SR*0.45), btype='low', ftype='butter', fs=SR); return signal.lfilter(b,a,x)
def synth(notes, kind):
    out=np.zeros((N,2))
    for nt in notes:
        f=hz(nt['m']); v=(nt['vel']/127)**1.5; d=nt['dur']
        if kind=='sbass':
            n=int((d+0.15)*SR); x=0.6*saws(f,n,[-6,6])+0.5*np.sign(np.sin(2*np.pi*f/2*np.arange(n)/SR))*0.6
            x=lp(x, 500+900*v)*env(n,0.003,0.12,0.55,0.05,d); pan=0.5
        elif kind=='arp':
            n=int((d+0.25)*SR); x=lp(saws(f,n,[-9,9]), 2200+1500*v)*env(n,0.002,0.07,0.15,0.08,d); pan=0.35 if int(nt['t']*8)%2 else 0.65
        elif kind=='lead':
            n=int((d+0.3)*SR); x=lp(saws(f,n,[-14,0,14],vib=0.004), 3800+1500*v)*env(n,0.008,0.3,0.8,0.09,d); pan=0.5
        elif kind=='ipad':                                   # the intro bed: many detuned saws, dark, slow in and out
            n=int((d+1.6)*SR); x=lp(saws(f,n,[-21,-12,-5,0,5,12,21]), 750+18*max(0,60-nt['m']))*env(n,0.45,0.6,0.9,0.7,d); pan=0.5
        elif kind=='pluck':
            n=int((d+0.5)*SR); x=lp(saws(f,n,[-5,5])*0.7+np.sin(2*np.pi*f*np.arange(n)/SR)*0.6, 900+1400*v)*env(n,0.003,0.11,0.0,0.1,d+0.3); pan=0.5
        elif kind=='riff':                                   # the "guitar" part: a gritty saw stack, driven
            n=int((d+0.12)*SR); x=np.tanh(2.2*lp(saws(f,n,[-11,0,11])+0.5*saws(f/2,n,[0]), 1300+1700*v))*0.7*env(n,0.004,0.2,0.7,0.05,d); pan=0.5
        elif kind=='stab':
            n=int((d+0.4)*SR); x=lp(saws(f,n,[-12,-4,4,12]), 3200)*env(n,0.01,0.25,0.6,0.2,d); pan=0.5
        else:
            n=int((d+1.0)*SR); x=lp(saws(f,n,[-19,-7,0,7,19]), 1500)*env(n,0.25,0.5,0.85,0.45,d); pan=0.5
        a=int(nt['t']*SR); n=min(n,N-a)
        if n<=0: continue
        out[a:a+n,0]+=x[:n]*v*(1-pan)*1.4; out[a:a+n,1]+=x[:n]*v*pan*1.4
    return out
def chorus(x, depth=0.004, rate=0.6):
    n=len(x); t=np.arange(n); y=x.copy()
    for ch,ph in ((0,0),(1,np.pi/2)):
        dl=(0.012+depth*np.sin(2*np.pi*rate*t/SR+ph))*SR; idx=np.clip(t-dl,0,n-1); i0=idx.astype(int); fr=idx-i0
        y[:,ch]=0.7*x[:,ch]+0.7*(x[i0,ch]*(1-fr)+x[np.minimum(i0+1,n-1),ch]*fr)
    return y
def delay(x, tm=0.27, fb=0.33, wet=0.3):
    d=int(tm*SR); y=x.copy(); tap=x.copy()
    for k in range(1,5):
        tap=np.vstack([np.zeros((d,2)),tap[:-d]])[:, ::-1]*fb; y+=tap*wet/fb**0
    return y
def verb(x, secs, wet, gate=None):
    n=int(secs*SR); ir=rng.standard_normal((n,2))*np.exp(-np.arange(n)/(secs*SR/5))[:,None] if gate is None else rng.standard_normal((n,2))*(np.arange(n)<int(gate*SR))[:,None]*np.exp(-np.arange(n)/(secs*SR))[:,None]
    ir/=np.sqrt((ir**2).sum(0)); w=np.stack([signal.fftconvolve(x[:,c],ir[:,c])[:len(x)] for c in (0,1)],1); return x+w*wet
def hp(x, fc):
    b,a=signal.butter(2, fc, btype='high', fs=SR); return signal.lfilter(b,a,x,axis=0)
for k in SYN:
    stems[k]=synth([n for n in NOTES if n['stem']==k], k)
stems['arp']=delay(chorus(stems['arp']),0.27,0.3,0.25); stems['lead']=verb(delay(chorus(stems['lead'],0.003),0.3,0.3,0.22),1.6,0.18); stems['pad']=verb(chorus(stems['pad'],0.006,0.3),2.2,0.3)
stems['snare_e']=verb(stems['snare_e'],0.28,0.4,gate=0.2)                 # the 80s gated snare
stems['pluck']=verb(delay(stems['pluck'],0.29,0.25,0.18),1.8,0.2); stems['stab']=verb(chorus(stems['stab']),1.6,0.25); stems['riff']=chorus(stems['riff'],0.002,0.4); stems['ipad']=verb(chorus(stems['ipad'],0.007,0.25),2.6,0.35)
for k in stems:
    if not k.startswith('kick') and k not in ('sbass','toms_e','pluck','riff','ipad'): stems[k]=hp(stems[k],130)     # the low end belongs to kick and bass
# sidechain: everything melodic in the synthwave part ducks under the kick
kt=np.array([n['t'] for n in NOTES if n['stem']=='kick_e']); duck=np.ones(N)
for t0 in kt:
    a=int(t0*SR); n=min(int(0.26*SR),N-a); ar=np.arange(n); shape=1-np.exp(-ar/(0.085*SR))*np.minimum(1,ar/(0.006*SR)); duck[a:a+n]=np.minimum(duck[a:a+n], shape)      # 6 ms fade into the duck: no click
for k,dep in (('sbass',0.7),('pad',0.7),('arp',0.5),('riff',0.35),('stab',0.4),('lead',0.2)): stems[k]*= (1-dep*(1-duck))[:,None]
# ---------- pink-noise balance in layers ----------
def level(x):                                                  # how far the stem pokes out: its loudest third-octave band while it plays
    m=x.mean(1); f,t,Z=signal.stft(m,fs=SR,nperseg=4096,noverlap=2048); P=np.abs(Z)**2
    act=P.sum(0); keep=act>act.max()*0.02
    if keep.sum()<2: return -120
    best=-200; tot=np.zeros(keep.sum())
    for fc in 1000*2**(np.arange(-15,13)/3):
        lo,hi=fc/2**(1/6),fc*2**(1/6); band=(f>=lo)&(f<hi)
        if band.sum()==0 or hi>16000: continue
        e=P[band][:,keep].sum(0); tot+=e; best=max(best,10*np.log10(np.percentile(e,90)+1e-20))     # pink noise has the same energy in every such band
    return best+0.5*(10*np.log10(np.percentile(tot,90)+1e-20)-best)      # wide, noisy sources (cymbals, distortion) read louder than their single loudest band
LAYER={'front':3.0,'mid+':1.5,'mid':0.0,'back':-4.5,'far':-8.0}
ROLE=dict(ipad='back',pluck='front',riff='mid+',stab='back',kick_e='front',snare_e='front',kick_m='front',snare_m='front',lead='front',pizz='front',
          sbass='mid',bassg='mid',gtr='mid+',orch='mid',toms_m='mid',toms_e='mid',toms_a='mid',
          arp='back',cym_m='back',cym_e='back',cym_a='far',strings='back',pad='far')
print('stem        layer   raw dB   gain dB')
mix=np.zeros((N,2))
for k in sorted(stems):
    L=level(stems[k]); role=ROLE.get(k,'back'); g=LAYER[role]-L; print('%-11s %-6s %7.1f %8.1f'%(k,role,L,g)); stems[k]=stems[k]*10**(g/20); mix+=stems[k]
# tone: more bottom, less mids and top (RBJ shelves and a bell)
def biq(kind, f0, gdb, q=0.7):
    A=10**(gdb/40); w=2*np.pi*f0/SR; al=np.sin(w)/(2*q); c=np.cos(w)
    if kind=='peak': b=[1+al*A,-2*c,1-al*A]; a=[1+al/A,-2*c,1-al/A]
    else:
        s=1 if kind=='low' else -1; sq=2*np.sqrt(A)*al
        b=[A*((A+1)-s*(A-1)*c+sq), s*2*A*((A-1)-s*(A+1)*c), A*((A+1)-s*(A-1)*c-sq)]; a=[(A+1)+s*(A-1)*c+sq, -s*2*((A-1)+s*(A+1)*c), (A+1)+s*(A-1)*c-sq]
    return np.array(b)/a[0], np.array(a)/a[0]
def radio(mix):
    # the radio: the music itself goes THROUGH the set. Noise is added first, then everything shares one narrow, wobbling, overdriven speaker.
    ref=np.sqrt((mix**2).mean()); tt=np.arange(N)/SR
    mid=mix.mean(1,keepdims=True); mix=mid+(mix-mid)*0.25                                  # a radio is nearly mono
    hiss=rng.standard_normal((N,1)); hiss/=np.sqrt((hiss**2).mean())
    hum=(np.sin(2*np.pi*50*tt)+0.4*np.sin(2*np.pi*100*tt))[:,None]
    mix=mix+ref*(hiss*10**(-30/20)+hum*10**(-40/20))
    e=np.sqrt(signal.lfilter(*signal.butter(1,3,fs=SR),(mix**2).mean(1)))+1e-6; g=np.clip((ref/e)**0.45,0.5,2.2); mix*=g[:,None]      # the set's automatic gain: quiet passages swell and the hiss swells with them
    dl=(0.004+0.0016*np.sin(2*np.pi*0.45*tt)+0.00018*np.sin(2*np.pi*6.3*tt))*SR; ix=np.clip(np.arange(N)-dl,0,N-1); i0=ix.astype(int); fr=(ix-i0)[:,None]
    mix=mix[i0]*(1-fr)+mix[np.minimum(i0+1,N-1)]*fr                                       # wow and flutter
    mix=np.tanh(mix/ref*0.55)*ref/0.55                                                    # the little amp overdrives
    mix=signal.lfilter(*signal.butter(2,75,btype='high',fs=SR),mix,axis=0); mix=signal.lfilter(*signal.butter(4,3800,btype='low',fs=SR),mix,axis=0)
    b_,a_=biq('peak',160,3.0,1.2); mix=signal.lfilter(b_,a_,mix,axis=0)                   # the cabinet booms a little
    return mix

REF=np.array([-24.2,-15.4,-13,-12.7,-9.9,-10.9,-8.9,-9.7,-13.5,-17.4,-18.7,-15.7,-18.1,-15,-14.4,-15.3,-15.3,-16,-15.6,-15.3,-16.2,-16.8,-18.7,-17.7,-18.5,-18.2,-21.1,-26.9])   # Enter Sandman, share of energy per third-octave band
FC=1000*2**(np.arange(-15,13)/3)
def curve(x, t0):
    fr,t,S=signal.spectrogram(x[int(t0*SR):].mean(1),SR,window='blackman',nperseg=8192,noverlap=4096); P=S.mean(1)
    o=np.array([P[(fr>=c/2**(1/6))&(fr<c*2**(1/6))].sum() for c in FC]); return 10*np.log10(o/o.sum()+1e-12)
def match(x, amount, lim=7.0):                                # pull our tonal balance toward the reference with one smooth linear-phase EQ
    d=np.clip(REF-curve(x,bars[9]),-lim,lim)*amount; d=np.convolve(np.pad(d,1,mode='edge'),[0.25,0.5,0.25],mode='valid'); d-=d[8:20].mean()
    f=np.concatenate([[0],FC[FC<SR/2*0.95],[SR/2]]); g=np.concatenate([[d[0]],d[:len(f)-2],[d[len(f)-3]]])
    h=signal.firwin2(4097,f,10**(g/20),fs=SR); return np.stack([signal.fftconvolve(x[:,c],h,mode='same') for c in (0,1)],1), d
VAR=sys.argv[1] if len(sys.argv)>1 else 'A'; drive=1.1
if VAR=='A': mix,d=match(mix,1.0); drive=0.7                  # all the way to the reference, lighter limiter
elif VAR=='B': mix,d=match(mix,0.5); drive=0.9                # half way
elif VAR=='C':                                                # by hand: clear the mud, kick weight up from the sub, a little air
    for kind,f0,g,q in (('peak',260,-4.5,1.0),('peak',115,3.0,1.2),('low',55,-3.0,0.7),('high',6500,3.5,0.7)):
        b_,a_=biq(kind,f0,g,q); mix=signal.lfilter(b_,a_,mix,axis=0)
    drive=0.9
elif VAR=='D': mix,d=match(mix,0.5); mix=0.5*mix+0.5*radio(mix.copy()); drive=0.9      # half way, then half through the radio
print('final curve minus reference:', np.round(curve(mix,bars[9])-REF).astype(int))
# master: tame peaks, glue, normalise
pk=np.percentile(np.abs(mix),99.9); mix=np.tanh(mix/pk*drive); mix=mix/np.abs(mix).max()*0.76      # never past full scale
print('secs %.1f'%(N/SR)); 
for i,bt in enumerate(bars):
    a=int((bars[i-1] if i else 0)*SR); seg=mix[a:int(bt*SR)]; print(SONG[i][1],'%.3f'%np.sqrt((seg**2).mean()),end=' | ')
w=wave.open('king_%s.wav'%VAR,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype(np.int16).tobytes()); w.close()
