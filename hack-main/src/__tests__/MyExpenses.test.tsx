import { render, screen, waitFor } from '@testing-library/react';
import { MyExpenses } from '../pages/employee/MyExpenses';
import { useAuth } from '../contexts/AuthContext';
import { request } from '../lib/api';

jest.mock('../contexts/AuthContext');
jest.mock('../lib/api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('MyExpenses', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Test User', role: 'employee', company_id: '1', email: 'test@example.com', created_at: '2024-01-01T00:00:00Z' },
      token: 'test-token',
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      configError: null,
      refreshUser: jest.fn(),
    });
  });

  test('renders expenses list', async () => {
    mockRequest.mockResolvedValue({
      expenses: [
        {
          id: '1',
          description: 'Test expense',
          amount: 100,
          currency: 'USD',
          status: 'pending',
          date: '2024-01-01',
          receipt_url: '/test.pdf'
        }
      ],
      categories: []
    });

    render(<MyExpenses />);
    
    expect(screen.getByText('My Expenses')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Test expense')).toBeInTheDocument();
      expect(screen.getByText('USD 100.00')).toBeInTheDocument();
    });
  });

  test('pagination works with 10 items per page', async () => {
    const mockExpenses = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 1}`,
      description: `Expense ${i + 1}`,
      amount: 100 + i,
      currency: 'USD',
      status: 'pending',
      date: '2024-01-01',
      receipt_url: null
    }));

    mockRequest.mockResolvedValue({ expenses: mockExpenses, categories: [] });
    
    render(<MyExpenses />);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1 to 10 of 25 expenses')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });
  });

  test('shows receipt link when available', async () => {
    mockRequest.mockResolvedValue({
      expenses: [
        {
          id: '1',
          description: 'Test expense',
          amount: 100,
          currency: 'USD',
          status: 'pending',
          date: '2024-01-01',
          receipt_url: '/uploads/receipts/test.pdf'
        }
      ],
      categories: []
    });

    render(<MyExpenses />);
    
    await waitFor(() => {
      const viewLink = screen.getByText('View');
      expect(viewLink).toBeInTheDocument();
      expect(viewLink.closest('a')).toHaveAttribute('href', expect.stringContaining('/uploads/receipts/test.pdf'));
    });
  });

  test('shows empty state when no expenses', async () => {
    mockRequest.mockResolvedValue({ expenses: [], categories: [] });
    
    render(<MyExpenses />);
    
    await waitFor(() => {
      expect(screen.getByText('No expenses yet')).toBeInTheDocument();
      expect(screen.getByText('Submit your first expense to get started')).toBeInTheDocument();
    });
  });
});