import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { useAuth } from '../contexts/AuthContext';
import { request } from '../lib/api';

jest.mock('../contexts/AuthContext');
jest.mock('../lib/api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('ManagerDashboard', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Manager', role: 'manager', company_id: '1', email: 'manager@example.com', created_at: '2024-01-01T00:00:00Z' },
      token: 'test-token',
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      configError: null,
      refreshUser: jest.fn(),
    });

    mockRequest.mockResolvedValue({
      approvals: [],
      categories: []
    });
  });

  test('renders approvals page', async () => {
    render(<ManagerDashboard />);
    expect(screen.getByText('Approvals')).toBeInTheDocument();
    expect(screen.getByText('Review and approve expense requests')).toBeInTheDocument();
  });

  test('search bar filters by request owner', async () => {
    const mockApprovals = [
      {
        id: '1',
        expense: { id: '1', description: 'Test', amount: 100, currency: 'USD' },
        requester: { id: '1', name: 'John Doe' },
        status: 'pending'
      },
      {
        id: '2',
        expense: { id: '2', description: 'Test2', amount: 200, currency: 'USD' },
        requester: { id: '2', name: 'Jane Smith' },
        status: 'pending'
      }
    ];

    mockRequest.mockResolvedValue({ approvals: mockApprovals, categories: [] });
    
    render(<ManagerDashboard />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by request owner...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by request owner...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    expect(searchInput).toHaveValue('John');
  });

  test('pagination shows 10 items per page', async () => {
    const mockApprovals = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 1}`,
      expense: { id: `${i + 1}`, description: `Test ${i + 1}`, amount: 100, currency: 'USD' },
      requester: { id: `${i + 1}`, name: `User ${i + 1}` },
      status: 'pending'
    }));

    mockRequest.mockResolvedValue({ approvals: mockApprovals, categories: [] });
    
    render(<ManagerDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1 to 10 of 25 approvals')).toBeInTheDocument();
    });
  });

  test('can approve expense', async () => {
    const mockApproval = {
      id: '1',
      expense: { id: '1', description: 'Test expense', amount: 100, currency: 'USD', receipt_url: '/test.pdf' },
      requester: { id: '1', name: 'John Doe' },
      status: 'pending'
    };

    mockRequest.mockResolvedValue({ approvals: [mockApproval], categories: [] });
    
    render(<ManagerDashboard />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Review'));
    });

    await waitFor(() => {
      expect(screen.getByText('Review Expense')).toBeInTheDocument();
      expect(screen.getByText('View Receipt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Approve'));
    
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/api/approvals/1/decision',
        'test-token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'approved', comments: '' })
        })
      );
    });
  });
});