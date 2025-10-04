export interface User {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  manager_id?: string;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  country: string;
  default_currency: string;
  created_at: string;
}

export type ApprovalRuleType = 'percentage' | 'specific' | 'hybrid';

export interface RuleApproverStep {
  approver_id: string;
  order: number;
}

export interface ApprovalRule {
  id: string;
  company_id: string;
  rule_name: string;
  description?: string;
  approvers: string[];
  rule_type: ApprovalRuleType;
  min_approval_percentage: number;
  specific_approver_required?: string;
  created_at: string;
  approver_sequence?: RuleApproverStep[];
}

export interface ExpenseCategory {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface ReceiptAnalysis {
  text: string;
  confidence?: number | null;
  merchant?: string | null;
  amount?: number | null;
  currency?: string | null;
  date?: string | null;
  category?: string | null;
  description?: string | null;
}

export interface Expense {
  id: string;
  company_id: string;
  user_id: string;
  description: string;
  date: string;
  category_id?: string;
  paid_by: string;
  amount: number;
  currency: string;
  remarks?: string;
  receipt_url?: string;
  ocr_vendor?: string;
  ocr_amount?: number;
  ocr_date?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  expense_id: string;
  approver_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  comments?: string;
  approved_at?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'approval' | 'rejection' | 'escalation' | 'info';
  related_entity_id?: string;
  read: boolean;
  created_at: string;
}

export interface CurrencyQuote {
  base: string;
  target: string;
  rate: number;
  amount: number;
  converted_amount: number;
  updated_at: string;
  provider?: string;
}

export interface CurrencyRates {
  base: string;
  rates: Record<string, number>;
  updated_at: string;
  provider?: string;
}
