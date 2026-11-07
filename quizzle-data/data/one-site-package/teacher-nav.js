(() => {
  'use strict';
  // Single-site teacher navigation, Quizzle 2.6.3.
  // Remain within the original React home screen/login and add one native-looking link.
  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return;
  const ID = 'school-teacher-management-button-v2';
  const TARGET = '/school/admin';
  const params = new URLSearchParams(window.location.search);
  const returnToManagement = params.get('teacher') === '1';
  let permitted = false, busy = false, lastCheck = 0, timer = null, navigating = false;

  const findActionArea = () => document.querySelector('.home-page .action-area');
  function removeButton() { document.getElementById(ID)?.remove(); }
  function createButton(area) {
    let link = document.getElementById(ID);
    if (!link || link.parentElement !== area) {
      if (link) link.remove();
      link = document.createElement('a');
      link.id = ID;
      link.href = TARGET;
      link.className = 'btn btn-default';
      link.textContent = '🏫 学生答题管理';
      link.setAttribute('aria-label', '进入校园教师管理后台，发布测验和查看学生答题成绩');
      Object.assign(link.style, {
        boxSizing: 'border-box', color:'#fff', textDecoration:'none',
        padding: '0.8rem 2.5rem', minHeight:'54px', whiteSpace:'nowrap',
        width:'100%', fontFamily:'inherit', lineHeight:'normal'
      });
      // Put the link next to Create Quiz and Host Quiz, ahead of Admin/Logout.
      const children = Array.from(area.children);
      const secondButton = children.filter(el => el.tagName === 'BUTTON')[1];
      if (secondButton && secondButton.nextSibling) area.insertBefore(link,secondButton.nextSibling);
      else area.appendChild(link);
      link.addEventListener('click', (event) => {
        if (area.classList.contains('disabled')) event.preventDefault();
      });
    }
    const disabled = area.classList.contains('disabled');
    link.setAttribute('aria-disabled', disabled ? 'true':'false');
    link.style.opacity = disabled ? '0.6':'1';
    link.style.pointerEvents = disabled ? 'none':'auto';
  }
  function syncUI() {
    const area = findActionArea();
    if (!area || !permitted) { removeButton(); return; }
    createButton(area);
  }
  async function checkAuth() {
    if (busy || document.hidden) return;
    busy = true;
    lastCheck = Date.now();
    try {
      const res = await fetch('/api/auth/me', {credentials:'same-origin',cache:'no-store'});
      const data = res.ok ? await res.json() : {};
      permitted = data.authenticated === true && data.user &&
        (data.user.role === 'admin' || data.user.role === 'teacher');
    } catch (_) { permitted = false; }
    finally { busy = false; }
    if (permitted && returnToManagement && !navigating) {
      navigating = true;
      window.location.replace(TARGET);
      return;
    }
    syncUI();
  }
  function scheduleAuthCheck() {
    clearTimeout(timer);
    // Login/logout causes React to replace action buttons. Check promptly after it renders.
    const delay = Math.max(160, 800 - (Date.now() - lastCheck));
    timer = setTimeout(checkAuth, delay);
  }
  const observer = new MutationObserver((mutations) => {
    let authChanged = false, areaChanged = false;
    for (const m of mutations) {
      // Our own injected anchor is not an indication of changed authentication.
      const nodes = [...m.addedNodes,...m.removedNodes];
      if (nodes.length && nodes.every(n => n.nodeType === 1 && n.id === ID)) continue;
      if (m.type === 'childList' && nodes.some(n => n.nodeType === 1 && (n.matches?.('.action-area, .home-page, button') || n.querySelector?.('.action-area, button')))) authChanged = true;
      if (m.type === 'attributes' && m.target.classList?.contains('action-area')) areaChanged = true;
    }
    if (authChanged) scheduleAuthCheck();
    else if (areaChanged) syncUI();
  });
  function init() {
    observer.observe(document.getElementById('root') || document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    checkAuth();
    // Periodic refresh handles sessions changed in other browser tabs.
    window.setInterval(checkAuth, 7000);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) checkAuth(); });
    window.addEventListener('focus', checkAuth);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
