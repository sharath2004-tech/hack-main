import { CreditCard as Edit2, FileText, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { request } from '../../lib/api';
import { ApprovalRule, ApprovalRuleType, User } from '../../types';

type RuleFormState = {
  rule_name: string;
  description: string;
  approvers: string[];
  rule_type: ApprovalRuleType;
  min_approval_percentage: number;
  specific_approver_required: string;
};

const createEmptyRuleForm = (): RuleFormState => ({
  rule_name: '',
  description: '',
  approvers: [],
  rule_type: 'percentage',
  min_approval_percentage: 50,
  specific_approver_required: '',
});

const ruleTypeLabels: Record<ApprovalRuleType, string> = {
  percentage: 'Percentage threshold',
  specific: 'Specific approver',
  hybrid: 'Hybrid (percentage or specific approver)',
};

const ruleTypeDescriptions: Record<ApprovalRuleType, string> = {
  percentage: 'Approve the expense once a percentage of the selected approvers have approved.',
  specific: 'Approve the expense as soon as the specified approver approves.',
  hybrid: 'Approve the expense if either the percentage threshold or the specific approver condition is met.',
};

export const ApprovalRules: React.FC = () => {
  const { user: currentUser, token } = useAuth();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [formData, setFormData] = useState<RuleFormState>(() => createEmptyRuleForm());

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const resetForm = useCallback(() => {
    setFormData(createEmptyRuleForm());
    setEditingRule(null);
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [rulesData, usersData] = await Promise.all([
        request<{ rules: ApprovalRule[] }>('/api/approval-rules', token),
        request<{ users: User[] }>('/api/users', token),
      ]);

      console.log('Users data:', usersData.users);
      setRules(rulesData.rules);
      setUsers(usersData.users.filter((user) => ['admin', 'manager'].includes(user.role)));
    } catch (error) {
      console.error('Failed to load approval rules', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRuleTypeChange = (nextType: ApprovalRuleType) => {
    setFormData((prev) => {
      const next: RuleFormState = {
        ...prev,
        rule_type: nextType,
      };

      if (nextType === 'specific') {
        next.min_approval_percentage = 0;
        next.approvers = [];
      }

      if (nextType === 'percentage') {
        next.specific_approver_required = '';
        if (next.min_approval_percentage <= 0) {
          next.min_approval_percentage = 50;
        }
      }

      if (nextType === 'hybrid' && next.min_approval_percentage <= 0) {
        next.min_approval_percentage = 50;
      }

      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return;

    const percentageEnabled = formData.rule_type !== 'specific';
    const specificEnabled = formData.rule_type !== 'percentage';

    const sequencePayload =
      formData.rule_type === 'specific'
        ? formData.specific_approver_required
          ? [{ approver_id: formData.specific_approver_required, order: 1 }]
          : []
        : formData.approvers.map((approverId, index) => ({ approver_id: approverId, order: index + 1 }));

    const payload = {
      company_id: currentUser?.company_id,
      rule_name: formData.rule_name,
      description: formData.description,
      rule_type: formData.rule_type,
      approvers: percentageEnabled ? formData.approvers : [],
      min_approval_percentage: percentageEnabled
        ? Math.max(1, Math.min(100, Math.round(formData.min_approval_percentage)))
        : 0,
      specific_approver_required: specificEnabled
        ? formData.specific_approver_required || null
        : null,
      approver_sequence: sequencePayload,
    };

    try {
      if (editingRule) {
        await request(`/api/approval-rules/${editingRule.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await request('/api/approval-rules', token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
    } catch (error) {
      console.error('Failed to save approval rule', error);
      return;
    }

    setShowModal(false);
    resetForm();
    loadData();
  };

  const handleDelete = async (ruleId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      await request(`/api/approval-rules/${ruleId}`, token, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Failed to delete approval rule', error);
    }
  };

  const handleEdit = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setFormData({
      rule_name: rule.rule_name,
      description: rule.description || '',
      approvers: rule.approvers || [],
      rule_type: rule.rule_type,
      min_approval_percentage: rule.min_approval_percentage,
      specific_approver_required: rule.specific_approver_required || '',
    });
    setShowModal(true);
  };

  const toggleApprover = (userId: string) => {
    console.log('Toggling user:', userId, 'Current approvers:', formData.approvers);
    setFormData((prev) => {
      const newApprovers = prev.approvers.includes(userId)
        ? prev.approvers.filter(id => id !== userId)
        : [...prev.approvers, userId];
      console.log('New approvers:', newApprovers);
      return { ...prev, approvers: newApprovers };
    });
  };

  const moveApprover = (fromIndex: number, toIndex: number) => {
    setFormData((prev) => {
      if (toIndex < 0 || toIndex >= prev.approvers.length) {
        return prev;
      }
      const next = [...prev.approvers];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, approvers: next };
    });
  };

  const removeApproverFromSequence = (userId: string) => {
    setFormData((prev) => ({ ...prev, approvers: prev.approvers.filter((id) => id !== userId) }));
  };

  const getApproverLabel = useCallback(
    (rule: ApprovalRule) => {
      if (Array.isArray(rule.approver_sequence) && rule.approver_sequence.length > 0) {
        const steps = [...rule.approver_sequence]
          .sort((a, b) => a.order - b.order)
          .map((step) => usersById.get(step.approver_id)?.name)
          .filter((name): name is string => Boolean(name));
        if (steps.length > 0) {
          return steps.join(' → ');
        }
      }

      if (!rule.approvers || rule.approvers.length === 0) {
        return 'All managers/admins';
      }

      const names = rule.approvers
        .map((id) => usersById.get(id)?.name)
        .filter((name): name is string => Boolean(name));

      if (names.length === 0) {
        return `${rule.approvers.length} user(s)`;
      }

      const previewLimit = 3;
      if (names.length > previewLimit) {
        return `${names.slice(0, previewLimit).join(', ')} +${names.length - previewLimit} more`;
      }

      return names.join(', ');
    },
    [usersById]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Approval Rules</h1>
          <p className="text-slate-600 mt-1">Define workflow rules for expense approvals</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </button>
      </div>

      <div className="grid gap-6">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{rule.rule_name}</h3>
                {rule.description && <p className="text-slate-600 mb-4">{rule.description}</p>}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(rule)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Rule Type</div>
                <div className="text-sm text-slate-900">
                  {ruleTypeLabels[rule.rule_type]}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Approvers</div>
                <div className="text-sm text-slate-900">{getApproverLabel(rule)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                  Min Approval %
                </div>
                <div className="text-sm text-slate-900">
                  {rule.rule_type === 'specific'
                    ? 'Not applicable'
                    : `${rule.min_approval_percentage}%`}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                  Required Approver
                </div>
                <div className="text-sm text-slate-900">
                  {rule.specific_approver_required
                    ? usersById.get(rule.specific_approver_required)?.name || 'Unknown'
                    : rule.rule_type === 'percentage'
                    ? 'None'
                    : 'Not set'}
                </div>
              </div>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No approval rules yet</h3>
            <p className="text-slate-600 mb-4">Create your first rule to manage expense approvals</p>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {editingRule ? 'Edit Rule' : 'Create Rule'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rule Name</label>
                <input
                  type="text"
                  value={formData.rule_name}
                  onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Standard Expense Approval"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe when this rule applies..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rule Type</label>
                <select
                  value={formData.rule_type}
                  onChange={(e) => handleRuleTypeChange(e.target.value as ApprovalRuleType)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="percentage">Percentage threshold</option>
                  <option value="specific">Specific approver</option>
                  <option value="hybrid">Hybrid (percentage or specific)</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">{ruleTypeDescriptions[formData.rule_type]}</p>
              </div>

              {formData.rule_type !== 'specific' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Approvers (select managers/admins)
                  </label>
                  <div className="border border-slate-300 rounded-lg p-4 max-h-48 overflow-y-auto">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center py-2 hover:bg-slate-50 px-2 rounded"
                      >
                        <input
                          type="checkbox"
                          id={`approver-${user.id}`}
                          checked={formData.approvers.includes(user.id)}
                          onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Checkbox clicked for user:', user);
                            toggleApprover(user.id);
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <label htmlFor={`approver-${user.id}`} className="ml-3 text-sm text-slate-900 cursor-pointer">
                          {user.name} ({user.role})
                        </label>
                      </div>
                    ))}
                    {users.length === 0 && (
                      <p className="text-sm text-slate-500 text-center">No approvers available</p>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Choose who should count toward the approval percentage threshold and arrange their order below.
                  </p>
                  {formData.approvers.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-slate-700 mb-2">Approval Sequence</div>
                      <ol className="space-y-2">
                        {formData.approvers.filter(id => usersById.has(id)).map((approverId, index) => {
                          const approver = usersById.get(approverId)!;
                          return (
                            <li
                              key={approverId}
                              className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                            >
                              <div>
                                <div className="text-xs font-semibold text-slate-500 uppercase">Step {index + 1}</div>
                                <div className="text-sm text-slate-900">
                                  {approver.name} ({approver.role})
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => moveApprover(index, index - 1)}
                                  disabled={index === 0}
                                  className="px-2 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveApprover(index, index + 1)}
                                  disabled={index === formData.approvers.filter(id => usersById.has(id)).length - 1}
                                  className="px-2 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeApproverFromSequence(approverId)}
                                  className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      <p className="mt-2 text-xs text-slate-500">
                        Approval requests are sent in sequence. The next step activates once the previous step is approved.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {formData.rule_type !== 'specific' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Minimum Approval Percentage
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.min_approval_percentage}
                    onChange={(e) => {
                      const nextValue = Number(e.target.value);
                      if (Number.isNaN(nextValue)) return;
                      setFormData((prev) => ({
                        ...prev,
                        min_approval_percentage: Math.max(1, Math.min(100, Math.round(nextValue))),
                      }));
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {formData.rule_type !== 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Specific Approver Required
                  </label>
                  <select
                    value={formData.specific_approver_required}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        specific_approver_required: e.target.value,
                      }))
                    }
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select approver</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    {formData.rule_type === 'specific'
                      ? 'Expense is auto-approved once this person approves.'
                      : 'Expense is approved when this person approves or when the percentage threshold is met.'}
                  </p>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  {editingRule ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
