/* テスター版だけに入る画面：最初の同意・テスターID・終了時アンケート */
"use strict";
window.TesterUI=(function(){
  const LS={ get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
             set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };
  const C=window.APP_CFG||{};
  const SURVEY_FROM=C.surveyFrom||"2026-12-06";   // この日からアンケートを目立たせる
  const css=`.tq{position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.72);overflow:auto;padding:16px}
.tq .bx{max-width:560px;margin:0 auto;background:var(--panel,#1a2126);color:var(--fg,#eef2f4);border-radius:14px;padding:18px;font-size:17px;line-height:1.6}
.tq h2{font-size:20px;margin:0 0 10px}.tq p{margin:8px 0}.tq ul{padding-left:20px;margin:6px 0}
.tq label{display:flex;gap:10px;align-items:center;min-height:44px}
.tq .q{margin:16px 0 4px;font-weight:700}
.tq textarea{width:100%;min-height:76px;font-size:17px;border-radius:8px;padding:8px;box-sizing:border-box}
.tq button{min-height:52px;font-size:18px;border-radius:10px;padding:0 16px;width:100%;margin-top:14px;border:0;background:#2e8bff;color:#fff;font-weight:700}
.tq button.sub{background:transparent;color:inherit;border:1px solid #556}
.tq .err{color:#ff8a80}
.tbar{margin:10px 0;padding:12px;border:1px solid #2e8bff;border-radius:10px;font-size:17px}
.tbar button{min-height:48px;font-size:17px;border-radius:10px;padding:0 14px;border:0;background:#2e8bff;color:#fff;font-weight:700;margin-top:8px;width:100%}
.tbar small{opacity:.75}`;
  function el(t,a,...k){ const e=document.createElement(t); Object.assign(e,a||{}); k.forEach(x=>e.append(x)); return e; }
  function overlay(){ const o=el("div",{className:"tq"}); const b=el("div",{className:"bx"}); o.append(b); document.body.append(o); return [o,b]; }
  const shortId=d=>String(d||"").slice(-6).toUpperCase();

  function consent(ctx,done){
    const [o,b]=overlay();
    b.append(el("h2",{textContent:"テスト版のご利用にあたって"}),
      el("p",{textContent:"このアプリはテスト版です。使う前に、次の内容をご確認ください。"}),
      (()=>{ const u=el("ul"); [
        "乗車・降車・待機などの時刻と位置、走った道、入力した金額は、開発者に送られます。アプリの改善と、個人が分からない形の統計に使います。",
        "お名前・車番は集めません。所属の会社名・営業所を入れると、営業区域が表示され、同じ会社の人の設定も簡単になります。会社や地域ごとの統計にも使います（ほかの利用者に会社名と記録を結びつけて見せることはしません）。",
        "メモ欄などに、お客様の情報（名前・電話・行き先の住所）は書かないでください。",
        "勤務先の決まりで、記録をアプリに残すことや外部に送ることが禁止されている場合は、使わないでください。",
        "運転中は操作しないでください。停車中に操作してください。",
        "テスト終了後に記録の削除を希望される場合は、クラウドワークスのメッセージでテスターIDを添えてお知らせください。"
      ].forEach(t=>u.append(el("li",{textContent:t}))); return u; })(),
      el("p",{textContent:"あなたのテスターID："+shortId(ctx.DEV)}));
    const ok=el("button",{textContent:"同意して始める"});
    ok.onclick=()=>{ LS.set("consent",{v:2,at:Date.now()}); try{ ctx.write("consent",ctx.DEV,{v:2,at:Date.now(),app:C.ver||""}); }catch(e){} o.remove(); done&&done(); };
    b.append(ok);
  }

  const Q=[
    {k:"shift",t:"ふだんの勤務の形",o:["日勤","夜勤","隔日勤務","その他"]},
    {k:"area",t:"主に走っている地域（例：大阪市内、神戸市、名古屋市など）",free:1,short:1},
    {k:"days",t:"テスト期間中、このアプリを使った乗務の回数",o:["0回","1〜2回","3〜5回","6回以上"]},
    {k:"sat",t:"全体の満足度",o:["5（とても良い）","4","3","2","1（良くない）"]},
    {k:"best",t:"いちばん役に立った機能（いくつでも）",multi:1,o:["目標と進み具合","今月度の累計と足切りまでの残り","金額をぼかす表示","自分の稼げる時間帯・曜日・乗車地","乗車地図","走った道の再生","付け待ち・乗り場の記録","降車ワンタップ","特になし"]},
    {k:"bad",t:"使いにくかったところ・困ったこと",free:1},
    {k:"want",t:"あったらいいと思う機能",free:1},
    {k:"other",t:"ふだん使っている乗務記録・売上管理のアプリ（いくつでも）",multi:1,o:["タクシーボード","会社の仕組みだけ","紙やメモ","使っていない","その他"]},
    {k:"keep",t:"無料なら、この先も使い続けたいですか",o:["使いたい","たぶん使う","使わない"]},
    {k:"pay",t:"お金を払ってでも欲しい機能があれば、その機能と、月いくらまでなら払うか",free:1},
    {k:"battery",t:"電池の減り・動きの重さ",o:["気にならない","少し気になる","かなり気になる"]},
    {k:"bug",t:"動かなかった・おかしかったところ（いつ、何をしたときか）",free:1},
    {k:"news",t:"正式版が出たときの案内を受け取りたいですか",o:["受け取りたい","いらない"]}
  ];
  function survey(ctx,done){
    const prev=LS.get("survey",null);
    const [o,b]=overlay();
    b.append(el("h2",{textContent:"テスト終了アンケート（約10分）"}),
      el("p",{textContent:"テスターID："+shortId(ctx.DEV)+"（クラウドワークスの納品メッセージにも書いてください）"}));
    const inputs={};
    Q.forEach((q,n)=>{
      b.append(el("div",{className:"q",textContent:(n+1)+". "+q.t}));
      if(q.free){ const ta=el("textarea"); if(q.short) ta.style.minHeight="48px"; ta.value=prev&&prev[q.k]||""; inputs[q.k]=()=>ta.value.trim(); b.append(ta); return; }
      const name="tq_"+q.k, boxes=[];
      q.o.forEach(v=>{ const i=el("input",{type:q.multi?"checkbox":"radio",name,value:v}); const pv=prev&&prev[q.k]; if(pv&&(Array.isArray(pv)?pv.includes(v):pv===v)) i.checked=true; boxes.push(i); b.append(el("label",{},i,v)); });
      inputs[q.k]=()=>q.multi?boxes.filter(i=>i.checked).map(i=>i.value):((boxes.find(i=>i.checked)||{}).value||"");
    });
    const err=el("p",{className:"err"});
    const send=el("button",{textContent:"送る"}), later=el("button",{className:"sub",textContent:"あとで"});
    send.onclick=()=>{
      const a={}; Q.forEach(q=>a[q.k]=inputs[q.k]());
      const miss=Q.filter(q=>!q.free&&(Array.isArray(a[q.k])?!a[q.k].length:!a[q.k])).map(q=>Q.indexOf(q)+1);
      if(miss.length){ err.textContent="選んでいない質問があります："+miss.join("、")+" 番"; return; }
      a.at=Date.now(); a.app=C.ver||""; LS.set("survey",a);
      try{ ctx.write("survey",ctx.DEV,a); }catch(e){}
      o.remove(); done&&done(true);
      alert("ありがとうございました。電波があるときに自動で送られます。");
    };
    later.onclick=()=>{ o.remove(); done&&done(false); };
    b.append(err,send,later);
  }

  function mount(wrap,ctx){
    document.head.append(el("style",{textContent:css}));
    const bar=el("div",{className:"tbar"});
    const draw=()=>{
      bar.textContent="";
      const done=!!LS.get("survey",null), due=new Date().toISOString().slice(0,10)>=SURVEY_FROM;
      bar.append(el("div",{textContent:"テスト版　テスターID："+shortId(ctx.DEV)}));
      if(done) bar.append(el("small",{textContent:"アンケートは送信済みです（直して送り直すこともできます）"}));
      else bar.append(el("small",{textContent:due?"テスト終了アンケートをお願いします（約10分）":"テストの最後にアンケートをお願いします（"+SURVEY_FROM.slice(5).replace("-","/")+" から）"}));
      const btn=el("button",{textContent:done?"アンケートを直す":"アンケートに答える"}); btn.onclick=()=>survey(ctx,draw);
      if(done||due) bar.append(btn);
      if(due&&!done) bar.style.borderColor="#ffb300";
    };
    draw(); wrap.prepend(bar);
    { const cs=LS.get("consent",null); if(!cs||(cs.v||1)<2) consent(ctx); }
  }
  return {mount};
})();
