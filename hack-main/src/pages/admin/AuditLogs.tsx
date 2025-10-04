import { FileText, Filter } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { request } from '../../lib/api';
import type { AuditLog, User } from '../../types';

export const AuditLogs: React.FC = () => {
  const { user: currentUser, token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<Array<Pick<User, 'id' | 'name'>>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ action: '', entityType: '', userId: '' });

  const loadData = useCallback(async () => {
    if (!currentUser || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const params = new URLSearchParams();
    if (filter.action) params.set('action', filter.action);
    if (filter.entityType) params.set('entityType', filter.entityType);
    if (filter.userId) params.set('userId', filter.userId);

    const [logsData, usersData] = await Promise.all([
      request<{ logs: AuditLog[] }>(`/api/audit-logs${params.toString() ? `?${params.toString()}` : ''}`, token),
      request<{ users: Pick<User, 'id' | 'name'>[] }>('/api/audit-logs/users', token),
    ]);

    setLogs(logsData.logs);
    setUsers(usersData.users);
    setLoading(false);
  }, [filter.action, filter.entityType, filter.userId, currentUser, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-blue-100 text-blue-700';
      case 'update':
        return 'bg-yellow-100 text-yellow-700';
      case 'delete':
        return 'bg-red-100 text-red-700';
      case 'approved':
        return 'bg-green-100 text-green-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      case 'override':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-slate-100 text-slate-700';
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
        <h1 className="text-3xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-slate-600 mt-1">Track all actions across the system</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex items-center mb-4">
          <Filter className="w-5 h-5 text-slate-600 mr-2" />
          <h3 className="text-sm font-medium text-slate-900">Filters</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Action</label>
            <select
              value={filter.action}
              onChange={(e) => setFilter({ ...filter, action: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="override">Override</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Entity Type</label>
            <select
              value={filter.entityType}
              onChange={(e) => setFilter({ ...filter, entityType: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="expense">Expense</option>
              <option value="user">User</option>
              <option value="approval_rule">Approval Rule</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">User</label>
            <select
              value={filter.userId}
              onChange={(e) => setFilter({ ...filter, userId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Entity Type
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => {
                const owner = users.find((u) => u.id === log.user_id);
                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-600">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">
                      {owner?.name || 'System'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${getActionColor(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-600">{log.entity_type}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600 max-w-md truncate">
                      {JSON.stringify(log.details)}
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No audit logs found</h3>
            <p className="text-slate-600">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
};
