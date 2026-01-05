import React, { useEffect, useState } from 'react';
import { Icons } from './Icon';

interface ToastProps {
  message: string;
  onClose: () => void;
  type?: 'error' | 'success';
}

export const Toast: React.FC<ToastProps> = ({ message, onClose, type = 'error' }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for exit animation
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[9999] transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
      <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl backdrop-blur-xl border ${type === 'error' ? 'bg-black/90 text-white border-red-500/50' : 'bg-green-500/90 text-white border-white/20'}`}>
        <div className={`p-1.5 rounded-full ${type === 'error' ? 'bg-red-500 text-white' : 'bg-white text-green-600'}`}>
           {type === 'error' ? <Icons.Alert size={14} className="stroke-[3]" /> : <Icons.CheckSquare size={14} className="stroke-[3]" />}
        </div>
        <span className="font-bold text-sm tracking-wide font-sans">{message}</span>
        <button onClick={() => setVisible(false)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
           <Icons.Close size={14} />
        </button>
      </div>
    </div>
  );
};