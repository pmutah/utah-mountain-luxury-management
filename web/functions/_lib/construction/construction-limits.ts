/** Maximum raw file size for construction document uploads (supports user files up to 15 MB). */
export const CONSTRUCTION_MAX_BYTES = 16 * 1024 * 1024;

/** User-facing cap (MB) shown in UI copy. */
export const CONSTRUCTION_MAX_MB = 15;

/** Single KV value — one base64 blob (fast path for smaller files). */
export const KV_CONSTRUCTION_SINGLE_MAX_BYTES = 3 * 1024 * 1024;

/** Raw bytes per chunk when splitting across KV keys. */
export const KV_CONSTRUCTION_CHUNK_BYTES = 3 * 1024 * 1024;

/** Skip synchronous Gemini ingest above this size (avoids Worker timeouts). */
export const CONSTRUCTION_INGEST_MAX_BYTES = 10 * 1024 * 1024;
