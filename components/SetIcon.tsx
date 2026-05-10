"use client";

import { useEffect, useState } from "react";

import { Box } from "@mantine/core";

const SIZE = 16;

function setIconApiUrl(code: string) {
  return `/api/catalog/set-icons/${encodeURIComponent(code.toLowerCase())}`;
}

/** Safe fragment for XML `id` / CSS `#…` (alphanumeric, `_`, `-`). */
function sanitizeForSvgIdPart(s: string): string {
  const t = s.replace(/[^a-zA-Z0-9_-]/g, "");
  return t.length > 0 ? t : "x";
}

function setIconRootId(code: string): string {
  return `set-icon-${sanitizeForSvgIdPart(code.toLowerCase())}`;
}

/** Hex blacks we treat as theme-colored via `currentColor`. */
function shouldReplaceFill(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "#000" || v === "#000000";
}

function rewriteInlineStyleFills(style: string): string {
  return style.replace(
    /(^|;)\s*(fill)\s*:\s*(#000\b|#000000\b)/gi,
    (_m, sep: string, prop: string) => `${sep}${prop}: currentColor`,
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Theme paths that rely on initial fill (no fill/stroke attrs) via `currentColor`. */
function injectSetIconThemeStyle(svg: Element, svgId: string) {
  const doc = svg.ownerDocument;
  if (!doc) return;
  const style = doc.createElementNS(SVG_NS, "style");
  const rootSel =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? `#${CSS.escape(svgId)}`
      : `#${svgId}`;
  style.textContent = `${rootSel} path:not([fill]):not([stroke]) { fill: currentColor; }`;
  svg.insertBefore(style, svg.firstChild);
}

function applyCurrentColorToSvgRoot(svg: Element, svgId: string) {
  const nodes: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];
  for (const el of nodes) {
    const fill = el.getAttribute("fill");
    if (fill !== null && shouldReplaceFill(fill)) {
      el.setAttribute("fill", "currentColor");
    }
    const styleAttr = el.getAttribute("style");
    if (styleAttr !== null && /fill\s*:\s*#0{3,6}\b/i.test(styleAttr)) {
      el.setAttribute("style", rewriteInlineStyleFills(styleAttr));
    }
  }

  svg.setAttribute("id", svgId);
  injectSetIconThemeStyle(svg, svgId);

  const prev = svg.getAttribute("style")?.trim() ?? "";
  const extra = "width: 100%; height: 100%; display: block";
  svg.setAttribute(
    "style",
    prev ? `${prev.replace(/;?\s*$/, "")}; ${extra}` : extra,
  );
}

function serializeProcessedSvg(text: string, svgId: string): string | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return null;
  applyCurrentColorToSvgRoot(root, svgId);
  return root.outerHTML;
}

/** Small set symbol from synced catalog; hides itself if the SVG is missing. */
export function SetIcon({ code }: { code: string }) {
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const url = setIconApiUrl(code);
    const svgId = setIconRootId(code);

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          if (!ac.signal.aborted) setMarkup(null);
          return;
        }
        const text = await res.text();
        const html = serializeProcessedSvg(text, svgId);
        if (!ac.signal.aborted) setMarkup(html);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!ac.signal.aborted) setMarkup(null);
      }
    })();

    return () => ac.abort();
  }, [code]);

  if (!markup) return null;

  return (
    <Box
      component="span"
      w={SIZE}
      h={SIZE}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 0,
        color: "currentColor",
      }}
      aria-hidden
    >
      <span
        style={{
          display: "block",
          width: SIZE,
          height: SIZE,
          lineHeight: 0,
        }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </Box>
  );
}
