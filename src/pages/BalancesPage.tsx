import React, { useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { Card, Loading, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

export default function BalancesPage(){
 const {money}=useAuth();const toast=useToast();const [data,setData]=useState<any>(null);
 useEffect(()=>{window.nexora.balances.list().then(setData).catch((e)=>toast.error(e.message))},[]);
 if(!data)return <Loading/>;
 return <><PageHeader title="الأرصدة" subtitle="أرصدة العملاء والمندوبين محسوبة مباشرة من العمليات المالية"/>
 <Card><div className="card-title"><h3>أرصدة المندوبين</h3></div><DataTable rows={data.representatives} columns={[{key:'code',header:'الكود'},{key:'name',header:'المندوب'},{key:'collected',header:'إجمالي التحصيل',render:r=>money(r.collected)},{key:'commissions',header:'العمولات',render:r=>money(r.commissions)},{key:'due_to_admin',header:'المطلوب للإدارة',render:r=>money(r.due_to_admin)},{key:'delivered',header:'المسلم',render:r=>money(r.delivered)},{key:'outstanding',header:'المتبقي مع المندوب',render:r=><strong>{money(r.outstanding)}</strong>} ]}/></Card>
 <Card><div className="card-title"><h3>أرصدة العملاء</h3></div><DataTable rows={data.customers} columns={[{key:'code',header:'الكود'},{key:'name',header:'العميل'},{key:'representative_name',header:'المندوب'},{key:'receivables',header:'إجمالي المستحق',render:r=>money(r.receivables)},{key:'collected',header:'المحصل',render:r=>money(r.collected)},{key:'remaining',header:'المتبقي',render:r=><strong>{money(r.remaining)}</strong>} ]}/></Card></>;
}
