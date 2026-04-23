import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useAuthStore } from '../../stores/auth.store';
import { HiOutlineHome, HiOutlineCube, HiOutlineClipboardList, HiOutlineTruck, HiOutlineChartBar, HiOutlineCog, HiOutlineLogout, HiOutlineMenu, HiOutlineX, HiOutlineBeaker } from 'react-icons/hi';

const navItems = [
  { to: '/',            icon: HiOutlineHome,          label: 'Dashboard' },
  { to: '/inventario',  icon: HiOutlineCube,          label: 'Inventario' },
  { to: '/picking',     icon: HiOutlineClipboardList, label: 'Picking' },
  { to: '/picking-log', icon: HiOutlineClipboardList, label: 'Bitácora Picking' },
  { to: '/guias',       icon: HiOutlineTruck,         label: 'Guías' },
  { to: '/analisis',    icon: HiOutlineBeaker,        label: 'Análisis Inventario' },
  { to: '/bsale',       icon: HiOutlineCog,           label: 'BSale' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-bg-secondary border-r border-border-primary
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-border-primary">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-green to-brand-blue flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-text-primary">WMS PRO</h1>
              <p className="text-[10px] text-text-muted">Cabo de Hornos</p>
            </div>
          </div>
          <button className="lg:hidden text-text-secondary" onClick={() => setSidebarOpen(false)}>
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 mb-1
                ${isActive
                  ? 'bg-brand-blue/15 text-brand-blue'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}
              `}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User bar */}
        <div className="border-t border-border-primary p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center">
              <span className="text-brand-purple text-xs font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{user?.name}</p>
              <p className="text-xs text-text-muted truncate">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-text-muted hover:text-brand-red transition-colors p-1">
              <HiOutlineLogout className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border-primary bg-bg-secondary flex items-center justify-between px-4 lg:px-6">
          <button className="lg:hidden text-text-secondary" onClick={() => setSidebarOpen(true)}>
            <HiOutlineMenu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span className="hidden sm:inline">Bodega:</span>
            <span className="px-2 py-0.5 bg-brand-green/10 text-brand-green rounded text-xs font-medium">
              {user?.warehouse || 'Central'}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
