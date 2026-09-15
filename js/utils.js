// js/utils.js - Toast y Modal (helpers UI)
export function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export function toast(msg, type='info'){
  const c = document.getElementById('toastContainer');
  if(!c) return;
  const t = document.createElement('div');
  t.className=`toast ${type}`;
  const icons={success:'✓',error:'✕',info:'ℹ'};
  t.innerHTML=`<span>${icons[type]||'ℹ'}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(20px)'; setTimeout(()=>t.remove(),250)},2800);
}

export function showModal({title, text, confirmText='Confirmar', confirmClass='danger', onConfirm}){
  const overlay = document.getElementById('modalOverlay');
  if(!overlay) return;
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalText').textContent=text;
  const btnConfirm = document.getElementById('modalConfirm');
  btnConfirm.textContent=confirmText;
  btnConfirm.className='btn-modal '+confirmClass;
  overlay.classList.remove('hidden');
  const close = ()=> overlay.classList.add('hidden');
  document.getElementById('modalCancel').onclick=close;
  overlay.onclick=(e)=>{ if(e.target===overlay) close(); };
  btnConfirm.onclick=()=>{ close(); onConfirm&&onConfirm(); };
}
