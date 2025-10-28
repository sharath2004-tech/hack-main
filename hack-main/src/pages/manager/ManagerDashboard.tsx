import { CheckCircle, Search, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { request } from '../../lib/api';
import { Approval, Expense, ExpenseCategory, User } from '../../types';

type ApprovalWithDetails = Approval & { 
  expense: Expense & { receipt_url?: string }; 
  requester: Pick<User, 'id' | 'name'> 
};

export const ManagerDashboard: React.FC = () => {
  const { user: currentUser, token } = useAuth();
  const [approvals, setApprovals] = useState<ApprovalWithDetails[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalWithDetails | null>(null);
  const [decisionComments, setDecisionComments] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const itemsPerPage = 10;

  const loadData = useCallback(async () => {
    if (!currentUser || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [approvalsData, categoriesData] = await Promise.all([
        request<{ approvals: ApprovalWithDetails[] }>('/api/approvals/pending', token),
        request<{ categories: ExpenseCategory[] }>('/api/expense-categories', token),
      ]);

      setApprovals(approvalsData.approvals);
      setCategories(categoriesData.categories);
    } catch (error) {
      console.error('Failed to load approvals', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApproval = async (approvalId: string, status: 'approved' | 'rejected', comments: string) => {
    if (!token) return;

    try {
      await request(`/api/approvals/${approvalId}/decision`, token, {
        method: 'POST',
        body: JSON.stringify({ status, comments }),
      });
      setSelectedApproval(null);
      setDecisionComments('');
      loadData();
    } catch (error: unknown) {
      const apiError = error as { message?: string } | undefined;
      alert(apiError?.message || 'Failed to update approval');
    }
  };

  const filteredApprovals = approvals.filter(approval => 
    approval.requester?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredApprovals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedApprovals = filteredApprovals.slice(startIndex, startIndex + itemsPerPage);

  const getCategoryName = (categoryId?: string) => {
    return categories.find((c) => c.id === categoryId)?.name || '-';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      case 'escalated':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Approvals</h1>
        <p className="text-slate-600 mt-1">Review and approve expense requests</p>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by request owner..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Request Owner
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedApprovals.map((approval) => (
                <tr key={approval.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">{approval.requester?.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-900">{approval.expense.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-600">
                      {getCategoryName(approval.expense.category_id)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-600">
                      {new Date(approval.expense.date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">
                      {approval.expense.currency} {approval.expense.amount.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        approval.status
                      )}`}
                    >
                      {approval.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {approval.status === 'pending' && (
                      <button
                        onClick={() => {
                          setSelectedApproval(approval);
                          setDecisionComments('');
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredApprovals.length === 0 && approvals.length > 0 && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No matching approvals</h3>
            <p className="text-slate-600">Try adjusting your search term</p>
          </div>
        )}

        {approvals.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No pending approvals</h3>
            <p className="text-slate-600">All caught up!</p>
          </div>
        )}
      </div>

      {filteredApprovals.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-slate-600">
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredApprovals.length)} of {filteredApprovals.length} approvals
            {searchTerm && ` (filtered from ${approvals.length} total)`}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Review Expense</h2>

            <div className="space-y-4 mb-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Submitted By</div>
                    <div className="text-sm text-slate-900">{selectedApproval.requester?.name}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Date</div>
                  <div className="text-sm text-slate-900">
                    {new Date(selectedApproval.expense.date).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Description</div>
                <div className="text-sm text-slate-900">{selectedApproval.expense.description}</div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Category</div>
                  <div className="text-sm text-slate-900">
                    {getCategoryName(selectedApproval.expense.category_id)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Paid By</div>
                  <div className="text-sm text-slate-900">{selectedApproval.expense.paid_by}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Amount</div>
                <div className="text-2xl font-bold text-slate-900">
                  {selectedApproval.expense.currency} {selectedApproval.expense.amount.toFixed(2)}
                </div>
              </div>

              {selectedApproval.expense.remarks && (
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Remarks</div>
                  <div className="text-sm text-slate-900">{selectedApproval.expense.remarks}</div>
                </div>
              )}

              {selectedApproval.expense.receipt_url && (
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Receipt</div>
                  <a
                    href={`${import.meta.env.VITE_API_URL}${selectedApproval.expense.receipt_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
                  >
                    View Receipt
                  </a>
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Comments</label>
              <textarea
                rows={3}
                value={decisionComments}
                onChange={(e) => setDecisionComments(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Add your comments..."
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setSelectedApproval(null);
                  setDecisionComments('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApproval(selectedApproval.id, 'rejected', decisionComments)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </button>
              <button
                onClick={() => handleApproval(selectedApproval.id, 'approved', decisionComments)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
