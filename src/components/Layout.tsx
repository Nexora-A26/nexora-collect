import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Building2, ClipboardList, FileBarChart, HandCoins, LayoutDashboard, LogOut,
  Menu, ReceiptText, ScrollText, Settings, ShieldCheck, Users, WalletCards, X,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { cx } from '../lib/utils';

type NavItem = {
  key: PageKey;
  path: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [
      { key:'dashboard', path:'/', label:'لوحة التحكم', icon:LayoutDashboard },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { key:'representatives', path:'/representatives', label:'المندوبون', icon:Users },
      { key:'customers', path:'/customers', label:'العملاء', icon:Building2 },
      { key:'receivables', path:'/receivables', label:'المبالغ المستحقة', icon:ClipboardList },
      { key:'collections', path:'/collections', label:'عمليات القبض', icon:ReceiptText },
      { key:'settlements', path:'/settlements', label:'تسليمات المندوبين', icon:HandCoins },
      { key:'balances', path:'/balances', label:'الأرصدة', icon:WalletCards },
    ],
  },
  {
    title: 'التحليل والتقارير',
    items: [
      { key:'reports', path:'/reports', label:'التقارير', icon:FileBarChart },
    ],
  },
  {
    title: 'النظام',
    items: [
      { key:'users', path:'/users', label:'المستخدمون والصلاحيات', icon:ShieldCheck },
      { key:'audit', path:'/audit', label:'سجل العمليات', icon:ScrollText },
      { key:'settings', path:'/settings', label:'الإعدادات', icon:Settings },
    ],
  },
];

const allNav = navGroups.flatMap((group)=>group.items);

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout, can } = useAuth();

  return <div className="sidebar-inner">
    <div className="sidebar-brand premium-brand">
      <div className="sidebar-logo-frame">
        <img className="brand-small brand-image" src="./app-icon-white.png" alt="Nexora Collect" />
      </div>
      <div className="sidebar-brand-copy">
        <strong>Nexora Collect</strong>
        <span>نكسورا للتحصيل</span>
      </div>
    </div>

    <nav className="sidebar-nav" aria-label="القائمة الرئيسية">
      {navGroups.map((group)=>{
        const visibleItems = group.items.filter((item)=>can(item.key,'view'));
        if (!visibleItems.length) return null;
        return <section className="nav-group" key={group.title}>
          <div className="nav-group-label">{group.title}</div>
          <div className="nav-group-items">
            {visibleItems.map((item)=>{
              const Icon = item.icon;
              return <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={onNavigate}
                className={({isActive})=>cx('nav-item',isActive&&'active')}
                title={item.label}
              >
                <span className="nav-icon"><Icon size={20} strokeWidth={1.8}/></span>
                <span className="nav-label">{item.label}</span>
              </NavLink>;
            })}
          </div>
        </section>;
      })}
    </nav>

    <div className="sidebar-footer premium-footer">
      <div className="sidebar-user-card">
        <div className="sidebar-user-avatar">{user.fullName.slice(0,1)}</div>
        <div className="sidebar-user-copy">
          <strong>{user.fullName}</strong>
          <span>{user.role==='admin'?'مدير النظام':user.role==='viewer'?'مشاهد':'مستخدم'}</span>
        </div>
        <button className="sidebar-logout-btn" onClick={()=>void logout()} title="تسجيل الخروج" aria-label="تسجيل الخروج">
          <LogOut size={18} strokeWidth={1.8}/>
        </button>
      </div>
    </div>
  </div>;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, settings } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const currentLabel = useMemo(()=>allNav.find((n)=>n.path==='/' ? location.pathname==='/' : location.pathname.startsWith(n.path))?.label || 'نكسورا للتحصيل',[location.pathname]);

  useEffect(()=>{
    setMobileOpen(false);
  },[location.pathname]);

  useEffect(()=>{
    const original = document.body.style.overflow;
    if (mobileOpen) document.body.style.overflow = 'hidden';
    return ()=>{ document.body.style.overflow = original; };
  },[mobileOpen]);

  return <div className="app-shell premium-shell">
    <aside className="sidebar desktop-sidebar">
      <SidebarContent />
    </aside>

    <div className={cx('mobile-sidebar-layer', mobileOpen && 'open')} aria-hidden={!mobileOpen}>
      <button className="mobile-sidebar-backdrop" onClick={()=>setMobileOpen(false)} aria-label="إغلاق القائمة" />
      <aside className="sidebar mobile-sidebar" role="dialog" aria-modal="true" aria-label="القائمة الجانبية">
        <button className="mobile-sidebar-close" onClick={()=>setMobileOpen(false)} aria-label="إغلاق">
          <X size={20}/>
        </button>
        <SidebarContent onNavigate={()=>setMobileOpen(false)} />
      </aside>
    </div>

    <div className="main-area">
      <header className="topbar">
        <div className="topbar-title">
          <button className="icon-btn mobile-menu-btn" onClick={()=>setMobileOpen(true)} aria-label="فتح القائمة"><Menu size={22}/></button>
          <div><strong>{currentLabel}</strong><span>{settings.organization_name || 'نكسورا للتحصيل'}</span></div>
        </div>
        <div className="user-menu">
          <div className="user-avatar">{user.fullName.slice(0,1)}</div>
          <div><strong>{user.fullName}</strong><span>{user.role==='admin'?'مدير النظام':user.role==='viewer'?'مشاهد':'مستخدم'}</span></div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
