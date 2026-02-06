
import React from 'react';
import { ViewMode, User } from '../types';
import { ICONS } from '../constants';

interface SidebarProps {
  currentView: ViewMode;
  setView: (view: ViewMode) => void;
  user: User;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, user }) => {
  const menuItems: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: ICONS.Dashboard },
    { id: 'taxonomy-manager', label: 'Taxonomy Builder', icon: ICONS.Tree },
    { id: 'suppliers', label: 'Suppliers', icon: ICONS.Users },
    { id: 'inventory', label: 'Product Inventory', icon: ICONS.Inventory },
    { id: 'system-builder', label: 'System Builder', icon: ICONS.SystemBuilder },
    { id: 'visualize', label: 'Visualization', icon: ICONS.Visualize },
    { id: 'add-product', label: 'Add Product', icon: ICONS.Add },
  ];

  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full flex-shrink-0 transition-all duration-300 ease-in-out border-r border-slate-800">
      <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800/50">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
          <span className="font-bold text-lg">PI</span>
        </div>
        <span className="font-bold text-lg text-white tracking-wide">Platform</span>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
        <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Main Menu</p>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              currentView === item.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        
        <div className="pt-8 pb-2">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">System</p>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-white transition-all">
            {ICONS.Users}
            Team Management
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              currentView === 'settings'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            {ICONS.Settings}
            Settings
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border border-slate-600">
            <img src={`https://picsum.photos/seed/${user.name}/40`} alt="Avatar" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate uppercase tracking-tighter">{user.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
