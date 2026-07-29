import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Confirm, Form, Input, Loading, Modal, PageHeader, SearchInput, Select, StatusBadge, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';

const emptyForm = { code:'',name:'',phone:'',address:'',area:'',representative_id:'',commission_percentage:'',status:'active',notes:'' };

export default function CustomersPage(){
  const { money,can }=useAuth(); const toast=useToast();
  const [rows,setRows]=useState<any[]>([]),[reps,setReps]=useState<any[]>([]),[search,setSearch]=useState(''),[loading,setLoading]=useState(true);
  const [open,setOpen]=useState(false),[editing,setEditing]=useState<any|null>(null),[form,setForm]=useState<any>(emptyForm),[saving,setSaving]=useState(false);
  const [remove,setRemove]=useState<any|null>(null),[detail,setDetail]=useState<any|null>(null),[transfer,setTransfer]=useState<any|null>(null),[transferRep,setTransferRep]=useState(''),[transferNotes,setTransferNotes]=useState('');
  const load=async()=>{setLoading(true);try{const [c,r]=await Promise.all([window.nexora.customers.list({search}),window.nexora.representatives.list({status:'active'})]);setRows(c);setReps(r);}catch(e:any){toast.error(e.message);}finally{setLoading(false);}};
  useEffect(()=>{void load();},[search]);
  const showCreate=()=>{setEditing(null);setForm(emptyForm);setOpen(true)};
  const showEdit=(r:any)=>{setEditing(r);setForm({...r,representative_id:r.representative_id??'',commission_percentage:r.commission_percentage??''});setOpen(true)};
  const save=async()=>{setSaving(true);try{const v={...form,representative_id:form.representative_id?Number(form.representative_id):null};editing?await window.nexora.customers.update(editing.id,v):await window.nexora.customers.create(v);toast.success(editing?'تم تعديل العميل.':'تمت إضافة العميل.');setOpen(false);await load();}catch(e:any){toast.error(e.message);}finally{setSaving(false)}};
  const doRemove=async()=>{if(!remove)return;setSaving(true);try{const r=await window.nexora.customers.remove(remove.id);toast.success(r.deactivated?'تم إيقاف العميل لوجود سجل مالي.':'تم حذف العميل.');setRemove(null);await load();}catch(e:any){toast.error(e.message);}finally{setSaving(false)}};
  const showDetail=async(id:number)=>{try{setDetail(await window.nexora.customers.get(id));}catch(e:any){toast.error(e.message)}};
  const doTransfer=async()=>{if(!transfer)return;setSaving(true);try{await window.nexora.customers.transfer(transfer.id,transferRep?Number(transferRep):null,transferNotes);toast.success('تم نقل العميل. العمليات السابقة بقيت مرتبطة بالمندوب السابق.');setTransfer(null);await load();}catch(e:any){toast.error(e.message);}finally{setSaving(false)}};
  return <>
    <PageHeader title="العملاء" subtitle="إدارة العملاء وربطهم بالمندوبين ومتابعة عمليات القبض المباشرة" actions={can('customers','create')&&<Button onClick={showCreate}><Plus size={17}/>إضافة عميل</Button>}/>
    <Card><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو الكود أو الهاتف أو المنطقة"/></div>{loading?<Loading/>:<DataTable rows={rows} columns={[
      {key:'code',header:'الكود'},{key:'name',header:'اسم العميل'},{key:'phone',header:'الهاتف'},{key:'area',header:'المنطقة'},{key:'representative_name',header:'المندوب'},
      {key:'collections_count',header:'عدد العمليات'},{key:'collected',header:'إجمالي القبض',render:r=>money(r.collected)},{key:'commissions',header:'العمولات',render:r=>money(r.commissions)},{key:'net',header:'صافي الإدارة',render:r=><strong>{money(r.net)}</strong>},
      {key:'status',header:'الحالة',render:r=><StatusBadge status={r.status}/>},{key:'actions',header:'الإجراءات',render:r=><div className="row-actions"><button onClick={()=>void showDetail(r.id)}><Eye size={17}/></button>{can('customers','edit')&&<><button onClick={()=>showEdit(r)}><Pencil size={17}/></button><button onClick={()=>{setTransfer(r);setTransferRep(String(r.representative_id??''));setTransferNotes('')}}><ArrowLeftRight size={17}/></button></>}{can('customers','delete')&&<button className="danger" onClick={()=>setRemove(r)}><Trash2 size={17}/></button>}</div>}
    ]}/>}</Card>
    <Modal open={open} title={editing?'تعديل العميل':'إضافة عميل جديد'} onClose={()=>setOpen(false)}><Form onSubmit={save}><div className="form-grid">
      <Input label="كود العميل" placeholder="يُنشأ تلقائياً" value={form.code||''} onChange={e=>setForm({...form,code:e.target.value})}/><Input label="اسم العميل *" required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/>
      <Input label="الهاتف" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/><Input label="المنطقة" value={form.area||''} onChange={e=>setForm({...form,area:e.target.value})}/>
      <Select label="المندوب" value={form.representative_id??''} onChange={e=>setForm({...form,representative_id:e.target.value})}><option value="">بدون مندوب</option>{reps.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select>
      <Input label="نسبة عمولة خاصة %" type="number" min="0" max="100" step="0.01" value={form.commission_percentage??''} onChange={e=>setForm({...form,commission_percentage:e.target.value})} hint="اتركها فارغة لاستخدام نسبة المندوب الافتراضية أثناء القبض"/>
      <Select label="الحالة" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">فعال</option><option value="inactive">متوقف</option></Select>
      <div className="full"><Input label="العنوان" value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/></div><div className="full"><Textarea label="ملاحظات" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
    </div><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ</Button></div></Form></Modal>
    <Confirm open={!!remove} title="حذف أو إيقاف العميل" message="إذا كان للعميل سجل قبض فسيتم إيقافه بدلاً من حذفه." danger onCancel={()=>setRemove(null)} onConfirm={doRemove} loading={saving}/>
    <Modal open={!!transfer} title="نقل العميل إلى مندوب آخر" onClose={()=>setTransfer(null)} width={560}><Select label="المندوب الجديد" value={transferRep} onChange={e=>setTransferRep(e.target.value)}><option value="">بدون مندوب</option>{reps.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select><Textarea label="ملاحظات النقل" value={transferNotes} onChange={e=>setTransferNotes(e.target.value)} rows={3}/><div className="info-box">العمليات السابقة لن تتغير، وسيُستخدم المندوب الجديد للعمليات المستقبلية.</div><div className="modal-actions"><Button variant="secondary" onClick={()=>setTransfer(null)}>إلغاء</Button><Button loading={saving} onClick={doTransfer}>تنفيذ النقل</Button></div></Modal>
    <Modal open={!!detail} title="ملف العميل" onClose={()=>setDetail(null)} width={1000}>{detail&&<div><div className="detail-hero"><div><h3>{detail.customer.name}</h3><p>{detail.customer.code} • {detail.customer.representative_name||'بدون مندوب'} • {detail.customer.area||'بدون منطقة'}</p></div><StatusBadge status={detail.customer.status}/></div>
      <div className="mini-stats"><div><span>عدد عمليات القبض</span><strong>{detail.summary?.operations||0}</strong></div><div><span>إجمالي القبض</span><strong>{money(detail.summary?.collected)}</strong></div><div><span>العمولات</span><strong>{money(detail.summary?.commissions)}</strong></div><div><span>صافي الإدارة</span><strong>{money(detail.summary?.net)}</strong></div></div>
      <h3 className="section-title">سجل القبض المباشر</h3><DataTable rows={detail.collections} columns={[{key:'receipt_number',header:'الإيصال'},{key:'collection_date',header:'التاريخ'},{key:'representative_name',header:'المندوب'},{key:'amount',header:'المبلغ',render:r=>money(r.amount)},{key:'commission_percentage',header:'النسبة',render:r=>`${r.commission_percentage}%`},{key:'commission_amount',header:'العمولة',render:r=>money(r.commission_amount)},{key:'net_amount',header:'الصافي',render:r=>money(r.net_amount)},{key:'status',header:'الحالة',render:r=><StatusBadge status={r.status}/>} ]}/>
    </div>}</Modal>
  </>
}
