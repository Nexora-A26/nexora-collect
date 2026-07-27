import React, { ReactNode, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3, BookOpenCheck, Building2, ChevronLeft, ClipboardList, Coins, FileBarChart,
  HandCoins, LayoutDashboard, LogOut, Menu, ReceiptText, ScrollText, Settings, ShieldCheck,
  Users, WalletCards, X
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { cx } from '../lib/utils';

const nav = [
  { key:'dashboard', path:'/', label:'لوحة التحكم', icon:LayoutDashboard },
  { key:'representatives', path:'/representatives', label:'المندوبون', icon:Users },
  { key:'customers', path:'/customers', label:'العملاء', icon:Building2 },
  { key:'receivables', path:'/receivables', label:'المبالغ المستحقة', icon:ClipboardList },
  { key:'collections', path:'/collections', label:'عمليات القبض', icon:ReceiptText },
  { key:'settlements', path:'/settlements', label:'تسليمات المندوبين', icon:HandCoins },
  { key:'balances', path:'/balances', label:'الأرصدة', icon:WalletCards },
  { key:'reports', path:'/reports', label:'التقارير', icon:FileBarChart },
  { key:'users', path:'/users', label:'المستخدمون والصلاحيات', icon:ShieldCheck },
  { key:'audit', path:'/audit', label:'سجل العمليات', icon:ScrollText },
  { key:'settings', path:'/settings', label:'الإعدادات', icon:Settings },
] as const;

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can, settings } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const currentLabel = useMemo(()=>nav.find((n)=>n.path==='/' ? location.pathname==='/' : location.pathname.startsWith(n.path))?.label || 'نكسورا للتحصيل',[location.pathname]);
  return <div className={cx('app-shell', collapsed && 'sidebar-collapsed')}>
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand-small"><Coins size={22}/></div><div><strong>نكسورا</strong><span>للتحصيل</span></div></div>
      <nav>{nav.filter((item)=>can(item.key as PageKey,'view')).map((item)=>{
        const Icon = item.icon;
        return <NavLink key={item.path} to={item.path} end={item.path==='/' } className={({isActive})=>cx('nav-item',isActive&&'active')} title={item.label}>
          <Icon size={20}/><span>{item.label}</span><ChevronLeft className="nav-arrow" size={15}/>
        </NavLink>;
      })}</nav>
      <div className="sidebar-footer"><button className="nav-item logout" onClick={()=>void logout()}><LogOut size={20}/><span>تسجيل الخروج</span></button></div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="topbar-title"><button className="icon-btn" onClick={()=>setCollapsed((v)=>!v)}>{collapsed?<Menu/>:<X/>}</button><div><strong>{currentLabel}</strong><span>{settings.organization_name || 'نكسورا للتحصيل'}</span></div></div>
        <div className="user-menu"><div className="user-avatar">{user.fullName.slice(0,1)}</div><div><strong>{user.fullName}</strong><span>{user.role==='admin'?'مدير النظام':user.role==='viewer'?'مشاهد':'مستخدم'}</span></div></div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
