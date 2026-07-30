import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Play } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Button, Card, Input, PageHeader, Select } from '../components/ui';
import { useToast } from '../components/Toast';
import { exportExcel, tableHtml } from '../lib/export';
import { paymentLabels, statusLabels } from '../lib/utils';

const reportTypes = [
  ['representatives','تقرير المندوبين'],['customers','تقرير العملاء'],
  ['collections','تقرير التحصيلات'],['commissions','تقرير العمولات'],['settlements','تقرير تسليمات المندوبين'],
];
type ReportConfig = { headers: Record<string,string>; money: string[]; sum: string[] };
const config: Record<string,ReportConfig> = {
 representatives:{headers:{code:'الكود',name:'المندوب',customers:'عدد العملاء',operations:'عدد العمليات',collected:'المحصل',commissions:'العمولات',net:'صافي الإدارة',delivered:'المسلم'},money:['collected','commissions','net','delivered'],sum:['customers','operations','collected','commissions','net','delivered']},
 customers:{headers:{code:'الكود',name:'العميل',representative_name:'المندوب',area:'المنطقة',operations:'عدد العمليات',collected:'المحصل',commissions:'العمولات',net:'صافي الإدارة'},money:['collected','commissions','net'],sum:['operations','collected','commissions','net']},
 collections:{headers:{receipt_number:'الإيصال',collection_date:'التاريخ',representative_name:'المندوب',customer_name:'العميل',amount:'المبلغ',commission_percentage:'النسبة %',commission_amount:'العمولة',net_amount:'صافي الإدارة',payment_method:'الدفع',status:'الحالة'},money:['amount','commission_amount','net_amount'],sum:['amount','commission_amount','net_amount']},
 commissions:{headers:{receipt_number:'الإيصال',collection_date:'التاريخ',representative_name:'المندوب',customer_name:'العميل',amount:'المبلغ',commission_percentage:'النسبة %',commission_amount:'العمولة',net_amount:'صافي الإدارة',payment_method:'الدفع',status:'الحالة'},money:['amount','commission_amount','net_amount'],sum:['amount','commission_amount','net_amount']},
 settlements:{headers:{number:'السند',settlement_date:'التاريخ',representative_name:'المندوب',amount:'المبلغ',payment_method:'الطريقة',reference_number:'المرجع',received_by:'المستلم',notes:'ملاحظات'},money:['amount'],sum:['amount']},
};
export default function ReportsPage(){
 const {money,can}=useAuth();const toast=useToast();
 const [type,setType]=useState('collections'),[filters,setFilters]=useState<any>({dateFrom:'',dateTo:'',representativeId:'',customerId:'',area:'',paymentMethod:''}),[rows,setRows]=useState<any[]>([]),[reps,setReps]=useState<any[]>([]),[customers,setCustomers]=useState<any[]>([]),[loading,setLoading]=useState(false);
 useEffect(()=>{Promise.all([window.nexora.representatives.list({}),window.nexora.customers.list({})]).then(([r,c])=>{setReps(r);setCustomers(c)}).catch(e=>toast.error(e.message))},[]);
 const cfg=config[type];
 const displayRows=useMemo(()=>rows.map(r=>Object.fromEntries(Object.keys(cfg.headers).map(k=>[k,cfg.money.includes(k)?money(r[k]):k==='payment_method'?(paymentLabels[r[k]]||r[k]):k==='status'?(statusLabels[r[k]]||r[k]):r[k]??'']))),[rows,cfg,money]);
 const totalRow=useMemo(()=>{
  if(!rows.length)return null;
  const keys=Object.keys(cfg.headers);
  const firstKey=keys[0];
  const result:Record<string,any>={__isTotal:true};
  for(const key of keys){
   if(key===firstKey){result[key]='الإجمالي / Total';continue;}
   if(!cfg.sum.includes(key)){result[key]='';continue;}
   const total=rows.reduce((sum,row)=>sum+Number(row[key]||0),0);
   result[key]=cfg.money.includes(key)?money(total):new Intl.NumberFormat('en-US').format(total);
  }
  return result;
 },[rows,cfg,money]);
 const tableRows=useMemo(()=>totalRow?[...displayRows,totalRow]:displayRows,[displayRows,totalRow]);
 const pdfHeaders=useMemo(()=>Object.fromEntries(Object.entries(cfg.headers).filter(([key])=>key!=='net'&&key!=='net_amount')),[cfg]);
 const excelRows=useMemo(()=>{
  const keys=Object.keys(cfg.headers);
  const normalized=rows.map(row=>Object.fromEntries(keys.map(key=>{
   if(key==='payment_method')return [key,paymentLabels[row[key]]||row[key]||''];
   if(key==='status')return [key,statusLabels[row[key]]||row[key]||''];
   if(cfg.money.includes(key)||cfg.sum.includes(key)||key==='commission_percentage')return [key,Number(row[key]||0)];
   return [key,row[key]??''];
  })));
  if(!rows.length)return normalized;
  const firstKey=keys[0];
  const total:Record<string,any>={__isTotal:true};
  for(const key of keys){
   if(key===firstKey){total[key]='الإجمالي / Total';continue;}
   total[key]=cfg.sum.includes(key)?rows.reduce((sum,row)=>sum+Number(row[key]||0),0):'';
  }
  return [...normalized,total];
 },[rows,cfg]);
 const run=async()=>{setLoading(true);try{setRows(await window.nexora.reports.run(type,filters));}catch(e:any){toast.error(e.message)}finally{setLoading(false)}};
 const title=reportTypes.find(x=>x[0]===type)?.[1]||'تقرير';
 const excel=async()=>{try{const result=await exportExcel(title,excelRows,cfg.headers);if(!result?.canceled)toast.success('تم إنشاء ملف Excel مع صف الإجمالي.')}catch(e:any){toast.error(e.message)}};
 const pdf=async()=>{try{await window.nexora.export.pdf(title,tableHtml(title,tableRows,pdfHeaders));toast.success('تم إنشاء ملف PDF مع الإجمالي وبدون صافي الإدارة.')}catch(e:any){toast.error(e.message)}};
 return <><PageHeader title="التقارير" subtitle="تقارير التحصيل والعمولات والتسليمات قابلة للتصفية والتصدير" actions={can('reports','export')&&rows.length>0&&<><Button variant="secondary" onClick={()=>void excel()}><FileSpreadsheet size={17}/>Excel</Button><Button variant="secondary" onClick={()=>void pdf()}><FileDown size={17}/>PDF</Button></>}/>
 <Card><div className="report-filters"><Select label="نوع التقرير" value={type} onChange={e=>{setType(e.target.value);setRows([])}}>{reportTypes.map(([k,l])=><option key={k} value={k}>{l}</option>)}</Select><Input label="من تاريخ" type="date" value={filters.dateFrom} onChange={e=>setFilters({...filters,dateFrom:e.target.value})}/><Input label="إلى تاريخ" type="date" value={filters.dateTo} onChange={e=>setFilters({...filters,dateTo:e.target.value})}/><Select label="المندوب" value={filters.representativeId} onChange={e=>setFilters({...filters,representativeId:e.target.value,customerId:''})}><option value="">الكل</option>{reps.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select><Select label="العميل" value={filters.customerId} onChange={e=>setFilters({...filters,customerId:e.target.value})}><option value="">الكل</option>{customers.filter(c=>!filters.representativeId||String(c.representative_id)===String(filters.representativeId)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Input label="المنطقة" value={filters.area} onChange={e=>setFilters({...filters,area:e.target.value})}/><Select label="طريقة الدفع" value={filters.paymentMethod} onChange={e=>setFilters({...filters,paymentMethod:e.target.value})}><option value="">الكل</option>{Object.entries(paymentLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><div className="filter-submit"><Button loading={loading} onClick={()=>void run()}><Play size={16}/>تشغيل التقرير</Button></div></div></Card>
 <Card><div className="card-title"><h3>{title}</h3><span>{rows.length} سجل</span></div><DataTable rows={tableRows} keyField="__index" columns={Object.entries(cfg.headers).map(([key,header])=>({key,header}))}/></Card>
 </>;
}
