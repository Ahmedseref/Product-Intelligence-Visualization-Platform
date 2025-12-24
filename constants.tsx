
import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  BarChart3, 
  PlusCircle, 
  Users, 
  Settings, 
  Filter, 
  Download,
  Search,
  ChevronDown,
  History,
  Edit,
  Trash2,
  MoreVertical,
  Layers,
  Globe,
  Truck,
  DollarSign
} from 'lucide-react';

export const ICONS = {
  Dashboard: <LayoutDashboard size={20} />,
  Inventory: <Package size={20} />,
  Visualize: <BarChart3 size={20} />,
  Add: <PlusCircle size={20} />,
  Users: <Users size={20} />,
  Settings: <Settings size={20} />,
  Filter: <Filter size={16} />,
  Download: <Download size={16} />,
  Search: <Search size={16} />,
  ChevronDown: <ChevronDown size={16} />,
  History: <History size={16} />,
  Edit: <Edit size={16} />,
  Trash: <Trash2 size={16} />,
  More: <MoreVertical size={16} />,
  Details: <Layers size={18} />,
  Location: <Globe size={18} />,
  Logistics: <Truck size={18} />,
  Price: <DollarSign size={18} />
};

export const SECTORS = ['Retail', 'Industrial', 'Chemical', 'Textile', 'Food & Beverage', 'Electronics'];
export const CATEGORIES = ['Raw Materials', 'Finished Goods', 'Components', 'Packaging'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY'];
export const UNITS = ['kg', 'ton', 'piece', 'liter', 'box', 'pallet'];
