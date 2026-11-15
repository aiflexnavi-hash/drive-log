/* 写真の文字をスマホの中で読む（Android アプリで config.ocr が true のときだけ入る）。
   Google の ML Kit（日本語の読み取り部品をアプリに同梱）を使う。写真も文字も外には送らない。使った回数で費用は増えない。
   画面側は window.OCR.read(写真ファイル) を呼ぶ。返すのは {text, lines:[{text,x,y,w,h}]}。 */
"use strict";
(function(){
  const P=window.Capacitor&&window.Capacitor.Plugins; const TR=P&&P.TextRecognition, FS=P&&P.Filesystem;
  if(!TR||!FS) return;
  // 大きすぎる写真は縮める（長い辺 2200 まで）。向きはここで直す。
  async function shrink(file){ let src;
    try{ src=await createImageBitmap(file,{imageOrientation:"from-image"}); }
    catch(e){ src=await new Promise((ok,ng)=>{ const im=new Image(); im.onload=()=>ok(im); im.onerror=ng; im.src=URL.createObjectURL(file); }); }
    const w0=src.width, h0=src.height, k=Math.min(1,2200/Math.max(w0,h0)), c=document.createElement("canvas");
    c.width=Math.round(w0*k); c.height=Math.round(h0*k); c.getContext("2d").drawImage(src,0,0,c.width,c.height);
    return c.toDataURL("image/jpeg",0.9).split(",")[1]; }
  window.OCR={ async read(file){ const name="ocr-"+Date.now()+".jpg"; const data=await shrink(file);
    const w=await FS.writeFile({path:name,data,directory:"CACHE"});
    try{ const r=await TR.processImage({path:w.uri,script:"JAPANESE"}); const lines=[];
      (r.blocks||[]).forEach(b=>(b.lines||[]).forEach(l=>{ const bb=l.boundingBox||{}; lines.push({text:l.text||"",x:bb.left||0,y:bb.top||0,w:(bb.right-bb.left)||0,h:(bb.bottom-bb.top)||0}); }));
      return {text:r.text||"",lines}; }
    finally{ FS.deleteFile({path:name,directory:"CACHE"}).catch(()=>{}); } } };
})();
