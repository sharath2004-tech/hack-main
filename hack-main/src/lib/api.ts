export interface ApiError extends Error {
  status: number;
  details?: unknown;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const buildHeaders = (
  token: string | null,
  extra: HeadersInit = {},
  skipJsonContentType = false
): HeadersInit => {
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(extra)),
  };

  if (!skipJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const makeError = async (response: Response): Promise<ApiError> => {
  const error = new Error('Request failed') as ApiError;
  error.status = response.status;
  try {
    const payload = await response.json();
    error.message = payload?.error || response.statusText;
    error.details = payload;
  } catch {
    error.message = response.statusText;
  }
  return error;
};

export const request = async <T>(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> => {
  if (!API_BASE_URL) {
    throw Object.assign(new Error('Missing VITE_API_URL environment variable'), { status: 500 });
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(
      token,
      options.headers || {},
      options.body instanceof FormData
    ),
  });

  if (!response.ok) {
    throw await makeError(response);
  }

  return response.headers.get('content-type')?.includes('application/json')
    ? ((await response.json()) as T)
    : (undefined as T);
};
