import React, { useEffect, useState } from 'react';
import { Eye, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Confirm, Form, Input, Loading, Modal, PageHeader, SearchInput, Select, StatusBadge, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';

const emptyForm = { code:'', name:'', phone:'', address:'', email:'', default_commission:'0', status:'active', notes:'' };

export default function RepresentativesPage() {
  const { money, can } = useAuth();
  const toast = useToast();
  const [rows,setRows]=useState<any[]>([]), [loading,setLoading]=useState(true), [search,setSearch]=useState('');
  const [editing,setEditing]=useState<any|null>(null), [form,setForm]=useState<any>(emptyForm), [open,setOpen]=useState(false), [saving,setSaving]=useState(false);
  const [remove,setRemove]=useState<any|null>(null), [detail,setDetail]=useState<any|null>(null);
  const load=async()=>{ setLoading(true); try{setRows(await window.nexora.representatives.list({search}));}catch(e:any){toast.error(e.message);}finally{setLoading(false);} };
  useEffect(()=>{void load();},[search]);
  const showCreate=()=>{setEditing(null);setForm(emptyForm);setOpen(true);};
  const showEdit=(r:any)=>{setEditing(r);setForm({...r,default_commission:String(r.default_commission)});setOpen(true);};
  const save=async()=>{setSaving(true);try{editing?await window.nexora.representatives.update(editing.id,form):await window.nexora.representatives.create(form);toast.success(editing?'تم تعديل المندوب.':'تمت إضافة المندوب.');setOpen(false);await load();}catch(e:any){toast.error(e.message);}finally{setSaving(false);}};
  const doRemove=async()=>{if(!remove)return;setSaving(true);try{const r=await window.nexora.representatives.remove(remove.id);toast.success(r.deactivated?'تم إيقاف المندوب لوجود سجل مالي.':'تم حذف المندوب.');setRemove(null);await load();}catch(e:any){toast.error(e.message);}finally{setSaving(false);}};
  const showDetail=async(id:number)=>{try{setDetail(await window.nexora.representatives.get(id));}catch(e:any){toast.error(e.message);}};
  return <>
    <PageHeader title="المندوبون" subtitle="إدارة المندوبين ونسب العمولات ونتائج القبض المباشر" actions={can('representatives','create')&&<Button onClick={showCreate}><Plus size={17}/>إضافة مندوب</Button>}/>
    <Card><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو الكود أو الهاتف"/></div>{loading?<Loading/>:<DataTable rows={rows} columns={[
      {key:'code',header:'الكود'},{key:'name',header:'اسم المندوب'},{key:'phone',header:'الهاتف'},{key:'customer_count',header:'العملاء'},
      {key:'default_commission',header:'النسبة الافتراضية',render:r=>`${r.default_commission}%`},{key:'collected',header:'المحصل',render:r=>money(r.collected)},
      {key:'commissions',header:'العمولات',render:r=>money(r.commissions)},{key:'net',header:'صافي الإدارة',render:r=>money(r.net)},{key:'status',header:'الحالة',render:r=><StatusBadge status={r.status}/>},
      {key:'actions',header:'الإجراءات',render:r=><div className="row-actions"><button onClick={()=>void showDetail(r.id)} title="عرض"><Eye size={17}/></button>{can('representatives','edit')&&<button onClick={()=>showEdit(r)} title="تعديل"><Pencil size={17}/></button>}{can('representatives','delete')&&<button className="danger" onClick={()=>setRemove(r)} title="حذف"><Trash2 size={17}/></button>}</div>}
    ]}/>}</Card>
    <Modal open={open} title={editing?'تعديل المندوب':'إضافة مندوب جديد'} onClose={()=>setOpen(false)}><Form onSubmit={save}><div className="form-grid">
      <Input label="كود المندوب" placeholder="يُنشأ تلقائياً عند تركه فارغاً" value={form.code||''} onChange={e=>setForm({...form,code:e.target.value})}/>
      <Input label="اسم المندوب *" required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/>
      <Input label="رقم الهاتف" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/>
      <Input label="البريد الإلكتروني" type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/>
      <Input label="نسبة العمولة الافتراضية %" type="number" min="0" max="100" step="0.01" value={form.default_commission} onChange={e=>setForm({...form,default_commission:e.target.value})}/>
      <Select label="الحالة" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">فعال</option><option value="inactive">متوقف</option></Select>
      <div className="full"><Input label="العنوان" value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/></div>
      <div className="full"><Textarea label="ملاحظات" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
    </div><div className="modal-actions"><Button variant="secondary" type="button" onClick={()=>setOpen(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ</Button></div></Form></Modal>
    <Confirm open={!!remove} title="حذف أو إيقاف المندوب" message="إذا كان للمندوب سجل قبض أو تسليم فسيتم إيقافه بدلاً من حذفه حفاظاً على البيانات." danger onCancel={()=>setRemove(null)} onConfirm={doRemove} loading={saving}/>
    <Modal open={!!detail} title="ملف المندوب" onClose={()=>setDetail(null)} width={980}>{detail&&<div>
      <div className="detail-hero"><div className="detail-avatar"><UserRound/></div><div><h3>{detail.rep.name}</h3><p>{detail.rep.code} • {detail.rep.phone||'لا يوجد هاتف'}</p></div><StatusBadge status={detail.rep.status}/></div>
      <div className="mini-stats"><div><span>عدد عمليات القبض</span><strong>{detail.summary.operations||0}</strong></div><div><span>إجمالي القبض</span><strong>{money(detail.summary.collected)}</strong></div><div><span>العمولات</span><strong>{money(detail.summary.commissions)}</strong></div><div><span>صافي الإدارة</span><strong>{money(detail.summary.net)}</strong></div><div><span>المسلم للإدارة</span><strong>{money(detail.summary.delivered)}</strong></div><div><span>الرصيد مع المندوب</span><strong>{money(detail.summary.outstanding)}</strong></div></div>
      <h3 className="section-title">العملاء التابعون</h3><DataTable rows={detail.customers} columns={[{key:'code',header:'الكود'},{key:'name',header:'العميل'},{key:'phone',header:'الهاتف'},{key:'collections_count',header:'عدد العمليات'},{key:'collected',header:'إجمالي القبض',render:r=>money(r.collected)},{key:'commissions',header:'العمولات',render:r=>money(r.commissions)},{key:'net',header:'صافي الإدارة',render:r=>money(r.net)}]}/>
    </div>}</Modal>
  </>;
}
