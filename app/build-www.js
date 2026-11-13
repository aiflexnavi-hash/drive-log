// ウェブ版（../index.html, ../shim.js）から、アプリに入れる www/ を作る。
// テスター用の設定（config.json）と画面（tester.js）を shim.js の前に差し込む。
const fs=require("fs"), path=require("path");
const root=path.resolve(__dirname,".."), www=path.join(__dirname,"www");
fs.rmSync(www,{recursive:true,force:true}); fs.mkdirSync(www);
const pkg=require("./package.json");
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,"config.json"),"utf8"));
cfg.ver=process.env.APP_VERSION||pkg.version;
let html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const tag='<script src="shim.js"></script>';
if(!html.includes(tag)) throw new Error("index.html に shim.js の読み込みがない");
html=html.replace(tag,'<script>window.APP_CFG='+JSON.stringify(cfg)+';</script>\n<script src="tester.js"></script>\n'+tag);
html=html.replace('<link rel="manifest" href="manifest.json">\n','');
fs.writeFileSync(path.join(www,"index.html"),html);
for(const f of ["shim.js","icon.svg"]) fs.copyFileSync(path.join(root,f),path.join(www,f));
fs.copyFileSync(path.join(__dirname,"tester.js"),path.join(www,"tester.js"));
console.log("www ok", cfg.ver, cfg.u?"保存先あり":"保存先なし（スマホ内だけ）");
