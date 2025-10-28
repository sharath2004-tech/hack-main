// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock API function
const request = async (url: string, token: string, options?: any) => {
  const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:4000';
  if (!API_BASE_URL) {
    throw new Error('Missing VITE_API_URL environment variable');
  }
  
  const headers: any = {
    'Authorization': `Bearer ${token}`,
  };
  
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers,
    ...options,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API Error');
  }
  
  return response.json();
};

describe('API utilities', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    process.env.VITE_API_URL = 'http://localhost:4000';
  });

  test('makes GET request successfully', async () => {
    const mockResponse = { data: 'test' };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const result = await request('/api/test', 'token123');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/test', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
      },
    });
    expect(result).toEqual(mockResponse);
  });

  test('makes POST request with FormData', async () => {
    const mockResponse = { success: true };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const formData = new FormData();
    formData.append('test', 'value');

    await request('/api/upload', 'token123', {
      method: 'POST',
      body: formData,
    });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': 'Bearer token123',
      },
    });
  });

  test('handles API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Invalid data' }),
    } as unknown as Response);

    await expect(request('/api/error', 'token123')).rejects.toThrow('Invalid data');
  });

  test('throws error when API URL is missing', async () => {
    const originalEnv = process.env.VITE_API_URL;
    delete process.env.VITE_API_URL;
    
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Missing VITE_API_URL environment variable' }),
    } as unknown as Response);

    await expect(request('/api/test', 'token123')).rejects.toThrow('Missing VITE_API_URL environment variable');
    
    process.env.VITE_API_URL = originalEnv;
  });
});