export type CoverTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

/** Same layout math as CSS `object-fit: cover` (center crop). */
export function computeObjectFitCoverTransform(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): CoverTransform {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.max(dstW / srcW, dstH / srcH);
  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  return {
    scale,
    offsetX: (dstW - scaledW) / 2,
    offsetY: (dstH - scaledH) / 2,
  };
}

export function mapPointCover(
  point: { x: number; y: number },
  transform: CoverTransform,
): { x: number; y: number } {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

export function mapPointsCover(
  points: { x: number; y: number }[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number }[] {
  const t = computeObjectFitCoverTransform(srcW, srcH, dstW, dstH);
  return points.map((p) => mapPointCover(p, t));
}
