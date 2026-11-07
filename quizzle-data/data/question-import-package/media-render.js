/* SCHOOL_IMPORT_MEDIA_RENDER_V1 */
(()=>{
  'use strict';
  if(typeof document==='undefined')return;
  const marker=/\[\[QUIZZLE_MEDIA:(\/school\/import\/media\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+)\]\]/g;
  const style=document.createElement('style');
  style.textContent='.quizzle-import-media{display:block;max-width:min(100%,760px);max-height:520px;margin:14px auto;border-radius:10px;object-fit:contain;background:#fff;box-shadow:0 2px 12px rgba(50,45,100,.12)}.quizzle-import-video{width:100%;max-height:520px;background:#111}.quizzle-import-media-link{display:inline-block;margin:8px 0;color:#5b45c5;font-size:13px}';
  document.head?.append(style);
  function applyMathCss(){if(globalThis.QuizzleMath?.css&&!style.dataset.math){style.textContent+=globalThis.QuizzleMath.css;style.dataset.math='1';}}
  function safeUrl(value){try{const u=new URL(value,location.origin);return u.origin===location.origin&&u.pathname.startsWith('/school/import/media/')?u.href:'';}catch{return '';}}
  function mediaNode(url){const safe=safeUrl(url);if(!safe)return null;const isVideo=/\.(?:mp4|webm|ogg|mov)(?:$|\?)/i.test(safe);if(isVideo){const v=document.createElement('video');v.className='quizzle-import-media quizzle-import-video';v.controls=true;v.preload='metadata';v.src=safe;return v;}const img=document.createElement('img');img.className='quizzle-import-media';img.alt='题目图片';img.loading='lazy';img.src=safe;return img;}
  function replaceText(node){const value=node.nodeValue||'';if(!value.includes('[[QUIZZLE_MEDIA:'))return;marker.lastIndex=0;let match,last=0,changed=false;const frag=document.createDocumentFragment();while((match=marker.exec(value))){changed=true;if(match.index>last)frag.append(document.createTextNode(value.slice(last,match.index)));const media=mediaNode(match[1]);if(media)frag.append(media);else frag.append(document.createTextNode('（题目媒体加载失败）'));last=match.index+match[0].length;}if(!changed)return;if(last<value.length)frag.append(document.createTextNode(value.slice(last)));node.parentNode?.replaceChild(frag,node);}
  function textNodes(){if(!document.body)return[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),nodes=[];let n;while((n=walker.nextNode())){const tag=n.parentElement?.tagName;if(tag!=='SCRIPT'&&tag!=='STYLE'&&tag!=='TEXTAREA')nodes.push(n);}return nodes;}
  function replaceMath(node){const value=node.nodeValue||'',math=globalThis.QuizzleMath;if(!math||!math.hasFormatting(value))return;const host=document.createElement('span');host.className='quizzle-math';math.renderInline(value,host);node.parentNode?.replaceChild(host,node);}
  function scan(){applyMathCss();for(const text of textNodes())replaceText(text);for(const text of textNodes())replaceMath(text);}
  function setup(){globalThis.QuizzleMediaScan=scan;scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,characterData:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
/* END_SCHOOL_IMPORT_MEDIA_RENDER_V1 */
