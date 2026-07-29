import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { ToastProvider } from './components/Toast';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import RepresentativesPage from './pages/RepresentativesPage';
import CustomersPage from './pages/CustomersPage';
import CollectionsPage from './pages/CollectionsPage';
import SettlementsPage from './pages/SettlementsPage';
import BalancesPage from './pages/BalancesPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';

function AppContent(){
 const [status,setStatus]=useState<{loading:boolean;needsSetup:boolean;user:AppUser|null}>({loading:true,needsSetup:false,user:null});
 const [settings,setSettings]=useState<Record<string,any>>({currency_symbol:'د.ع',currency_code:'IQD',currency_name:'الدينار العراقي',symbol_position:'after',decimal_places:0,thousands_separator:',',decimal_separator:'.',organization_name:'نكسورا للتحصيل'});
 const refreshSettings=useCallback(async()=>{if(status.user){setSettings(await window.nexora.settings.get())}},[status.user]);
 useEffect(()=>{window.nexora.auth.status().then((r)=>setStatus({loading:false,...r})).catch(()=>setStatus({loading:false,needsSetup:true,user:null}))},[]);
 useEffect(()=>{if(status.user)void refreshSettings()},[status.user,refreshSettings]);
 const can=useCallback((page:PageKey,action:PermissionAction='view')=>status.user?.role==='admin'||Boolean(status.user?.permissions?.[page]?.[action]),[status.user]);
 const money=useCallback((value:unknown)=>{const n=Number(value||0),d=Number(settings.decimal_places||0);let formatted=new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);if(settings.thousands_separator!==',')formatted=formatted.replaceAll(',',String(settings.thousands_separator??','));if(settings.decimal_separator!=='.')formatted=formatted.replace('.',String(settings.decimal_separator??'.'));return settings.symbol_position==='before'?`${settings.currency_symbol} ${formatted}`:`${formatted} ${settings.currency_symbol}`},[settings]);
 const logout=useCallback(async()=>{await window.nexora.auth.logout();setStatus({loading:false,needsSetup:false,user:null})},[]);
 const authValue=useMemo(()=>status.user?{user:status.user,settings,refreshSettings,logout,can,money}:null,[status.user,settings,refreshSettings,logout,can,money]);
 if(status.loading)return <Loading/>;
 if(!status.user)return <AuthPage needsSetup={status.needsSetup} onAuthenticated={(user)=>setStatus({loading:false,needsSetup:false,user})}/>;
 const homePath=([['dashboard','/'],['representatives','/representatives'],['customers','/customers'],['collections','/collections'],['settlements','/settlements'],['balances','/balances'],['reports','/reports'],['users','/users'],['audit','/audit'],['settings','/settings']] as Array<[PageKey,string]>).find(([p])=>can(p,'view'))?.[1] || '/';
 const guard=(page:PageKey,node:React.ReactNode)=>can(page,'view')?node:<Navigate to={homePath} replace/>;
 return <AuthProvider value={authValue!}><Layout><Routes><Route path="/" element={can('dashboard','view')?<DashboardPage/>:<Navigate to={homePath} replace/>}/><Route path="/representatives" element={guard('representatives',<RepresentativesPage/>)}/><Route path="/customers" element={guard('customers',<CustomersPage/>)}/><Route path="/collections" element={guard('collections',<CollectionsPage/>)}/><Route path="/settlements" element={guard('settlements',<SettlementsPage/>)}/><Route path="/balances" element={guard('balances',<BalancesPage/>)}/><Route path="/reports" element={guard('reports',<ReportsPage/>)}/><Route path="/users" element={guard('users',<UsersPage/>)}/><Route path="/audit" element={guard('audit',<AuditPage/>)}/><Route path="/settings" element={guard('settings',<SettingsPage/>)}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Layout></AuthProvider>;
}
export default function App(){return <ToastProvider><AppContent/></ToastProvider>}
