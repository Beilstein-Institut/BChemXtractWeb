/**
 * Client-side SVG export helpers.
 *
 * Kept out of the presentational CdxViewer so rasterization/IO concerns live in
 * one place with a single, leak-proof object-URL lifecycle.
 */

/** Wrap raw SVG markup in an image/svg+xml Blob (for direct .svg download). */
export function svgToBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml" });
}

/**
 * Rasterize a self-contained (sanitized, no external refs) SVG string to a PNG
 * Blob via <img> → <canvas>. Drawn at `scale`× on an opaque white ground so a
 * black line drawing survives any paste target. `fallbackWidth`/`fallbackHeight`
 * are used only when the loaded image reports no intrinsic size.
 *
 * Resolves `null` (never rejects) if the SVG can't be decoded or the canvas is
 * unavailable — the object URL is revoked on every path, success or failure.
 */
export function svgToPng(
  svg: string,
  opts: { scale?: number; fallbackWidth?: number; fallbackHeight?: number } = {},
): Promise<Blob | null> {
  const { scale = 2, fallbackWidth = 800, fallbackHeight = 600 } = opts;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(svgToBlob(svg));
    const img = new Image();
    img.onload = () => {
      const w = (img.naturalWidth || fallbackWidth) * scale;
      const h = (img.naturalHeight || fallbackHeight) * scale;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
