import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogs } from '../pages/admin/AuditLogs';
import { useAuth } from '../contexts/AuthContext';
import { request } from '../lib/api';

jest.mock('../contexts/AuthContext');
jest.mock('../lib/api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('AuditLogs', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Admin', role: 'admin', company_id: '1', email: 'admin@example.com', created_at: '2024-01-01T00:00:00Z' },
      token: 'test-token',
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      configError: null,
      refreshUser: jest.fn(),
    });
  });

  test('renders audit logs page', async () => {
    mockRequest.mockResolvedValue({ logs: [], users: [] });
    
    render(<AuditLogs />);
    
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Track all actions across the system')).toBeInTheDocument();
  });

  test('filters work correctly', async () => {
    mockRequest.mockResolvedValue({
      logs: [
        {
          id: '1',
          action: 'create',
          entity_type: 'expense',
          user_id: '1',
          created_at: '2024-01-01T00:00:00Z',
          details: {}
        }
      ],
      users: [{ id: '1', name: 'Test User' }]
    });
    
    render(<AuditLogs />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Actions')).toBeInTheDocument();
    });

    const actionFilter = screen.getByDisplayValue('All Actions');
    fireEvent.change(actionFilter, { target: { value: 'create' } });
    
    expect(actionFilter).toHaveValue('create');
  });

  test('pagination shows 10 items per page', async () => {
    const mockLogs = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 1}`,
      action: 'create',
      entity_type: 'expense',
      user_id: '1',
      created_at: '2024-01-01T00:00:00Z',
      details: {}
    }));

    mockRequest.mockResolvedValue({ logs: mockLogs, users: [] });
    
    render(<AuditLogs />);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1 to 10 of 25 logs')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });
  });

  test('resets to page 1 when filters change', async () => {
    const mockLogs = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 1}`,
      action: 'create',
      entity_type: 'expense',
      user_id: '1',
      created_at: '2024-01-01T00:00:00Z',
      details: {}
    }));

    mockRequest.mockResolvedValue({ logs: mockLogs, users: [] });
    
    render(<AuditLogs />);
    
    await waitFor(() => {
      // Navigate to page 2
      fireEvent.click(screen.getByText('Next'));
    });

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    });

    // Change filter - should reset to page 1
    const actionFilter = screen.getByDisplayValue('All Actions');
    fireEvent.change(actionFilter, { target: { value: 'create' } });

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });
  });
});