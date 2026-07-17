package org.beilstein.chemxtract.render.graphic;

import java.awt.*;
import java.awt.geom.Rectangle2D;
import java.io.*;

import org.apache.commons.logging.*;

import com.aspose.metafiles.AsposeLicenseException;
import com.aspose.metafiles.EmfMetafile;
import com.aspose.metafiles.License;
import com.aspose.metafiles.MetafilesException;
import com.aspose.metafiles.WmfMetafile;

/**
 * Graphic reader for the Windows Enhanced Metafile format.
 * 
 * @author stephan
 * @version $Id: EMFGraphicReader.java,v 1.16 2014-06-12 11:32:55 bsnie Exp $
 */
public class EMFGraphicReader {
  private static final Log logger = LogFactory.getLog(EMFGraphicReader.class);

  // the height and width of the meta file is given by resolution depending pixel size
  // this is the correction factor to calculate the resolution independent width/height.
  private static final float RESOLUTION_FACTOR;

  static {
    // initialize Aspose license
    License license = new License();
    try {
      // old license
      license.setLicense(EMFGraphicReader.class.getClassLoader().getResourceAsStream("Aspose.Metafiles.lic"));
    } catch (AsposeLicenseException e) {
      logger.error("Cannot use license", e);
    }

    // Aspose seems to use 96 dpi as standard resolution
    int resolution = 96;
    try {
      resolution = Toolkit.getDefaultToolkit().getScreenResolution();
    } catch (java.awt.HeadlessException e) {
      logger.warn("Could not determine the current screen resolution");
    }
    RESOLUTION_FACTOR = 72f / resolution;
  }

  /**
   * Reads the graphic from an {@link InputStream}
   * 
   * @param in {@link InputStream} from which the graphic should be read
   * @return Graphic
   * @throws IOException Occurs if the reader couldn't read the graphic from the {@link InputStream}
   * @throws IOException Occurs if an exception occur during the generation of the graphic
   */
  public static Graphic readGraphic(InputStream in) throws IOException {
    try {
      EmfMetafile metaFile = new EmfMetafile(new BufferedInputStream(in));
      return new EMFGraphic(metaFile);
    } catch (Exception e) {
      if (e instanceof IOException) {
        throw (IOException) e;
      }
      throw new IOException("Could not load EMF graphic", e);
    }
  }

  /**
   * Implementation of the {@link Graphic} interface.
   */
  public static class EMFGraphic extends AbstractGraphic {
    private final EmfMetafile metafile;

    private EMFGraphic(EmfMetafile metafile) {
      this.metafile = metafile;

      setOriginalBounds(new Rectangle2D.Float(metafile.getMinX(), metafile.getMinY(), metafile.getWidth(), metafile.getHeight()));
      setBounds(new Rectangle2D.Float(metafile.getMinX() * RESOLUTION_FACTOR, metafile.getMinY() * RESOLUTION_FACTOR,
              metafile.getWidth() * RESOLUTION_FACTOR, metafile.getHeight() * RESOLUTION_FACTOR));
    }

    @Override
    public GraphicType getType() {
      return GraphicType.EMF;
    }

    @Override
    public void paintIntern(Graphics2D g) throws IOException {
      metafile.setDefaultRenderingHints((RenderingHints) g.getRenderingHints().clone());

      try {
        metafile.playMetafile(g);
      } catch (MetafilesException e) {
        throw new IOException("Cannot render EMF graphic", e);
      }
    }
  }
}
