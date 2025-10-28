import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmployeeDashboard } from '../pages/employee/EmployeeDashboard';
import { useAuth } from '../contexts/AuthContext';
import { request } from '../lib/api';

jest.mock('../contexts/AuthContext');
jest.mock('../lib/api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('EmployeeDashboard', () => {
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

  test('renders expense form', () => {
    render(<EmployeeDashboard />);
    expect(screen.getByText('Submit Expense')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  test('receipt upload is at the top', () => {
    render(<EmployeeDashboard />);
    const receiptInput = screen.getByLabelText('Receipt (Optional)');
    const descriptionInput = screen.getByLabelText('Description');
    
    expect(receiptInput.compareDocumentPosition(descriptionInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('submits expense form', async () => {
    mockRequest.mockResolvedValue({ success: true });
    
    render(<EmployeeDashboard />);
    
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Test expense' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100.00' } });
    fireEvent.click(screen.getByText('Submit Expense'));
    
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/api/expenses', 'test-token', expect.any(Object));
    });
  });

  test('handles receipt analysis', async () => {
    const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
    mockRequest.mockResolvedValue({ 
      analysis: { 
        merchant: 'Test Store', 
        amount: 50.00, 
        currency: 'USD',
        date: '2024-01-01'
      } 
    });
    
    render(<EmployeeDashboard />);
    
    const fileInput = screen.getByLabelText('Receipt (Optional)');
    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/api/receipts/analyze', 'test-token', expect.any(Object));
    });
  });
});