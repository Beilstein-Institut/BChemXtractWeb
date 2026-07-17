package org.beilstein.chemxtract.render.graphic;

import java.io.IOException;
import java.io.InputStream;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * Embedded Windows Metafile (WMF) reader — STUBBED.
 *
 * <p>See {@link EMFGraphicReader}. The licensed Aspose dependency is removed; this
 * returns {@code null} so that {@code CDGraphicsWriter.writePicture} renders its
 * visible "picture type not supported" fallback box instead of silently dropping
 * the picture. If real files ever need this, wire in Batik's
 * {@code org.apache.batik.transcoder.wmf.tosvg}.
 */
public final class WMFGraphicReader {
  private static final Log logger = LogFactory.getLog(WMFGraphicReader.class);

  private WMFGraphicReader() {}

  public static Graphic readGraphic(InputStream in) throws IOException {
    logger.debug("WMF embedded metafile encountered; rendering skipped (Aspose removed).");
    return null;
  }
}
