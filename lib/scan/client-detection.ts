import {
  SCAN_SCORE_STABILITY_DRIFT_RATIO,
  SCAN_STABILITY_LARGE_DRIFT_RATIO,
  SCAN_STABILITY_SMALL_DRIFT_RATIO,
} from "@/lib/scan/constants";

type Point = { x: number; y: number };

export function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i]!.x * points[j]!.y - points[j]!.x * points[i]!.y;
  }
  return Math.abs(area) / 2;
}

export function scoreCardDetection(
  corners: Point[] | null,
  canvasW: number,
  canvasH: number,
  prevCorners: Point[] | null,
): number {
  if (!corners || corners.length !== 4) return 0;

  const area = polygonArea(corners);
  const frameArea = canvasW * canvasH;
  if (frameArea <= 0) return 0;

  const ratio = area / frameArea;
  if (ratio < 0.06 || ratio > 0.95) return 0;

  const areaScore = Math.min(1, ratio / 0.4);
  let stability = 1;
  if (prevCorners && prevCorners.length === 4) {
    let drift = 0;
    for (let i = 0; i < 4; i++) {
      drift += Math.hypot(corners[i]!.x - prevCorners[i]!.x, corners[i]!.y - prevCorners[i]!.y);
    }
    const maxDrift = Math.min(canvasW, canvasH) * SCAN_SCORE_STABILITY_DRIFT_RATIO;
    stability = Math.max(0, 1 - drift / (maxDrift * 4));
  }

  return Math.max(0, Math.min(1, areaScore * 0.65 + stability * 0.35));
}

export function strokeColorForScore(score: number): string {
  if (score >= 0.75) return "#40c057";
  if (score >= 0.55) return "#fab005";
  return "#fa5252";
}

function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** True when the detected quad moved enough to treat as a new card in frame. */
export function cornersChangedSignificantly(
  current: Point[] | null,
  previous: Point[] | null,
  frameW: number,
  frameH: number,
): boolean {
  if (!current || current.length !== 4) return false;
  if (!previous || previous.length !== 4) return true;

  const prevArea = polygonArea(previous);
  const curArea = polygonArea(current);
  if (prevArea <= 0) return true;

  const c0 = centroid(previous);
  const c1 = centroid(current);
  const shift = Math.hypot(c1.x - c0.x, c1.y - c0.y);
  const shiftThreshold = Math.min(frameW, frameH) * 0.06;

  if (shift > shiftThreshold) return true;

  const areaDelta = Math.abs(curArea - prevArea) / prevArea;
  if (areaDelta > 0.18) return true;

  let cornerDrift = 0;
  for (let i = 0; i < 4; i++) {
    cornerDrift += Math.hypot(current[i]!.x - previous[i]!.x, current[i]!.y - previous[i]!.y);
  }
  const driftThreshold = Math.min(frameW, frameH) * SCAN_STABILITY_LARGE_DRIFT_RATIO * 4;
  return cornerDrift > driftThreshold;
}

/** Average pixel movement per corner vs the previous frame. */
export function averageCornerDrift(
  current: Point[],
  previous: Point[] | null,
): number | null {
  if (current.length !== 4 || !previous || previous.length !== 4) return null;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    sum += Math.hypot(current[i]!.x - previous[i]!.x, current[i]!.y - previous[i]!.y);
  }
  return sum / 4;
}

export type ScanCaptureHint =
  | { kind: "movement" }
  | { kind: "stabilizing"; stable: number; required: number }
  | { kind: "low_detection"; score: number; required: number }
  | { kind: "same_card" }
  | { kind: "cooldown" }
  | { kind: "busy" };

export function resolveScanCaptureHint(input: {
  corners: Point[] | null;
  score: number;
  frameDrift: number | null;
  frameMinDim: number;
  detectionMinScore: number;
  overlayMinScore: number;
  stableCount: number;
  requiredStable: number;
  stableEnough: boolean;
  intervalOk: boolean;
  busy: boolean;
  hasPriorScan: boolean;
  sceneChanged: boolean;
}): ScanCaptureHint | null {
  const {
    corners,
    score,
    frameDrift,
    frameMinDim,
    detectionMinScore,
    overlayMinScore,
    stableCount,
    requiredStable,
    stableEnough,
    intervalOk,
    busy,
    hasPriorScan,
    sceneChanged,
  } = input;

  if (!corners || corners.length !== 4 || score < overlayMinScore) return null;
  if (busy) return { kind: "busy" };
  if (hasPriorScan && !sceneChanged) return { kind: "same_card" };

  const largeDriftPx = frameMinDim * SCAN_STABILITY_LARGE_DRIFT_RATIO;
  const smallDriftPx = frameMinDim * SCAN_STABILITY_SMALL_DRIFT_RATIO;
  const detectionOk = score >= detectionMinScore;
  const smallDrift = frameDrift !== null && frameDrift <= smallDriftPx;

  if (frameDrift !== null && frameDrift >= largeDriftPx) {
    return { kind: "movement" };
  }
  if (!detectionOk && !smallDrift) {
    return {
      kind: "low_detection",
      score,
      required: detectionMinScore,
    };
  }
  if (!stableEnough) {
    return { kind: "stabilizing", stable: stableCount, required: requiredStable };
  }
  if (!intervalOk) return { kind: "cooldown" };
  return null;
}

export function scanCaptureHintMessage(hint: ScanCaptureHint): string {
  switch (hint.kind) {
    case "movement":
      return "Too much movement — hold the camera steadier";
    case "stabilizing":
      return `Hold steady… ${hint.stable}/${hint.required}`;
    case "low_detection":
      return `Detection ${Math.round(hint.score * 100)}% — need ${Math.round(hint.required * 100)}%`;
    case "same_card":
      return "Move to another card to scan again";
    case "cooldown":
      return "Waiting before next scan…";
    case "busy":
      return "Scanning…";
  }
}
