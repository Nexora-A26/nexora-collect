const previewUsers={
  admin:{password:'admin123',name:'مدير النظام',role:'مدير',avatar:'م'},
  user:{password:'user123',name:'مستخدم النظام',role:'مستخدم',avatar:'س'},
  viewer:{password:'viewer123',name:'مشاهد النظام',role:'مشاهد — قراءة فقط',avatar:'ش'}
};
const loginScreen=document.getElementById('loginScreen');
const onlineApp=document.getElementById('onlineApp');
const loginForm=document.getElementById('loginForm');
const loginError=document.getElementById('loginError');
const usernameInput=document.getElementById('loginUsername');
const passwordInput=document.getElementById('loginPassword');
const loginButton=document.getElementById('loginButton');

function applyUser(username){
  const user=previewUsers[username];
  if(!user)return;
  document.getElementById('currentUserName').textContent=user.name;
  document.getElementById('currentUserRole').textContent=user.role;
  document.getElementById('userAvatar').textContent=user.avatar;
  document.body.dataset.role=username;
}
function openApp(username){
  applyUser(username);
  loginScreen.classList.add('is-hidden');
  onlineApp.classList.remove('is-hidden');
  if(document.getElementById('rememberMe').checked)localStorage.setItem('nexoraPreviewUser',username);
  else sessionStorage.setItem('nexoraPreviewUser',username);
}
function logout(){
  localStorage.removeItem('nexoraPreviewUser');
  sessionStorage.removeItem('nexoraPreviewUser');
  onlineApp.classList.add('is-hidden');
  loginScreen.classList.remove('is-hidden');
  passwordInput.value='';
  loginError.textContent='';
  usernameInput.focus();
}
loginForm.addEventListener('submit',e=>{
  e.preventDefault();
  const username=usernameInput.value.trim().toLowerCase();
  const password=passwordInput.value;
  loginError.textContent='';
  if(!username||!password){loginError.textContent='يرجى إدخال اسم المستخدم وكلمة المرور.';return;}
  if(!previewUsers[username]||previewUsers[username].password!==password){loginError.textContent='اسم المستخدم أو كلمة المرور غير صحيحة.';return;}
  loginButton.classList.add('loading');
  loginButton.querySelector('span').textContent='جارٍ تسجيل الدخول...';
  setTimeout(()=>{loginButton.classList.remove('loading');loginButton.querySelector('span').textContent='دخول إلى النظام';openApp(username)},450);
});
document.getElementById('togglePassword').addEventListener('click',e=>{
  const show=passwordInput.type==='password';
  passwordInput.type=show?'text':'password';
  e.currentTarget.textContent=show?'إخفاء':'إظهار';
});
document.querySelectorAll('[data-demo-user]').forEach(button=>button.addEventListener('click',()=>{
  usernameInput.value=button.dataset.demoUser;
  passwordInput.value=button.dataset.demoPass;
  loginError.textContent='';
}));
document.getElementById('logoutButton').addEventListener('click',logout);
const savedUser=localStorage.getItem('nexoraPreviewUser')||sessionStorage.getItem('nexoraPreviewUser');
if(savedUser&&previewUsers[savedUser])openApp(savedUser);
else setTimeout(()=>usernameInput.focus(),100);

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
