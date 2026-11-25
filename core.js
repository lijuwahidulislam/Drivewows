'use strict';
/* ScanFree core engine: linear algebra, document edge detection, perspective warp.
   All processing is local - no uploads, no tracking. */
function $(id){return document.getElementById(id);}
function qs(s,r){return (r||document).querySelector(s);}
function qsa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}

var state={
  pages:[],      /* each page: {jpeg: dataUrl, w, h} */
  cur:null,      /* working page {canvas, quad, rot, filter, bright, contrast, sharp, warped} */
  editIdx:-1,
  facing:'environment',
  torchOn:false,
  pdfBlob:null, pdfName:'', pdfUrl:null,
  screen:'home'
};

function toast(msg,ms){
  var t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(function(){t.classList.remove('show');},ms||2800);
}
function busy(on,text){
  var b=$('busy');
  $('busyText').textContent=text||'Working...';
  b.hidden=!on;
}
function confirmBox(title,text,okLabel,cb){
  var m=$('modal');
  $('modalTitle').textContent=title;
  $('modalText').textContent=text;
  $('modalOk').textContent=okLabel||'OK';
  m.classList.add('show');
  $('modalOk').focus();
  $('modalOk').onclick=function(){m.classList.remove('show');if(cb){cb(true);}};
  $('modalCancel').onclick=function(){m.classList.remove('show');if(cb){cb(false);}};
}

function gauss(A,b){
  var n=b.length,i,r,c;
  for(i=0;i<n;i++){
    var m=i;
    for(r=i+1;r<n;r++){if(Math.abs(A[r][i])>Math.abs(A[m][i])){m=r;}}
    var tA=A[i];A[i]=A[m];A[m]=tA;
    var tB=b[i];b[i]=b[m];b[m]=tB;
    var piv=A[i][i]||1e-9;
    for(r=i+1;r<n;r++){
      var f=A[r][i]/piv;
      for(c=i;c<n;c++){A[r][c]-=f*A[i][c];}
      b[r]-=f*b[i];
    }
  }
  var x=new Array(n);
  for(i=n-1;i>=0;i--){
    var s=b[i];
    for(c=i+1;c<n;c++){s-=A[i][c]*x[c];}
    x[i]=s/(A[i][i]||1e-9);
  }
  return x;
}
function solveH(src,dst){
  var A=[],b=[],i;
  for(i=0;i<4;i++){
    var x=src[i][0],y=src[i][1],u=dst[i][0],v=dst[i][1];
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  }
  return gauss(A,b);
}
function applyH(H,x,y){
  var d=H[6]*x+H[7]*y+1;
  return [(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d];
}
function otsuArr(g){
  var hist=new Float64Array(256),i,k;
  for(i=0;i<g.length;i++){hist[Math.max(0,Math.min(255,g[i]|0))]++;}
  var total=g.length,sum=0;
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
function linFit(pts){
  var n=pts.length,sx=0,sy=0,sxx=0,sxy=0,i;
  for(i=0;i<n;i++){sx+=pts[i][0];sy+=pts[i][1];sxx+=pts[i][0]*pts[i][0];sxy+=pts[i][0]*pts[i][1];}
  var d=n*sxx-sx*sx;
  if(Math.abs(d)<1e-9){return null;}
  var a=(n*sxy-sx*sy)/d;
  return [a,(sy-a*sx)/n];
}
function detectQuad(id){
  var w=id.width,h=id.height,d=id.data,n=w*h,i,p,y,x;
  if(w<50||h<50){return null;}
  var g=new Float64Array(n);
  for(i=0,p=0;i<n;i++,p+=4){g[i]=0.299*d[p]+0.587*d[p+1]+0.114*d[p+2];}
  var bl=new Float64Array(n);
  for(y=0;y<h;y++){
    for(x=0;x<w;x++){
      var s=0,c2=0,yy,xx;
      for(yy=(y-1<0?0:y-1);yy<=(y+1>h-1?h-1:y+1);yy++){
        for(xx=(x-1<0?0:x-1);xx<=(x+1>w-1?w-1:x+1);xx++){s+=g[yy*w+xx];c2++;}
      }
      bl[y*w+x]=s/c2;
    }
  }
  var gy=new Float64Array(n),gx=new Float64Array(n);
  for(y=1;y<h-1;y++){
    for(x=1;x<w-1;x++){
      i=y*w+x;
      gx[i]=Math.abs(bl[i+1]-bl[i-1]);
      gy[i]=Math.abs(bl[i+w]-bl[i-w]);
    }
  }
  var th=otsuArr(bl);
  function spans(polarity){
    var rs=new Int32Array(h),cs=new Int32Array(w),area=0;
    for(y=0;y<h;y++){
      for(x=0;x<w;x++){
        if((bl[y*w+x]>th)===polarity){rs[y]++;cs[x]++;area++;}
      }
    }
    if(area<n*0.06){return null;}
    function span(arr){
      var max=0,k;
      for(k=0;k<arr.length;k++){if(arr[k]>max){max=arr[k];}}
      if(max<8){return null;}
      var lim=max*0.4,st=-1,bs=-1,be=-1,blen=0,k2;
      for(k2=0;k2<=arr.length;k2++){
        var on=(k2<arr.length&&arr[k2]>lim);
        if(on&&st<0){st=k2;}
        if((!on||k2===arr.length)&&st>=0){
          var len=k2-st;
          if(len>blen){blen=len;bs=st;be=k2-1;}
          st=-1;
        }
      }
      if(blen<arr.length*0.18){return null;}
      return [bs,be];
    }
    var sx2=span(cs),sy2=span(rs);
    if(!sx2||!sy2){return null;}
    return [sx2[0],sy2[0],sx2[1],sy2[1],area/n];
  }
  var cand=[],sB=spans(true),sD=spans(false);
  if(sB){cand.push(sB);}
  if(sD){cand.push(sD);}
  if(!cand.length){return null;}
  cand.sort(function(a,b2){return Math.abs(a[4]-0.4)-Math.abs(b2[4]-0.4);});
  var bb=cand[0];
  if(bb[4]<0.1||bb[4]>0.985){return null;}
  var x0=bb[0],y0=bb[1],x1=bb[2],y1=bb[3],bw=x1-x0+1,bh=y1-y0+1,k;
  function fitSide(side){
    var pts=[],cx,cy,m,bi,bm,lo,hi;
    if(side===0){lo=y0;hi=y0+Math.round(bh*0.45);}
    else if(side===1){lo=y0+Math.round(bh*0.55);hi=y1;}
    else if(side===2){lo=x0;hi=x0+Math.round(bw*0.45);}
    else{lo=x0+Math.round(bw*0.55);hi=x1;}
    if(side<2){
      for(k=0;k<bw;k++){
        cx=x0+k;bm=0;bi=-1;
        for(y=lo;y<=hi;y++){m=gy[y*w+cx];if(m>bm){bm=m;bi=y;}}
        if(bm>4&&bi>=0){pts.push([cx,bi]);}
      }
    }else{
      for(k=0;k<bh;k++){
        cy=y0+k;bm=0;bi=-1;
        for(x=lo;x<=hi;x++){m=gx[cy*w+x];if(m>bm){bm=m;bi=x;}}
        if(bm>4&&bi>=0){pts.push([bi,cy]);}
      }
    }
    if(pts.length<Math.max(bw,bh)*0.3){return null;}
    return linFit(pts);
  }
  var lt=fitSide(0),lb=fitSide(1),ll=fitSide(2),lr=fitSide(3);
  function inter(lh,lv){
    if(!lh||!lv){return null;}
    var a=lh[0],b2=lh[1],c2=lv[0],d2=lv[1];
    var den=1-a*c2;
    if(Math.abs(den)<1e-6){return null;}
    var py=(a*d2+b2)/den;
    return [c2*py+d2,py];
  }
  var cbox=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  var q=[inter(lt,ll)||cbox[0],inter(lt,lr)||cbox[1],inter(lb,lr)||cbox[2],inter(lb,ll)||cbox[3]];
  var pa=((Math.abs(q[1][0]-q[0][0])+Math.abs(q[2][0]-q[3][0]))*0.5)*((Math.abs(q[3][1]-q[0][1])+Math.abs(q[2][1]-q[1][1]))*0.5);
  if(pa<n*0.06){return null;}
  for(i=0;i<4;i++){
    q[i]=[Math.max(0,Math.min(w-1,q[i][0])),Math.max(0,Math.min(h-1,q[i][1]))];
  }
  return q;
}
function warpPixels(sd,od,H){
  var sw=sd.width,sh=sd.height,sp=sd.data,op=od.data,ow=od.width,oh=od.height,x,y,c;
  for(y=0;y<oh;y++){
    for(x=0;x<ow;x++){
      var pt=applyH(H,x,y),sx=pt[0],sy=pt[1],o=(y*ow+x)*4;
      if(sx<-0.5||sy<-0.5||sx>sw-0.5||sy>sh-0.5){
        op[o]=255;op[o+1]=255;op[o+2]=255;op[o+3]=255;
        continue;
      }
      var x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
      var x1=x0+1,y1=y0+1;
      if(x0<0){x0=0;}if(y0<0){y0=0;}
      if(x1>sw-1){x1=sw-1;}if(y1>sh-1){y1=sh-1;}
      var i00=(y0*sw+x0)*4,i10=(y0*sw+x1)*4,i01=(y1*sw+x0)*4,i11=(y1*sw+x1)*4;
      for(c=0;c<3;c++){
        op[o+c]=sp[i00+c]*(1-fx)*(1-fy)+sp[i10+c]*fx*(1-fy)+sp[i01+c]*(1-fx)*fy+sp[i11+c]*fx*fy;
      }
      op[o+3]=255;
    }
  }
}
function dist(a,b){var dx=a[0]-b[0],dy=a[1]-b[1];return Math.sqrt(dx*dx+dy*dy);}
function quadOutSize(q){
  var w=Math.round((dist(q[0],q[1])+dist(q[3],q[2]))/2);
  var h=Math.round((dist(q[0],q[3])+dist(q[1],q[2]))/2);
  return [Math.max(8,w),Math.max(8,h)];
}
function warpPage(srcCanvas,quad){
  var size=quadOutSize(quad);
  var out=document.createElement('canvas');
  out.width=size[0];out.height=size[1];
  var srcData=srcCanvas.getContext('2d').getImageData(0,0,srcCanvas.width,srcCanvas.height);
  var outData=out.getContext('2d').createImageData(size[0],size[1]);
  var H=solveH([[0,0],[size[0],0],[size[0],size[1]],[0,size[1]]],quad);
  warpPixels(srcData,outData,H);
  out.getContext('2d').putImageData(outData,0,0);
  return out;
}
function defaultQuad(w,h){
  return [[w*0.08,h*0.08],[w*0.92,h*0.08],[w*0.92,h*0.92],[w*0.08,h*0.92]];
}