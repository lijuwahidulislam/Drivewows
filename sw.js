'use strict';
var CACHE='scanfree-v1';
var ASSETS=['./','./index.html','./style.css','./core.js','./app.js','./upload.js','./edit.js','./pdf.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-192.png','./icon-maskable-512.png','./privacy.html','./terms.html','./help.html'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ASSETS.map(function(u){
      return c.add(new Request(u,{cache:'reload'})).catch(function(){return null;});
    }));
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET'){return;}
  var url=new URL(req.url);
  if(url.origin!==location.origin){return;}
  e.respondWith(
    caches.match(req,{ignoreSearch:true}).then(function(hit){
      if(hit){return hit;}
      return fetch(req).then(function(res){
        var copy=res.clone();
        caches.open(CACHE).then(function(c){c.put(req,copy);}).catch(function(){});
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(home){
          return home||new Response('Offline',{status:503});
        });
      });
    })
  );
});