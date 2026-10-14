/** Canonical card aspect for warp + hashing (matches typical Scryfall border_crop ratio). */
export const SCAN_CANONICAL_WIDTH = 488;
export const SCAN_CANONICAL_HEIGHT = 680;

/** Hide border overlay below this detection score (0–1). */
export const SCAN_OVERLAY_MIN_SCORE = 0.3;

/** Min border detection score (0–1) before auto-capture sends a frame to /api/scan. */
export const SCAN_DETECTION_MIN_SCORE_DEFAULT = 0.65;

/**
 * Stable frames after a successful scan, once the detected quad has moved
 * enough to count as a new card (`cornersChangedSignificantly` vs last scan).
 * First scan in a session still uses `scanStableFrames` from config (default 8).
 */
export const SCAN_STABLE_FRAMES_RESCAN = 4;

/**
 * Corner drift per frame, as a fraction of min(video width, height).
 * Below `SMALL`: counts as stable even if the composite score wobbles slightly.
 * At or above `LARGE`: resets the stable-frame counter (hand moved too much).
 */
export const SCAN_STABILITY_SMALL_DRIFT_RATIO = 0.1;
export const SCAN_STABILITY_LARGE_DRIFT_RATIO = 0.2;

/** How quickly the detection % penalizes frame-to-frame corner jitter (display score). */
export const SCAN_SCORE_STABILITY_DRIFT_RATIO = 0.16;

/**
 * dHash fingerprint size in bits. Change only here (supported: 64, 128, 256).
 * Must be divisible by 8 and by `DHASH_ROW_COUNT`.
 */
export const SCAN_HASH_BITS = 1024;

/** dHash grid rows; comparisons per row × rows must equal `SCAN_HASH_BITS`. */
export const DHASH_ROW_COUNT = 32;

if (SCAN_HASH_BITS % 8 !== 0) {
  throw new Error(`SCAN_HASH_BITS (${SCAN_HASH_BITS}) must be divisible by 8`);
}
if (SCAN_HASH_BITS % DHASH_ROW_COUNT !== 0) {
  throw new Error(
    `SCAN_HASH_BITS (${SCAN_HASH_BITS}) must be divisible by DHASH_ROW_COUNT (${DHASH_ROW_COUNT})`,
  );
}

/** dHash sample grid width in pixels (`DHASH_COLS - 1` horizontal comparisons per row). */
export const DHASH_COLS = SCAN_HASH_BITS / DHASH_ROW_COUNT + 1;

export const SCAN_HASH_BYTE_SIZE = SCAN_HASH_BITS / 8;

/**
 * Default max Hamming distance for a hash match (~37.5% of bits; ~62% min shown
 * confidence). Looser than the original 12/64 cutoff to surface more candidates.
 */
export const SCAN_MATCH_MAX_HAMMING_DEFAULT = Math.round(
  (SCAN_HASH_BITS * 24) / 64,
);

export const SCAN_INDEX_VERSION = 1;
