# Grieg, "In the Hall of the Mountain King" -> synthwave/metal arrangement. Score -> MIDI file + sampled render (GeneralUser GS soundfont).
import random, struct, wave, sys
import numpy as np, mido, tinysoundfont
random.seed(7)
SF='/tmp/sf/gu/GeneralUser-GS.sf2'; SR=44100
A=[(59,1),(61,1),(62,1),(64,1),(66,1),(62,1),(66,2),(65,1),(61,1),(65,2),(64,1),(60,1),(64,2),(59,1),(61,1),(62,1),(64,1),(66,1),(62,1),(66,1),(71,1),(69,1),(66,1),(62,1),(66,1),(69,2),(0,2)]
B=[(66,1),(68,1),(70,1),(71,1),(73,1),(70,1),(73,2),(74,1),(70,1),(74,2),(73,1),(70,1),(73,2),(66,1),(68,1),(70,1),(71,1),(73,1),(70,1),(73,2),(74,1),(70,1),(74,2),(73,2),(0,2)]
ACC={'A':{4,7,10,21,25},'B':{4,7,10,17,20,23}}                 # Grieg's own accents (the > marks)
def lay(th,acc):
    g=[None]*64; st=0
    for i,(m,l) in enumerate(th):
        if m: g[st]=(m,l*2,i in acc)
        st+=l*2
    return g
SEC={'A':dict(th=lay(A,ACC['A']),root=[47,47,49,48,47,47,50,50],ch=[[59,62,66]]*2+[[61,65,68],[60,64,67]]+[[59,62,66]]*2+[[62,66,69]]*2),
     'B':dict(th=lay(B,ACC['B']),root=[54,54,50,54,54,54,50,54],ch=[[66,70,73]]*2+[[62,66,70],[66,70,73]]+[[66,70,73]]*2+[[62,66,70],[66,70,73]])}
# the song: (section, style, bpm at its start)
SONG=[('A','pizz',133),('A','pizz',133),('B','pizz2',133),('B','pizz2',133),
      ('A','wave',133),('A','wave',133),('B','wave2',133),('B','wave2',133),('A','wave3',133),('A','wave3',133),
      ('A','metal',133),('A','metal',133),('B','metal2',133),('B','metal2',133),('A','metal3',133),('A','metal3',133),
      ('B','fin',133),('A','fin',133),('A','fin',133)]
PROG={0:45,1:38,2:81,3:80,4:30,5:30,6:33,7:48,8:47,10:62}; PAN={4:24,5:104,2:70,3:50}; VOL={0:118,1:105,2:84,3:60,4:92,5:92,6:112,7:70,8:110,10:80}
NOTES=[]; STYLE='pizz'; KICKS=[]
ev=[]                                                              # (time, kind, ch, note, vel)
def note(t,ch,m,dur,vel,hum=0.006):
    t+=random.uniform(-hum,hum) if hum else 0; vel=max(1,min(127,int(vel+random.uniform(-6,6))))
    ev.append((max(0,t),1,ch,m,vel)); ev.append((max(0,t)+max(0.03,dur),0,ch,m,0))
    NOTES.append(dict(t=max(0,t),ch=ch,m=m,dur=max(0.03,dur),vel=vel,style=STYLE))
def drum(t,m,vel): note(t,9,m,0.1,vel,0.003)
t=0.3; bars=[]
for si,(sec,style,bpm) in enumerate(SONG):
    STYLE=style; S=SEC[sec]; nbpm=SONG[si+1][2] if si+1<len(SONG) else bpm
    for st in range(64):
        b=st%16; bar=st//16; hb=st//8; s16=60/(bpm+(nbpm-bpm)*st/64)/4; e8=s16*2; n=S['th'][st]; root=S['root'][hb]; ch=S['ch'][hb]
        beat=b%4==0; newh = st%8==0 and (st==0 or S['root'][hb]!=S['root'][hb-1])
        if style.startswith('pizz'):
            if newh:                                                                            # thick slow chords under the melody, held until the harmony moves
                k=hb+1
                while k<8 and S['root'][k]==root: k+=1
                L=(k-hb)*8*s16
                for m in [root-12, ch[2]-24, ch[0]-12, ch[1]-12]+([ch[2]-12] if style=='pizz2' else []): note(t,7,m,L*1.02,72,0)
            if n: note(t,0,n[0]-12,n[1]*s16*0.5,96+(18 if n[2] else 0)); 
            if style=='pizz2' and n: note(t,0,n[0],n[1]*s16*0.5,70+(18 if n[2] else 0))
            if b%4==0: note(t,0,(root if b%8==0 else root+7)-12,s16*2,74)                 # the bass walks root-fifth like the original
            if style=='pizz2' and b%4==2: drum(t,42,38)
            if style=='pizz2' and bar==3 and b>=8 and b%2==0: drum(t,45 if b<12 else 41,60+b*3)      # tom pickup into the next part
        elif style.startswith('wave'):
            if b%2==0: note(t,1,root-12,e8*0.8,100 if beat else 84)                           # pumping synth bass
            if beat: drum(t,36,112)
            if b in (4,12): drum(t,38,104)
            if b%2==0: drum(t,42,70 if b%4==2 else 48)
            if st==0: drum(t,49,96)
            note(t,3,ch[[0,1,2,1][b%4]]+12,s16*0.8,60 if b%2==0 else 44,0.002)                # arpeggio
            if n: note(t,2,n[0]+(12 if style!='wave' else 0),n[1]*s16*0.9,92+(20 if n[2] else 0))
            if style=='wave2' and newh: note(t,7,ch[0],s16*8,70); note(t,7,ch[1],s16*8,64); note(t,7,ch[2],s16*8,64)
            if style=='wave3':                                                                  # guitars creep in: the riff in unison under the lead
                if n:
                    for c in (4,5): note(t,c,n[0]-12,n[1]*s16*0.55,74+(22 if n[2] else 0))
                if bar==3 and b>=12: drum(t,38,90+b*2)
        elif style.startswith('metal') or style=='fin':
            # rhythm guitars: Grieg's line as a single-note riff in octaves; his accents become power chords on the harmony; bass and kick lock to it
            if n:
                if n[2]:
                    for c in (4,5):
                        for iv in (0,7,12): note(t,c,root+iv,n[1]*s16*0.92,112)
                    note(t,6,root-12,n[1]*s16*0.9,118); drum(t,36,124)
                else:
                    for c in (4,5): note(t,c,n[0]-12,s16*1.5,96)
                    note(t,6,n[0]-24 if n[0]-24>=28 else n[0]-12,s16*1.6,104); drum(t,36,112)
            elif b%2==0:                                                                          # the rests: palm-muted pedal on the root
                for c in (4,5): note(t,c,root,s16*0.9,84)
                note(t,6,root-12,s16,96); drum(t,36,104)
            if style in ('metal2','metal3','fin') and b%2==1: drum(t,36,92)                       # double kick fills the sixteenths
            if b in (4,12): drum(t,38,120)
            if b%2==0: drum(t,42 if style=='metal' else 51,78 if beat else 58)
            if st==0 or (style=='fin' and b==0): drum(t,49 if bar%2==0 else 57,112)
            if style!='metal' and n: note(t,2,n[0]+12,n[1]*s16*0.9,96+(18 if n[2] else 0))      # lead on top from the second pass
            if style in ('metal3','fin') and newh:
                for m in ch: note(t,7,m,s16*8,78)
            if style=='fin' and n and n[2]: note(t,8,root-12,s16*3,120); note(t,10,ch[0],s16*2,96); note(t,10,ch[2],s16*2,96)   # timpani and brass hit the accents
            if bar==3 and b>=12: drum(t,[50,47,45,41][b-12],110)
        t+=s16
    bars.append(t)
# ending the way Grieg does it: hammered chords with air between, then the last one
STYLE='fin'; gap=60/133
for k,(d,v) in enumerate([(2,1),(2,1),(1,1),(1,1),(1,1),(6,1)]):
    for c in (4,5):
        for iv in (0,7,12): note(t,c,47+iv,gap*d*(0.5 if k<5 else 1),124)
    note(t,6,35,gap*d*(0.5 if k<5 else 1),124); note(t,8,35,gap*d*0.9,127); drum(t,36,127); drum(t,38,127); drum(t,49 if k%2==0 else 57,124)
    for m in (59,62,66,71): note(t,7,m,gap*d*(0.5 if k<5 else 1),110); note(t,10,m,gap*d*(0.5 if k<5 else 1),110)
    t+=gap*d
END=t+2.5
ev.sort(key=lambda e:(e[0],e[1]))

END=t+3.0
