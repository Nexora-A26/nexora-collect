import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Confirm, Form, Input, Loading, Modal, PageHeader, SearchInput, Select, StatusBadge, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { today } from '../lib/utils';

const empty={number:'',customer_id:'',description:'',original_amount:'',commission_percentage:'',issue_date:today(),due_date:'',notes:''};
export default function ReceivablesPage(){
 const {money,can}=useAuth();const toast=useToast();
 const [rows,setRows]=useState<any[]>([]),[customers,setCustomers]=useState<any[]>([]),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[loading,setLoading]=useState(true);
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<any|null>(null),[form,setForm]=useState<any>(empty),[saving,setSaving]=useState(false),[remove,setRemove]=useState<any|null>(null);
 const load=async()=>{setLoading(true);try{const [r,c]=await Promise.all([window.nexora.receivables.list({search,status}),window.nexora.customers.list({status:'active'})]);setRows(r);setCustomers(c);}catch(e:any){toast.error(e.message)}finally{setLoading(false)}};
 useEffect(()=>{void load()},[search,status]);
 const save=async()=>{setSaving(true);try{const v={...form,customer_id:Number(form.customer_id)};editing?await window.nexora.receivables.update(editing.id,v):await window.nexora.receivables.create(v);toast.success(editing?'تم تعديل المبلغ المستحق.':'تمت إضافة المبلغ المستحق.');setOpen(false);await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 const doRemove=async()=>{if(!remove)return;setSaving(true);try{const r=await window.nexora.receivables.remove(remove.id);toast.success(r.cancelled?'تم إلغاء السجل لوجود عمليات قبض.':'تم حذف السجل.');setRemove(null);await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 return <><PageHeader title="المبالغ المستحقة" subtitle="إضافة المبالغ والفواتير ومتابعة الدفعات والمتبقي" actions={can('receivables','create')&&<Button onClick={()=>{setEditing(null);setForm(empty);setOpen(true)}}><Plus size={17}/>إضافة مبلغ</Button>}/>
 <Card><div className="toolbar"><SearchInput value={search} onChange={setSearch}/><Select value={status} onChange={e=>setStatus(e.target.value)}><option value="">كل الحالات</option><option value="unpaid">غير مدفوع</option><option value="partial">جزئي</option><option value="paid">مدفوع</option><option value="overdue">متأخر</option><option value="cancelled">ملغى</option></Select></div>{loading?<Loading/>:<DataTable rows={rows} columns={[
  {key:'number',header:'الرقم'},{key:'customer_name',header:'العميل'},{key:'representative_name',header:'المندوب'},{key:'description',header:'الوصف'},
  {key:'original_amount',header:'الأصل',render:r=>money(r.original_amount)},{key:'paid_amount',header:'المدفوع',render:r=>money(r.paid_amount)},{key:'remaining_amount',header:'المتبقي',render:r=>money(r.remaining_amount)},
  {key:'commission_percentage',header:'النسبة',render:r=>`${r.commission_percentage}%`},{key:'due_date',header:'الاستحقاق'},{key:'status',header:'الحالة',render:r=><StatusBadge status={r.status}/>},
  {key:'actions',header:'الإجراءات',render:r=><div className="row-actions">{can('receivables','edit')&&r.status!=='cancelled'&&<button onClick={()=>{setEditing(r);setForm({...r,customer_id:String(r.customer_id),original_amount:String(r.original_amount),commission_percentage:String(r.commission_percentage)});setOpen(true)}}><Pencil size={17}/></button>}{can('receivables','delete')&&<button className="danger" onClick={()=>setRemove(r)}><Trash2 size={17}/></button>}</div>}
 ]}/>}</Card>
 <Modal open={open} title={editing?'تعديل مبلغ مستحق':'إضافة مبلغ مستحق'} onClose={()=>setOpen(false)}><Form onSubmit={save}><div className="form-grid">
  <Input label="رقم السجل" placeholder="يُنشأ تلقائياً" value={form.number||''} onChange={e=>setForm({...form,number:e.target.value})}/><Select label="العميل *" required disabled={!!editing} value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}><option value="">اختر العميل</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} — {c.code}</option>)}</Select>
  <div className="full"><Input label="الوصف *" required value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></div><Input label="المبلغ *" type="number" min="0.0001" required value={form.original_amount} onChange={e=>setForm({...form,original_amount:e.target.value})}/>
  <Input label="نسبة العمولة %" type="number" min="0" max="100" step="0.01" value={form.commission_percentage??''} onChange={e=>setForm({...form,commission_percentage:e.target.value})} hint="اتركها فارغة لاستخدام نسبة العميل أو المندوب"/>
  <Input label="تاريخ التسجيل" type="date" required value={form.issue_date} onChange={e=>setForm({...form,issue_date:e.target.value})}/><Input label="تاريخ الاستحقاق" type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}/>
  <div className="full"><Textarea label="ملاحظات" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
 </div><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ</Button></div></Form></Modal>
 <Confirm open={!!remove} title="حذف أو إلغاء المبلغ" message="إذا كانت هناك عمليات قبض مرتبطة فسيتم إلغاء السجل بدلاً من حذفه." danger onCancel={()=>setRemove(null)} onConfirm={doRemove} loading={saving}/></>;
}
