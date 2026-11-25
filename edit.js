'use strict';
/* ScanFree page manager: thumbnails, reorder, rotate, edit, delete, retake, start over */

function renderPages(){
  var grid=$('pagesGrid');
  grid.innerHTML='';
  $('pageCount').textContent=state.pages.length+(state.pages.length===1?' page':' pages');
  $('pagesEmpty').hidden=state.pages.length>0;
  state.pages.forEach(function(pg,idx){
    var card=document.createElement('div');
    card.className='pagecard';
    card.setAttribute('role','group');
    card.setAttribute('aria-label','Page '+(idx+1));
    var tw=document.createElement('div');
    tw.className='thumbwrap';
    tw.setAttribute('draggable','true');
    tw.setAttribute('tabindex','0');
    tw.setAttribute('role','button');
    tw.setAttribute('aria-label','Page '+(idx+1)+'. Drag to reorder. Press Enter to edit.');
    var img=document.createElement('img');
    img.src=pg.jpeg;
    img.alt='Page '+(idx+1)+' preview';
    tw.appendChild(img);
    var num=document.createElement('span');
    num.className='pnum';
    num.textContent=idx+1;
    tw.appendChild(num);
    card.appendChild(tw);
    var btns=document.createElement('div');
    btns.className='pbtns';
    function addBtn(label,fn,cls,al){
      var b=document.createElement('button');
      b.className='mini'+(cls?' '+cls:'');
      b.textContent=label;
      b.setAttribute('aria-label',al||label);
      b.addEventListener('click',function(ev){ev.stopPropagation();fn();});
      btns.appendChild(b);
    }
    if(idx>0){addBtn('<',function(){movePage(idx,idx-1);},null,'Move page '+(idx+1)+' left');}
    addBtn('Edit',function(){editPage(idx);},null,'Edit page '+(idx+1));
    addBtn('Rot',function(){rotatePage(idx);},null,'Rotate page '+(idx+1)+' by 90 degrees');
    addBtn('Del',function(){deletePage(idx);},'danger','Delete page '+(idx+1));
    if(idx<state.pages.length-1){addBtn('>',function(){movePage(idx,idx+1);},null,'Move page '+(idx+1)+' right');}
    card.appendChild(btns);
    tw.addEventListener('dragstart',function(e){dragIdx=idx;card.classList.add('dragging');try{e.dataTransfer.setData('text/plain',String(idx));}catch(ex){}});
    tw.addEventListener('dragend',function(){card.classList.remove('dragging');});
    tw.addEventListener('drop',function(e){e.preventDefault();e.stopPropagation();var from=dragIdx;dragIdx=-1;movePage(from,idx);});
    tw.addEventListener('dragover',function(e){e.preventDefault();});
    tw.addEventListener('click',function(){editPage(idx);});
    tw.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();editPage(idx);}});
    grid.appendChild(card);
  });
}
var dragIdx=-1;
function movePage(from,to){
  if(from<0||from>=state.pages.length||to<0||to>=state.pages.length||from===to){return;}
  var p=state.pages.splice(from,1)[0];
  state.pages.splice(to,0,p);
  renderPages();
  toast('Page moved.');
}
function rotatePage(idx){
  var pg=state.pages[idx];
  loadImage(pg.jpeg).then(function(img){
    var c=document.createElement('canvas');
    c.width=pg.h;c.height=pg.w;
    var ctx=c.getContext('2d');
    ctx.translate(c.width/2,c.height/2);
    ctx.rotate(Math.PI/2);
    ctx.drawImage(img,-pg.w/2,-pg.h/2);
    state.pages[idx]={jpeg:c.toDataURL('image/jpeg',0.85),w:c.width,h:c.height};
    renderPages();
  }).catch(function(){toast('Could not rotate this page.');});
}
function editPage(idx){
  var pg=state.pages[idx];
  loadImage(pg.jpeg).then(function(img){
    var c=document.createElement('canvas');
    c.width=pg.w;c.height=pg.h;
    c.getContext('2d').drawImage(img,0,0);
    state.cur={canvas:c,quad:defaultQuad(pg.w,pg.h),rot:0,filter:'original',bright:0,contrast:0,sharp:0,warped:null};
    state.editIdx=idx;
    show('enhance');
  }).catch(function(){toast('Could not open this page for editing.');});
}
function deletePage(idx){
  confirmBox('Delete this page?','This removes page '+(idx+1)+' from your document. It cannot be undone.','Delete',function(ok){
    if(ok){state.pages.splice(idx,1);renderPages();}
  });
}
$('btnStartOver').addEventListener('click',function(){
  if(!state.pages.length){toast('Nothing to clear.');return;}
  confirmBox('Start over?','This will delete all '+state.pages.length+' scanned pages. Your PDFs already downloaded are safe. This cannot be undone.','Delete everything',function(ok){
    if(ok){
      state.pages=[];
      renderPages();
      toast('All pages were removed. Ready for a new scan.');
    }
  });
});
$('btnToPreview').addEventListener('click',function(){
  if(!state.pages.length){toast('Add at least one page first.');return;}
  show('preview');
});