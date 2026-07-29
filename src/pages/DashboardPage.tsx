import React, { useEffect, useState } from 'react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { Banknote, Building2, ChartNoAxesColumn, HandCoins, ReceiptText, TrendingUp, Users, Wallet, WalletCards } from 'lucide-react';
import { Card, Loading, PageHeader } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { paymentLabels } from '../lib/utils';

export default function DashboardPage() {
  const { money } = useAuth();
  const [data,setData] = useState<any>(null);
  const [error,setError] = useState('');
  useEffect(()=>{ window.nexora.dashboard.get().then(setData).catch((e)=>setError(e.message)); },[]);
  if (!data) return <Loading/>;
  const t=data.totals;
  const cards=[
    ['إجمالي المندوبين',t.representatives,Users],
    ['إجمالي العملاء',t.customers,Building2],
    ['عدد عمليات القبض',t.operations,ReceiptText],
    ['إجمالي المبالغ المقبوضة',money(t.collected),Banknote],
    ['عمولات المندوبين',money(t.commissions),HandCoins],
    ['صافي الإدارة',money(t.net),Wallet],
    ['المتبقي مع المندوبين',money(t.outstanding),WalletCards],
    ['تحصيلات اليوم',money(t.today),TrendingUp],
    ['تحصيلات الشهر',money(t.month),ChartNoAxesColumn],
  ];
  return <div>
    <PageHeader title="لوحة التحكم" subtitle="ملخص مباشر لعمليات القبض والعمولات وصافي الإدارة"/>
    {error && <div className="error-box">{error}</div>}
    <div className="stats-grid">{cards.map(([label,value,Icon]:any)=><Card key={label} className="stat-card"><div className="stat-icon"><Icon size={22}/></div><div><span>{label}</span><strong>{value}</strong></div></Card>)}</div>
    <div className="charts-grid">
      <Card><div className="card-title"><h3>التحصيلات خلال 30 يوماً</h3></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend}><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.35}/><stop offset="95%" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip formatter={(v)=>money(v)}/><Area type="monotone" dataKey="amount" stroke="#0f766e" fill="url(#g)"/></AreaChart></ResponsiveContainer></div></Card>
      <Card><div className="card-title"><h3>أفضل المندوبين تحصيلاً</h3></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.topReps} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="name" width={90}/><Tooltip formatter={(v)=>money(v)}/><Bar dataKey="amount" fill="#0891b2" radius={[6,0,0,6]}/></BarChart></ResponsiveContainer></div></Card>
    </div>
    <Card><div className="card-title"><h3>آخر عمليات القبض</h3></div><DataTable rows={data.recent} columns={[
      {key:'receipt_number',header:'رقم الإيصال'},{key:'representative_name',header:'المندوب'},{key:'customer_name',header:'العميل'},
      {key:'amount',header:'المبلغ',render:(r)=>money(r.amount)},{key:'commission_amount',header:'العمولة',render:(r)=>money(r.commission_amount)},
      {key:'net_amount',header:'صافي الإدارة',render:(r)=><strong>{money(r.net_amount)}</strong>},{key:'collection_date',header:'التاريخ'},{key:'payment_method',header:'الدفع',render:(r)=>paymentLabels[r.payment_method]||r.payment_method},
    ]}/></Card>
  </div>;
}
