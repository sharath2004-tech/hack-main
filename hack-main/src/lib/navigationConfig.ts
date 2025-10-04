import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  CheckSquare,
  Settings,
} from 'lucide-react';

export type RoleKey = 'admin' | 'manager' | 'employee';

export interface RoleMenuItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const ROLE_MENU_ITEMS: Record<RoleKey, RoleMenuItem[]> = {
  admin: [
    { id: 'user-management', label: 'Users', icon: Users },
    { id: 'approval-rules', label: 'Approval Rules', icon: FileText },
    { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
    { id: 'company-settings', label: 'Settings', icon: Settings },
  ],
  manager: [
    { id: 'manager-dashboard', label: 'Approvals', icon: CheckSquare },
    { id: 'employee-dashboard', label: 'Submit Expense', icon: LayoutDashboard },
    { id: 'my-expenses', label: 'My Expenses', icon: FileText },
  ],
  employee: [
    { id: 'employee-dashboard', label: 'Submit Expense', icon: LayoutDashboard },
    { id: 'my-expenses', label: 'My Expenses', icon: FileText },
  ],
};

export const DEFAULT_PAGE_BY_ROLE: Record<RoleKey, string> = {
  admin: 'user-management',
  manager: 'manager-dashboard',
  employee: 'employee-dashboard',
};

export const SHARED_PAGES = ['notifications'];
