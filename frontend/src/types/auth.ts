/**
 * Wire types for the Phase 11 auth surface — mirrors the Pydantic shapes
 * in backend/app/models/auth.py (snake_case preserved at the boundary
 * per project convention).
 */

export interface SessionInfoResponse {
  session_id: string;
  has_history: boolean;
}

export interface RestoreRequest {
  code: string;
}

export interface CsrfTokenResponse {
  csrf_token: string;
}
