const OPENCV_URL = "https://docs.opencv.org/4.7.0/opencv.js";
/** npm path on jsDelivr (correct JS MIME; avoids ORB on gh/raw URLs). */
const JSCANIFY_URL = "https://cdn.jsdelivr.net/npm/jscanify@1.4.2/src/jscanify.js";

export type LoadScannerScriptsOptions = {
  onProgress?: (status: string) => void;
};

function loadScript(src: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      if (existing.dataset.loadFailed === "1") {
        reject(
          new Error(
            `${label} failed to load earlier. Hard-refresh the page (Ctrl+Shift+R) and try again.`,
          ),
        );
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          reject(scriptLoadError(label, src));
        },
        { once: true },
      );
      return;
    }

    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => {
      s.dataset.loadFailed = "1";
      reject(scriptLoadError(label, src));
    };
    document.head.appendChild(s);
  });
}

function scriptLoadError(label: string, src: string): Error {
  return new Error(
    `${label} could not be loaded from ${src}. ` +
      "Open DevTools → Network and check for blocked requests (ORB, ad blockers, or offline). " +
      "A hard refresh may help if a previous load failed.",
  );
}

function waitForOpenCv(): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const tick = () => {
      const cv = window.cv;
      if (cv && typeof cv.Mat === "function") {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(
          new Error(
            "OpenCV did not finish initializing within 60s. The download may have stalled, or this device is too slow to compile WASM.",
          ),
        );
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

export async function loadScannerScripts(
  options?: LoadScannerScriptsOptions,
): Promise<InstanceType<Window["jscanify"]>> {
  const progress = options?.onProgress;

  try {
    progress?.("Loading OpenCV…");
    await loadScript(OPENCV_URL, "OpenCV");
    progress?.("Initializing OpenCV…");
    await waitForOpenCv();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Scanner setup failed (OpenCV): ${detail}`);
  }

  try {
    progress?.("Loading jscanify…");
    await loadScript(JSCANIFY_URL, "jscanify");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Scanner setup failed (jscanify): ${detail}`);
  }

  if (typeof window.jscanify !== "function") {
    throw new Error(
      "Scanner setup failed (jscanify): script loaded but did not register on the page. Try a hard refresh.",
    );
  }

  return new window.jscanify();
}

export function cornersArrayFromPoints(
  points: ReturnType<InstanceType<Window["jscanify"]>["getCornerPoints"]>,
): { x: number; y: number }[] | null {
  const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = points;
  if (!topLeftCorner || !topRightCorner || !bottomLeftCorner || !bottomRightCorner) {
    return null;
  }
  return [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner];
}
