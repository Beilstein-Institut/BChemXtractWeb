package org.beilstein.chemxtract.render;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

import org.beilstein.chemxtract.cdx.CDDocument;
import org.beilstein.chemxtract.cdx.reader.CDXMLReader;
import org.beilstein.chemxtract.cdx.reader.CDXReader;
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
    graphic = GraphicUtils.createScaledGraphic(graphic, -1.0, -1.0, -1.0, -1.0, scale);

    try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      SVGGraphicWriter.writeGraphic(graphic, out);
      return out.toByteArray();
    }
  }
}
