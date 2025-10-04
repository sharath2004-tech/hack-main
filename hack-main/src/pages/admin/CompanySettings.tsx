import { Building2, Save } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { request } from '../../lib/api';
import type { Company } from '../../types';

export const CompanySettings: React.FC = () => {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    default_currency: '',
  });

  const loadCompany = useCallback(async () => {
    if (!user || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await request<{ company: Company }>('/api/company', token);
      setFormData({
        name: data.company.name,
        country: data.company.country,
        default_currency: data.company.default_currency,
      });
    } catch (error) {
      console.error('Failed to load company', error);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (!token) {
        throw new Error('You must be signed in to update company settings');
      }

      await request('/api/company', token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: formData.name,
          country: formData.country,
          default_currency: formData.default_currency,
        }),
      });

      alert('Company settings updated successfully!');
      loadCompany();
    } catch (error: unknown) {
      const apiError = error as { message?: string } | undefined;
      alert(apiError?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Company Settings</h1>
        <p className="text-slate-600 mt-1">Manage your company information</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-lg">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div className="ml-4">
            <h2 className="text-xl font-semibold text-slate-900">Company Information</h2>
            <p className="text-sm text-slate-600">Update your company details</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter company name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Country</label>
            <select
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="European Union">European Union</option>
              <option value="India">India</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Default Currency
            </label>
            <select
              value={formData.default_currency}
              onChange={(e) => setFormData({ ...formData, default_currency: e.target.value })}
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="INR">INR - Indian Rupee</option>
              <option value="CAD">CAD - Canadian Dollar</option>
              <option value="AUD">AUD - Australian Dollar</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};
