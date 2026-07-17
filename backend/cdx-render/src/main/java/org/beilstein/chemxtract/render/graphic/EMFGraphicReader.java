package org.beilstein.chemxtract.render.graphic;

import java.io.IOException;
import java.io.InputStream;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * Embedded Windows Enhanced Metafile (EMF) reader — STUBBED.
 *
 * <p>The original used the licensed Aspose.Metafiles library, which is not
 * shipped with BChemXtractWeb. EMF is only present when a Windows picture is
 * pasted into a ChemDraw document; native chemistry never uses it. This returns
 * {@code null} so that {@code CDGraphicsWriter.writePicture} renders its visible
 * "picture type not supported" fallback box instead of silently dropping the
 * picture (Aspose removed).
 */
public final class EMFGraphicReader {
  private static final Log logger = LogFactory.getLog(EMFGraphicReader.class);

  private EMFGraphicReader() {}

  public static Graphic readGraphic(InputStream in) throws IOException {
    logger.debug("EMF embedded metafile encountered; rendering skipped (Aspose removed).");
    return null;
  }
}
