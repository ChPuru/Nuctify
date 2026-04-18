import React from 'react';
import { useToastStore } from '../store/toast';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

if (toasts.length === 0) return null;

return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => removeToast(toast.id)}>
          <div className="toast-icon">
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'info' && 'i'}
            {toast.type === 'warning' && '!'}
          </div>
          <div className="toast-message">{toast.message}</div>
        </div>
      ))}
    </div>
  );
}
