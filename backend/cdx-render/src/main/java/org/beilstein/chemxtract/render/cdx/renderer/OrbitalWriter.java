package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.cdx.CDGraphic;
import org.beilstein.chemxtract.cdx.CDRectangle;

import java.awt.*;
import java.awt.geom.Line2D;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;

public class OrbitalWriter {

  private static final Log logger = LogFactory.getLog(OrbitalWriter.class);
  private Graphics2D graphics2D;

  public OrbitalWriter(Graphics2D graphics2D) {
    this.graphics2D = graphics2D;
  }

  /**
   * Generate a graphical presentation of a ChemDraw orbital graphic.
   *
   * @param graphic ChemDraw graphic
   * @param figure  Graphical figure
   * @param color   Current color
   */
  void writeOrbital(CDGraphic graphic, Java2DFigure figure, Color color) {
    CDRectangle boundingBox = graphic.getBounds();
    if (logger.isDebugEnabled()) {
      createOrbitalDebugOutput(graphic, boundingBox);
      return;
    }

    PathPoint point1 = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint point2 = point(boundingBox.getLeft(), boundingBox.getTop());
    PathPoint d = sub(point2, point1);

    // generate shape based on the orbital type
    switch (graphic.getOrbitalType()) {
      case s: {
        Path path = new Path();
        CurveUtils.addCircle(path, point1, point2);
        PathFigure pathFigure = new PathFigure(path, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path, true, false);
        figure.addFigure(pathFigure);
        break;
      }
      case oval: {
        Path path = new Path();
        CurveUtils.addOval(path, point1, point2);
        PathFigure pathFigure = new PathFigure(path, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path, true, false);
        figure.addFigure(pathFigure);
        break;
      }
      case lobe: {
        Path path = new Path();
        CurveUtils.addLobe(path, point1, point2);
        PathFigure pathFigure = new PathFigure(path, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path, true, false);
        figure.addFigure(pathFigure);
        break;
      }
      case p: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, sub(point1, d));
        PathFigure pathFigure = new PathFigure(path1, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case hybridPlus: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, scaleAdd(point1, d, -1f / 2.5));
        PathFigure pathFigure = new PathFigure(path1, true, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case hybridMinus: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, scaleAdd(point1, d, -1f / 2.5f));
        PathFigure pathFigure = new PathFigure(path1, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case dz2Plus: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addOval(path2, point1, point(point1.x - d.y / 2f, point1.y + d.x / 2f));
        Path path3 = new Path();
        CurveUtils.addLobe(path3, point1, sub(point1, d));

        PathFigure pathFigure = new PathFigure(path3, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path3));
        figure.addFigure(ShadedFigureCreator.createFigure(path2, color));
        figure.addFigure(new PathFigure(path2));
        pathFigure = new PathFigure(path1, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1));
        break;
      }
      case dz2Minus: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addOval(path2, point1, point(point1.x - d.y / 2f, point1.y + d.x / 2f));
        Path path3 = new Path();
        CurveUtils.addLobe(path3, point1, sub(point1, d));
        figure.addFigure(ShadedFigureCreator.createFigure(path3, color));
        figure.addFigure(new PathFigure(path3));
        PathFigure pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path2));
        figure.addFigure(ShadedFigureCreator.createFigure(path1, color));
        figure.addFigure(new PathFigure(path1));
        break;
      }
      case dxy: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, sub(point1, d));
        Path path3 = new Path();
        CurveUtils.addLobe(path3, point1, point(point1.x - d.y, point1.y + d.x));
        Path path4 = new Path();
        CurveUtils.addLobe(path4, point1, point(point1.x + d.y, point1.y - d.x));
        figure.addFigure(ShadedFigureCreator.createFigure(path1, color));
        figure.addFigure(ShadedFigureCreator.createFigure(path2, color));
        PathFigure pathFigure = new PathFigure(path3, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path4, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1));
        figure.addFigure(new PathFigure(path2));
        figure.addFigure(new PathFigure(path3));
        figure.addFigure(new PathFigure(path4));
        break;
      }
      case sShaded: {
        Path path = new Path();
        CurveUtils.addCircle(path, point1, point2);
        figure.addFigure(ShadedFigureCreator.createFigure(path, color));
        figure.addFigure(new PathFigure(path, true, false));
        break;
      }
      case ovalShaded: {
        Path path = new Path();
        CurveUtils.addOval(path, point1, point2);
        figure.addFigure(ShadedFigureCreator.createFigure(path, color));
        figure.addFigure(new PathFigure(path, true, false));
        break;
      }
      case lobeShaded: {
        Path path = new Path();
        CurveUtils.addLobe(path, point1, point2);
        figure.addFigure(ShadedFigureCreator.createFigure(path, color));
        figure.addFigure(new PathFigure(path, true, false));
        break;
      }
      case pShaded: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, sub(point1, d));
        figure.addFigure(ShadedFigureCreator.createFigure(path1, color));
        PathFigure pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case sFilled: {
        Path path = new Path();
        CurveUtils.addCircle(path, point1, point2);
        PathFigure pathFigure = new PathFigure(path, true, true);
        figure.addFigure(pathFigure);
        break;
      }
      case ovalFilled: {
        Path path = new Path();
        CurveUtils.addOval(path, point1, point2);
        PathFigure pathFigure = new PathFigure(path, true, true);
        figure.addFigure(pathFigure);
        break;
      }
      case lobeFilled: {
        Path path = new Path();
        CurveUtils.addLobe(path, point1, point2);
        PathFigure pathFigure = new PathFigure(path, true, true);
        figure.addFigure(pathFigure);
        break;
      }
      case pFilled: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, sub(point1, d));
        figure.addFigure(ShadedFigureCreator.createFigure(path1, color));
        PathFigure pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case hybridPlusFilled: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, scaleAdd(point1, d, -1f / 2.5f));
        PathFigure pathFigure = new PathFigure(path1, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path2, false, true);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case hybridMinusFilled: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, scaleAdd(point1, d, -1f / 2.5f));
        PathFigure pathFigure = new PathFigure(path1, false, true);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1, true, false));
        figure.addFigure(new PathFigure(path2, true, false));
        break;
      }
      case dz2PlusFilled: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addOval(path2, point1, point(point1.x - d.y / 2f, point1.y + d.x / 2f));
        Path path3 = new Path();
        CurveUtils.addLobe(path3, point1, sub(point1, d));
        PathFigure pathFigure = new PathFigure(path3, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path3));
        pathFigure = new PathFigure(path2, false, true);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path2));
        pathFigure = new PathFigure(path1, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1));
        break;
      }
      case dz2MinusFilled: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addOval(path2, point1, point(point1.x - d.y / 2f, point1.y + d.x / 2f));
        Path path3 = new Path();
        CurveUtils.addLobe(path3, point1, sub(point1, d));

        PathFigure pathFigure = new PathFigure(path3, false, true);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path3));
        pathFigure = new PathFigure(path2, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path2));
        pathFigure = new PathFigure(path1, false, true);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1));
        break;
      }
      case dxyFilled: {
        Path path1 = new Path();
        CurveUtils.addLobe(path1, point1, point2);
        Path path2 = new Path();
        CurveUtils.addLobe(path2, point1, sub(point1, d));
        Path path3 = new Path();
        CurveUtils.addLobe(path3, point1, point(point1.x - d.y, point1.y + d.x));
        Path path4 = new Path();
        CurveUtils.addLobe(path4, point1, point(point1.x + d.y, point1.y - d.x));
        PathFigure pathFigure = new PathFigure(path1, false, true);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path2, false, true);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path3, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        pathFigure = new PathFigure(path4, false, true);
        pathFigure.setPaint(Color.WHITE);
        figure.addFigure(pathFigure);
        figure.addFigure(new PathFigure(path1));
        figure.addFigure(new PathFigure(path2));
        figure.addFigure(new PathFigure(path3));
        figure.addFigure(new PathFigure(path4));
        break;
      }
    }
  }

  private void createOrbitalDebugOutput(CDGraphic graphic, CDRectangle boundingBox) {
    logger.debug("Orbital " + boundingBox + " types=" + graphic.getOrbitalType());
    graphics2D.setColor(Color.RED);
    graphics2D.setStroke(new BasicStroke(1f));
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
    return;
  }

}
