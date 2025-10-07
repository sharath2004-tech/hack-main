import { CreditCard as Edit2, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { request } from '../../lib/api';
import { User } from '../../types';

export const UserManagement: React.FC = () => {
  const { user: currentUser, token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'employee' as 'admin' | 'manager' | 'employee',
    manager_id: '',
  });
  const [deleteDialogUser, setDeleteDialogUser] = useState<User | null>(null);
  const [deleteReassign, setDeleteReassign] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const directReports = useMemo(
    () => (deleteDialogUser ? users.filter((u) => u.manager_id === deleteDialogUser.id) : []),
    [deleteDialogUser, users]
  );
  const reassignCandidates = useMemo(
    () =>
      deleteDialogUser
        ? users.filter(
            (candidate) =>
              (candidate.role === 'manager' || candidate.role === 'admin') && candidate.id !== deleteDialogUser.id
          )
        : [],
    [deleteDialogUser, users]
  );
  const deleteRequiresReassign = useMemo(() => {
    if (!deleteDialogUser) return false;
    if (deleteDialogUser.role !== 'employee') return true;
    return directReports.length > 0;
  }, [deleteDialogUser, directReports]);

  const loadUsers = useCallback(async () => {
    if (!currentUser || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await request<{ users: User[] }>('/api/users', token);
      setUsers(data.users);
    } catch (error) {
      console.error('Failed to load users', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return;

    try {
      if (editingUser) {
        await request(`/api/users/${editingUser.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formData.name,
            role: formData.role,
            manager_id: formData.manager_id || null,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to update user', error);
    }

    setShowModal(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', role: 'employee', manager_id: '' });
    loadUsers();
  };

  const startDelete = (user: User) => {
    setDeleteDialogUser(user);
    setDeleteReassign('');
    setDeleteError(null);
  };

  const submitDelete = async () => {
    if (!token || !deleteDialogUser) return;

    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const payload: Record<string, string> = {};
      if (deleteReassign) {
        payload.reassign_to = deleteReassign;
      }

      await request(`/api/users/${deleteDialogUser.id}`, token, {
        method: 'DELETE',
        body: JSON.stringify(payload),
      });

      setDeleteDialogUser(null);
      setDeleteReassign('');
      loadUsers();
    } catch (error) {
      const apiError = error as { message?: string };
      setDeleteError(apiError?.message || 'Unable to delete user. Please resolve outstanding assignments.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      manager_id: user.manager_id || '',
    });
    setShowModal(true);
  };

  const managers = users.filter((u) => u.role === 'manager' || u.role === 'admin');

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
          <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-600 mt-1">Manage your team members and their roles</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((user) => {
                const manager = users.find((u) => u.id === user.manager_id);
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{user.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${
                          user.role === 'admin'
                            ? 'bg-red-100 text-red-700'
                            : user.role === 'manager'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">{manager?.name || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => startDelete(user)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {editingUser ? 'Edit User' : 'Add User'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as 'admin' | 'manager' | 'employee',
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {formData.role === 'employee' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Manager</label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">No Manager</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
                    setFormData({ name: '', email: '', role: 'employee', manager_id: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  {editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteDialogUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Delete User</h2>
            <p className="text-sm text-slate-600 mb-4">
              Deleting <span className="font-semibold text-slate-800">{deleteDialogUser.name}</span> will remove
              their access immediately.
            </p>

            {deleteError && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            )}

            {directReports.length > 0 && (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This user currently manages team members. Choose a new manager so their reports aren’t orphaned.
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Reassign to</label>
              <select
                value={deleteReassign}
                onChange={(e) => setDeleteReassign(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select user {deleteRequiresReassign ? '(required)' : '(optional)'}</option>
                {reassignCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.role})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Pick the manager who should inherit their approvals, expenses, and direct reports. Required when
                deleting managers with active responsibilities.
              </p>
              {deleteRequiresReassign && reassignCandidates.length === 0 && (
                <p className="text-xs text-red-600">
                  No eligible managers or admins are available to take over. Add one before deleting this user.
                </p>
              )}
            </div>

            <div className="flex space-x-3 pt-6">
              <button
                type="button"
                onClick={() => {
                  setDeleteDialogUser(null);
                  setDeleteReassign('');
                  setDeleteError(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDelete}
                disabled={
                  deleteSubmitting || (deleteRequiresReassign && (!deleteReassign || reassignCandidates.length === 0))
                }
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-60"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
