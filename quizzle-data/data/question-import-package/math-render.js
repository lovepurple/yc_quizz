/* SCHOOL_IMPORT_MATH_RENDER_V1 */
/*
 * The student page is rendered by the existing Quizzle client after the
 * document has loaded.  Older media patches only replaced image markers and
 * therefore left formula source such as x^{2} and x_{1} visible.  This small
 * client scans the rendered question text after every SPA update and uses the
 * shared, offline-safe QuizzleMath renderer.
 */
(()=>{
  'use strict';
  if(typeof document==='undefined')return;
  const cssHost=document.createElement('style');
  cssHost.dataset.quizzleMathRender='1';
  document.head?.append(cssHost);
  function addCss(){
    if(!cssHost.parentNode&&document.head)document.head.append(cssHost);
    if(globalThis.QuizzleMath?.css&&!cssHost.dataset.ready){
      cssHost.textContent=globalThis.QuizzleMath.css;
      cssHost.dataset.ready='1';
    }
  }
  function ignored(node){
    const parent=node.parentElement;
    if(!parent)return true;
    const tag=parent.tagName;
    if(tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||tag==='INPUT'||tag==='OPTION')return true;
    return !!parent.closest('.quizzle-math,[data-quizzle-math-ignore="true"]');
  }
  function nodes(){
    if(!document.body||typeof NodeFilter==='undefined')return[];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];
    let n;
    while((n=walker.nextNode()))if(!ignored(n))out.push(n);
    return out;
  }
  function replace(node){
    const math=globalThis.QuizzleMath,value=node.nodeValue||'';
    if(!math||!math.hasFormatting(value))return;
    const host=document.createElement('span');
    host.className='quizzle-math';
    host.setAttribute('role','math');
    math.renderInline(value,host);
    node.parentNode?.replaceChild(host,node);
  }
  function scan(){
    addCss();
    for(const node of nodes())replace(node);
  }
  function setup(){
    globalThis.QuizzleMathScan=scan;
    scan();
    if(typeof MutationObserver==='function'&&document.body){
      new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,characterData:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
/* END_SCHOOL_IMPORT_MATH_RENDER_V1 */
