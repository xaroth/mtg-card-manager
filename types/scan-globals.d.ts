export {};

type ScanCorner = { x: number; y: number };

type ScanCornerPoints = {
  topLeftCorner?: ScanCorner;
  topRightCorner?: ScanCorner;
  bottomLeftCorner?: ScanCorner;
  bottomRightCorner?: ScanCorner;
};

declare global {
  interface Window {
    cv: {
      Mat: unknown;
      imread: (image: HTMLCanvasElement | HTMLImageElement) => unknown;
      [key: string]: unknown;
      onRuntimeInitialized?: () => void;
    };
    jscanify: new () => {
      findPaperContour: (img: unknown) => unknown;
      getCornerPoints: (contour: unknown) => ScanCornerPoints;
      extractPaper: (
        image: HTMLCanvasElement,
        resultWidth: number,
        resultHeight: number,
        cornerPoints?: ScanCornerPoints,
      ) => HTMLCanvasElement | null;
    };
  }
}
