/* SCHOOL_IMPORT_TEMPLATE_DOWNLOAD_V1 */
(() => {
  'use strict';
  const info = {
    word: {label:'Word', name:'Word试题上传模板.docx', mime:'wordprocessingml.document'},
    excel: {label:'Excel', name:'Excel试题上传模板.xlsx', mime:'spreadsheetml.sheet'}
  };
  const status = document.getElementById('templateDownloadStatus');
  if (!status) return;
  for (const link of document.querySelectorAll('[data-school-template]')) {
    link.addEventListener('click', async event => {
      event.preventDefault();
      if (link.getAttribute('aria-disabled') === 'true') return;
      const item = info[link.getAttribute('data-school-template')];
      if (!item) return;
      link.setAttribute('aria-disabled','true');
      link.setAttribute('aria-busy','true');
      status.classList.remove('error');
      status.textContent = '正在准备 ' + item.label + ' 模板…';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(link.href, {
          credentials:'same-origin', cache:'no-store', signal:controller.signal
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw Error(response.status === 401 ? '登录已过期，请重新登录教师账号后下载。' :
            (error.message || '下载失败，请重试。'));
        }
        if (!(response.headers.get('Content-Type') || '').includes(item.mime)) {
          throw Error('没有收到有效模板，请刷新页面并确认教师账号已登录。');
        }
        const file = await response.blob();
        if (file.size < 100) throw Error('模板内容不完整，请重试。');
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = item.name;
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url),10000);
        status.textContent = item.label + ' 模板已开始下载。替换示例题并保存后，即可上传识别。';
      } catch (error) {
        status.classList.add('error');
        status.textContent = error.name === 'AbortError' ? '下载超时，请检查校园网络后重试。' : error.message;
      } finally {
        clearTimeout(timer);
        link.removeAttribute('aria-disabled');
        link.removeAttribute('aria-busy');
      }
    });
  }
})();
/* END_SCHOOL_IMPORT_TEMPLATE_DOWNLOAD_V1 */
