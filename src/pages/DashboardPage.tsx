import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  Building2,
  ChartNoAxesColumn,
  HandCoins,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { Button, Card, Empty, Loading, PageHeader } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useAuth } from '../components/AuthContext';
import { paymentLabels } from '../lib/utils';

type DashboardData = {
  totals: {
    representatives: number;
    customers: number;
    operations: number;
    collected: number;
    commissions: number;
    net: number;
    delivered: number;
    outstanding: number;
    today: number;
    month: number;
  };
  recent: any[];
  trend: Array<{ date: string; amount: number }>;
  topReps: Array<{ name: string; amount: number }>;
  topCustomers: Array<{ name: string; amount: number }>;
};

const emptyDashboard: DashboardData = {
  totals: {
    representatives: 0,
    customers: 0,
    operations: 0,
    collected: 0,
    commissions: 0,
    net: 0,
    delivered: 0,
    outstanding: 0,
    today: 0,
    month: 0,
  },
  recent: [],
  trend: [],
  topReps: [],
  topCustomers: [],
};

function finiteNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeRows(input: unknown) {
  return Array.isArray(input) ? input : [];
}

function normalizeDashboard(input: any): DashboardData {
  const source = input && typeof input === 'object' ? input : {};
  const totals = source.totals && typeof source.totals === 'object' ? source.totals : {};
  return {
    totals: {
      representatives: finiteNumber(totals.representatives),
      customers: finiteNumber(totals.customers),
      operations: finiteNumber(totals.operations),
      collected: finiteNumber(totals.collected),
      commissions: finiteNumber(totals.commissions),
      net: finiteNumber(totals.net),
      delivered: finiteNumber(totals.delivered),
      outstanding: finiteNumber(totals.outstanding),
      today: finiteNumber(totals.today),
      month: finiteNumber(totals.month),
    },
    recent: normalizeRows(source.recent),
    trend: normalizeRows(source.trend).map((row: any) => ({
      date: String(row?.date || ''),
      amount: finiteNumber(row?.amount),
    })),
    topReps: normalizeRows(source.topReps).map((row: any) => ({
      name: String(row?.name || 'غير محدد'),
      amount: finiteNumber(row?.amount),
    })),
    topCustomers: normalizeRows(source.topCustomers).map((row: any) => ({
      name: String(row?.name || 'غير محدد'),
      amount: finiteNumber(row?.amount),
    })),
  };
}

function fillLastThirtyDays(rows: Array<{ date: string; amount: number }>) {
  const source = new Map(rows.map((row) => [row.date, finiteNumber(row.amount)]));
  const result: Array<{ date: string; label: string; amount: number }> = [];
  const today = new Date();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setHours(12, 0, 0, 0);
    day.setDate(today.getDate() - offset);
    const key = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
    result.push({
      date: key,
      label: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`,
      amount: source.get(key) || 0,
    });
  }
  return result;
}

export default function DashboardPage() {
  const { money } = useAuth();
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await window.nexora.dashboard.get();
      setData(normalizeDashboard(response));
      setUpdatedAt(new Date());
    } catch (requestError: any) {
      setData(emptyDashboard);
      setError(requestError?.message || 'تعذر تحميل بيانات لوحة التحكم.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const trend = useMemo(() => fillLastThirtyDays(data.trend), [data.trend]);
  const totalTrend = useMemo(() => trend.reduce((sum, row) => sum + row.amount, 0), [trend]);
  const t = data.totals;

  const cards = [
    ['إجمالي المندوبين', t.representatives, Users],
    ['إجمالي العملاء', t.customers, Building2],
    ['عدد عمليات القبض', t.operations, ReceiptText],
    ['إجمالي المبالغ المقبوضة', money(t.collected), Banknote],
    ['عمولات المندوبين', money(t.commissions), HandCoins],
    ['صافي الإدارة', money(t.net), Wallet],
    ['المبالغ المسلّمة', money(t.delivered), WalletCards],
    ['المتبقي مع المندوبين', money(t.outstanding), WalletCards],
    ['تحصيلات اليوم', money(t.today), TrendingUp],
    ['تحصيلات الشهر', money(t.month), ChartNoAxesColumn],
  ];

  const compactNumber = (value: unknown) => new Intl.NumberFormat('ar-IQ', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(finiteNumber(value));

  if (loading && !updatedAt) return <Loading />;

  return <div>
    <PageHeader
      title="لوحة التحكم"
      subtitle={updatedAt ? `آخر تحديث: ${updatedAt.toLocaleString('ar-IQ')}` : 'ملخص مباشر لعمليات القبض والعمولات والأرصدة'}
      actions={<Button variant="secondary" loading={loading} onClick={() => void loadDashboard()}><RefreshCw size={17}/>تحديث البيانات</Button>}
    />

    {error && <div className="error-box dashboard-error"><strong>تعذر تحميل لوحة التحكم.</strong><span>{error}</span><Button variant="secondary" onClick={() => void loadDashboard()}>إعادة المحاولة</Button></div>}

    <div className="stats-grid dashboard-stats-grid">
      {cards.map(([label, value, Icon]: any) => <Card key={label} className="stat-card">
        <div className="stat-icon"><Icon size={22}/></div>
        <div><span>{label}</span><strong>{value}</strong></div>
      </Card>)}
    </div>

    <div className="dashboard-charts-grid">
      <Card className="dashboard-chart-wide">
        <div className="card-title"><h3>التحصيلات خلال آخر 30 يوماً</h3><span>{money(totalTrend)}</span></div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs><linearGradient id="dashboardTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.35}/><stop offset="95%" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false}/>
              <XAxis dataKey="label" interval={4} tick={{ fontSize: 11 }}/>
              <YAxis tickFormatter={compactNumber} tick={{ fontSize: 11 }} width={58}/>
              <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''} formatter={(value) => [money(finiteNumber(value)), 'المبلغ']}/>
              <Area type="monotone" dataKey="amount" stroke="#0f766e" strokeWidth={2.5} fill="url(#dashboardTrend)" connectNulls/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="card-title"><h3>أفضل المندوبين تحصيلاً</h3><span>{data.topReps.length} مندوب</span></div>
        {data.topReps.length ? <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={data.topReps} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
              <XAxis type="number" tickFormatter={compactNumber} tick={{ fontSize: 11 }}/>
              <YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 11 }}/>
              <Tooltip formatter={(value) => [money(finiteNumber(value)), 'المبلغ']}/>
              <Bar dataKey="amount" fill="#0891b2" radius={[6, 0, 0, 6]}/>
            </BarChart>
          </ResponsiveContainer>
        </div> : <Empty title="لا توجد تحصيلات للمندوبين" message="ستظهر البيانات بعد تسجيل أول عملية قبض."/>}
      </Card>

      <Card>
        <div className="card-title"><h3>أفضل العملاء تحصيلاً</h3><span>{data.topCustomers.length} عميل</span></div>
        {data.topCustomers.length ? <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={data.topCustomers} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
              <XAxis type="number" tickFormatter={compactNumber} tick={{ fontSize: 11 }}/>
              <YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 11 }}/>
              <Tooltip formatter={(value) => [money(finiteNumber(value)), 'المبلغ']}/>
              <Bar dataKey="amount" fill="#0f766e" radius={[6, 0, 0, 6]}/>
            </BarChart>
          </ResponsiveContainer>
        </div> : <Empty title="لا توجد تحصيلات للعملاء" message="ستظهر البيانات بعد تسجيل أول عملية قبض."/>}
      </Card>
    </div>

    <Card>
      <div className="card-title"><h3>آخر عمليات القبض</h3><span>{data.recent.length} عملية</span></div>
      <DataTable rows={data.recent} columns={[
        { key: 'receipt_number', header: 'رقم الإيصال' },
        { key: 'representative_name', header: 'المندوب' },
        { key: 'customer_name', header: 'العميل' },
        { key: 'amount', header: 'المبلغ', render: (row) => money(finiteNumber(row.amount)) },
        { key: 'commission_amount', header: 'العمولة', render: (row) => money(finiteNumber(row.commission_amount)) },
        { key: 'net_amount', header: 'صافي الإدارة', render: (row) => <strong>{money(finiteNumber(row.net_amount))}</strong> },
        { key: 'collection_date', header: 'التاريخ' },
        { key: 'payment_method', header: 'الدفع', render: (row) => paymentLabels[row.payment_method] || row.payment_method || '-' },
      ]}/>
    </Card>
  </div>;
}
