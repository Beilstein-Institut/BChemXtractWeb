package org.beilstein.chemxtract.render.graphic;

import static org.apache.batik.ext.awt.MultipleGradientPaint.LINEAR_RGB;
import static org.apache.batik.ext.awt.MultipleGradientPaint.NO_CYCLE;
import static org.apache.batik.ext.awt.MultipleGradientPaint.REFLECT;
import static org.apache.batik.ext.awt.MultipleGradientPaint.REPEAT;
import static org.apache.batik.ext.awt.MultipleGradientPaint.SRGB;
import static org.apache.batik.util.SVGConstants.SVG_COLOR_INTERPOLATION_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_GRADIENT_UNITS_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_ID_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_LINEAR_GRADIENT_TAG;
import static org.apache.batik.util.SVGConstants.SVG_LINEAR_RGB_VALUE;
import static org.apache.batik.util.SVGConstants.SVG_NAMESPACE_URI;
import static org.apache.batik.util.SVGConstants.SVG_OFFSET_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_OPAQUE_VALUE;
import static org.apache.batik.util.SVGConstants.SVG_PAD_VALUE;
import static org.apache.batik.util.SVGConstants.SVG_RADIAL_GRADIENT_TAG;
import static org.apache.batik.util.SVGConstants.SVG_REFLECT_VALUE;
import static org.apache.batik.util.SVGConstants.SVG_REPEAT_VALUE;
import static org.apache.batik.util.SVGConstants.SVG_SPREAD_METHOD_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_SRGB_VALUE;
import static org.apache.batik.util.SVGConstants.SVG_STOP_COLOR_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_STOP_OPACITY_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_STOP_TAG;
import static org.apache.batik.util.SVGConstants.SVG_TRANSFORM_ATTRIBUTE;
import static org.apache.batik.util.SVGConstants.SVG_USER_SPACE_ON_USE_VALUE;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Paint;
import java.awt.geom.AffineTransform;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;

import org.apache.batik.dom.GenericDOMImplementation;
import org.apache.batik.ext.awt.LinearGradientPaint;
import org.apache.batik.ext.awt.MultipleGradientPaint;
import org.apache.batik.ext.awt.RadialGradientPaint;
import org.apache.batik.svggen.DefaultExtensionHandler;
import org.apache.batik.svggen.SVGColor;
import org.apache.batik.svggen.SVGGeneratorContext;
import org.apache.batik.svggen.SVGGraphics2D;
import org.apache.batik.svggen.SVGPaintDescriptor;
import org.beilstein.chemxtract.render.IOUtils;
import org.w3c.dom.DOMImplementation;
import org.w3c.dom.Element;

/**
 * Graphic writer for the SVG graphic format.
 * 
 * @author stephan
 * @version $Id: SVGGraphicWriter.java,v 1.7 2014-06-12 11:32:55 bsnie Exp $
 */
public class SVGGraphicWriter {
  /**
   * Writes the graphic to an {@link OutputStream}
   * 
   * @param graphic Graphic
   * @param out {@link OutputStream} to which the graphic should be written
   * @throws IOException Occurs if the writer couldn't write the graphic to the {@link OutputStream}
   */
  public static void writeGraphic(Graphic graphic, OutputStream out) throws IOException {
    writeGraphic(graphic, out, false);
  }
  
  /**
   * Writes the graphic to an {@link OutputStream}
   * 
   * @param graphic Graphic
   * @param out {@link OutputStream} to which the graphic should be written
   * @throws IOException Occurs if the writer couldn't write the graphic to the {@link OutputStream}
   */
  public static void writeGraphic(Graphic graphic, OutputStream out, boolean textAsShapes) throws IOException {
    Rectangle2D bounds = graphic.getBounds();

    int width = (int) Math.ceil(bounds.getWidth());
    int height = (int) Math.ceil(bounds.getHeight());

    if (width <= 0) {
      throw new IOException("Incorrect width for graphic: " + width);
    }
    if (height <= 0) {
      throw new IOException("Incorrect height for graphic: " + height);
    }

    DOMImplementation domImpl = GenericDOMImplementation.getDOMImplementation();
    org.w3c.dom.Document document = domImpl.createDocument(null, "svg", null);
    SVGGeneratorContext ctx = SVGGeneratorContext.createDefault(document);
    ctx.setExtensionHandler(new GradientExtensionHandler());

    SVGGraphics2D g = new SVGGraphics2D(ctx, textAsShapes);
    g.setSVGCanvasSize(new Dimension(width, height));
    g.setClip(0, 0, width, height);

    // move upper left corner to (0/0)
    AffineTransform transform = AffineTransform.getTranslateInstance(-bounds.getMinX(), -bounds.getMinY());
    g.setTransform(transform);

    graphic.paint(g);

    g.dispose();

    Element root = g.getRoot();
    root.setAttributeNS(null, "viewBox", "0 0 " + width + " " + height);
    root.setAttributeNS(null, "preserveAspectRatio", "xMidYMid meet");
    // write stream
    Writer outWriter = new OutputStreamWriter(new BufferedOutputStream(out), IOUtils.ENCODING);
    g.stream(root, outWriter, false, true);
    outWriter.flush();
    outWriter.close();
  }
}

/**
 * Extension of Batik's {@link DefaultExtensionHandler} which 
 * handles different kinds of Paint objects
 * 
 * I wonder why this is not part of the svggen library.
 * @author Martin Steiger
 */
class GradientExtensionHandler extends DefaultExtensionHandler {
  @Override
  public SVGPaintDescriptor handlePaint(Paint paint, SVGGeneratorContext genCtx) {
// Handle LinearGradientPaint
    if (paint instanceof LinearGradientPaint) {
      return getLgpDescriptor((LinearGradientPaint) paint, genCtx);
    }

// Handle RadialGradientPaint
    if (paint instanceof RadialGradientPaint) {
      return getRgpDescriptor((RadialGradientPaint) paint, genCtx);
    }

    return super.handlePaint(paint, genCtx);
  }

  private SVGPaintDescriptor getRgpDescriptor(RadialGradientPaint gradient, SVGGeneratorContext genCtx) {
    Element gradElem = genCtx.getDOMFactory().createElementNS(SVG_NAMESPACE_URI, SVG_RADIAL_GRADIENT_TAG);

// Create and set unique XML id
    String id = genCtx.getIDGenerator().generateID("gradient");
    gradElem.setAttribute(SVG_ID_ATTRIBUTE, id);

// Set x,y pairs
    Point2D centerPt = gradient.getCenterPoint();
    gradElem.setAttribute("cx", String.valueOf(centerPt.getX()));
    gradElem.setAttribute("cy", String.valueOf(centerPt.getY()));

    Point2D focusPt = gradient.getFocusPoint();
    gradElem.setAttribute("fx", String.valueOf(focusPt.getX()));
    gradElem.setAttribute("fy", String.valueOf(focusPt.getY()));

    gradElem.setAttribute("r", String.valueOf(gradient.getRadius()));

    addMgpAttributes(gradElem, genCtx, gradient);

    return new SVGPaintDescriptor("url(#" + id + ")", SVG_OPAQUE_VALUE, gradElem);
  }

  private SVGPaintDescriptor getLgpDescriptor(LinearGradientPaint gradient, SVGGeneratorContext genCtx) {
    Element gradElem = genCtx.getDOMFactory().createElementNS(SVG_NAMESPACE_URI, SVG_LINEAR_GRADIENT_TAG);

// Create and set unique XML id
    String id = genCtx.getIDGenerator().generateID("gradient");
    gradElem.setAttribute(SVG_ID_ATTRIBUTE, id);

// Set x,y pairs
    Point2D startPt = gradient.getStartPoint();
    gradElem.setAttribute("x1", String.valueOf(startPt.getX()));
    gradElem.setAttribute("y1", String.valueOf(startPt.getY()));

    Point2D endPt = gradient.getEndPoint();
    gradElem.setAttribute("x2", String.valueOf(endPt.getX()));
    gradElem.setAttribute("y2", String.valueOf(endPt.getY()));

    addMgpAttributes(gradElem, genCtx, gradient);

    return new SVGPaintDescriptor("url(#" + id + ")", SVG_OPAQUE_VALUE, gradElem);
  }

  private void addMgpAttributes(Element gradElem, SVGGeneratorContext genCtx, MultipleGradientPaint gradient) {
    gradElem.setAttribute(SVG_GRADIENT_UNITS_ATTRIBUTE, SVG_USER_SPACE_ON_USE_VALUE);

// Set cycle method
    if (gradient.getCycleMethod() == REFLECT) {
      gradElem.setAttribute(SVG_SPREAD_METHOD_ATTRIBUTE, SVG_REFLECT_VALUE);
    } else if (gradient.getCycleMethod() == REPEAT) {
      gradElem.setAttribute(SVG_SPREAD_METHOD_ATTRIBUTE, SVG_REPEAT_VALUE);
    } else if (gradient.getCycleMethod() == NO_CYCLE) {
      gradElem.setAttribute(SVG_SPREAD_METHOD_ATTRIBUTE, SVG_PAD_VALUE);// this is the default
    }

// Set color space
    if (gradient.getColorSpace() == LINEAR_RGB) {
      gradElem.setAttribute(SVG_COLOR_INTERPOLATION_ATTRIBUTE, SVG_LINEAR_RGB_VALUE);
    } else if (gradient.getColorSpace() == SRGB) {
      gradElem.setAttribute(SVG_COLOR_INTERPOLATION_ATTRIBUTE, SVG_SRGB_VALUE);
    }

// Set transform matrix if not identity
    AffineTransform tf = gradient.getTransform();
    if (!tf.isIdentity()) {
      String matrix = "matrix(" + tf.getScaleX() + " " + tf.getShearX() + " " + tf.getTranslateX() + " " + tf.getScaleY() + " " +
              tf.getShearY() + " " + tf.getTranslateY() + ")";
      gradElem.setAttribute(SVG_TRANSFORM_ATTRIBUTE, matrix);
    }

// Convert gradient stops
    Color[] colors = gradient.getColors();
    float[] fracs = gradient.getFractions();

    for (int i = 0; i < colors.length; i++) {
      Element stop = genCtx.getDOMFactory().createElementNS(SVG_NAMESPACE_URI, SVG_STOP_TAG);
      SVGPaintDescriptor pd = SVGColor.toSVG(colors[i], genCtx);

      stop.setAttribute(SVG_OFFSET_ATTRIBUTE, (int) (fracs[i] * 100.0f) + "%");
      stop.setAttribute(SVG_STOP_COLOR_ATTRIBUTE, pd.getPaintValue());

      if (colors[i].getAlpha() != 255) {
        stop.setAttribute(SVG_STOP_OPACITY_ATTRIBUTE, pd.getOpacityValue());
      }

      gradElem.appendChild(stop);
    }
  }
}
