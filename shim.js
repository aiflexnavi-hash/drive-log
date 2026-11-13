/* 乗務記録：ウェブ版の土台。
   画面のコードは Claude 内アプリと同じものを使い、保存先だけをここで差し替える。
   保存はまずスマホの中（すぐ反映・電波なしでも動く）→ つながったら Google シートへ送る。
   AI は使わない（無料版は変動費ゼロ）。 */
"use strict";
window.NO_CHAT=true;   // 雑談の相談はアプリに入れない
(function(){
  const LS={ get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
             set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };

  /* 設定：リンクの #u=<デプロイID>&k=<合言葉> */
  /* テスター版（Android アプリ）：保存先はアプリに入っている（window.APP_CFG）。記録は端末ごとに分けて送る */
  const TESTER=window.APP_CFG&&window.APP_CFG.tester?window.APP_CFG:null;
  const h=new URLSearchParams(location.hash.slice(1));
  if(!TESTER&&h.get("u")&&h.get("k")){ LS.set("cfg",{u:h.get("u"),k:h.get("k")}); history.replaceState(null,"",location.pathname); }
  const CFG=TESTER?(TESTER.u?{u:TESTER.u}:null):LS.get("cfg",null);
  let DEV=LS.get("dev",null);
  if(TESTER&&!DEV){ DEV=(Date.now().toString(36)+Math.random().toString(36).slice(2,12)).replace(/[^a-z0-9]/g,"").slice(0,24); LS.set("dev",DEV); }
  window.APP_DEV=DEV;
  const API=CFG?"https://script.google.com/macros/s/"+CFG.u+"/exec":null;
  async function call(body){
    if(!API) throw {code:"no_cfg"};
    const auth=TESTER?{tester:TESTER.tester,dev:DEV,ua:navigator.userAgent}:{token:CFG.k};
    const r=await fetch(API,{method:"POST",body:JSON.stringify({...auth,...body})});
    const j=await r.json(); if(!j.ok) throw {code:j.error||"error"}; return j;
  }

  /* ---------- 保存（スマホ内 + 送信待ち） ---------- */
  const store=LS.get("docs2",{});      // "col/id" -> {c,i,u,d}
  let queue=LS.get("queue2",[]);       // 送信待ち "col/id"
  // 走った道は量が多いので、送り終えた45日より前の分はスマホから消す（Google 側には残る）
  { const old=Date.now()/1000-45*86400; let n=0; Object.keys(store).forEach(k=>{ const s=store[k]; if(s.c==="tracks"&&s.d&&s.d.to<old&&!queue.includes(k)){ delete store[k]; n++; } }); if(n) LS.set("docs2",store); }
  const listeners=new Set();
  let changeTimer=null;
  function save(){ LS.set("docs2",store); LS.set("queue2",queue); }
  function changed(){ clearTimeout(changeTimer); changeTimer=setTimeout(()=>{ listeners.forEach(f=>{ try{ f(); }catch(e){} }); },0); }
  function write(c,i,d){
    const k=c+"/"+i, prev=store[k];
    store[k]={c,i,u:Math.max(Date.now(),prev?prev.u+1:0),d:d==null?null:JSON.parse(JSON.stringify(d))};
    if(!queue.includes(k)) queue.push(k);
    save(); changed(); sync();
  }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,10); }

  let syncing=false, lastOk=0, failed=false, oldServer=false;
  async function sync(){
    if(syncing||!API) return; syncing=true;
    let sent=false;
    try{
      while(queue.length){
        const keys=queue.slice(0,40), sentU={};
        await call({op:"put",writes:keys.map(k=>{ const s=store[k]; if(s) sentU[k]=s.u; return s?{c:s.c,i:s.i,u:s.u,d:s.d}:null; }).filter(Boolean)});
        // 送っている間に書き直された分は、送り直すために残す
        queue=queue.filter(k=>!keys.includes(k)||(store[k]&&store[k].u!==sentU[k])); save(); sent=true;
      }
      if(sent){ failed=false; oldServer=false; lastOk=Date.now(); }
    }catch(e){ failed=true; if(e&&e.code==="bad_op") oldServer=true; }
    syncing=false; pill();
  }
  async function pull(){
    if(!API) return;
    try{
      const j=await call({op:"pull"});
      if(!!j.ai!==aiOn){ aiOn=!!j.ai; LS.set("aiOn",aiOn); if(aiOn) setTimeout(()=>location.reload(),300); }
      const seen=new Set();
      let diff=false;
      j.docs.forEach(s=>{ const k=s.c+"/"+s.i; seen.add(k); if(queue.includes(k)) return; const cur=store[k]; if(!cur||cur.u<s.u){ store[k]={c:s.c,i:s.i,u:s.u,d:s.x?null:s.d}; diff=true; } });
      save(); changed(); failed=false; oldServer=false; lastOk=Date.now();
      if(diff){ mergeShifts(); refreshAfter(); }
    }catch(e){ failed=true; if(e&&e.code==="bad_op") oldServer=true; }
    pill();
  }
  // 入庫後（日報）の画面を開いていれば、新しい記録で描き直す
  function refreshAfter(){ try{ if(typeof goalLoad==="function"){ if(typeof G==="object") G.monthFor=null; goalLoad(); } }catch(e){} try{ if(document.body.classList.contains("after") && typeof nipLoad==="function") nipLoad(); }catch(e){} }
  // 同じ時間帯の乗務が2つある（Claude 内アプリと位置が取れる版で別々に出庫した）ときは、早いほうに1つにまとめる
  function mergeShifts(){
    const sh=Object.values(store).filter(s=>s.c==="shifts"&&s.d&&s.d.start).sort((a,b)=>a.d.start-b.d.start);
    let did=false;
    sh.forEach(b=>{ if(!store["shifts/"+b.i]||!store["shifts/"+b.i].d) return;
      const host=sh.find(a=>a!==b&&store["shifts/"+a.i]&&store["shifts/"+a.i].d&&a.d.start<=b.d.start&&b.d.start-a.d.start<20*3600000&&b.d.start<=(a.d.end||Infinity)&&!(a.d.start===b.d.start&&a.i>b.i));
      if(!host) return;
      let fares=[], lastAt=0;
      Object.values(store).filter(s=>s.c==="events"&&s.d&&s.d.shift===b.i).forEach(s=>{ if(s.d.type==="shift_start"||s.d.type==="shift_end"){ write("events",s.i,null); return; } if(s.d.type==="dropoff") fares.push(Number(s.d.at)||0); lastAt=Math.max(lastAt,Number(s.d.at)||0); write("events",s.i,{...s.d,shift:host.i}); });
      // 「位置が取れる版の分のまとめ」行は、その時間までの本物の記録が来たら消す
      Object.values(store).filter(s=>s.c==="events"&&s.d&&s.d.shift===host.i&&String(s.i).startsWith("webversion-")).forEach(s=>{ if(fares.some(t=>t<=s.d.at+600000)) write("events",s.i,null); });
      const hd={...host.d}; if(!hd.car&&b.d.car) hd.car=b.d.car; if(hd.end) hd.end=Math.max(hd.end,b.d.end||0,lastAt);   // まとめる先がまだ乗務中なら、そのまま乗務中
      write("shifts",host.i,hd); write("shifts",b.i,null); did=true; });
    return did;
  }
  function pill(){
    const el=document.getElementById("sync"); if(!el) return;
    if(!API){ el.textContent="保存：未設定"; el.className="gps bad"; return; }
    if(oldServer){ el.textContent="スマホに保存中（Google 側の差し替え待ち）"+(queue.length?" "+queue.length+"件":""); el.className="gps"; el.style.color="var(--wait)"; el.style.borderColor="var(--wait)"; return; }
    if(queue.length){ el.textContent="未送信 "+queue.length+"件"+(failed?"（電波待ち）":""); el.className="gps"; el.style.color="var(--wait)"; el.style.borderColor="var(--wait)"; return; }
    el.style.color=""; el.style.borderColor="";
    if(failed){ el.textContent="保存：つながりません"; el.className="gps bad"; } else { el.textContent="保存：OK"; el.className="gps ok"; }
  }

  /* ---------- Claude 内アプリと同じ書き方で使える db ---------- */
  function snapDoc(c,i){ const s=store[c+"/"+i]; const d=s&&s.d; return { id:i, exists:!!d, data:()=>d?JSON.parse(JSON.stringify(d)):undefined }; }
  function docRef(c,i){
    i=i||uid();
    return { id:i,
      get:async()=>snapDoc(c,i),
      set:async d=>write(c,i,d),
      update:async d=>{ const s=store[c+"/"+i]; if(!s||!s.d) throw {code:"not_found"}; const n={...s.d}; Object.keys(d).forEach(k=>{ if(d[k]&&d[k].__delete__) delete n[k]; else n[k]=d[k]; }); write(c,i,n); },
      delete:async()=>write(c,i,null) };
  }
  function query(c,q){
    q=q||{w:[],o:null,l:null};
    const run=()=>{
      let rows=Object.values(store).filter(s=>s.c===c&&s.d).map(s=>({id:s.i,d:s.d}));
      q.w.forEach(([f,op,v])=>{ rows=rows.filter(r=>{ const x=r.d[f]; return op==="=="?x===v: op==="!="?x!==v: op===">"?x>v: op===">="?x>=v: op==="<"?x<v: op==="<="?x<=v: op==="in"?v.includes(x): true; }); });
      if(q.o){ const [f,dir]=q.o; rows.sort((a,b)=>{ const x=a.d[f], y=b.d[f]; const r= x==null&&y==null?0: x==null?-1: y==null?1: x<y?-1: x>y?1:0; return dir==="desc"?-r:r; }); }
      if(q.l!=null) rows=rows.slice(0,q.l);
      const docs=rows.map(r=>({id:r.id,exists:true,data:()=>JSON.parse(JSON.stringify(r.d))}));
      return {docs,empty:!docs.length,size:docs.length};
    };
    return {
      where:(f,op,v)=>query(c,{...q,w:[...q.w,[f,op,v]]}),
      orderBy:(f,dir)=>query(c,{...q,o:[f,dir||"asc"]}),
      limit:n=>query(c,{...q,l:n}),
      get:async()=>run(),
      onSnapshot:(fn)=>{ let last=null; const l=()=>{ const s=run(); const sig=JSON.stringify(s.docs.map(d=>[d.id,d.data()])); if(sig!==last){ last=sig; fn(s); } }; listeners.add(l); setTimeout(l,0); return ()=>listeners.delete(l); },
      doc:i=>docRef(c,i),
      add:async d=>{ const r=docRef(c); await r.set(d); return r; }
    };
  }
  const db={ collection:c=>query(c), doc:p=>{ const a=p.split("/"); return docRef(a[0],a[1]); } };

  /* ---------- 読み上げ（スマホの音声） ---------- */
  function makeTts(){
    if(!("speechSynthesis" in window)) return null;
    const subs=new Set(); const emit=s=>subs.forEach(f=>{ try{ f(s); }catch(e){} });
    return { onState:f=>{ subs.add(f); return ()=>subs.delete(f); },
      speak:(text)=>new Promise((res,rej)=>{ try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(String(text)); u.lang="ja-JP";
        u.onstart=()=>emit({state:"speaking"}); u.onend=()=>{ emit({state:"idle",reason:"completed"}); res(); }; u.onerror=()=>{ emit({state:"idle",reason:"error"}); rej({code:"unavailable"}); };
        speechSynthesis.speak(u); }catch(e){ rej({code:"unavailable"}); } }),
      stop:()=>{ try{ speechSynthesis.cancel(); }catch(e){} } };
  }
  const downloads={ save:async({filename,data})=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type:"text/csv"})); a.download=filename; document.body.append(a); a.click(); a.remove(); } };

  /* ---------- AI（保存先にキーがあるときだけ） ---------- */
  let aiOn=LS.get("aiOn",false);
  function b64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(",")[1]); r.onerror=rej; r.readAsDataURL(blob); }); }
  async function ask(input,opts){
    opts=opts||{};
    const prompt= typeof input==="string" ? input : (input||[]).map(m=>m.content).join("\n\n");
    const images=[]; for(const im of (opts.images||[])) images.push({t:im.type||"image/jpeg",b:await b64(im)});
    const tier= opts.modelTier==="default"||opts.modelTier==="complex" ? "default" : "quick";
    let j; try{ j=await call({op:"ai",tier,prompt,images}); }catch(e){ throw {code:e.code==="no_key"?"not_granted":(e.code||"error"),message:"AI を使えませんでした"}; }
    try{ if(j.usage) write("ailog",uid(),{at:Date.now(),tier,model:j.model||null,images:images.length,in:j.usage.input_tokens||0,out:j.usage.output_tokens||0}); }catch(e){}   // 費用を測るため
    if(opts.onText) try{ opts.onText({text:j.text,delta:j.text}); }catch(e){}
    return {text:j.text,truncated:!!j.truncated};
  }
  const sample=Object.assign((i,o)=>ask(i,o),{
    json:async(i,o)=>{ const r=await ask(i,o); const t=r.text; const a=t.indexOf("{"), z=t.lastIndexOf("}"); const a2=t.indexOf("["), z2=t.lastIndexOf("]");
      const txt= a>=0&&(a2<0||a<a2) ? t.slice(a,z+1) : (a2>=0?t.slice(a2,z2+1):t); try{ return JSON.parse(txt); }catch(e){ throw {code:"bad_json",text:t}; } },
    limits:async()=>({images:{maxCount:4,mediaTypes:["image/jpeg","image/png","image/webp"]}})
  });

  window.claude={ use:async name=>{
    if(name==="sample") return API&&aiOn?sample:null;
    if(name==="db") return (API||TESTER)?db:null;
    if(name==="downloads") return downloads;
    if(name==="tts") return makeTts();
    return null;
  }};

  /* ---------- 画面に足すもの：保存の状態・取り込み ---------- */
  function importFile(file){
    const rd=new FileReader();
    rd.onload=()=>{
      let j; try{ j=JSON.parse(rd.result); }catch(e){ alert("ファイルを読めませんでした"); return; }
      const docs=Array.isArray(j.docs)?j.docs:[];
      let n=0;
      docs.forEach(x=>{ if(!x||!x.c||!x.i) return;
        const k=x.c+"/"+x.i; if(store[k]&&store[k].d) return; write(x.c,x.i,x.d); n++; });
      mergeShifts(); alert(n+"件 取り込みました"); refreshAfter();
    };
    rd.readAsText(file);
  }
  document.addEventListener("DOMContentLoaded",()=>{
    const head=document.querySelector("header");
    if(head){ const s=document.createElement("span"); s.id="sync"; s.className="gps"; head.append(s); pill(); }
    const wrap=document.querySelector(".wrap");
    if(wrap){
      const box=document.createElement("details"); box.style.cssText="margin-top:8px;font-size:17px";
      const sm=document.createElement("summary"); sm.textContent="記録の取り込み"; sm.style.cssText="min-height:44px;display:flex;align-items:center;cursor:pointer;color:var(--muted)";
      const p=document.createElement("p"); p.className="note"; p.style.fontSize="17px"; p.textContent="Claude 内のアプリから書き出したファイル（.json）を選ぶと、記録と日報をこちらに移します。同じものは二重に入りません。";
      const f=document.createElement("input"); f.type="file"; f.accept=".json,application/json"; f.style.fontSize="17px";
      f.addEventListener("change",()=>{ if(f.files[0]) importFile(f.files[0]); f.value=""; });
      if(!TESTER){ box.append(sm,p,f); wrap.append(box); }
      if(TESTER&&window.TesterUI) window.TesterUI.mount(wrap,{write,store,DEV});
      if(!API&&!TESTER){ const w=document.createElement("p"); w.className="err"; w.style.fontSize="18px"; w.textContent="送られてきたリンクから開き直してください（保存先の情報がリンクに入っています）。"; wrap.prepend(w); }
    }
    if("serviceWorker" in navigator){ /* なし：常に最新を読む */ }
  });
  pull().then(sync);
  setInterval(()=>{ pull().then(sync); },60000);
  window.addEventListener("online",()=>{ pull().then(sync); });
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") pull().then(sync); });
})();
