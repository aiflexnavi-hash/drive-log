/* 裏でも位置を取る（Android アプリで config.bg が true のときだけ入る）。
   乗務中（出庫〜入庫）だけ、通知を出して位置を取り続ける。乗務していない間は普通の位置の取り方に戻す。
   画面側のコードは navigator.geolocation.watchPosition で位置を受け取っているので、そこを差し替える。 */
"use strict";
(function(){
  const P=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.BackgroundGeolocation;
  if(!P||!navigator.geolocation) return;
  const orig=navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const subs=[];               // [ok, ng]
  let nativeId=null, bgId=null, bgStarting=false;
  const toPos=l=>({coords:{latitude:l.latitude,longitude:l.longitude,accuracy:l.accuracy,speed:l.speed==null?null:l.speed,altitude:l.altitude,heading:l.bearing},timestamp:l.time||Date.now()});
  const send=p=>subs.forEach(s=>{ try{ s[0](p); }catch(e){} });
  const fail=e=>subs.forEach(s=>{ try{ s[1]&&s[1](e); }catch(x){} });
  function onShift(){ try{ return !!(typeof S==="object"&&S.shift&&!S.shift.end); }catch(e){ return false; } }
  function startNative(){ if(nativeId!=null) return; nativeId=orig(send,fail,{enableHighAccuracy:true,maximumAge:5000,timeout:20000}); }
  function stopNative(){ if(nativeId==null) return; try{ navigator.geolocation.clearWatch(nativeId); }catch(e){} nativeId=null; }
  async function startBg(){ if(bgId!=null||bgStarting) return; bgStarting=true;
    try{ bgId=await P.addWatcher({backgroundTitle:"乗務記録",backgroundMessage:"乗務中の位置を記録しています（入庫で止まります）",requestPermissions:true,stale:false,distanceFilter:10},
      (l,err)=>{ if(err){ fail({code:err.code==="NOT_AUTHORIZED"?1:2,message:String(err.message||err.code)}); return; } if(l) send(toPos(l)); });
      stopNative(); }
    catch(e){ bgId=null; startNative(); }
    bgStarting=false; }
  async function stopBg(){ if(bgId==null) return; const id=bgId; bgId=null; startNative(); try{ await P.removeWatcher({id}); }catch(e){} }
  function check(){ if(!subs.length) return; if(onShift()) startBg(); else stopBg(); if(!onShift()&&nativeId==null) startNative(); }
  navigator.geolocation.watchPosition=function(ok,ng){ subs.push([ok,ng]); check(); if(bgId==null) startNative(); return 9000+subs.length; };
  setInterval(check,5000);
  document.addEventListener("visibilitychange",check);
})();
