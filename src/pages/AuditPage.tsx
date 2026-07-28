import React, { useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { actionLabels, entityLabels } from '../lib/utils';
import { Card, Input, Loading, PageHeader, SearchInput, Select } from '../components/ui';
import { useToast } from '../components/Toast';

export default function AuditPage(){
 const toast=useToast();const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[filters,setFilters]=useState({search:'',entityType:'',action:'',dateFrom:'',dateTo:''});
 const load=async()=>{setLoading(true);try{setRows(await window.nexora.audit.list(filters))}catch(e:any){toast.error(e.message)}finally{setLoading(false)}};
 useEffect(()=>{const t=setTimeout(()=>void load(),250);return()=>clearTimeout(t)},[filters]);
 return <><PageHeader title="سجل العمليات" subtitle="سجل غير قابل للتعديل لكل العمليات الإدارية والمالية"/><Card><div className="toolbar audit-filters"><SearchInput value={filters.search} onChange={v=>setFilters({...filters,search:v})}/><Select value={filters.entityType} onChange={e=>setFilters({...filters,entityType:e.target.value})}><option value="">كل الأقسام</option>{Object.entries(entityLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><Select value={filters.action} onChange={e=>setFilters({...filters,action:e.target.value})}><option value="">كل العمليات</option>{Object.entries(actionLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><Input type="date" value={filters.dateFrom} onChange={e=>setFilters({...filters,dateFrom:e.target.value})}/><Input type="date" value={filters.dateTo} onChange={e=>setFilters({...filters,dateTo:e.target.value})}/></div>{loading?<Loading/>:<DataTable rows={rows} columns={[{key:'created_at',header:'التاريخ والوقت',render:r=>new Date(r.created_at).toLocaleString('ar-IQ')},{key:'username',header:'المستخدم'},{key:'action',header:'العملية',render:r=>actionLabels[r.action]||r.action},{key:'entity_type',header:'القسم',render:r=>entityLabels[r.entity_type]||r.entity_type},{key:'entity_id',header:'رقم السجل'},{key:'new_values',header:'التفاصيل',render:r=><code className="audit-json">{r.new_values?String(r.new_values).slice(0,160):'—'}</code>}]}/>}</Card></>;
}
