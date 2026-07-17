package org.beilstein.chemxtract.render.graphic;

import java.awt.image.BufferedImage;
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
 * an invisible 1x1 placeholder so such an embedded object is skipped rather than
 * failing the whole render.
 */
public final class EMFGraphicReader {
  private static final Log logger = LogFactory.getLog(EMFGraphicReader.class);

  private EMFGraphicReader() {}

  public static Graphic readGraphic(InputStream in) throws IOException {
    logger.debug("EMF embedded metafile encountered; rendering skipped (Aspose removed).");
    return new ImageGraphic(new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB), GraphicType.EMF);
  }
}
