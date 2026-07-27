import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Confirm, Form, Input, Loading, Modal, PageHeader, Select, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { paymentLabels, today } from '../lib/utils';

const empty={number:'',representative_id:'',amount:'',settlement_date:today(),payment_method:'cash',reference_number:'',received_by:'',notes:''};
export default function SettlementsPage(){
 const {money,can}=useAuth();const toast=useToast();
 const [rows,setRows]=useState<any[]>([]),[reps,setReps]=useState<any[]>([]),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[form,setForm]=useState<any>(empty),[balance,setBalance]=useState<any>(null),[saving,setSaving]=useState(false),[remove,setRemove]=useState<any|null>(null);
 const load=async()=>{setLoading(true);try{const [s,r]=await Promise.all([window.nexora.settlements.list({}),window.nexora.representatives.list({status:'active'})]);setRows(s);setReps(r);}catch(e:any){toast.error(e.message)}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const chooseRep=async(value:string)=>{setForm({...form,representative_id:value});if(value){try{setBalance(await window.nexora.settlements.balance(Number(value)))}catch(e:any){toast.error(e.message)}}else setBalance(null)};
 const save=async()=>{setSaving(true);try{await window.nexora.settlements.create({...form,representative_id:Number(form.representative_id)});toast.success('تم تسجيل تسليم المندوب.');setOpen(false);setForm(empty);setBalance(null);await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 const doRemove=async()=>{if(!remove)return;setSaving(true);try{await window.nexora.settlements.remove(remove.id);toast.success('تم حذف سجل التسليم.');setRemove(null);await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 return <><PageHeader title="تسليمات المندوبين" subtitle="تسجيل المبالغ التي سلّمها المندوبون إلى الإدارة" actions={can('settlements','create')&&<Button onClick={()=>{setForm(empty);setBalance(null);setOpen(true)}}><Plus size={17}/>تسجيل تسليم</Button>}/>
 <Card>{loading?<Loading/>:<DataTable rows={rows} columns={[{key:'number',header:'رقم السند'},{key:'settlement_date',header:'التاريخ'},{key:'representative_name',header:'المندوب'},{key:'amount',header:'المبلغ',render:r=>money(r.amount)},{key:'payment_method',header:'الطريقة',render:r=>paymentLabels[r.payment_method]||r.payment_method},{key:'reference_number',header:'المرجع'},{key:'received_by',header:'المستلم'},{key:'actions',header:'الإجراءات',render:r=>can('settlements','delete')?<div className="row-actions"><button className="danger" onClick={()=>setRemove(r)}><Trash2 size={17}/></button></div>:null}]}/>}</Card>
 <Modal open={open} title="تسجيل تسليم مندوب" onClose={()=>setOpen(false)}><Form onSubmit={save}><div className="form-grid">
  <Input label="رقم السند" placeholder="يُنشأ تلقائياً" value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/><Input label="التاريخ" type="date" required value={form.settlement_date} onChange={e=>setForm({...form,settlement_date:e.target.value})}/>
  <Select label="المندوب *" required value={form.representative_id} onChange={e=>void chooseRep(e.target.value)}><option value="">اختر المندوب</option>{reps.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select><Input label="المبلغ المسلم *" type="number" min="0.0001" max={balance?.outstanding} required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
  {balance&&<div className="full mini-stats compact"><div><span>المطلوب للإدارة</span><strong>{money(balance.due)}</strong></div><div><span>المسلم سابقاً</span><strong>{money(balance.delivered)}</strong></div><div><span>الرصيد الحالي</span><strong>{money(balance.outstanding)}</strong></div></div>}
  <Select label="طريقة التسليم" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{Object.entries(paymentLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><Input label="رقم المرجع" value={form.reference_number} onChange={e=>setForm({...form,reference_number:e.target.value})}/>
  <Input label="اسم المستلم" value={form.received_by} onChange={e=>setForm({...form,received_by:e.target.value})}/><div className="full"><Textarea label="ملاحظات" rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
 </div><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ</Button></div></Form></Modal>
 <Confirm open={!!remove} title="حذف سجل التسليم" message="سيؤثر الحذف على رصيد المندوب المستحق للإدارة." danger onCancel={()=>setRemove(null)} onConfirm={doRemove} loading={saving}/></>;
}
