/**
 * Typed REST client for the wikilab server extension.
 *
 * Every function delegates to `requestAPI` from `./request` and returns a
 * strongly-typed promise matching the backend response shape defined in
 * `./types`.
 */

import { ServerConnection } from '@jupyterlab/services';

import { requestAPI } from './request';
import type {
  WikiListResponse,
  WikiCreateRequest,
  OperationResponse,
  PageListResponse,
  PageGetResponse,
  PageSaveRequest,
  PageCreateRequest,
  PageCreateResponse,
  PageRenameRequest,
  HistoryResponse,
  PageAtShaResponse,
  GitStatusResponse,
  SearchResponse,
  BacklinksResponse
} from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the base URL for a given wiki ID.
 *
 * Backend route pattern: `/wikilab/api/wikis/{wiki_id}`
 */
function wikiUrl(wikiId: string, ...segments: string[]): string {
  const parts = ['wikilab', 'api', 'wikis', wikiId, ...segments];
  return parts.filter(Boolean).join('/');
}

// ── Wiki endpoints ──────────────────────────────────────────────────────────

/**
 * List all registered wikis for the current user.
 *
 * `GET /wikis`
 */
export async function listWikis(
  serverSettings: ServerConnection.ISettings
): Promise<WikiListResponse> {
  return requestAPI<WikiListResponse>('wikis', serverSettings, {
    method: 'GET'
  });
}

/**
 * Register a new wiki.
 *
 * `POST /wikis/{wiki_id}`
 */
export async function createWiki(
  wikiId: string,
  payload: WikiCreateRequest,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  return requestAPI<OperationResponse>(
    `wikis/${encodeURIComponent(wikiId)}`,
    serverSettings,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Remove a registered wiki.
 *
 * `DELETE /wikis/{wiki_id}/delete`
 */
export async function deleteWiki(
  wikiId: string,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  return requestAPI<OperationResponse>(
    `wikis/${encodeURIComponent(wikiId)}/delete`,
    serverSettings,
    { method: 'DELETE' }
  );
}

// ── Page endpoints ──────────────────────────────────────────────────────────

/**
 * List all pages in a wiki.
 *
 * `GET /wikis/{wiki_id}/pages`
 */
export async function listPages(
  wikiId: string,
  serverSettings: ServerConnection.ISettings
): Promise<PageListResponse> {
  return requestAPI<PageListResponse>(
    wikiUrl(wikiId, 'pages'),
    serverSettings,
    { method: 'GET' }
  );
}

/**
 * Get page content by slug.
 *
 * `GET /wikis/{wiki_id}/pages/{slug}`
 */
export async function getPage(
  wikiId: string,
  slug: string,
  serverSettings: ServerConnection.ISettings
): Promise<PageGetResponse> {
  return requestAPI<PageGetResponse>(
    wikiUrl(wikiId, 'pages', encodeURIComponent(slug)),
    serverSettings,
    { method: 'GET' }
  );
}

/**
 * Save (upsert) a page.
 *
 * `PUT /wikis/{wiki_id}/pages/{slug}`
 *
 * Sends `head_sha` for optimistic concurrency control.
 */
export async function savePage(
  wikiId: string,
  slug: string,
  payload: PageSaveRequest,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  try {
    return requestAPI<OperationResponse>(
      wikiUrl(wikiId, 'pages', encodeURIComponent(slug)),
      serverSettings,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    if (
      err instanceof ServerConnection.ResponseError &&
      err.response.status === 409
    ) {
      const data = await err.response.json().catch(() => ({}));
      throw Object.assign(new Error('Conflict'), data);
    }
    throw err;
  }
}

/**
 * Create a new page.
 *
 * `POST /wikis/{wiki_id}/pages`
 */
export async function createPage(
  wikiId: string,
  payload: PageCreateRequest,
  serverSettings: ServerConnection.ISettings
): Promise<PageCreateResponse> {
  return requestAPI<PageCreateResponse>(
    wikiUrl(wikiId, 'pages', 'create'),
    serverSettings,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Delete a page.
 *
 * `DELETE /wikis/{wiki_id}/pages/{slug}/delete`
 */
export async function deletePage(
  wikiId: string,
  slug: string,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  return requestAPI<OperationResponse>(
    wikiUrl(wikiId, 'pages', encodeURIComponent(slug), 'delete'),
    serverSettings,
    { method: 'DELETE' }
  );
}

/**
 * Rename a page.
 *
 * `POST /wikis/{wiki_id}/pages/{slug}/rename`
 */
export async function renamePage(
  wikiId: string,
  slug: string,
  payload: PageRenameRequest,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  return requestAPI<OperationResponse>(
    wikiUrl(wikiId, 'pages', encodeURIComponent(slug), 'rename'),
    serverSettings,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// ── Git endpoints ───────────────────────────────────────────────────────────

/**
 * Get the git status of a wiki.
 *
 * `GET /wikis/{wiki_id}/git/status`
 */
export async function getGitStatus(
  wikiId: string,
  serverSettings: ServerConnection.ISettings
): Promise<GitStatusResponse> {
  return requestAPI<GitStatusResponse>(
    wikiUrl(wikiId, 'git', 'status'),
    serverSettings,
    { method: 'GET' }
  );
}

/**
 * Pull from the remote.
 *
 * `POST /wikis/{wiki_id}/git/pull`
 */
export async function gitPull(
  wikiId: string,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  return requestAPI<OperationResponse>(
    wikiUrl(wikiId, 'git', 'pull'),
    serverSettings,
    { method: 'POST' }
  );
}

/**
 * Push to the remote.
 *
 * `POST /wikis/{wiki_id}/git/push`
 */
export async function gitPush(
  wikiId: string,
  serverSettings: ServerConnection.ISettings
): Promise<OperationResponse> {
  return requestAPI<OperationResponse>(
    wikiUrl(wikiId, 'git', 'push'),
    serverSettings,
    { method: 'POST' }
  );
}

// ── History / backlinks / search ────────────────────────────────────────────

/**
 * Get git commit history for a page.
 *
 * `GET /wikis/{wiki_id}/pages/{slug}/history`
 */
export async function getPageHistory(
  wikiId: string,
  slug: string,
  serverSettings: ServerConnection.ISettings
): Promise<HistoryResponse> {
  return requestAPI<HistoryResponse>(
    wikiUrl(wikiId, 'pages', encodeURIComponent(slug), 'history'),
    serverSettings,
    { method: 'GET' }
  );
}

/**
 * Get page content at a specific git commit SHA.
 *
 * `GET /wikis/{wiki_id}/pages/{slug}/history/{sha}`
 */
export async function getPageContentAtSha(
  wikiId: string,
  slug: string,
  sha: string,
  serverSettings: ServerConnection.ISettings
): Promise<PageAtShaResponse> {
  return requestAPI<PageAtShaResponse>(
    wikiUrl(wikiId, 'pages', encodeURIComponent(slug), 'history', sha),
    serverSettings,
    { method: 'GET' }
  );
}

/**
 * Find backlinks to a page.
 *
 * `GET /wikis/{wiki_id}/pages/{slug}/backlinks`
 */
export async function getBacklinks(
  wikiId: string,
  slug: string,
  serverSettings: ServerConnection.ISettings
): Promise<BacklinksResponse> {
  return requestAPI<BacklinksResponse>(
    wikiUrl(wikiId, 'pages', encodeURIComponent(slug), 'backlinks'),
    serverSettings,
    { method: 'GET' }
  );
}

/**
 * Full-text search across a wiki.
 *
 * `GET /wikis/{wiki_id}/pages/search?term=...&case_sensitive=...`
 */
export async function searchWiki(
  wikiId: string,
  term: string,
  caseSensitive = false,
  serverSettings: ServerConnection.ISettings
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    term,
    case_sensitive: String(caseSensitive)
  });
  return requestAPI<SearchResponse>(
    `${wikiUrl(wikiId, 'pages', 'search')}?${params.toString()}`,
    serverSettings,
    { method: 'GET' }
  );
}
