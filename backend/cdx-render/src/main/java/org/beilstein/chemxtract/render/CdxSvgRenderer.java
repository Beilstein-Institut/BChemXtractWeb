package org.beilstein.chemxtract.render;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

import org.beilstein.chemxtract.cdx.CDDocument;
import org.beilstein.chemxtract.cdx.reader.CDXMLReader;
import org.beilstein.chemxtract.cdx.reader.CDXReader;
import org.beilstein.chemxtract.render.graphic.AbstractGraphic;
import org.beilstein.chemxtract.render.graphic.CDXGraphicReader;
import org.beilstein.chemxtract.render.graphic.Graphic;
import org.beilstein.chemxtract.render.graphic.GraphicUtils;
import org.beilstein.chemxtract.render.graphic.SVGGraphicWriter;

/**
 * Faithful ChemDraw document -> SVG renderer. JPype entry point for the backend.
 *
 * <p>Reader is chosen from the magic bytes: binary CDX starts with {@code "VjCD"};
 * anything else is treated as CDXML. Mirrors the {@code RenderCdDocumentToSvg}
 * example from the boa tools, sourced from a byte[] instead of a file.
 */
public final class CdxSvgRenderer {

  private CdxSvgRenderer() {}

  /**
   * @param cdxBytes raw .cdx (binary) or .cdxml (XML) bytes
   * @param scale    output scale; ~3.0 gives a crisp single page
   * @return UTF-8 SVG bytes
   */
  public static byte[] toSvg(byte[] cdxBytes, double scale) throws Exception {
    boolean binaryCdx = cdxBytes.length >= 4
        && cdxBytes[0] == 'V' && cdxBytes[1] == 'j' && cdxBytes[2] == 'C' && cdxBytes[3] == 'D';

    CDDocument doc;
    try (InputStream in = new ByteArrayInputStream(cdxBytes)) {
      doc = binaryCdx ? CDXReader.readDocument(in) : CDXMLReader.readDocument(in);
    }

    Graphic graphic = CDXGraphicReader.readGraphic(doc);
    // The occurrence bboxes (BCXSubstance.getOccurrences) live in the ORIGINAL
    // CDX document frame. CDXGraphic normalizes its rendered bounds to origin
    // (0,0) and scales them by an internal factor (72/70), so getBounds() is
    // NOT the frame occurrences are in. Derive the true document->SVG transform
    // from the graphic's own rectangles: origin = originalBounds.min (the doc
    // frame), and the internal factor = normalizedBounds.width/originalBounds
    // .width. The full doc->SVG scale is that internal factor times the render
    // scale. Stamping these lets the frontend map an occurrence rect onto the
    // render via svg = (cdx - origin) * scale.
    java.awt.geom.Rectangle2D orig = ((AbstractGraphic) graphic).getOriginalBounds();
    java.awt.geom.Rectangle2D norm = graphic.getBounds();
    double originX = orig.getX();
    double originY = orig.getY();
    double effectiveScale = scale * (norm.getWidth() / orig.getWidth());
    graphic = GraphicUtils.createScaledGraphic(graphic, -1.0, -1.0, -1.0, -1.0, scale);

    try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      SVGGraphicWriter.writeGraphic(graphic, out);
      String svg = out.toString("UTF-8");
      String attrs = " data-cdx-scale=\"" + effectiveScale
          + "\" data-cdx-origin-x=\"" + originX
          + "\" data-cdx-origin-y=\"" + originY + "\"";
      // SVGGraphicWriter emits a single root "<svg " open tag.
      svg = svg.replaceFirst("<svg ", "<svg" + java.util.regex.Matcher.quoteReplacement(attrs) + " ");
      return svg.getBytes("UTF-8");
    }
  }
}
