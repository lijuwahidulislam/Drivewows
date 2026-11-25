'use strict';
/* ScanFree upload, corner adjustment, enhancement */

/* ---------- upload ---------- */
$('btnUpload').addEventListener('click',openPicker);
$('btnCamUpload').addEventListener('click',openPicker);
$('btnCamUpload2').addEventListener('click',openPicker);
$('btnAddUpload').addEventListener('click',openPicker);
$('btnAddScan').addEventListener('click',function(){show('cam');});
function openPicker(){$('fileInput').click();}
$('fileInput').addEventListener('change',function(){
  var files=Array.prototype.slice.call(this.files||[]);
  this.value='';
  if(!files.length){return;}
  handleFiles(files);
});
function loadFileImage(file){
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file);
    var img=new Image();
    img.onload=function(){URL.revokeObjectURL(url);res(img);};
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('LOAD'));};
    img.src=url;
  });
}
function loadImage(src){
  return new Promise(function(res,rej){
    var img=new Image();
    img.onload=function(){res(img);};
    img.onerror=function(){rej(new Error('img'));};
    img.src=src;
  });
}
async function handleFiles(files){
  busy(true,'Reading images...');
  var added=0,failed=0;
  for(var i=0;i<files.length;i++){
    var f=files[i];
    if(!/^image\/(jpe?g|png|webp)$/i.test(f.type)){
      if(files.length===1){busy(false);toast('That file type is not supported. Please use a JPG, PNG, or WEBP photo.');return;}
      failed++;continue;
    }
    if(f.size>25*1024*1024){
      if(files.length===1){busy(false);toast('That image is too large (over 25 MB). Please choose a smaller photo.');return;}
      failed++;continue;
    }
    try{
      var img=await loadFileImage(f);
      var c=document.createElement('canvas');
      var sc=Math.min(1,2200/Math.max(img.width,img.height));
      c.width=Math.max(1,Math.round(img.width*sc));
      c.height=Math.max(1,Math.round(img.height*sc));
      var cx2=c.getContext('2d');
      cx2.fillStyle='#fff';
      cx2.fillRect(0,0,c.width,c.height);
      cx2.drawImage(img,0,0,c.width,c.height);
      added++;
      if(files.length===1){
        busy(false);
        photoToAdjust(c);
        return;
      }
      await addAutoPage(c);
    }catch(err){failed++;}
  }
  busy(false);
  if(added===0){
    toast('The image could not be opened. Please try a different photo.');
    show('pages');
    return;
  }
  toast(added+' image'+(added>1?'s':'')+' added');
  show('pages');
}
async function addAutoPage(canvas){
  try{
    var q=detectQuad(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
    var out=q?warpPage(canvas,q):canvas;
    state.pages.push({jpeg:out.toDataURL('image/jpeg',0.82),w:out.width,h:out.height});
  }catch(e){
    state.pages.push({jpeg:canvas.toDataURL('image/jpeg',0.82),w:canvas.width,h:canvas.height});
  }
}
function photoToAdjust(canvas){
  state.cur={canvas:canvas,quad:null,rot:0,filter:'original',bright:0,contrast:0,sharp:0};
  state.editIdx=-1;
  busy(true,'Finding page edges...');
  setTimeout(function(){
    try{
      var q=detectQuad(state.cur.canvas.getContext('2d').getImageData(0,0,state.cur.canvas.width,state.cur.canvas.height));
      state.cur.quad=q||defaultQuad(state.cur.canvas.width,state.cur.canvas.height);
      state.cur.autoFound=!!q;
      busy(false);
      show('adjust');
      initAdjust();
    }catch(e){busy(false);toast('This image could not be processed. Please try again.');}
  },40);
}

/* ---------- adjust screen: draggable corners ---------- */
var adjScale=1;
function initAdjust(){
  var cv=$('cvAdjust'),canvas=state.cur.canvas;
  var box=$('adjustBox');
  var maxW=Math.min((box.clientWidth-20)||600,820);
  adjScale=Math.min(1,maxW/canvas.width);
  cv.width=Math.round(canvas.width*adjScale);
  cv.height=Math.round(canvas.height*adjScale);
  cv.getContext('2d').drawImage(canvas,0,0,cv.width,cv.height);
  placeHandles();
  if(!state.cur.autoFound){toast('Automatic detection was not confident - please drag the corners onto your document.');}
}
function placeHandles(){
  qsa('.handle').forEach(function(h){
    var i=parseInt(h.getAttribute('data-i'),10);
    var q=state.cur.quad[i];
    h.style.left=(q[0]*adjScale)+'px';
    h.style.top=(q[1]*adjScale)+'px';
  });
}
(function(){
  var active=null;
  qsa('.handle').forEach(function(h){
    h.addEventListener('pointerdown',function(e){
      active=h;
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    h.addEventListener('pointermove',function(e){
      if(active!==h){return;}
      var cv=$('cvAdjust'),r=cv.getBoundingClientRect();
      var x=(e.clientX-r.left)/adjScale,y=(e.clientY-r.top)/adjScale;
      x=Math.max(0,Math.min(state.cur.canvas.width-1,x));
      y=Math.max(0,Math.min(state.cur.canvas.height-1,y));
      state.cur.quad[parseInt(h.getAttribute('data-i'),10)]=[x,y];
      h.style.left=(x*adjScale)+'px';
      h.style.top=(y*adjScale)+'px';
    });
    h.addEventListener('pointerup',function(){active=null;});
    h.addEventListener('pointercancel',function(){active=null;});
  });
})();
$('btnAuto').addEventListener('click',function(){
  busy(true,'Detecting edges...');
  setTimeout(function(){
    try{
      var q=detectQuad(state.cur.canvas.getContext('2d').getImageData(0,0,state.cur.canvas.width,state.cur.canvas.height));
      busy(false);
      if(q){state.cur.quad=q;placeHandles();toast('Page edges detected.');}
      else{toast('No document was detected. Try better lighting, or drag the corners manually.');}
    }catch(e){busy(false);toast('Detection failed. Please adjust the corners manually.');}
  },40);
});
$('btnResetC').addEventListener('click',function(){
  state.cur.quad=defaultQuad(state.cur.canvas.width,state.cur.canvas.height);
  placeHandles();
  toast('Corners reset.');
});
$('btnRetakeA').addEventListener('click',function(){show('cam');});
$('btnConfirm').addEventListener('click',function(){
  busy(true,'Straightening and cropping...');
  setTimeout(function(){
    try{
      state.cur.warped=warpPage(state.cur.canvas,state.cur.quad);
      busy(false);
      show('enhance');
    }catch(e){busy(false);toast('Cropping failed. Please try adjusting the corners again.');}
  },40);
});

/* ---------- enhance screen: filters, sliders, rotate ---------- */
function getWarped(){return state.cur.warped||state.cur.canvas;}
function renderEnhance(){
  var cv=$('cvEnh'),src=getWarped();
  var rot=state.cur.rot;
  var w=src.width,h=src.height;
  var dims=(rot%180===0)?[w,h]:[h,w];
  cv.width=dims[0];cv.height=dims[1];
  var ctx=cv.getContext('2d');
  ctx.save();
  ctx.translate(cv.width/2,cv.height/2);
  ctx.rotate(rot*Math.PI/180);
  ctx.drawImage(src,-w/2,-h/2);
  ctx.restore();
  applyEnhance(cv);
  syncChips();
}
function applyEnhance(cv){
  var ctx=cv.getContext('2d');
  var id=ctx.getImageData(0,0,cv.width,cv.height);
  applyFilter(id,state.cur.filter);
  applyAdjust(id,state.cur.bright,state.cur.contrast);
  if(state.cur.sharp>0){sharpen(id,state.cur.sharp);}
  ctx.putImageData(id,0,0);
}
function syncChips(){
  qsa('#scrEnhance .chips button').forEach(function(b){
    b.setAttribute('aria-pressed',String(b.getAttribute('data-f')===state.cur.filter));
  });
  $('sBright').value=state.cur.bright;$('vBright').textContent=state.cur.bright;
  $('sContrast').value=state.cur.contrast;$('vContrast').textContent=state.cur.contrast;
  $('sSharp').value=state.cur.sharp;$('vSharp').textContent=state.cur.sharp;
}
qsa('#scrEnhance .chips button').forEach(function(b){
  b.addEventListener('click',function(){
    state.cur.filter=b.getAttribute('data-f');
    renderEnhance();
  });
});
$('sBright').addEventListener('input',function(){state.cur.bright=parseInt(this.value,10);$('vBright').textContent=this.value;renderEnhance();});
$('sContrast').addEventListener('input',function(){state.cur.contrast=parseInt(this.value,10);$('vContrast').textContent=this.value;renderEnhance();});
$('sSharp').addEventListener('input',function(){state.cur.sharp=parseInt(this.value,10);$('vSharp').textContent=this.value;renderEnhance();});
$('btnRot').addEventListener('click',function(){state.cur.rot=(state.cur.rot+90)%360;renderEnhance();});
$('btnResetE').addEventListener('click',function(){
  state.cur.filter='original';state.cur.bright=0;state.cur.contrast=0;state.cur.sharp=0;state.cur.rot=0;
  renderEnhance();
  toast('Edits reset.');
});
$('btnCrop').addEventListener('click',function(){show('adjust');});
$('btnRetakeE').addEventListener('click',function(){show('cam');});
$('btnContinue').addEventListener('click',function(){
  var cv=$('cvEnh');
  var pg={jpeg:cv.toDataURL('image/jpeg',0.85),w:cv.width,h:cv.height};
  if(state.editIdx>=0){
    state.pages[state.editIdx]=pg;
    toast('Page updated.');
  }else{
    state.pages.push(pg);
    toast('Page '+state.pages.length+' added.');
  }
  show('pages');
});

/* ---------- pixel operations ---------- */
function applyAdjust(id,bright,contrast){
  if(!bright&&!contrast){return;}
  var d=id.data;
  var bb=bright*2.2;
  var C=contrast*2.55;
  var f=(259*(C+255))/(255*(259-C));
  var i,c;
  for(i=0;i<d.length;i+=4){
    for(c=0;c<3;c++){
      var v=d[i+c]+bb;
      v=(v-128)*f+128;
      d[i+c]=v<0?0:(v>255?255:v);
    }
  }
}
function otsuBytes(d){
  var hist=new Int32Array(256),i,k;
  for(i=0;i<d.length;i+=4){hist[d[i]]++;}
  var total=d.length/4,sum=0;
  for(k=0;k<256;k++){sum+=k*hist[k];}
  var sumB=0,wB=0,best=-1,th=127;
  for(k=0;k<256;k++){
    wB+=hist[k];if(wB===0){continue;}
    var wF=total-wB;if(wF===0){break;}
    sumB+=k*hist[k];
    var mB=sumB/wB,mF=(sum-sumB)/wF,v=wB*wF*(mB-mF)*(mB-mF);
    if(v>best){best=v;th=k;}
  }
  return th;
}
function sharpen(id,amt){
  var w=id.width,h=id.height,d=id.data;
  if(w<3||h<3){return;}
  var out=new Uint8ClampedArray(d);
  var y,x,c,center=1+amt/25*4;
  for(y=1;y<h-1;y++){
    for(x=1;x<w-1;x++){
      var i=(y*w+x)*4;
      for(c=0;c<3;c++){
        var v=center*d[i+c]-(d[i-4+c]+d[i+4+c]+d[i-w*4+c]+d[i+w*4+c]);
        out[i+c]=v;
      }
      out[i+3]=255;
    }
  }
  d.set(out);
}
function applyFilter(id,filter){
  var d=id.data,i,c,k;
  if(filter==='gray'||filter==='bw'||filter==='document'){
    for(i=0;i<d.length;i+=4){
      var v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      d[i]=v;d[i+1]=v;d[i+2]=v;
    }
  }
  if(filter==='auto'||filter==='document'){
    var hist=new Int32Array(256);
    for(i=0;i<d.length;i+=4){hist[d[i]]++;}
    var tot=d.length/4,lo=0,hi=255,acc=0;
    for(k=0;k<256;k++){acc+=hist[k];if(acc>=tot*0.02){lo=k;break;}}
    acc=0;
    for(k=255;k>=0;k--){acc+=hist[k];if(acc>=tot*0.02){hi=k;break;}}
    var rg=Math.max(8,hi-lo);
    var sc2=255/rg;
    for(i=0;i<d.length;i+=4){
      for(c=0;c<3;c++){
        var v2=(d[i+c]-lo)*sc2;
        d[i+c]=v2<0?0:(v2>255?255:v2);
      }
    }
  }
  if(filter==='bw'){
    var th=otsuBytes(d);
    for(i=0;i<d.length;i+=4){
      d[i]=d[i]>th?255:0;d[i+1]=d[i];d[i+2]=d[i];
    }
  }
  if(filter==='color'){
    for(i=0;i<d.length;i+=4){
      var r2=d[i],g2=d[i+1],bl=d[i+2];
      var l=(0.299*r2+0.587*g2+0.114*bl);
      for(c=0;c<3;c++){
        var v3=l+(d[i+c]-l)*1.3;
        v3=(v3-128)*1.12+128;
        d[i+c]=v3;
      }
    }
  }
  if(filter==='document'){
    for(i=0;i<d.length;i+=4){
      for(c=0;c<3;c++){
        var v4=(d[i+c]-128)*1.3+128;
        d[i+c]=v4;
      }
    }
    sharpen(id,20);
  }
}