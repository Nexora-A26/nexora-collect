import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Pencil, Plus, Printer, XCircle } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Form, Input, Loading, Modal, PageHeader, SearchInput, Select, StatusBadge, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { escapeHtml, paymentLabels, today } from '../lib/utils';

const newEmpty=()=>({
  operation_token:crypto.randomUUID(),
  receipt_number:'',
  representative_id:'',
  customer_id:'',
  amount:'',
  commission_percentage:'',
  collection_date:today(),
  payment_method:'cash',
  notes:'',
});

export default function CollectionsPage(){
 const {money,can}=useAuth();const toast=useToast();
 const [rows,setRows]=useState<any[]>([]),[representatives,setRepresentatives]=useState<any[]>([]),[customers,setCustomers]=useState<any[]>([]),[search,setSearch]=useState(''),[loading,setLoading]=useState(true);
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<any|null>(null),[form,setForm]=useState<any>(newEmpty()),[saving,setSaving]=useState(false),[cancel,setCancel]=useState<any|null>(null),[reason,setReason]=useState('');

 const load=async()=>{setLoading(true);try{
   const [r,reps,c]=await Promise.all([
     window.nexora.collections.list({search}),
     window.nexora.representatives.list({status:'active'}),
     window.nexora.customers.list({status:'active'}),
   ]);
   setRows(r);setRepresentatives(reps);setCustomers(c);
 }catch(e:any){toast.error(e.message)}finally{setLoading(false)}};
 useEffect(()=>{void load()},[search]);

 const selectedRepresentative=representatives.find(r=>String(r.id)===String(form.representative_id));
 const selectedCustomer=customers.find(c=>String(c.id)===String(form.customer_id));
 const availableCustomers=useMemo(()=>customers.filter(c=>!form.representative_id||!c.representative_id||String(c.representative_id)===String(form.representative_id)),[customers,form.representative_id]);
 const calc=useMemo(()=>{
   const amount=Number(form.amount||0);
   const percentage=Number(form.commission_percentage||0);
   const commission=Math.round((amount*percentage/100)*10000)/10000;
   return{amount,percentage,commission,net:amount-commission};
 },[form.amount,form.commission_percentage]);

 const defaultCommission=(customer:any,representative:any)=>{
   if(customer?.commission_percentage!==null&&customer?.commission_percentage!==undefined&&customer?.commission_percentage!=='')return String(customer.commission_percentage);
   if(representative?.default_commission!==null&&representative?.default_commission!==undefined)return String(representative.default_commission);
   return '0';
 };

 const showCreate=()=>{setEditing(null);setForm(newEmpty());setOpen(true)};
 const changeRepresentative=(value:string)=>{
   const rep=representatives.find(r=>String(r.id)===value);
   const currentCustomer=customers.find(c=>String(c.id)===String(form.customer_id));
   const customerAllowed=currentCustomer&&(!currentCustomer.representative_id||String(currentCustomer.representative_id)===value);
   const nextCustomer=customerAllowed?currentCustomer:null;
   setForm({...form,representative_id:value,customer_id:nextCustomer?String(nextCustomer.id):'',commission_percentage:defaultCommission(nextCustomer,rep)});
 };
 const changeCustomer=(value:string)=>{
   const customer=customers.find(c=>String(c.id)===value);
   const rep=representatives.find(r=>String(r.id)===String(form.representative_id));
   setForm({...form,customer_id:value,commission_percentage:defaultCommission(customer,rep)});
 };

 const save=async()=>{setSaving(true);try{
   if(!form.representative_id)throw new Error('اختر المندوب.');
   if(!form.customer_id)throw new Error('اختر العميل.');
   if(!(Number(form.amount)>0))throw new Error('أدخل مبلغ قبض أكبر من صفر.');
   const percentage=Number(form.commission_percentage||0);
   if(percentage<0||percentage>100)throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
   const v={...form,representative_id:Number(form.representative_id),customer_id:Number(form.customer_id),amount:Number(form.amount),commission_percentage:percentage};
   editing?await window.nexora.collections.update(editing.id,v):await window.nexora.collections.create(v);
   toast.success(editing?'تم تعديل عملية القبض وحساب النتيجة.':`تم تسجيل القبض. العمولة ${money(calc.commission)} — صافي الإدارة ${money(calc.net)}`);
   setOpen(false);await load();
 }catch(e:any){toast.error(e.message)}finally{setSaving(false)}};

 const doCancel=async()=>{if(!cancel)return;setSaving(true);try{await window.nexora.collections.cancel(cancel.id,reason);toast.success('تم إلغاء عملية القبض وإعادة احتساب الأرصدة.');setCancel(null);setReason('');await load();}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};

 const printReceipt=async(id:number)=>{try{
   const {receipt,settings:s}=await window.nexora.collections.receipt(id);
   const html=`<h1>${escapeHtml(s.organization_name)}</h1><h2>إيصال قبض رقم ${escapeHtml(receipt.receipt_number)}</h2><div class="meta"><span>التاريخ: ${escapeHtml(receipt.collection_date)}</span><span>طريقة الدفع: ${escapeHtml(paymentLabels[receipt.payment_method]||receipt.payment_method)}</span></div><table><tbody><tr><th>المندوب</th><td>${escapeHtml(receipt.representative_name||'—')}</td></tr><tr><th>العميل</th><td>${escapeHtml(receipt.customer_name)}</td></tr><tr><th>المبلغ المقبوض</th><td>${escapeHtml(money(receipt.amount))}</td></tr><tr><th>نسبة العمولة</th><td>${escapeHtml(receipt.commission_percentage)}%</td></tr><tr><th>قيمة العمولة</th><td>${escapeHtml(money(receipt.commission_amount))}</td></tr><tr><th>صافي الإدارة</th><td>${escapeHtml(money(receipt.net_amount))}</td></tr><tr><th>ملاحظات</th><td>${escapeHtml(receipt.notes||'—')}</td></tr></tbody></table><p style="margin-top:40px;text-align:left">المستلم: ${escapeHtml(receipt.created_by_name||'')}</p>`;
   await window.nexora.export.pdf(`إيصال-${receipt.receipt_number}`,html);toast.success('تم إنشاء ملف PDF للإيصال.');
 }catch(e:any){toast.error(e.message)}};

 return <><PageHeader title="عمليات القبض" subtitle="اختر المندوب والعميل، أدخل المبلغ ونسبة العمولة، وستظهر النتيجة مباشرة" actions={can('collections','create')&&<Button onClick={showCreate}><Plus size={17}/>قبض مباشر</Button>}/>
 <Card><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="بحث برقم الإيصال أو العميل أو المندوب"/></div>{loading?<Loading/>:<DataTable rows={rows} columns={[
  {key:'receipt_number',header:'الإيصال'},{key:'collection_date',header:'التاريخ'},{key:'representative_name',header:'المندوب'},{key:'customer_name',header:'العميل'},
  {key:'amount',header:'المبلغ المقبوض',render:r=>money(r.amount)},{key:'commission_percentage',header:'النسبة',render:r=>`${r.commission_percentage}%`},{key:'commission_amount',header:'العمولة',render:r=>money(r.commission_amount)},{key:'net_amount',header:'صافي الإدارة',render:r=><strong>{money(r.net_amount)}</strong>},
  {key:'payment_method',header:'الدفع',render:r=>paymentLabels[r.payment_method]||r.payment_method},{key:'status',header:'الحالة',render:r=><StatusBadge status={r.status}/>},{key:'actions',header:'الإجراءات',render:r=><div className="row-actions"><button onClick={()=>void printReceipt(r.id)} title="PDF"><Printer size={17}/></button>{can('collections','edit')&&r.status==='active'&&<button onClick={()=>{setEditing(r);setForm({...r,representative_id:String(r.representative_id??''),customer_id:String(r.customer_id),amount:String(r.amount),commission_percentage:String(r.commission_percentage)});setOpen(true)}} title="تعديل"><Pencil size={17}/></button>}{can('collections','delete')&&r.status==='active'&&<button className="danger" onClick={()=>setCancel(r)} title="إلغاء"><XCircle size={17}/></button>}</div>}
 ]}/>}</Card>

 <Modal open={open} title={editing?'تعديل عملية القبض':'تسجيل قبض مباشر'} onClose={()=>setOpen(false)} width={900}><Form onSubmit={save}><div className="form-grid">
  <Input label="رقم الإيصال" placeholder="يُنشأ تلقائياً" value={form.receipt_number||''} onChange={e=>setForm({...form,receipt_number:e.target.value})}/><Input label="تاريخ القبض" type="date" required value={form.collection_date} onChange={e=>setForm({...form,collection_date:e.target.value})}/>
  <Select label="المندوب *" required value={form.representative_id} onChange={e=>changeRepresentative(e.target.value)}><option value="">اختر المندوب</option>{representatives.map(r=><option key={r.id} value={r.id}>{r.name} — الافتراضي {r.default_commission}%</option>)}</Select>
  <Select label="العميل *" required disabled={!form.representative_id} value={form.customer_id} onChange={e=>changeCustomer(e.target.value)}><option value="">{form.representative_id?'اختر العميل':'اختر المندوب أولاً'}</option>{availableCustomers.map(c=><option key={c.id} value={c.id}>{c.name}{c.area?` — ${c.area}`:''}</option>)}</Select>
  <Input label="المبلغ المقبوض *" type="number" min="0.0001" step="0.0001" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/><Input label="نسبة العمولة % *" type="number" min="0" max="100" step="0.01" required value={form.commission_percentage} onChange={e=>setForm({...form,commission_percentage:e.target.value})} hint={selectedCustomer?.commission_percentage!=null?'تم تحميل النسبة الخاصة بالعميل':selectedRepresentative?'تم تحميل النسبة الافتراضية للمندوب':'أدخل النسبة'}/>
  <Select label="طريقة الدفع" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{Object.entries(paymentLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <div className="direct-result-card"><div className="direct-result-title"><Calculator size={20}/><span>النتيجة المباشرة</span></div><div className="direct-result-grid"><div><span>المبلغ المقبوض</span><strong>{money(calc.amount)}</strong></div><div><span>عمولة المندوب ({calc.percentage}%)</span><strong>{money(calc.commission)}</strong></div><div className="net-result"><span>صافي الإدارة</span><strong>{money(calc.net)}</strong></div></div></div>
  <div className="full"><Textarea label="ملاحظات" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
 </div><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ عملية القبض</Button></div></Form></Modal>

 <Modal open={!!cancel} title="إلغاء عملية القبض" onClose={()=>setCancel(null)} width={520}><Textarea label="سبب الإلغاء" rows={3} value={reason} onChange={e=>setReason(e.target.value)}/><div className="warning-box">سيتم إلغاء العملية وإعادة احتساب عمولة المندوب وصافي الإدارة ورصيد التسليم.</div><div className="modal-actions"><Button variant="secondary" onClick={()=>setCancel(null)}>تراجع</Button><Button variant="danger" loading={saving} onClick={doCancel}>تأكيد الإلغاء</Button></div></Modal>
 </>;
}
