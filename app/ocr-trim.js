// 文字読み取りの部品から、使わない言語（中国語・デーヴァナーガリー・韓国語）を外してアプリを軽くする。
// 形が変わっていて外せないときは、ここで止める（動かないアプリを作らないため）。
const fs=require("fs"), path=require("path");
const base=path.join(process.argv[2]||path.join(__dirname,"node_modules/@capacitor-mlkit/text-recognition"),"android");
const drop=[["chinese","Chinese","CHINESE"],["devanagari","Devanagari","DEVANAGARI"],["korean","Korean","KOREAN"]];
const g=path.join(base,"build.gradle"); let s=fs.readFileSync(g,"utf8");
const j=path.join(base,"src/main/java/io/capawesome/capacitorjs/plugins/mlkit/textrecognition/TextRecognition.java"); let t=fs.readFileSync(j,"utf8");
for(const [lo,Cap,UP] of drop){
  const a=new RegExp('^\\s*implementation "com\\.google\\.mlkit:text-recognition-'+lo+':[^"]*"\\n','m'); if(!a.test(s)) throw new Error("gradle: "+lo); s=s.replace(a,"");
  const b=new RegExp('^import com\\.google\\.mlkit\\.vision\\.text\\.'+lo+'\\.'+Cap+'TextRecognizerOptions;\\n','m'); if(!b.test(t)) throw new Error("import: "+lo); t=t.replace(b,"");
  const c=new RegExp('^\\s*case "'+UP+'":\\n\\s*return new '+Cap+'TextRecognizerOptions\\.Builder\\(\\)\\.build\\(\\);\\n','m'); if(!c.test(t)) throw new Error("case: "+lo); t=t.replace(c,"");
}
if(/Chinese|Devanagari|Korean/.test(t)) throw new Error("残りがある");
if(!/JapaneseTextRecognizerOptions\.Builder/.test(t)||!/text-recognition-japanese/.test(s)) throw new Error("日本語が消えた");
fs.writeFileSync(g,s); fs.writeFileSync(j,t); console.log("ocr-trim ok");
