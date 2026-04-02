// ─── Domain Types ──────────────────────────────────────────────────────────

export type DocumentStatus = "draft" | "published";

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string;
  description: string | null;
  tags: string[];
  status: DocumentStatus;
  parent_id: string | null;
  position: number;
  author_id: string;
  author_name?: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  children?: Document[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  title: string;
  content: string;
  version: number;
  author_id: string;
  author_name: string;
  created_at: string;
}

export interface NavItem {
  id: string;
  title: string;
  slug: string;
  position: number;
  children?: NavItem[];
}

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  rank: number;
  description: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor";
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total_docs: number;
  published_docs: number;
  draft_docs: number;
  total_users: number;
}

// ─── API Response Types ─────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface ListDocsResponse {
  data: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface NavResponse {
  nav: NavItem[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

// ─── Request Types ──────────────────────────────────────────────────────────

export interface CreateDocRequest {
  title: string;
  slug: string;
  content: string;
  description?: string;
  tags?: string[];
  parent_id?: string | null;
  position?: number;
}

export interface UpdateDocRequest {
  title?: string;
  slug?: string;
  content?: string;
  description?: string;
  tags?: string[];
  parent_id?: string | null;
  position?: number;
}
