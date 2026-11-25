'use strict';
/* ScanFree PDF: preview, in-browser PDF writer, download, share, print */

/* ---------- preview screen ---------- */
function renderPreview(){
  var stack=$('previewStack');
  stack.innerHTML='';
  if(!$('docName').value){$('docName').value=defaultDocName();}
  state.pages.forEach(function(pg,i){
    var fig=document.createElement('figure');
    var img=document.createElement('img');
    img.src=pg.jpeg;
    img.alt='Page '+(i+1);
    img.style.cssText='background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08);border-radius:4px;max-width:100%;display:block;margin:0 auto;';
    var cap=document.createElement('figcaption');
    cap.textContent='Page '+(i+1)+' of '+state.pages.length;
    fig.appendChild(img);fig.appendChild(cap);
    stack.appendChild(fig);
  });
}
function defaultDocName(){
  var d=new Date();
  var m=('0'+(d.getMonth()+1)).slice(-2);
  var day=('0'+d.getDate()).slice(-2);
  return 'ScanFree-Document-'+d.getFullYear()+'-'+m+'-'+day;
}
function safeName(name){
  var s=(name||'').replace(/[^a-zA-Z0-9 _\-.]/g,'').trim();
  if(!s){s=defaultDocName();}
  return s.slice(0,60);
}
$('btnBackEdit').addEventListener('click',function(){show('pages');});

/* ---------- PDF writer (PDF 1.4, JPEG pages, no watermark) ---------- */
function pdfEscape(s){
  var r='',i,c;
  s=String(s||'');
  for(i=0;i<s.length;i++){
    c=s.charCodeAt(i);
    if(c<32||c>126){r+='?';}
    else{r+=s.charAt(i);}
  }
  return r.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function pageBox(im,size){
  var A4=[595.28,841.89],LT=[612,792];
  if(size==='a4'){return im.w>im.h?[A4[1],A4[0]]:A4;}
  if(size==='letter'){return im.w>im.h?[LT[1],LT[0]]:LT;}
  var ar=im.w/im.h;
  var cands=[A4,[A4[1],A4[0]],LT,[LT[1],LT[0]]];
  var best=A4,bd=1e9,i;
  for(i=0;i<cands.length;i++){
    var dd=Math.abs(ar-cands[i][0]/cands[i][1]);
    if(dd<bd){bd=dd;best=cands[i];}
  }
  return best;
}
function buildPdf(imgs,opts){
  var enc=new TextEncoder();
  var chunks=[],total=0,offsets={};
  function add(s){
    var u=(typeof s==='string')?enc.encode(s):s;
    chunks.push(u);total+=u.length;
  }
  function obj(id){offsets[id]=total;}
  var n=imgs.length,i;
  add(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));
  obj(1);
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  var kids=[];
  for(i=0;i<n;i++){kids.push((3+i*3)+' 0 R');}
  obj(2);
  add('2 0 obj\n<< /Type /Pages /Count '+n+' /Kids ['+kids.join(' ')+'] >>\nendobj\n');
  for(i=0;i<n;i++){
    var im=imgs[i];
    var box=pageBox(im,opts.size);
    var pw=box[0],ph=box[1];
    var mg=8;
    var sc=Math.min((pw-2*mg)/im.w,(ph-2*mg)/im.h);
    var dw=im.w*sc,dh=im.h*sc;
    var dx=(pw-dw)/2,dy=(ph-dh)/2;
    var cs='q '+dw.toFixed(2)+' 0 0 '+dh.toFixed(2)+' '+dx.toFixed(2)+' '+dy.toFixed(2)+' cm /Im1 Do Q';
    var pid=3+i*3,cid=4+i*3,iid=5+i*3;
    obj(pid);
    add(pid+' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pw.toFixed(2)+' '+ph.toFixed(2)+'] /Resources << /XObject << /Im1 '+iid+' 0 R >> >> /Contents '+cid+' 0 R >>\nendobj\n');
    obj(cid);
    add(cid+' 0 obj\n<< /Length '+cs.length+' >>\nstream\n'+cs+'\nendstream\nendobj\n');
    obj(iid);
    add(iid+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+im.w+' /Height '+im.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+im.bytes.length+' >>\nstream\n');
    add(im.bytes);
    add('\nendstream\nendobj\n');
  }
  var infoId=3+n*3;
  var dt=new Date();
  function pad(v){return (v<10?'0':'')+v;}
  var ds='D:'+dt.getFullYear()+pad(dt.getMonth()+1)+pad(dt.getDate())+pad(dt.getHours())+pad(dt.getMinutes())+pad(dt.getSeconds());
  obj(infoId);
  add(infoId+' 0 obj\n<< /Producer (ScanFree) /Title ('+pdfEscape(opts.title)+') /CreationDate ('+ds+') >>\nendobj\n');
  var xrefPos=total;
  var count=infoId+1;
  var crlf='\r\n';
  var xr='xref\n0 '+count+'\n0000000000 65535 f'+crlf;
  for(i=1;i<=infoId;i++){
    var o=offsets[i];
    var os=''+o;
    while(os.length<10){os='0'+os;}
    xr+=os+' 00000 n'+crlf;
  }
  add(xr);
  add('trailer\n<< /Size '+count+' /Root 1 0 R /Info '+infoId+' 0 R >>\nstartxref\n'+xrefPos+'\n%%EOF');
  var out=new Uint8Array(total);
  var pos=0;
  for(i=0;i<chunks.length;i++){out.set(chunks[i],pos);pos+=chunks[i].length;}
  return out;
}

/* ---------- create PDF ---------- */
function dataUrlToBytes(dataUrl){
  var b64=dataUrl.split(',')[1]||'';
  var bin=atob(b64);
  var u8=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++){u8[i]=bin.charCodeAt(i);}
  return u8;
}
async function createPdf(){
  if(!state.pages.length){toast('There are no pages to export.');return;}
  busy(true,'Creating PDF...');
  await new Promise(function(r){setTimeout(r,30);});
  try{
    var quality=$('pdfQuality').value;
    var size=$('pageSize').value;
    var title=safeName($('docName').value);
    var imgs=[];
    for(var i=0;i<state.pages.length;i++){
      busy(true,'Processing page '+(i+1)+' of '+state.pages.length+'...');
      await new Promise(function(r){setTimeout(r,10);});
      var pg=state.pages[i];
      var bytes;
      if(quality==='high'){
        var img=await loadImage(pg.jpeg);
        var c=document.createElement('canvas');
        c.width=pg.w;c.height=pg.h;
        c.getContext('2d').drawImage(img,0,0);
        bytes=dataUrlToBytes(c.toDataURL('image/jpeg',0.92));
      }else{
        bytes=dataUrlToBytes(pg.jpeg);
      }
      imgs.push({bytes:bytes,w:pg.w,h:pg.h});
      if(quality!=='high'&&bytes.length>3*1024*1024){
        var img2=await loadImage(pg.jpeg);
        var c2=document.createElement('canvas');
        var sc2=Math.min(1,2000/Math.max(pg.w,pg.h));
        c2.width=Math.round(pg.w*sc2);c2.height=Math.round(pg.h*sc2);
        c2.getContext('2d').drawImage(img2,0,0,c2.width,c2.height);
        imgs[imgs.length-1]={bytes:dataUrlToBytes(c2.toDataURL('image/jpeg',0.7)),w:c2.width,h:c2.height};
      }
    }
    var pdf=buildPdf(imgs,{title:title,size:size});
    if(state.pdfUrl){URL.revokeObjectURL(state.pdfUrl);}
    state.pdfBlob=new Blob([pdf],{type:'application/pdf'});
    state.pdfUrl=URL.createObjectURL(state.pdfBlob);
    state.pdfName=safeName($('docName').value)+'.pdf';
    var kb=Math.round(state.pdfBlob.size/1024);
    $('doneInfo').textContent=state.pages.length+' pages - about '+kb+' KB - created in your browser.';
    $('doneName').value=state.pdfName.replace(/\.pdf$/,'');
    show('done');
    toast('PDF created successfully.');
  }catch(err){
    toast('PDF creation failed. Try Standard quality, fewer pages, or a shorter document name.');
  }
  busy(false);
}
$('btnCreatePdf').addEventListener('click',createPdf);

/* ---------- done screen: download / share / print ---------- */
$('btnDownload').addEventListener('click',function(){
  if(!state.pdfUrl){toast('Create the PDF first.');return;}
  try{
    var a=document.createElement('a');
    a.href=state.pdfUrl;
    a.download=state.pdfName||defaultDocName()+'.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Downloading '+a.download);
  }catch(e){toast('Download failed. Please try again.');}
});
$('btnShare').addEventListener('click',async function(){
  if(!state.pdfUrl){toast('Create the PDF first.');return;}
  var file;
  try{
    file=new File([state.pdfBlob],state.pdfName||defaultDocName()+'.pdf',{type:'application/pdf'});
  }catch(e){
    toast('Sharing is not supported on this browser. Please use Download instead.');
    return;
  }
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file],title:state.pdfName||'ScanFree Document'});
    }catch(err){
      if(err&&err.name==='AbortError'){return;}
      toast('Sharing was not completed. You can download the PDF instead.');
    }
    return;
  }
  toast('Sharing files is not supported on this browser. Please download the PDF and share it from your Files app.');
});
$('btnPrint').addEventListener('click',function(){
  if(!state.pdfUrl){toast('Create the PDF first.');return;}
  var w=window.open(state.pdfUrl,'_blank');
  if(w){
    setTimeout(function(){try{w.print();}catch(e){}},400);
    toast('Use your PDF viewer print button if the print dialog does not open.');
  }else{
    toast('The print window was blocked. Please download the PDF and print it from your PDF viewer.');
  }
});
$('btnNewScan').addEventListener('click',function(){
  confirmBox('Start a new scan?','Your pages and PDF will be removed from this browser session. Make sure you have downloaded your PDF first.','Start new scan',function(ok){
    if(ok){
      if(state.pdfUrl){URL.revokeObjectURL(state.pdfUrl);}
      state.pdfUrl=null;state.pdfBlob=null;
      state.pages=[];
      renderPages();
      show('home');
    }
  });
});
$('doneName').addEventListener('change',function(){
  var n=safeName($('doneName').value);
  state.pdfName=n+'.pdf';
  $('doneName').value=n;
});

/* ---------- session guard ---------- */
window.addEventListener('beforeunload',function(e){
  if(state.pages.length&&!state.pdfUrl){
    e.preventDefault();
    e.returnValue='Your scanned pages will be lost if you leave now.';
  }
});
window.addEventListener('pagehide',function(){stopCam();});
setInterval(function(){
  if(state.pages.length>=12){
    var approxKB=state.pages.reduce(function(s,p){return s+(p.jpeg?Math.round(p.jpeg.length*0.75/1024):0);},0);
    if(approxKB>40*1024){
      toast('Your document is getting large. Consider creating the PDF now, or splitting into two documents.',5000);
    }
  }
},20000);
document.addEventListener('keydown',function(e){
  if(state.screen==='cam'&&e.key==='Enter'&&document.activeElement===document.body){
    capturePhoto();
  }
});