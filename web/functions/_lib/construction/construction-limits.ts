/** Maximum raw file size for construction document uploads (supports user files up to 15 MB). */
export const CONSTRUCTION_MAX_BYTES = 16 * 1024 * 1024;

/** User-facing cap (MB) shown in UI copy. */
export const CONSTRUCTION_MAX_MB = 15;

/**
 * KV value limit is 25 MiB; base64 expands ~4/3. 16 MiB raw fits safely in KV when Firebase is unavailable.
 */
export const KV_CONSTRUCTION_MAX_BYTES = 16 * 1024 * 1024;
