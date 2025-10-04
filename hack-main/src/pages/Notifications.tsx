import { Bell, Check, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { request } from '../lib/api';
import { Notification } from '../types';

export const Notifications: React.FC = () => {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!user || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await request<{ notifications: Notification[] }>('/api/notifications', token);
      setNotifications(data.notifications);
    } catch (error) {
      console.error('Failed to load notifications', error);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = async (notificationId: string) => {
    if (!token) return;
    await request(`/api/notifications/${notificationId}/read`, token, { method: 'POST' });
    loadNotifications();
  };

  const markAllAsRead = async () => {
    if (!token) return;
    await request('/api/notifications/read-all', token, { method: 'POST' });
    loadNotifications();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'approval':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'rejection':
        return <X className="w-5 h-5 text-red-600" />;
      default:
        return <Bell className="w-5 h-5 text-blue-600" />;
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-600 mt-1">Stay updated with your expense activities</p>
        </div>
        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`bg-white rounded-xl shadow-sm border p-4 transition hover:shadow-md ${
              notification.read ? 'border-slate-200' : 'border-blue-200 bg-blue-50'
            }`}
          >
            <div className="flex items-start">
              <div className={`p-2 rounded-lg ${notification.read ? 'bg-slate-100' : 'bg-blue-100'}`}>
                {getTypeIcon(notification.type)}
              </div>
              <div className="ml-4 flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{notification.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="ml-4 p-1 text-blue-600 hover:bg-blue-100 rounded transition"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {notifications.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Bell className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No notifications</h3>
            <p className="text-slate-600">You're all caught up!</p>
          </div>
        )}
      </div>
    </div>
  );
};
