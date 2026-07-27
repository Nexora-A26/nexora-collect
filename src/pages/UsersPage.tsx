import React, { useEffect, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Confirm, Form, Input, Loading, Modal, PageHeader, Select } from '../components/ui';
import { useToast } from '../components/Toast';

const pages: Array<[PageKey,string]> = [['dashboard','لوحة التحكم'],['representatives','المندوبون'],['customers','العملاء'],['receivables','المبالغ المستحقة'],['collections','عمليات القبض'],['settlements','تسليمات المندوبين'],['balances','الأرصدة'],['reports','التقارير'],['users','المستخدمون'],['audit','سجل العمليات'],['settings','الإعدادات']];
const actions: Array<[PermissionAction,string]> = [['view','عرض'],['create','إضافة'],['edit','تعديل'],['delete','حذف'],['export','تصدير']];
const blankPermissions=()=>Object.fromEntries(pages.map(([p])=>[p,Object.fromEntries(actions.map(([a])=>[a,false]))]));
const empty={username:'',full_name:'',password:'',role:'user',active:true,permissions:blankPermissions()};

export default function UsersPage(){
 const {can,user}=useAuth();const toast=useToast();
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[editing,setEditing]=useState<any|null>(null),[form,setForm]=useState<any>(empty),[saving,setSaving]=useState(false),[remove,setRemove]=useState<any|null>(null);
 const load=async()=>{setLoading(true);try{setRows(await window.nexora.users.list())}catch(e:any){toast.error(e.message)}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const showCreate=()=>{setEditing(null);setForm({...empty,permissions:blankPermissions()});setOpen(true)};
 const showEdit=(r:any)=>{setEditing(r);setForm({...r,password:'',active:Boolean(r.active),permissions:r.permissions||blankPermissions()});setOpen(true)};
 const setPerm=(page:PageKey,action:PermissionAction,value:boolean)=>setForm({...form,permissions:{...form.permissions,[page]:{...form.permissions[page],[action]:value}}});
 const togglePage=(page:PageKey,value:boolean)=>setForm({...form,permissions:{...form.permissions,[page]:Object.fromEntries(actions.map(([a])=>[a,form.role==='viewer'&&!['view','export'].includes(a)?false:value]))}});
 const save=async()=>{setSaving(true);try{editing?await window.nexora.users.update(editing.id,form):await window.nexora.users.create(form);toast.success(editing?'تم تعديل المستخدم وصلاحياته.':'تم إنشاء المستخدم.');setOpen(false);if(editing?.id===user.id){window.location.reload();return;}await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 const doRemove=async()=>{if(!remove)return;setSaving(true);try{await window.nexora.users.remove(remove.id);toast.success('تم تعطيل المستخدم.');setRemove(null);await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 return <><PageHeader title="المستخدمون والصلاحيات" subtitle="يستطيع المدير تحديد الصفحات والعمليات المسموح بها لكل مستخدم" actions={can('users','create')&&<Button onClick={showCreate}><Plus size={17}/>مستخدم جديد</Button>}/>
 <Card>{loading?<Loading/>:<DataTable rows={rows} columns={[{key:'username',header:'اسم المستخدم'},{key:'full_name',header:'الاسم الكامل'},{key:'role',header:'الدور',render:r=>r.role==='admin'?'مدير النظام':r.role==='viewer'?'مشاهد':'مستخدم'},{key:'active',header:'الحالة',render:r=><span className={`badge ${r.active?'badge-active':'badge-inactive'}`}>{r.active?'فعال':'متوقف'}</span>},{key:'created_at',header:'تاريخ الإنشاء',render:r=>new Date(r.created_at).toLocaleDateString('ar-IQ')},{key:'actions',header:'الإجراءات',render:r=><div className="row-actions">{can('users','edit')&&<button onClick={()=>showEdit(r)}><Pencil size={17}/></button>}{can('users','delete')&&r.id!==user.id&&<button className="danger" onClick={()=>setRemove(r)}><Trash2 size={17}/></button>}</div>}]}/>}</Card>
 <Modal open={open} title={editing?'تعديل المستخدم':'إنشاء مستخدم'} onClose={()=>setOpen(false)} width={1050}><Form onSubmit={save}><div className="form-grid">
  <Input label="اسم المستخدم *" required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/><Input label="الاسم الكامل *" required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/>
  <Input label={editing?'كلمة مرور جديدة (اختياري)':'كلمة المرور *'} type="password" required={!editing} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><Select label="الدور" value={form.role} onChange={e=>{const role=e.target.value;setForm({...form,role,permissions:role==='admin'?blankPermissions():form.permissions})}}><option value="admin">مدير النظام</option><option value="user">مستخدم</option><option value="viewer">مشاهد</option></Select>
  <Select label="الحالة" value={form.active?'1':'0'} onChange={e=>setForm({...form,active:e.target.value==='1'})}><option value="1">فعال</option><option value="0">متوقف</option></Select>
 </div>{form.role!=='admin'&&<><div className="permissions-title"><ShieldCheck size={20}/><div><h3>صلاحيات الصفحات</h3><p>حدد الصفحات التي تظهر للمستخدم وما يمكنه فعله داخل كل صفحة.</p></div></div><div className="permission-table"><table><thead><tr><th>الصفحة</th><th>تحديد الكل</th>{actions.map(([a,l])=><th key={a}>{l}</th>)}</tr></thead><tbody>{pages.map(([p,label])=><tr key={p}><td><strong>{label}</strong></td><td><input type="checkbox" checked={actions.every(([a])=>Boolean(form.permissions?.[p]?.[a]) || (form.role==='viewer'&&!['view','export'].includes(a)))} onChange={e=>togglePage(p,e.target.checked)}/></td>{actions.map(([a])=><td key={a}><input type="checkbox" disabled={form.role==='viewer'&&!['view','export'].includes(a)} checked={Boolean(form.permissions?.[p]?.[a])} onChange={e=>setPerm(p,a,e.target.checked)}/></td>)}</tr>)}</tbody></table></div></>}
 <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ المستخدم</Button></div></Form></Modal>
 <Confirm open={!!remove} title="تعطيل المستخدم" message="لن يتمكن المستخدم من تسجيل الدخول بعد التعطيل، ويمكن إعادة تفعيله لاحقاً من التعديل." danger onCancel={()=>setRemove(null)} onConfirm={doRemove} loading={saving}/></>;
}
