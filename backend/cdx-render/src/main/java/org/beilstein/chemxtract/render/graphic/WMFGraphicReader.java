package org.beilstein.chemxtract.render.graphic;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * Embedded Windows Metafile (WMF) reader — STUBBED.
 *
 * <p>See {@link EMFGraphicReader}. The licensed Aspose dependency is removed; a
 * WMF embed is skipped with an invisible placeholder. If real files ever need
 * this, wire in Batik's {@code org.apache.batik.transcoder.wmf.tosvg}.
 */
public final class WMFGraphicReader {
  private static final Log logger = LogFactory.getLog(WMFGraphicReader.class);

  private WMFGraphicReader() {}

  public static Graphic readGraphic(InputStream in) throws IOException {
    logger.debug("WMF embedded metafile encountered; rendering skipped (Aspose removed).");
    return new ImageGraphic(new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB), GraphicType.WMF);
  }
}
