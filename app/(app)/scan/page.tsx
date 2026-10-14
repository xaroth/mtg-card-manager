"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  Image,
  Loader,
  LoadingOverlay,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { ScanPrintAdjustModal } from "@/components/ScanPrintAdjustModal";
import { SetIcon } from "@/components/SetIcon";
import type { AppConfig } from "@/lib/mtg/schemas";
import {
  SCAN_CANONICAL_HEIGHT,
  SCAN_CANONICAL_WIDTH,
  SCAN_OVERLAY_MIN_SCORE,
  SCAN_STABLE_FRAMES_RESCAN,
  SCAN_STABILITY_LARGE_DRIFT_RATIO,
  SCAN_STABILITY_SMALL_DRIFT_RATIO,
} from "@/lib/scan/constants";
import { resolveScanConfig } from "@/lib/scan/config";
import {
  averageCornerDrift,
  cornersChangedSignificantly,
  resolveScanCaptureHint,
  scanCaptureHintMessage,
  strokeColorForScore,
  scoreCardDetection,
  type ScanCaptureHint,
} from "@/lib/scan/client-detection";
import {
  cornersArrayFromPoints,
  loadScannerScripts,
} from "@/lib/scan/load-scanner-scripts";
import { mapPointsCover } from "@/lib/scan/object-fit-cover";
import type { ScanMatchResult } from "@/lib/scan/types";

type ScanStatus = {
  ready: boolean;
  entryCount: number;
  builtAt?: string;
};

const ANALYSIS_INTERVAL_MS = 80;

export default function ScanPage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<InstanceType<Window["jscanify"]> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCornersRef = useRef<{ x: number; y: number }[] | null>(null);
  const stableCountRef = useRef(0);
  const lastScanAtRef = useRef(0);
  const scanningRef = useRef(false);
  const extractingRef = useRef(false);
  const lastScanCornersRef = useRef<{ x: number; y: number }[] | null>(null);
  const pendingScanReplacesResultsRef = useRef(false);

  const [scannerReady, setScannerReady] = useState(false);
  const [scannerLoadStatus, setScannerLoadStatus] = useState("Loading scanner…");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<ScanStatus | null>(null);
  const [config, setConfig] = useState(() => resolveScanConfig({ defaultSearchQuery: "" }));
  const [detectionScore, setDetectionScore] = useState(0);
  const [captureHint, setCaptureHint] = useState<ScanCaptureHint | null>(null);
  const captureHintKeyRef = useRef<string | null>(null);
  const [results, setResults] = useState<ScanMatchResult[]>([]);
  const [lastScanError, setLastScanError] = useState<string | null>(null);
  const [pick, setPick] = useState<ScanMatchResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const releaseCameraStream = useCallback(() => {
    for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    lastCornersRef.current = null;
    lastScanCornersRef.current = null;
    stableCountRef.current = 0;
    extractingRef.current = false;
    captureHintKeyRef.current = null;
    setCaptureHint(null);
    const overlay = overlayRef.current;
    const octx = overlay?.getContext("2d");
    if (overlay && octx) octx.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  const toggleCamera = useCallback(() => {
    if (cameraEnabled) {
      releaseCameraStream();
      setDetectionScore(0);
      setCaptureHint(null);
      captureHintKeyRef.current = null;
      setCameraEnabled(false);
    } else {
      setCameraEnabled(true);
    }
  }, [cameraEnabled, releaseCameraStream]);

  useEffect(() => {
    let cancelled = false;
    void loadScannerScripts({
      onProgress: (status) => {
        if (!cancelled) setScannerLoadStatus(status);
      },
    })
      .then((scanner) => {
        if (!cancelled) {
          scannerRef.current = scanner;
          setScannerReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setCameraError(
            e instanceof Error ? e.message : "Failed to load scanner libraries",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: AppConfig | null) => {
        if (cfg) setConfig(resolveScanConfig(cfg));
      })
      .catch(() => {});
  }, []);

  const refreshIndexStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/status");
      if (res.ok) setIndexStatus((await res.json()) as ScanStatus);
    } catch {
      setIndexStatus({ ready: false, entryCount: 0 });
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refreshIndexStatus(), 0);
    return () => window.clearTimeout(t);
  }, [refreshIndexStatus]);

  useEffect(() => {
    if (!scannerReady || !cameraEnabled) return;

    let cancelled = false;

    async function startCamera() {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch (e) {
        setCameraError(
          e instanceof Error
            ? e.message
            : "Camera access denied. Use HTTPS or localhost.",
        );
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      releaseCameraStream();
    };
  }, [scannerReady, cameraEnabled, releaseCameraStream]);

  const postScan = useCallback(async (blob: Blob) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLastScanError(null);
    try {
      const form = new FormData();
      form.append("image", blob, "scan.jpg");
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const body = (await res.json()) as {
        matches?: ScanMatchResult[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      if (body.matches && body.matches.length > 0) {
        setResults(body.matches);
      } else if (pendingScanReplacesResultsRef.current) {
        setResults([]);
      }
    } catch (e) {
      setLastScanError(e instanceof Error ? e.message : String(e));
    } finally {
      scanningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!scannerReady || !indexStatus?.ready || !cameraEnabled) return;

    let raf = 0;
    let lastTick = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastTick < ANALYSIS_INTERVAL_MS) return;
      lastTick = now;

      const video = videoRef.current;
      const viewport = viewportRef.current;
      const overlay = overlayRef.current;
      const work = workRef.current;
      const scanner = scannerRef.current;
      if (!video || !viewport || !overlay || !work || !scanner || video.readyState < 2) {
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;

      const displayW = viewport.clientWidth;
      const displayH = viewport.clientHeight;
      if (!displayW || !displayH) return;

      work.width = w;
      work.height = h;
      const wctx = work.getContext("2d");
      if (!wctx) return;
      wctx.drawImage(video, 0, 0, w, h);

      let corners: { x: number; y: number }[] | null = null;
      let cornerPoints: ReturnType<typeof scanner.getCornerPoints> | null = null;
      try {
        const img = window.cv.imread(work) as { delete: () => void };
        const contour = scanner.findPaperContour(img);
        if (contour) {
          cornerPoints = scanner.getCornerPoints(contour);
          corners = cornersArrayFromPoints(cornerPoints);
        }
        img.delete();
      } catch {
        corners = null;
      }

      const prevCorners = lastCornersRef.current;
      const score = scoreCardDetection(corners, w, h, prevCorners);
      const frameDrift =
        corners && prevCorners ? averageCornerDrift(corners, prevCorners) : null;
      lastCornersRef.current = corners;
      setDetectionScore(score);

      const dpr = window.devicePixelRatio || 1;
      overlay.width = Math.round(displayW * dpr);
      overlay.height = Math.round(displayH * dpr);
      overlay.style.width = "100%";
      overlay.style.height = "100%";

      const octx = overlay.getContext("2d");
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.clearRect(0, 0, displayW, displayH);
        if (corners && corners.length === 4 && score >= SCAN_OVERLAY_MIN_SCORE) {
          const mapped = mapPointsCover(corners, w, h, displayW, displayH);
          octx.strokeStyle = strokeColorForScore(score);
          octx.lineWidth = 3;
          octx.beginPath();
          octx.moveTo(mapped[0]!.x, mapped[0]!.y);
          for (let i = 1; i < 4; i++) octx.lineTo(mapped[i]!.x, mapped[i]!.y);
          octx.closePath();
          octx.stroke();
        }
      }

      const hasPriorScan = lastScanCornersRef.current !== null;
      const sceneChanged =
        hasPriorScan &&
        corners !== null &&
        cornersChangedSignificantly(corners, lastScanCornersRef.current, w, h);

      const minDim = Math.min(w, h);
      const smallDriftPx = minDim * SCAN_STABILITY_SMALL_DRIFT_RATIO;
      const largeDriftPx = minDim * SCAN_STABILITY_LARGE_DRIFT_RATIO;
      const detectionOk = score >= config.scanDetectionMinScore;
      const canCapture = !hasPriorScan || sceneChanged;

      if (!corners || corners.length !== 4) {
        stableCountRef.current = 0;
      } else if (!canCapture) {
        stableCountRef.current = 0;
      } else if (frameDrift !== null && frameDrift >= largeDriftPx) {
        stableCountRef.current = 0;
      } else if (detectionOk || (frameDrift !== null && frameDrift <= smallDriftPx)) {
        stableCountRef.current += 1;
      }

      const requiredStable = hasPriorScan
        ? Math.min(SCAN_STABLE_FRAMES_RESCAN, config.scanStableFrames)
        : config.scanStableFrames;
      const stableEnough = stableCountRef.current >= requiredStable;
      const wallNow = Date.now();
      const intervalOk = wallNow - lastScanAtRef.current >= config.scanMinIntervalMs;

      const hint = resolveScanCaptureHint({
        corners,
        score,
        frameDrift,
        frameMinDim: minDim,
        detectionMinScore: config.scanDetectionMinScore,
        overlayMinScore: SCAN_OVERLAY_MIN_SCORE,
        stableCount: stableCountRef.current,
        requiredStable,
        stableEnough,
        intervalOk,
        busy: scanningRef.current || extractingRef.current,
        hasPriorScan,
        sceneChanged,
      });
      const hintKey = hint ? `${hint.kind}:${JSON.stringify(hint)}` : "";
      if (hintKey !== captureHintKeyRef.current) {
        captureHintKeyRef.current = hintKey;
        setCaptureHint(hint);
      }

      if (
        canCapture &&
        stableEnough &&
        intervalOk &&
        cornerPoints &&
        corners &&
        !scanningRef.current &&
        !extractingRef.current
      ) {
        try {
          extractingRef.current = true;
          const capturedCorners = corners.map((p) => ({ ...p }));
          pendingScanReplacesResultsRef.current =
            lastScanCornersRef.current !== null && sceneChanged;

          const extracted = scanner.extractPaper(
            work,
            SCAN_CANONICAL_WIDTH,
            SCAN_CANONICAL_HEIGHT,
            cornerPoints,
          );
          if (!extracted) {
            extractingRef.current = false;
            return;
          }
          extracted.toBlob(
            (blob) => {
              extractingRef.current = false;
              if (!blob) return;
              lastScanAtRef.current = Date.now();
              stableCountRef.current = 0;
              lastScanCornersRef.current = capturedCorners;
              void postScan(blob);
            },
            "image/jpeg",
            0.88,
          );
        } catch {
          extractingRef.current = false;
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scannerReady, config, indexStatus?.ready, postScan, cameraEnabled]);

  const cameraPanel = (
    <Paper withBorder p="xs" pos="relative" style={{ overflow: "hidden", background: "#111" }}>
      <LoadingOverlay
        visible={!scannerReady && !cameraError}
        zIndex={20}
        overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
        loaderProps={{
          children: (
            <Stack align="center" gap="xs">
              <Loader />
              <Text size="sm" fw={500}>
                Loading scanner…
              </Text>
              <Text size="xs" c="dimmed" ta="center" maw={280}>
                {scannerLoadStatus}
              </Text>
            </Stack>
          ),
        }}
      />
      {cameraError && (
        <Alert color="red" title="Scanner could not start" mb="xs">
          {cameraError}
        </Alert>
      )}
      <Box
        ref={viewportRef}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          maxHeight: "70vh",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: cameraError || !cameraEnabled ? "none" : "block",
          }}
        />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
        {cameraEnabled && captureHint && (
          <Box
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              pointerEvents: "none",
            }}
          >
            <Badge
              size="lg"
              variant="filled"
              color={
                captureHint.kind === "movement"
                  ? "orange"
                  : captureHint.kind === "same_card"
                    ? "gray"
                    : captureHint.kind === "stabilizing" || captureHint.kind === "low_detection"
                      ? "yellow"
                      : "blue"
              }
              fullWidth
              styles={{
                root: {
                  whiteSpace: "normal",
                  height: "auto",
                  padding: "8px 12px",
                },
                label: { whiteSpace: "normal", lineHeight: 1.35 },
              }}
            >
              {scanCaptureHintMessage(captureHint)}
            </Badge>
          </Box>
        )}
      </Box>
      <canvas ref={workRef} style={{ display: "none" }} />
      {scannerReady && (
        <Group justify="space-between" align="center" mt="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {cameraEnabled
              ? `Detection ${Math.round(detectionScore * 100)}% · overlay shows border confidence`
              : "Camera stopped"}
          </Text>
          <Button
            size="xs"
            variant="light"
            onClick={() => toggleCamera()}
          >
            {cameraEnabled ? "Stop" : "Start"}
          </Button>
        </Group>
      )}
    </Paper>
  );

  const resultsPanel = (
    <Stack gap="sm">
      <Title order={4}>Matches</Title>
      {results.length === 0 && (
        <Text size="sm" c="dimmed">
          Point the camera at a card. Matches appear here when found.
        </Text>
      )}
      {lastScanError && (
        <Text size="sm" c="red">
          {lastScanError}
        </Text>
      )}
      <Stack gap="xs">
        {results.map((m) => (
          <Card
            key={m.id}
            withBorder
            padding="sm"
            style={{ cursor: m.print ? "pointer" : "default" }}
            onClick={() => {
              if (!m.print) return;
              setPick(m);
              setModalOpen(true);
            }}
          >
            <Group wrap="nowrap" align="flex-start" gap="sm">
              {m.imageUrl && (
                <Image src={m.imageUrl} w={56} h={78} fit="contain" alt="" radius="sm" />
              )}
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {m.name}
                </Text>
                <Group gap={6}>
                  <SetIcon code={m.set} />
                  <Text size="xs" c="dimmed">
                    {m.set.toUpperCase()} #{m.collector_number}
                  </Text>
                </Group>
                <Group gap={6}>
                  {m.owned && (
                    <Badge size="xs" color="green" variant="light">
                      owned
                    </Badge>
                  )}
                  {m.wishlist && (
                    <Badge size="xs" color="gray" variant="light">
                      wishlist
                    </Badge>
                  )}
                  <Text size="xs" c="dimmed">
                    {Math.round(m.confidence * 100)}% match
                  </Text>
                </Group>
              </Stack>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );

  return (
    <Stack gap="md">
      <Title order={2}>Scan</Title>
      <Text size="sm" c="dimmed">
        Hold a card in view on a plain background. The app detects borders automatically and
        matches against your collection. Camera requires HTTPS in production (localhost is fine).
      </Text>

      {indexStatus && !indexStatus.ready && (
        <Alert color="yellow" title="Scan index not ready">
          Run Sync from the Sync page (or <Code>pnpm sync</Code>) to build the visual index from
          your collection cards.
        </Alert>
      )}

      {indexStatus?.ready && (
        <Text size="xs" c="dimmed">
          Index: {indexStatus.entryCount} cards
          {indexStatus.builtAt ? ` · built ${new Date(indexStatus.builtAt).toLocaleString()}` : ""}
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Box>{cameraPanel}</Box>
        <Box>{resultsPanel}</Box>
      </SimpleGrid>

      <ScanPrintAdjustModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        match={pick}
        onSaved={() => void refreshIndexStatus()}
      />
    </Stack>
  );
}
