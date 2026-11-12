/* 乗務記録：ウェブ版の土台。
   画面のコードは Claude 内アプリと同じものを使い、保存先だけをここで差し替える。
   保存はまずスマホの中（すぐ反映・電波なしでも動く）→ つながったら Google シートへ送る。
   AI は使わない（無料版は変動費ゼロ）。 */
"use strict";
(function(){
  const LS={ get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
             set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };

  /* 設定：リンクの #u=<デプロイID>&k=<合言葉> */
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get("u")&&h.get("k")){ LS.set("cfg",{u:h.get("u"),k:h.get("k")}); history.replaceState(null,"",location.pathname); }
  const CFG=LS.get("cfg",null);
  const API=CFG?"https://script.google.com/macros/s/"+CFG.u+"/exec":null;
  async function call(body){
    if(!API) throw {code:"no_cfg"};
    const r=await fetch(API,{method:"POST",body:JSON.stringify({token:CFG.k,...body})});
    const j=await r.json(); if(!j.ok) throw {code:j.error||"error"}; return j;
  }

  /* ---------- 保存（スマホ内 + 送信待ち） ---------- */
  const store=LS.get("docs2",{});      // "col/id" -> {c,i,u,d}
  let queue=LS.get("queue2",[]);       // 送信待ち "col/id"
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

  let syncing=false, lastOk=0, failed=false;
  async function sync(){
    if(syncing||!API) return; syncing=true;
    try{
      while(queue.length){
        const keys=queue.slice(0,40);
        await call({op:"put",writes:keys.map(k=>{ const s=store[k]; return s?{c:s.c,i:s.i,u:s.u,d:s.d}:null; }).filter(Boolean)});
        queue=queue.filter(k=>!keys.includes(k)); save();
      }
      failed=false; lastOk=Date.now();
    }catch(e){ failed=true; }
    syncing=false; pill();
  }
  async function pull(){
    if(!API) return;
    try{
      const j=await call({op:"pull"});
      const seen=new Set();
      let diff=false;
      j.docs.forEach(s=>{ const k=s.c+"/"+s.i; seen.add(k); if(queue.includes(k)) return; const cur=store[k]; if(!cur||cur.u<s.u){ store[k]={c:s.c,i:s.i,u:s.u,d:s.x?null:s.d}; diff=true; } });
      save(); changed(); failed=false; lastOk=Date.now();
      if(diff) refreshAfter();
    }catch(e){ failed=true; }
    pill();
  }
  // 入庫後（日報）の画面を開いていれば、新しい記録で描き直す
  function refreshAfter(){ try{ if(document.body.classList.contains("after") && typeof nipLoad==="function") nipLoad(); }catch(e){} }
  function pill(){
    const el=document.getElementById("sync"); if(!el) return;
    if(!API){ el.textContent="保存：未設定"; el.className="gps bad"; return; }
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

  window.claude={ use:async name=>{
    if(name==="db") return API?db:null;
    if(name==="downloads") return downloads;
    if(name==="tts") return makeTts();
    return null;   // sample（AI）は使わない
  }};

  /* ---------- 画面に足すもの：保存の状態・取り込み ---------- */
  function importFile(file){
    const rd=new FileReader();
    rd.onload=()=>{
      let j; try{ j=JSON.parse(rd.result); }catch(e){ alert("ファイルを読めませんでした"); return; }
      const docs=Array.isArray(j.docs)?j.docs:[];
      let n=0;
      // 0時過ぎに位置が取れる版で押した分（同じ時間帯の乗務）を、取り込む乗務にまとめる
      const imported=docs.filter(x=>x.c==="shifts"&&x.d&&x.d.start);
      const webShifts=Object.values(store).filter(s=>s.c==="shifts"&&s.d&&s.d.start&&!docs.some(x=>x.c==="shifts"&&x.i===s.i));
      const moved=new Set();
      webShifts.forEach(ws=>{ const host=imported.find(t=>ws.d.start>=t.d.start&&ws.d.start<=(t.d.end||Infinity)); if(!host) return;
        Object.values(store).filter(s=>s.c==="events"&&s.d&&s.d.shift===ws.i).forEach(s=>{ if(s.d.type==="shift_start"||s.d.type==="shift_end"){ write("events",s.i,null); return; } write("events",s.i,{...s.d,shift:host.i}); });
        write("shifts",ws.i,null); moved.add(host.i); });
      docs.forEach(x=>{ if(!x||!x.c||!x.i) return; if(x.d&&x.d.src==="claude"&&String(x.i).startsWith("webversion-")&&moved.has(x.d.shift)) return;
        const k=x.c+"/"+x.i; if(store[k]&&store[k].d) return; write(x.c,x.i,x.d); n++; });
      alert(n+"件 取り込みました"); refreshAfter();
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
      box.append(sm,p,f); wrap.append(box);
      if(!API){ const w=document.createElement("p"); w.className="err"; w.style.fontSize="18px"; w.textContent="送られてきたリンクから開き直してください（保存先の情報がリンクに入っています）。"; wrap.prepend(w); }
    }
    if("serviceWorker" in navigator){ /* なし：常に最新を読む */ }
  });
  pull().then(sync);
  setInterval(()=>{ pull().then(sync); },60000);
  window.addEventListener("online",()=>{ pull().then(sync); });
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") pull().then(sync); });
})();
