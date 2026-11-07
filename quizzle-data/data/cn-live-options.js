/* Quizzle 2.6.3 live student-answer text, compatible with Chinese translation plugin.
 * Does not alter answers or disclose correct-answer information.
 */
(() => {
  'use strict';
  if (window.__quizzleCnLiveOptions) return;
  window.__quizzleCnLiveOptions = true;
  const css = document.createElement('style');
  css.id = 'quizzle-cn-live-options-style';
  css.textContent = `
    .ingame-content.grid-layout .ingame-answer.cn-live-option {flex-direction:column; gap:clamp(.35rem,1.2vh,.9rem);padding:clamp(.6rem,1.6vw,1.5rem)}
    .ingame-content.grid-layout .ingame-answer.cn-live-option svg {flex-shrink:0;max-height:3.25rem}
    .ingame-content.grid-layout .cn-live-option-label{font-size:clamp(1.05rem,1.9vw,1.85rem);line-height:1.4;font-weight:700;color:#fff;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.4);overflow-wrap:anywhere;max-width:100%;max-height:50%;overflow:auto}
    .ingame-content.grid-layout .cn-live-option-img{display:block;max-width:min(85%,320px);max-height:48%;object-fit:contain;border-radius:.5rem}
    @media(max-width:700px){.ingame-content.grid-layout .ingame-answer.cn-live-option svg{max-height:2rem}.ingame-content.grid-layout .cn-live-option-label{font-size:clamp(.85rem,3.5vw,1.25rem)}}
  `;
  (document.head || document.documentElement).appendChild(css);
  let busy=false;
  const paint=async()=>{
    if(busy || window.location.pathname.replace(/\/$/,'')!=='/client')return;
    const boxes=[...document.querySelectorAll('.ingame-content.grid-layout > .ingame-answer')];
    const sid=window.localStorage?.getItem('quizzle_session_id');
    if(!sid||boxes.length===0)return;
    busy=true;
    try{
      const res=await fetch('/api/cn-live-options',{headers:{'X-Quizzle-Session':sid},cache:'no-store',credentials:'same-origin'});
      if(!res.ok || res.status===204)return;
      const data=await res.json();
      if(!Array.isArray(data.choices)||boxes.length!==data.choices.length)return;
      const title=document.querySelector('.ingame-header h2')?.textContent?.trim();
      if(!title||title!==String(data.title||'').trim())return;
      boxes.forEach((box,i)=>{
        const answer=data.choices[i];
        if(!answer || typeof answer.content!=='string')return;
        box.classList.add('cn-live-option');
        const old=box.querySelector('.cn-live-option-label,.cn-live-option-img');
        const kind=answer.type==='image'?'image':'text';
        const content=answer.content;
        if(old?.dataset.content===content && old.dataset.kind===kind)return;
        if(old)old.remove();
        if(kind==='image'){
          if(!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(content))return;
          const el=document.createElement('img');el.className='cn-live-option-img';el.dataset.kind='image';el.dataset.content=content;el.alt='选项'+(i+1);el.src=content;box.appendChild(el);
        }else{
          const el=document.createElement('span');el.className='cn-live-option-label';el.dataset.kind='text';el.dataset.content=content;el.textContent=content;box.appendChild(el);
        }
      });
    }catch(err){/* 网络抖动时保留原来的彩色按钮，下一次继续获取 */}
    finally{busy=false;}
  };
  setInterval(paint,1200);
  window.addEventListener('pageshow',paint);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint();});
})();
