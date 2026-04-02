import type {
  AuthResponse,
  Document,
  ListDocsResponse,
  NavResponse,
  SearchResponse,
  Stats,
  DocumentVersion,
  CreateDocRequest,
  UpdateDocRequest,
} from "@/src/types";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Token management
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string) => { accessToken = token; },
  clear: () => { accessToken = null; },
};

// Base fetch with auth and error handling
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && accessToken) {
    // Try to refresh token
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      try {
        const refreshed = await refreshAccessToken(refreshToken);
        headers["Authorization"] = `Bearer ${refreshed.access_token}`;
        tokenStore.set(refreshed.access_token);
        localStorage.setItem("refresh_token", refreshed.refresh_token);

        // Retry original request
        const retryRes = await fetch(`/api/v1${path}`, {
          ...options,
          headers,
        });
        if (!retryRes.ok) {
          const errBody: { error: string; code?: string } = await retryRes.json().catch(() => ({ error: "Unknown error" }));
          throw new ApiError(retryRes.status, errBody.code, errBody.error);
        }
        return retryRes.json();
      } catch {
        tokenStore.clear();
        localStorage.removeItem("refresh_token");
        window.location.href = "/admin/login";
        throw new ApiError(401, "AUTH_EXPIRED", "Session expired");
      }
    }
  }

  if (!res.ok) {
    const err: { error: string; code?: string } = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, err.code, err.error);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth API ───────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
  const res = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error("Refresh failed");
  return res.json();
}

export const auth = {
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, name: string, password: string, role?: string) =>
    apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, name, password, role }),
    }),

  logout: () =>
    apiFetch<void>("/auth/logout", { method: "POST" }),

  me: () => apiFetch<import("@/src/types").User>("/auth/me"),

  refresh: (refreshToken: string) => refreshAccessToken(refreshToken),
};

// ─── Public API ─────────────────────────────────────────────────────────────

export const publicApi = {
  listDocs: () =>
    apiFetch<{ data: Omit<Document, "content">[]; total: number }>("/public/docs"),

  getDoc: (slug: string) =>
    apiFetch<Document>(`/public/docs/${slug}`),

  getNav: () =>
    apiFetch<NavResponse>("/public/nav"),

  search: (q: string) =>
    apiFetch<SearchResponse>(`/public/search?q=${encodeURIComponent(q)}`),
};

// ─── Admin API ───────────────────────────────────────────────────────────────

export const adminApi = {
  listDocs: (params?: { page?: number; page_size?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.page_size) qs.set("page_size", String(params.page_size));
    if (params?.status) qs.set("status", params.status);
    return apiFetch<ListDocsResponse>(`/admin/docs?${qs.toString()}`);
  },

  getDoc: (id: string) =>
    apiFetch<Document>(`/admin/docs/${id}`),

  createDoc: (data: CreateDocRequest) =>
    apiFetch<Document>("/admin/docs", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateDoc: (id: string, data: UpdateDocRequest) =>
    apiFetch<Document>(`/admin/docs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteDoc: (id: string) =>
    apiFetch<{ message: string }>(`/admin/docs/${id}`, { method: "DELETE" }),

  publishDoc: (id: string) =>
    apiFetch<{ message: string }>(`/admin/docs/${id}/publish`, { method: "PATCH" }),

  unpublishDoc: (id: string) =>
    apiFetch<{ message: string }>(`/admin/docs/${id}/unpublish`, { method: "PATCH" }),

  moveDoc: (id: string, parent_id: string | null, position: number) =>
    apiFetch<{ message: string }>(`/admin/docs/${id}/move`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id, position }),
    }),

  getVersions: (id: string) =>
    apiFetch<{ versions: DocumentVersion[]; total: number }>(`/admin/docs/${id}/versions`),

  getStats: () =>
    apiFetch<Stats>("/admin/stats"),

  reindex: () =>
    apiFetch<{ message: string }>("/admin/search/reindex", { method: "POST" }),
};
