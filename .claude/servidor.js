const http=require("http"),fs=require("fs"),path=require("path");
const RAIZ=process.argv[2]||process.cwd(), PUERTO=Number(process.argv[3]||8123);
const TIPOS={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".svg":"image/svg+xml"};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split("?")[0]);
  if(p==="/")p="/index.html";
  const f=path.join(RAIZ,p);
  if(!f.startsWith(RAIZ)){res.writeHead(403).end();return;}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404,{"Content-Type":"text/plain"}).end("404 "+p);return;}
    res.writeHead(200,{"Content-Type":TIPOS[path.extname(f)]||"application/octet-stream","Service-Worker-Allowed":"/"});
    res.end(d);
  });
}).listen(PUERTO,()=>console.log("sirviendo "+RAIZ+" en http://localhost:"+PUERTO));
