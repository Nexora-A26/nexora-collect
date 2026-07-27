import React, { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type Toast = { id: number; type: 'success'|'error'; message: string };
const ToastContext = createContext<{ success(m:string):void; error(m:string):void }>({ success(){}, error(){} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((v) => [...v, { id, type, message }]);
    window.setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4000);
  }, []);
  return <ToastContext.Provider value={{ success: (m)=>push('success',m), error:(m)=>push('error',m) }}>
    {children}
    <div className="toast-stack">{items.map((t)=><div key={t.id} className={`toast toast-${t.type}`}>
      {t.type === 'success' ? <CheckCircle2/> : <XCircle/>}<span>{t.message}</span><button onClick={()=>setItems((v)=>v.filter((x)=>x.id!==t.id))}><X size={16}/></button>
    </div>)}</div>
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
