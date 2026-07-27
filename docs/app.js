const titles={dashboard:'لوحة التحكم',representatives:'المندوبون',customers:'العملاء',receivables:'المبالغ المستحقة',collections:'عمليات القبض',settlements:'تسليمات المندوبين',reports:'التقارير',permissions:'المستخدمون والصلاحيات',settings:'الإعدادات'};
const sidebar=document.querySelector('.sidebar');
document.querySelectorAll('#nav button').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  button.classList.add('active');
  const page=button.dataset.page;
  document.getElementById(page).classList.add('active');
  document.getElementById('pageTitle').textContent=titles[page]||'Nexora Collect';
  sidebar.classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}));
document.getElementById('menuButton').addEventListener('click',()=>sidebar.classList.toggle('open'));
document.addEventListener('click',e=>{if(innerWidth<760&&!sidebar.contains(e.target)&&e.target.id!=='menuButton')sidebar.classList.remove('open')});
