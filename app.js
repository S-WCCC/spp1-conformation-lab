"use strict";
const by = id => document.getElementById(id);
const canvas = by("mol"), ctx = canvas.getContext("2d");
const titles = {b:"游离 SPP1 构象 B",fab:"构象 B 与 Fab115",local:"靶段 T143–152 的局部对照"};
const tags = {b:[["SPP1","#64c5ab"],["B 靶段","#97f2ad"]],
  fab:[["SPP1","#64c5ab"],["B 靶段","#97f2ad"],["Fab 重链","#8ba7fd"],["Fab 轻链","#f4b469"]],
  local:[["A 靶段","#f581a6"],["B 靶段","#97f2ad"]]};
let run=null, frame=null, mode="fab", image=null, angle=0, timer=null, loadingId=0, runId=0;
let folder="demo",teacher=false;
function stop(){clearInterval(timer);timer=null;by("play").textContent="▶";by("play").setAttribute("aria-label","播放旋转");}
function draw(){
  if(!image||!run)return;
  const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const scale=Math.min(w/run.width,h/run.height), dw=run.width*scale,dh=run.height*scale;
  ctx.fillStyle="#101d27";ctx.fillRect(0,0,w,h);
  ctx.drawImage(image,(angle%run.cols)*run.width,Math.floor(angle/run.cols)*run.height,run.width,run.height,(w-dw)/2,(h-dh)/2,dw,dh);
  by("angle").value=angle;by("degrees").value=Math.round(360*angle/run.angles)+"°";
}
function turn(n){if(run){angle=((n%run.angles)+run.angles)%run.angles;draw();}}
function legend(){
  by("legend").replaceChildren(...tags[mode].map(([label,color])=>{
    const span=document.createElement("span"),i=document.createElement("i");
    i.style.backgroundColor=color;span.append(i,document.createTextNode(label));return span;
  }));
}
function showFrame(){
  if(!frame)return;
  const request=++loadingId;stop();image=null;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  by("loading").textContent="正在载入结构视图…";by("loading").hidden=false;
  by("viewtitle").textContent=titles[mode];legend();
  for(const b of by("modes").querySelectorAll("button"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));
  for(const b of by("frames").children)b.setAttribute("aria-pressed",String(+b.dataset.frame===frame.frame));
  by("distA").textContent=frame.nearA.toFixed(2);by("distB").textContent=frame.nearB.toFixed(2);
  by("interpret").textContent=frame.nearB<3?"当前帧的两条骨架在 T150 附近过于接近，原姿势存在局部空间冲突。":
    "这里测量的是一个位置的几何距离，判断整个界面的相容性还需检查其他位置。";
  if(teacher){by("getB").href=folder+"/"+frame.prefix+"-B.pdb";by("getFab").href=folder+"/"+frame.prefix+"-overlay.pdb";}
  const next=new Image();
  next.onload=()=>{if(request!==loadingId)return;image=next;by("loading").hidden=true;draw();};
  next.onerror=()=>{if(request===loadingId)by("loading").textContent="结构视图加载失败，请刷新页面重试。";};
  next.src=folder+"/"+frame.prefix+"-"+mode+".webp";
}
async function read(url,opts){
  const res=await fetch(url,opts);if(!res.ok){let msg="请求失败（"+res.status+"）";try{msg=(await res.json()).error||msg;}catch{}throw Error(msg);}
  return res.json();
}
async function selectRun(path){
  const id=++runId;
  try{
    const data=await read(path+"/run.json");if(id!==runId)return;
    folder=path;run=data;angle=0;stop();frame=data.frames[0]||null;
    by("device").textContent=data.gpu;by("runInfo").textContent=data.seed+" / "+data.samples;by("job").textContent=data.job;
    by("sampleNote").textContent=data.passed+" / "+data.samples+" 帧通过几何检查";by("angle").max=data.angles-1;
    by("frames").replaceChildren(...data.frames.map(f=>{const b=document.createElement("button");b.textContent="帧 "+String(f.frame).padStart(2,"0");b.dataset.frame=f.frame;b.onclick=()=>{frame=f;showFrame();};return b;}));
    by("downloads").hidden=!teacher||!frame;
    if(frame)showFrame();else{
      ++loadingId;image=null;ctx.clearRect(0,0,canvas.width,canvas.height);by("legend").replaceChildren();
      by("loading").hidden=false;by("loading").textContent="本次没有通过几何检查的构象。";by("distA").textContent=by("distB").textContent="—";by("interpret").textContent="";
    }
  }catch(e){by("loading").hidden=false;by("loading").textContent=e.message;}
}
by("modes").onclick=e=>{const b=e.target.closest("button[data-mode]");if(b){mode=b.dataset.mode;showFrame();}};
by("angle").oninput=e=>{stop();turn(+e.target.value);};
by("reset").onclick=()=>{stop();turn(0);};
by("play").onclick=()=>{if(timer){stop();return;}if(!image)return;
  by("play").textContent="Ⅱ";by("play").setAttribute("aria-label","暂停旋转");
  timer=setInterval(()=>turn(angle+1),130);
};
document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();});
let drag=null;
canvas.onpointerdown=e=>{if(!image)return;stop();drag={x:e.clientX,a:angle};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(drag)turn(drag.a+Math.round((e.clientX-drag.x)/12));};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.onkeydown=e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();stop();turn(angle+(e.key==="ArrowRight"?1:-1));}};
new ResizeObserver(draw).observe(canvas);
const stateText={ready:"可查看",pending:"排队中",running:"计算中",failed:"失败，可重试",unknown:"调度状态待更新"};
async function refresh(){
  try{
    const data=await read("./api/runs");by("runs").replaceChildren(...data.runs.map(r=>{
      const b=document.createElement("button");b.textContent="种子 "+r.seed+" · "+(stateText[r.state]||r.state)+(r.job?" · "+r.job:"");b.disabled=r.state!=="ready";
      b.onclick=()=>{selectRun(r.id==="demo"?"demo":"runs/"+r.id);by("observe").scrollIntoView();};return b;
    }));
  }catch(e){by("submitNote").textContent=e.message;}
}
by("runform").onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector("button");btn.disabled=true;
  try{const data=await read("./api/runs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seed:Number(by("seed").value)})});
    by("submitNote").textContent="种子 "+data.seed+" · "+(stateText[data.state]||data.state)+(data.job?" · 作业 "+data.job:"");
    await refresh();
  }catch(err){by("submitNote").textContent=err.message;}finally{btn.disabled=false;}
};
async function start(){
  if(location.hostname==="127.0.0.1"||location.hostname==="localhost"){
    try{teacher=!!(await read("./api/session")).teacher;}catch{}
  }
  if(teacher){by("siteMode").textContent="教师模式";by("teacher").hidden=false;refresh();setInterval(()=>{if(!document.hidden)refresh();},8000);}
  await selectRun("demo");
}
start();
