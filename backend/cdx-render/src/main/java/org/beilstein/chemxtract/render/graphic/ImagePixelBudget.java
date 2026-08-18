package org.beilstein.chemxtract.render.graphic;

import java.io.IOException;

/**
 * Per-render allocation budget for pictures embedded in a ChemDraw document.
 *
 * <p>A CDX/CDXML file can carry embedded PNG/JPEG/BMP/GIF/TIFF bytes, and the pixel
 * dimensions in those headers are attacker-controlled. Decoding allocates roughly
 * four bytes of heap per pixel, so a small, highly compressible picture declaring
 * huge dimensions (a flat-colour 12000x12000 PNG compresses to tens of kilobytes)
 * would exhaust the JVM heap. The backend runs the JVM with
 * {@code -XX:+ExitOnOutOfMemoryError}, so that exhaustion terminates the process
 * and drops every concurrent request, not just the offending one.
 *
 * <p>The budget is claimed from the image <em>header</em>, before any raster is
 * allocated, so an oversized picture is refused rather than partially decoded. It
 * is cumulative across the render because every decoded picture stays reachable
 * until the page is painted — a document holding a hundred moderately sized
 * pictures adds up the same way one enormous picture does.
 *
 * <p>{@link #MAX_TOTAL_PIXELS} is sized against the deployed heap: 48 megapixels
 * is about 192 MB of 32-bit raster, comfortably inside the 512 MB default
 * ({@code JVM_MAX_HEAP}) alongside the rest of a render. Raise both together.
 * Legitimate artwork stays well under it — a 300 dpi A4 scan is roughly 8.7
 * megapixels.
 *
 * <p>Refusal surfaces as {@link IOException}, which the picture writer already
 * handles by drawing its visible "not supported" placeholder box, so the rest of
 * the page still renders.
 *
 * <p>Not thread-safe: one instance belongs to one render.
 */
public final class ImagePixelBudget {

  /** Cumulative pixel ceiling for all embedded pictures in a single render. */
  public static final long MAX_TOTAL_PIXELS = 48_000_000L;

  private long used;

  /**
   * Reserve budget for a picture of the given header dimensions.
   *
   * @param width  pixel width from the image header
   * @param height pixel height from the image header
   * @throws IOException if the dimensions are not positive, or if granting them
   *                     would push this render past {@link #MAX_TOTAL_PIXELS}
   */
  public void claim(long width, long height) throws IOException {
    if (width <= 0 || height <= 0) {
      throw new IOException("Embedded picture declares non-positive dimensions");
    }
    long pixels = width * height;
    if (pixels > MAX_TOTAL_PIXELS - used) {
      throw new IOException("Embedded picture exceeds the permitted size for one render");
    }
    used += pixels;
  }

  /** @return pixels claimed so far by this render. */
  public long used() {
    return used;
  }
}
