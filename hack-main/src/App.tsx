import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ApprovalRules } from './pages/admin/ApprovalRules';
import { AuditLogs } from './pages/admin/AuditLogs';
import { CompanySettings } from './pages/admin/CompanySettings';
import { UserManagement } from './pages/admin/UserManagement';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { MyExpenses } from './pages/employee/MyExpenses';
import { Login } from './pages/Login';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { Notifications } from './pages/Notifications';
import { Signup } from './pages/Signup';
import {
  DEFAULT_PAGE_BY_ROLE,
  ROLE_MENU_ITEMS,
  SHARED_PAGES,
  type RoleKey,
} from './lib/navigationConfig';

const AppContent: React.FC = () => {
  const { user, loading, configError } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [currentPage, setCurrentPage] = useState('');

  const role = user?.role as RoleKey | undefined;

  const allowedPages = React.useMemo(() => {
    if (!role) return [] as string[];
    const menuPages = ROLE_MENU_ITEMS[role]?.map((item) => item.id) ?? [];
    return [...new Set([...menuPages, ...SHARED_PAGES])];
  }, [role]);

  React.useEffect(() => {
    if (role) {
      setCurrentPage(DEFAULT_PAGE_BY_ROLE[role]);
    } else {
      setCurrentPage('');
    }
  }, [role]);

  React.useEffect(() => {
    if (!role || !currentPage) return;
    if (!allowedPages.includes(currentPage)) {
      setCurrentPage(DEFAULT_PAGE_BY_ROLE[role]);
    }
  }, [allowedPages, currentPage, role]);

  if (configError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-4">
          <h1 className="text-2xl font-semibold text-slate-800">Configuration required</h1>
          <p className="text-slate-600">
            {configError}
          </p>
          <p className="text-sm text-slate-500">
            Create a <code>.env</code> file in the project root with <code>VITE_API_URL</code> pointing to your
            backend (e.g. <code>http://localhost:4000</code>) and the backend database settings, then restart the
            development server.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-600 text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    if (authView === 'login') {
      return <Login onNavigateToSignup={() => setAuthView('signup')} />;
    }
    return <Signup onNavigateToLogin={() => setAuthView('login')} />;
  }

  const renderPage = () => {
    if (role && currentPage && !allowedPages.includes(currentPage)) {
      return <div className="p-8">You do not have access to this page.</div>;
    }

    switch (currentPage) {
      case 'user-management':
        return <UserManagement />;
      case 'approval-rules':
        return <ApprovalRules />;
      case 'audit-logs':
        return <AuditLogs />;
      case 'company-settings':
        return <CompanySettings />;
      case 'employee-dashboard':
        return <EmployeeDashboard />;
      case 'my-expenses':
        return <MyExpenses />;
      case 'manager-dashboard':
        return <ManagerDashboard />;
      case 'notifications':
        return <Notifications />;
      default:
        return <div className="p-8">Page not found</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <main>{renderPage()}</main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
