import type { AppConfig } from "@/lib/mtg/schemas";
import {
  SCAN_DETECTION_MIN_SCORE_DEFAULT,
  SCAN_MATCH_MAX_HAMMING_DEFAULT,
} from "@/lib/scan/constants";
import type { ScanIndexImageKind } from "@/lib/scan/types";

export type ResolvedScanConfig = {
  scanMinIntervalMs: number;
  scanMatchMaxHamming: number;
  scanMatchMaxResults: number;
  scanDetectionMinScore: number;
  scanStableFrames: number;
  scanIndexImageKind: ScanIndexImageKind;
};

export function resolveScanConfig(cfg: AppConfig): ResolvedScanConfig {
  return {
    scanMinIntervalMs: cfg.scanMinIntervalMs ?? 1000,
    scanMatchMaxHamming: cfg.scanMatchMaxHamming ?? SCAN_MATCH_MAX_HAMMING_DEFAULT,
    scanMatchMaxResults: cfg.scanMatchMaxResults ?? 8,
    scanDetectionMinScore: cfg.scanDetectionMinScore ?? SCAN_DETECTION_MIN_SCORE_DEFAULT,
    scanStableFrames: cfg.scanStableFrames ?? 8,
    scanIndexImageKind: cfg.scanIndexImageKind ?? "border_crop",
  };
}
