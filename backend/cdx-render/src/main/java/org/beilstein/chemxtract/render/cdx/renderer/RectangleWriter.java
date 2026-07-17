package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.cdx.CDGraphic;
import org.beilstein.chemxtract.cdx.CDRectangle;

import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.geom.Line2D;
import java.awt.geom.NoninvertibleTransformException;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;

public class RectangleWriter {

  private static final Log logger = LogFactory.getLog(RectangleWriter.class);
  private Graphics2D graphics2D;
  private final Color shadowColor;
  private final float shadowOffset;
  private final float cornerWidth;

  public RectangleWriter(Graphics2D graphics2D, Color shadowColor, float shadowOffset, float cornerWidth) {
    this.graphics2D = graphics2D;
    this.shadowColor = shadowColor;
    this.shadowOffset = shadowOffset;
    this.cornerWidth = cornerWidth;
  }

  /**
   * Generate a graphical presentation of a ChemDraw rectangle graphic.
   *
   * @param graphic   ChemDraw graphic
   * @param figure    Graphical figure
   * @param color     Current color
   * @param lineWidth Current line width
   * @param boldWidth Current line width of bold lines
   */
  void writeRectangle(CDGraphic graphic, Java2DFigure figure, Color color, float lineWidth, float boldWidth) {
    CDRectangle boundingBox = graphic.getBounds();

    createRectangleDebugOutput(graphic, boundingBox);

    PathPoint point1 = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint point2 = point(boundingBox.getLeft(), boundingBox.getTop());

    PathPoint shadowPoint1 = add(point1, shadowOffset * lineWidth);
    PathPoint shadowPoint2 = add(point2, shadowOffset * lineWidth);

    float currentCornerWidth = cornerWidth;

    // calculate the perspective transformation by the major and minor axis
    AffineTransform perspectiveTransform = null;
    if (graphic.getCenter3D() != null && graphic.getMajorAxisEnd3D() != null && graphic.getMinorAxisEnd3D() != null) {

      PathPoint center = getCenter(graphic, boundingBox);
      PathPoint majorAxisEnd = getMajorAxisEnd(graphic, boundingBox);
      PathPoint minorAxisEnd = getMinorAxisEnd(graphic, boundingBox);

      perspectiveTransform = GeometryUtils.createPerspectiveTransform(center, majorAxisEnd, minorAxisEnd);
      AffineTransform inversePerspectiveTransform = getInversePerspectiveTransform(perspectiveTransform);

      point1 = GeometryUtils.transform(inversePerspectiveTransform, point1);
      point2 = GeometryUtils.transform(inversePerspectiveTransform, point2);

      shadowPoint1 = GeometryUtils.transform(inversePerspectiveTransform, shadowPoint1);
      shadowPoint2 = GeometryUtils.transform(inversePerspectiveTransform, shadowPoint2);

      PathPoint majorAxis = sub(majorAxisEnd, center);
      PathPoint minorAxis = sub(minorAxisEnd, center);

      currentCornerWidth /= length(majorAxis);
    }

    Path path = new Path();
    handleRoundedEdge(graphic, point1, point2, currentCornerWidth, path);

    if (perspectiveTransform != null) {
      path.transform(perspectiveTransform);
    }

    handleBoldAndDashing(graphic, figure, lineWidth, boldWidth);
    handleShadingAndFilling(graphic, figure, color, path);

    figure.addFigure(new PathFigure(path, true, false));

    handleShadow(graphic, figure, shadowPoint1, shadowPoint2, currentCornerWidth, perspectiveTransform, path);
  }

  PathPoint getMinorAxisEnd(CDGraphic graphic, CDRectangle boundingBox) {
    PathPoint minorAxisEnd = point(boundingBox.getRight(), boundingBox.getBottom());
    if (graphic.getMinorAxisEnd3D() != null) {
      minorAxisEnd = point(graphic.getMinorAxisEnd3D().getX(), graphic.getMinorAxisEnd3D().getY());
    }
    return minorAxisEnd;
  }

  PathPoint getMajorAxisEnd(CDGraphic graphic, CDRectangle boundingBox) {
    PathPoint majorAxisEnd = point(boundingBox.getLeft(), boundingBox.getTop());
    if (graphic.getMajorAxisEnd3D() != null) {
      majorAxisEnd = point(graphic.getMajorAxisEnd3D().getX(), graphic.getMajorAxisEnd3D().getY());
    }
    return majorAxisEnd;
  }

  PathPoint getCenter(CDGraphic graphic, CDRectangle boundingBox) {
    PathPoint center = point(boundingBox.getCenterX(), boundingBox.getCenterX());
    if (graphic.getCenter3D() != null) {
      center = point(graphic.getCenter3D().getX(), graphic.getCenter3D().getY());
    }
    return center;
  }

  private AffineTransform getInversePerspectiveTransform(AffineTransform perspectiveTransform) {
    AffineTransform inversePerspectiveTransform = null;
    try {
      inversePerspectiveTransform = perspectiveTransform.createInverse();
    } catch (NoninvertibleTransformException e) {
      throw new IllegalStateException(e);
    }
    return inversePerspectiveTransform;
  }

  private void handleRoundedEdge(CDGraphic graphic, PathPoint point1, PathPoint point2, float currentCornerWidth, Path path) {
    if (graphic.getRectangleType().isRoundEdge()) {
      CurveUtils.addRoundRectangle(path, point1, point2.x - point1.x, point2.y - point1.y, currentCornerWidth);
    } else {
      CurveUtils.addRectangle(path, point1, point2.x - point1.x, point2.y - point1.y);
    }
  }

  private void handleShadow(CDGraphic graphic, Java2DFigure figure, PathPoint shadowPoint1, PathPoint shadowPoint2,
    float currentCornerWidth, AffineTransform perspectiveTransform, Path path) {
    if (graphic.getRectangleType().isShadow()) {
      Path shadowPath = new Path(path);

      if (graphic.getRectangleType().isRoundEdge()) {
        CurveUtils.addRoundRectangle(shadowPath, shadowPoint1, shadowPoint2.x - shadowPoint1.x, shadowPoint2.y - shadowPoint1.y,
                currentCornerWidth);
      } else {
        CurveUtils.addRectangle(shadowPath, shadowPoint1, shadowPoint2.x - shadowPoint1.x, shadowPoint2.y - shadowPoint1.y);
      }

      if (perspectiveTransform != null) {
        shadowPath.transform(perspectiveTransform);
      }

      shadowPath = CurveUtils.subtract(shadowPath, path);
      PathFigure pathFigure = new PathFigure(shadowPath, false, true);
      pathFigure.setPaint(shadowColor);
      figure.addFigure(pathFigure);
    }
  }

  void handleBoldAndDashing(CDGraphic graphic, Java2DFigure figure, float lineWidth, float boldWidth) {
    if (graphic.getRectangleType().isBold()) {
      if (graphic.getRectangleType().isDashed()) {
        figure.setStroke(new BasicStroke(boldWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 10.75f }, 0.0f));
      } else {
        figure.setStroke(new BasicStroke(boldWidth));
      }
    } else if (graphic.getRectangleType().isDashed()) {
      figure.setStroke(new BasicStroke(lineWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 3.0f }, 0.0f));
    } else {
      figure.setStroke(new BasicStroke(lineWidth));
    }
  }

  void handleShadingAndFilling(CDGraphic graphic, Java2DFigure figure, Color color, Path path) {
    if (graphic.getRectangleType().isShaded()) {
      figure.addFigure(ShadedFigureCreator.createFigure(path, color));
    } else if (graphic.getRectangleType().isFilled()) {
      figure.addFigure(new PathFigure(path, true, true));
    } else {
      PathFigure pathFigure = new PathFigure(path, true, false);
      figure.addFigure(pathFigure);
    }
  }

  private void createRectangleDebugOutput(CDGraphic graphic, CDRectangle boundingBox) {
    if (logger.isDebugEnabled()) {
      logger.debug("Rectangle " + boundingBox);
      graphics2D.setStroke(new BasicStroke(0.5f));
      graphics2D.setColor(Color.CYAN);
      graphics2D.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));

      graphics2D.setColor(Color.GREEN);
      if (graphic.getMajorAxisEnd3D() != null) {
        graphics2D.draw(new Line2D.Float(graphic.getCenter3D().getX(), graphic.getCenter3D().getY(), graphic.getMajorAxisEnd3D().getX(),
                graphic.getMajorAxisEnd3D().getY()));
      }
      graphics2D.setColor(Color.RED);
      if (graphic.getMinorAxisEnd3D() != null) {
        graphics2D.draw(new Line2D.Float(graphic.getCenter3D().getX(), graphic.getCenter3D().getY(), graphic.getMinorAxisEnd3D().getX(),
                graphic.getMinorAxisEnd3D().getY()));
      }
      graphics2D.setColor(Color.BLACK);
    }
  }

}
