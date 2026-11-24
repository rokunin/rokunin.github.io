# usage: gen.py MODEL OUTPREFIX N "prompt" [ref1 ref2 ...] [--size 2k]
import sys, json, base64, mimetypes, urllib.request, concurrent.futures as cf, os
K=os.environ['NANOGPT_KEY']      # the key is never stored in the repo
a=sys.argv[1:]; size=None
if '--size' in a: i=a.index('--size'); size=a[i+1]; del a[i:i+2]
model,out,n,prompt,*refs=a; n=int(n)
def du(p): return f"data:{mimetypes.guess_type(p)[0] or 'image/png'};base64,"+base64.b64encode(open(p,'rb').read()).decode()
body={'model':model,'prompt':prompt,'n':1,'response_format':'b64_json'}
if refs: body['imageDataUrls']=[du(p) for p in refs]
if size: body['size']=size
def one(i):
    req=urllib.request.Request('https://nano-gpt.com/api/v1/images/generations',json.dumps(body).encode(),{'Content-Type':'application/json','Authorization':'Bearer '+K})
    try:
        r=json.load(urllib.request.urlopen(req,timeout=300)); d=r['data'][0]
        fn=f'{out}_{i}.png'
        if d.get('b64_json'): open(fn,'wb').write(base64.b64decode(d['b64_json']))
        else:
            open(f'{out}_{i}.url','w').write(d.get('url','')); return f'{out}_{i} NO-B64, url saved'
        return fn+' ok '+str(r.get('cost',''))
    except Exception as e:
        return f'{out}_{i} ERR {getattr(e,"read",lambda:b"")()[:200]} {e}'
open(os.path.join(os.path.dirname(os.path.abspath(out)) or '.', 'prompts.log'), 'a').write(json.dumps({'out': os.path.basename(out), 'model': model, 'n': n, 'size': size, 'refs': [os.path.basename(r) for r in refs], 'prompt': prompt}, ensure_ascii=False) + '\n')      # every paid prompt stays on disk next to its pictures
with cf.ThreadPoolExecutor(n) as ex:
    for s in ex.map(one,range(1,n+1)): print(s)
