'use strict';
/* ScanFree app: theme, PWA, screens, camera with live edge overlay */

/* ---------- theme ---------- */
(function(){
  var saved=null;
  try{saved=localStorage.getItem('sf-theme');}catch(e){}
  var dark=(saved==='dark')||(!saved&&window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  var btn=$('btnTheme');
  function sync(){btn.textContent=(document.documentElement.getAttribute('data-theme')==='dark')?'Light':'Dark';}
  sync();
  btn.addEventListener('click',function(){
    var now=document.documentElement.getAttribute('data-theme')==='dark';
    document.documentElement.setAttribute('data-theme',now?'light':'dark');
    try{localStorage.setItem('sf-theme',now?'light':'dark');}catch(e){}
    sync();
  });
})();

/* ---------- PWA offline ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
}

/* ---------- screens + progress steps ---------- */
var STEP_OF={home:-1,cam:0,adjust:1,enhance:2,pages:3,preview:4,done:4};
function show(name){
  qsa('.screen').forEach(function(s){s.classList.remove('active');});
  var el=$('scr'+name.charAt(0).toUpperCase()+name.slice(1));
  el.classList.add('active');
  state.screen=name;
  var st=$('steps'),step=STEP_OF[name];
  if(step<0){st.hidden=true;}
  else{
    st.hidden=false;
    qsa('#steps .step').forEach(function(s){
      var v=parseInt(s.getAttribute('data-s'),10);
      s.classList.remove('now','done');
      if(v<step){s.classList.add('done');}
      if(v===step){s.classList.add('now');}
    });
  }
  if(name==='cam'){startCam();}
  else{stopCam();}
  if(name==='pages'){renderPages();}
  if(name==='preview'){renderPreview();}
  if(name==='enhance'){renderEnhance();}
  window.scrollTo(0,0);
  var ttl=el.querySelector('h2[tabindex]');
  if(ttl){ttl.focus();}
}

/* ---------- camera ---------- */
var camStream=null;
function stopCam(){
  if(camStream){camStream.getTracks().forEach(function(t){t.stop();});camStream=null;}
  var v=$('camVideo');
  if(v){try{v.srcObject=null;}catch(e){}}
}
async function startCam(){
  var v=$('camVideo');
  stopCam();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    camFail('Your browser does not support camera access. Please use Chrome, Safari, Edge, or Firefox, or upload an image instead.');
    return;
  }
  if(!window.isSecureContext){
    camFail('Camera access needs a secure (HTTPS) connection. Please open ScanFree via its https:// link.');
    return;
  }
  var tries=[
    {video:{facingMode:{exact:state.facing},width:{ideal:1920},height:{ideal:1440}},audio:false},
    {video:{facingMode:state.facing,width:{ideal:1920},height:{ideal:1440}},audio:false},
    {video:true,audio:false}
  ];
  var lastErr=null;
  for(var i=0;i<tries.length;i++){
    try{
      camStream=await navigator.mediaDevices.getUserMedia(tries[i]);
      lastErr=null;
      break;
    }catch(err){lastErr=err;}
  }
  if(!camStream){
    var nm=(lastErr&&lastErr.name)||'';
    if(nm==='NotAllowedError'||nm==='SecurityError'){
      camFail('Camera access was denied. To allow it: tap the lock or camera icon in the address bar, set Camera to Allow, then tap Try again. You can also upload a photo instead.');
    }else if(nm==='NotFoundError'||nm==='OverconstrainedError'){
      camFail('No camera was found on this device. Try uploading an image instead.');
    }else if(nm==='NotReadableError'){
      camFail('The camera is in use by another app. Close other apps or tabs using the camera, then tap Try again.');
    }else{
      camFail('The camera could not be started. Tap Try again, or upload an image instead.');
    }
    return;
  }
  v.srcObject=camStream;
  try{await v.play();}catch(e){}
  var devs=[];
  try{devs=await navigator.mediaDevices.enumerateDevices();}catch(e){}
  var cams=devs.filter(function(d){return d.kind==='videoinput';});
  $('btnSwitch').hidden=cams.length<2;
  var track=camStream.getVideoTracks()[0];
  var caps={};
  try{caps=track.getCapabilities?track.getCapabilities():{};}catch(e){}
  $('btnTorch').hidden=!(caps.torch&&caps.torch.length);
  $('btnTorch').setAttribute('aria-pressed','false');
  $('btnTorch').classList.remove('on');
  state.torchOn=false;
  $('camMsg').hidden=true;
  startOverlayLoop();
}
function camFail(msg){
  $('camMsgTitle').textContent='Camera not available';
  $('camMsgText').textContent=msg;
  $('camMsg').hidden=false;
}
$('btnCamRetry').addEventListener('click',function(){startCam();});
$('btnSwitch').addEventListener('click',function(){
  state.facing=(state.facing==='environment')?'user':'environment';
  startCam();
});
$('btnTorch').addEventListener('click',async function(){
  var track=camStream&&camStream.getVideoTracks()[0];
  if(!track){return;}
  try{
    state.torchOn=!state.torchOn;
    await track.applyConstraints({advanced:[{torch:state.torchOn}]});
    $('btnTorch').setAttribute('aria-pressed',String(state.torchOn));
    $('btnTorch').classList.toggle('on',state.torchOn);
  }catch(e){toast('Torch is not supported on this device.');}
});
$('btnShutter').addEventListener('click',capturePhoto);
$('btnCamBack').addEventListener('click',function(){show(state.pages.length?'pages':'home');});
$('btnScan').addEventListener('click',function(){show('cam');});

/* live edge overlay: green outline when a page is detected */
var overlayRAF=0,overlayBusy=false,lastDetect=0,_off=null;
function startOverlayLoop(){
  if(overlayRAF){cancelAnimationFrame(overlayRAF);}
  var v=$('camVideo'),oc=$('camOverlay');
  function tick(){
    overlayRAF=requestAnimationFrame(tick);
    if(overlayBusy||state.screen!=='cam'){return;}
    var now=performance.now();
    if(now-lastDetect<420){return;}
    if(v.readyState<2||!v.videoWidth){return;}
    lastDetect=now;
    overlayBusy=true;
    setTimeout(function(){
      try{
        var scale=Math.min(1,320/v.videoWidth);
        var w=Math.max(1,Math.round(v.videoWidth*scale));
        var h=Math.max(1,Math.round(v.videoHeight*scale));
        if(!_off){_off=document.createElement('canvas');}
        var cx2=_off.getContext('2d',{willReadFrequently:true});
        _off.width=w;_off.height=h;
        cx2.drawImage(v,0,0,w,h);
        var q=detectQuad(cx2.getImageData(0,0,w,h));
        oc.width=v.videoWidth;oc.height=v.videoHeight;
        var c=oc.getContext('2d');
        c.clearRect(0,0,oc.width,oc.height);
        if(q){
          c.beginPath();
          c.moveTo(q[3][0]/scale,q[3][1]/scale);
          for(var i=0;i<4;i++){c.lineTo(q[i][0]/scale,q[i][1]/scale);}
          c.closePath();
          c.lineWidth=Math.max(3,oc.width/240);
          c.strokeStyle='rgba(34,197,94,0.95)';
          c.stroke();
          $('camHint').textContent='Page detected - hold steady and capture';
        }else{
          $('camHint').textContent='Place the document inside the frame';
        }
      }catch(e){}
      overlayBusy=false;
    },0);
  }
  tick();
}
function capturePhoto(){
  var v=$('camVideo');
  if(!v.videoWidth){toast('Camera is still starting - try again in a second.');return;}
  busy(true,'Capturing...');
  setTimeout(function(){
    try{
      var c=document.createElement('canvas');
      c.width=v.videoWidth;c.height=v.videoHeight;
      c.getContext('2d').drawImage(v,0,0);
      var maxDim=2200,sc=Math.min(1,maxDim/Math.max(c.width,c.height));
      if(sc<1){
        var c2=document.createElement('canvas');
        c2.width=Math.round(c.width*sc);c2.height=Math.round(c.height*sc);
        c2.getContext('2d').drawImage(c,0,0,c2.width,c2.height);
        c=c2;
      }
      photoToAdjust(c);
    }catch(e){busy(false);toast('Capture failed. Please try again.');}
  },30);
}