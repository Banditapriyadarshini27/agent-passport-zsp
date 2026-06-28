import React, { useEffect } from 'react';

const ToastItem = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.severity !== 'critical') {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, 5000); // Auto-dismiss non-critical alerts in 5 seconds
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  let borderClass = 'border-white/5';
  let titleColor = 'text-slate-300';
  let icon = '🔔';
  
  if (toast.severity === 'critical') {
    borderClass = 'border-rose-500/35 bg-rose-950/15 shadow-[0_0_12px_rgba(244,63,94,0.15)]';
    titleColor = 'text-rose-400 font-bold';
    icon = '🚨';
  } else if (toast.severity === 'medium') {
    borderClass = 'border-amber-500/25 bg-amber-950/10';
    titleColor = 'text-amber-400';
    icon = '⚠️';
  } else if (toast.severity === 'safe') {
    borderClass = 'border-emerald-500/25 bg-emerald-950/10';
    titleColor = 'text-[#00f5a0]';
    icon = '✅';
  }

  return (
    <div className={`p-3 rounded-lg border glass-panel transition-all duration-300 flex items-start gap-2.5 max-w-sm w-80 shadow-2xl animate-[slideIn_0.2s_ease-out] ${borderClass}`}>
      <span className="text-sm select-none">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <span className={`text-[10px] font-mono-custom uppercase tracking-wider ${titleColor}`}>
            {toast.title || 'System Notification'}
          </span>
          <button 
            onClick={() => onDismiss(toast.id)}
            className="text-slate-500 hover:text-slate-300 text-[10px] ml-2 select-none"
          >
            ✕
          </button>
        </div>
        <p className="text-[10px] font-mono-custom text-slate-300 mt-1 leading-relaxed">
          {toast.message}
        </p>
      </div>
    </div>
  );
};

export function ToastSystem({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div className="flex flex-col gap-2 pointer-events-auto">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
export default ToastSystem;
