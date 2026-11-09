export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  role: { id: string; name: string };
  permissions: string[];
  store: {
    id: string;
    name: string;
    gstin: string | null;
    stateCode: string;
    invoicePrefix: string;
    loyaltyEnabled: boolean;
    loyaltyPointValue: number;
  };
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}
