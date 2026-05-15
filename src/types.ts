/**
 * TypeScript API contracts for the wikilab REST API.
 *
 * These interfaces mirror the JSON responses produced by the
 * Python backend handlers in `jupyterhub_wikilab/routes.py`.
 * Every field name matches the backend serialiser exactly.
 */

// ── Wiki types ──────────────────────────────────────────────────────────────

/** A registered wiki entry returned by the backend. */
export interface WikiInfo {
  id: string;
  name: string;
  path: string;
}

/** GET /wikis response body. */
export interface WikiListResponse {
  wikis: Record<string, WikiInfo>;
}

/** POST /wikis/{id} request body. */
export interface WikiCreateRequest {
  id: string;
  name: string;
  path: string;
}

/** Success response for create/delete/rename/save operations. */
export interface OperationResponse {
  message: string;
}

/** Error response from any endpoint. */
export interface ErrorResponse {
  error: string;
}

// ── Page types ──────────────────────────────────────────────────────────────

/** Metadata for a single wiki page. */
export interface PageEntry {
  slug: string;
  title: string;
  mtime: string;
  head_sha?: string;
}

/** GET /wikis/{id}/pages response body. */
export interface PageListResponse {
  pages: PageEntry[];
}

/** GET /wikis/{id}/pages/{slug} response body. */
export interface PageGetResponse {
  content: string;
  head_sha?: string;
}

/** PUT /wikis/{id}/pages/{slug} request body. */
export interface PageSaveRequest {
  content: string;
  head_sha?: string;
}

/** POST /wikis/{id}/pages request body. */
export interface PageCreateRequest {
  title: string;
  content: string;
}

/** POST /wikis/{id}/pages/{slug} response body (newly created). */
export interface PageCreateResponse {
  slug: string;
  message: string;
}

/** POST /wikis/{id}/pages/{slug}/rename request body. */
export interface PageRenameRequest {
  new_title: string;
}

// ── Conflict types ──────────────────────────────────────────────────────────

/** 409 Conflict response when a stale write is detected. */
export interface ConflictResponse extends ErrorResponse {
  error: string;
  base_content?: string;
  their_content?: string;
}

// ── Git types ───────────────────────────────────────────────────────────────

/** Single git log entry returned for a page. */
export interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  author_email: string;
  date: string;
}

/** GET /wikis/{id}/pages/{slug}/history response body. */
export interface HistoryResponse {
  history: CommitEntry[];
}

/** GET /wikis/{id}/pages/{slug}/history/{sha} response body. */
export interface PageAtShaResponse {
  content: string;
}

/** GET /wikis/{id}/git/status response body. */
export interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  untracked: number;
  error?: string;
}

// ── Search / backlink types ─────────────────────────────────────────────────

/** Single full-text search hit. */
export interface SearchResult {
  file: string;
  line: number;
  content: string;
}

/** GET /wikis/{id}/pages/search response body. */
export interface SearchResponse {
  results: SearchResult[];
}

/** GET /wikis/{id}/pages/{slug}/backlinks response body. */
export interface BacklinksResponse {
  backlinks: string[];
}

// ── Request / response type map ─────────────────────────────────────────────

/**
 * Maps every API endpoint to its request and response types.
 * Used by `wikiApi.ts` to keep callers fully typed.
 */
export type ApiResponseMap = {
  'GET:/wikis': WikiListResponse;
  'POST:/wikis': OperationResponse;
  'DELETE:/wikis': OperationResponse;
  'GET:/wikis/:id/pages': PageListResponse;
  'GET:/wikis/:id/pages/:slug': PageGetResponse;
  'PUT:/wikis/:id/pages/:slug': OperationResponse;
  'POST:/wikis/:id/pages': PageCreateResponse;
  'DELETE:/wikis/:id/pages/:slug': OperationResponse;
  'POST:/wikis/:id/pages/:slug/rename': OperationResponse;
  'GET:/wikis/:id/pages/:slug/history': HistoryResponse;
  'GET:/wikis/:id/pages/:slug/history/:sha': PageAtShaResponse;
  'GET:/wikis/:id/git/status': GitStatusResponse;
  'POST:/wikis/:id/git/pull': OperationResponse;
  'POST:/wikis/:id/git/push': OperationResponse;
  'GET:/wikis/:id/pages/search': SearchResponse;
  'GET:/wikis/:id/pages/:slug/backlinks': BacklinksResponse;
};
