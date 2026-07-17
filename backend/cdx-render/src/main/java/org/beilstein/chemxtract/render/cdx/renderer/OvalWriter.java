package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.cdx.CDGraphic;
import org.beilstein.chemxtract.cdx.CDRectangle;

import java.awt.*;
import java.awt.geom.Line2D;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;

public class OvalWriter {
  private static final Log logger = LogFactory.getLog(OvalWriter.class);
  private Graphics2D graphics2D;
  private final Color shadowColor;
  private final float shadowOffset;

  public OvalWriter(Graphics2D graphics2D, Color shadowColor, float shadowOffset) {
    this.graphics2D = graphics2D;
    this.shadowColor = shadowColor;
    this.shadowOffset = shadowOffset;
  }

  /**
   * Generate a graphical presentation of a ChemDraw oval graphic.
   *
   * @param graphic   ChemDraw graphic
   * @param figure    Graphical figure
   * @param lineWidth Current line width
   * @param boldWidth Current line width of bold lines
   */
  void writeOval(CDGraphic graphic, Java2DFigure figure, Color color, float lineWidth, float boldWidth) {
    CDRectangle boundingBox = graphic.getBounds();
    createOvalDebugOutput(graphic, boundingBox);

    PathPoint center = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint majorAxisEnd = point(boundingBox.getLeft(), boundingBox.getTop());
    PathPoint minorAxisEnd = add(scale(orthogonal(sub(majorAxisEnd, center)), 0.4f), center);

    if (graphic.getCenter3D() != null) {
      center = point(graphic.getCenter3D().getX(), graphic.getCenter3D().getY());
    }
    if (graphic.getMajorAxisEnd3D() != null) {
      majorAxisEnd = point(graphic.getMajorAxisEnd3D().getX(), graphic.getMajorAxisEnd3D().getY());
    }
    if (graphic.getMinorAxisEnd3D() != null) {
      minorAxisEnd = point(graphic.getMinorAxisEnd3D().getX(), graphic.getMinorAxisEnd3D().getY());
    }

    handleBoldAndDashing(graphic, figure, lineWidth, boldWidth);

    Path path = new Path();
    handleCircle(graphic, center, majorAxisEnd, minorAxisEnd, path);

    handleShadingAndFilling(graphic, figure, color, path);
    figure.addFigure(new PathFigure(path, true, false));

    handleShadow(graphic, figure, center, majorAxisEnd, path);
  }

  private void handleBoldAndDashing(CDGraphic graphic, Java2DFigure figure, float lineWidth, float boldWidth) {
    if (graphic.getOvalType().isBold()) {
      if (graphic.getOvalType().isDashed()) {
        figure.setStroke(new BasicStroke(boldWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 10.75f }, 0.0f));
      } else {
        figure.setStroke(new BasicStroke(boldWidth));
      }
    } else if (graphic.getOvalType().isDashed()) {
      figure.setStroke(new BasicStroke(lineWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 3.0f }, 0.0f));
    } else {
      figure.setStroke(new BasicStroke(lineWidth));
    }
  }

  private void handleCircle(CDGraphic graphic, PathPoint center, PathPoint majorAxisEnd, PathPoint minorAxisEnd, Path path) {
    if (graphic.getOvalType().isCircle()) {
      CurveUtils.addCircle(path, center, majorAxisEnd);
    } else {
      CurveUtils.addOval(path, center, majorAxisEnd, minorAxisEnd);
    }
  }

  private void handleShadingAndFilling(CDGraphic graphic, Java2DFigure figure, Color color, Path path) {
    if (graphic.getOvalType().isShaded()) {
      figure.addFigure(ShadedFigureCreator.createFigure(path, color));
    } else if (graphic.getOvalType().isFilled()) {
      figure.addFigure(new PathFigure(path, false, true));
    }
  }

  private void handleShadow(CDGraphic graphic, Java2DFigure figure, PathPoint center, PathPoint majorAxisEnd, Path path) {
    if (graphic.getOvalType().isShadowed()) {
      Path shadowPath = new Path();

      if (graphic.getOvalType().isCircle()) {
        CurveUtils.addCircle(shadowPath, add(center, shadowOffset), add(majorAxisEnd, shadowOffset));
      } else {
        CurveUtils.addOval(shadowPath, add(center, shadowOffset), add(majorAxisEnd, shadowOffset));
      }

      shadowPath = CurveUtils.subtract(shadowPath, path);
      PathFigure pathFigure = new PathFigure(shadowPath, false, true);
      pathFigure.setPaint(shadowColor);
      figure.addFigure(pathFigure);
    }
  }

  private void createOvalDebugOutput(CDGraphic graphic, CDRectangle boundingBox) {
    if (logger.isDebugEnabled()) {
      logger.debug("Oval " + boundingBox + " types=" + graphic.getOvalType());
      graphics2D.setColor(Color.RED);
      graphics2D.setStroke(new BasicStroke(0.5f));
      graphics2D.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));

      graphics2D.setColor(Color.GREEN);
      graphics2D.setStroke(new BasicStroke(0.25f));
      graphics2D.draw(new Line2D.Float(graphic.getCenter3D().getX(), graphic.getCenter3D().getY(), graphic.getMajorAxisEnd3D().getX(),
              graphic.getMajorAxisEnd3D().getY()));

      graphics2D.setColor(Color.BLUE);
      graphics2D.setStroke(new BasicStroke(0.25f));
      graphics2D.draw(new Line2D.Float(graphic.getCenter3D().getX(), graphic.getCenter3D().getY(), graphic.getMinorAxisEnd3D().getX(),
              graphic.getMinorAxisEnd3D().getY()));

    }
  }
}
