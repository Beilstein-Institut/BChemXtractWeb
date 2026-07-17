package org.beilstein.chemxtract.render.cdx.renderer;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.add;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.angle;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.center;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.dot;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.length;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.midPoint;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.normalize;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.orthogonal;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.point;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.scale;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.scaleAdd;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.sub;

import java.awt.Stroke;
import java.awt.geom.AffineTransform;
import java.awt.geom.Area;
import java.awt.geom.GeneralPath;
import java.awt.geom.Point2D;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * Helper class to generate various paths for curves and other basic geometries. This class is used
 * by {@link CDGraphicsWriter} .
 * 
 * @author stephan
 * @version $Id: CurveUtils.java,v 1.10 2014-06-12 11:32:59 bsnie Exp $
 */
public class CurveUtils {
  private static final Log logger = LogFactory.getLog(CurveUtils.class);

  // see http://www.whizkidtech.redprince.net/bezier/circle/
  private static final float kappa = (float) (4d * (Math.sqrt(2d) - 1d) / 3d);

  private static final float[] cirlce =
          new float[] { -kappa, -1, 0, -1, kappa, -1, 1, -kappa, 1, 0, 1, kappa, kappa, 1, 0, 1, -kappa, 1, -1, kappa, -1, 0, -1, -kappa };

  private static final float px1 = 0.28f;
  private static final float py1 = 0.88f;
  private static final float sx1 = 0.09f;
  private static final float sy1 = 0.18f;
  private static final float px2 = 0.17f;
  private static final float py2 = 0.20f;
  private static final float sx2 = 0.10f;
  private static final float sy2 = 0.24f;

  private static final float[] lobe = new float[] { px1 + sx1,
          py1 - sy1,
          px1,
          py1,
          px1 - sx1,
          py1 + sy1,
          -px1 + sx1,
          py1 + sy1,
          -px1,
          +py1,
          -px1 - sx1,
          py1 - sy1,
          -px2 - sx2,
          py2 + sy2,
          -px2,
          py2,
          -px2 + sx2,
          py2 - sy2,
          px2 - sx2,
          py2 - sy2,
          px2,
          py2,
          px2 + sx2,
          py2 + sy2 };

  private static final double PI2 = Math.PI / 2d;

  /**
   * Subtract one path from another. The path must be closed ans build an area.
   * 
   * @param path1 Path 1
   * @param path2 Path 2
   * @return Path 1 minus Path2
   */
  public static Path subtract(Path path1, Path path2) {
    Area area = new Area(path1.toShape());
    area.subtract(new Area(path2.toShape()));
    return new Path(new GeneralPath(area));
  }

  /**
   * Generate path for a line.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the line start
   * @param point2 Coordinate of the line end
   * @param connect True if the generated path should be connected to the previous path by a line
   * @return The complete path
   */
  public static Path addLine(Path path, PathPoint point1, PathPoint point2, boolean connect) {
    if (connect) {
      path.lineTo(point1);
    } else {
      path.moveTo(point1);
    }
    path.lineTo(point2);
    return path;
  }

  /**
   * Generate path for a line.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the line start
   * @param point2 Coordinate of the line end
   * @param width Width of the line
   * @param dashed True, if the line should be dashed
   * @return The complete path
   */
  public static Path addLine(Path path, PathPoint point1, PathPoint point2, float width, boolean dashed) {
    PathPoint d = sub(point2, point1);
    float radius = length(d);
    if (radius <= 0) {
      logger.warn("Invalid length for line: " + radius);
      return path;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    float width2 = width / 2f;
    if (width == 0f) {
      if (!dashed) {
        path.moveTo(point1);
        path.lineTo(point2);
      } else {
        float stepSize = 6f;
        float stepSize2 = stepSize / 2f;
        int steps = (int) Math.floor(radius / stepSize);
        for (int i = 0; i < steps; i++) {
          path.moveTo(scaleAdd(point1, n, i * stepSize));
          path.lineTo(scaleAdd(point1, n, i * stepSize + stepSize2));
        }
      }
    } else {
      if (!dashed) {
        path.moveTo(scaleAdd(point1, o, width2));
        path.lineTo(scaleAdd(point1, o, -width2));
        path.lineTo(scaleAdd(point2, o, -width2));
        path.lineTo(scaleAdd(point2, o, width2));
        path.closePath();
      } else {
        float stepSize = 6f;
        float stepSize2 = stepSize / 2f;
        int steps = (int) Math.floor(radius / stepSize);
        for (int i = 0; i < steps; i++) {
          path.moveTo(scaleAdd(point1, n, i * stepSize, o, -width2));
          path.lineTo(scaleAdd(point1, n, i * stepSize + stepSize2, o, -width2));
          path.lineTo(scaleAdd(point1, n, i * stepSize + stepSize2, o, width2));
          path.lineTo(scaleAdd(point1, n, i * stepSize, o, width2));
          path.closePath();
        }
      }
    }
    return path;
  }

  /**
   * Generate path for a line.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the line start
   * @param point2 Coordinate of the line start
   * @param spacing1 Spacing between line and the first point
   * @param spacing2 Spacing between line and the second point
   * @param width Width of the line
   * @param dashPattern Spacing between dashed
   * @param dashed True, if the line should be dashed
   * @return The complete path
   */
  public static Path addLine(Path path, PathPoint point1, PathPoint point2, float spacing1, float spacing2, float width, float dashPattern,
    boolean dashed) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for line: " + length);
      return path;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    point1 = scaleAdd(point1, n, spacing1);
    point2 = scaleAdd(point2, n, -spacing2);
    length -= spacing1 + spacing2;

    float width2 = width / 2f;

    if (dashed) {
      float stepSize = dashPattern * 2f;
      float stepSize2 = stepSize / 2f;
      int steps = (int) Math.floor(length / stepSize2);
      for (int i = 0; i < steps; i++) {
        if (i % 2 != 0) {
          continue;
        }
        if (width == 0f) {
          path.moveTo(scaleAdd(point1, n, i * stepSize2));
          path.lineTo(scaleAdd(point1, n, i * stepSize2 + stepSize2));
        } else {
          path.moveTo(scaleAdd(point1, n, i * stepSize2, o, -width2));
          path.lineTo(scaleAdd(point1, n, i * stepSize2 + stepSize2, o, -width2));
          path.lineTo(scaleAdd(point1, n, i * stepSize2 + stepSize2, o, width2));
          path.lineTo(scaleAdd(point1, n, i * stepSize2, o, width2));
          path.closePath();
        }
      }
      if (steps % 2 == 0) {
        if (width == 0f) {
          path.moveTo(scaleAdd(point1, n, steps * stepSize2));
          path.lineTo(point2);
        } else {
          path.moveTo(scaleAdd(point1, n, steps * stepSize2, o, -width2));
          path.lineTo(scaleAdd(point2, o, -width2));
          path.lineTo(scaleAdd(point2, o, width2));
          path.lineTo(scaleAdd(point1, n, steps * stepSize2, o, width2));
          path.closePath();
        }
      }
    } else {
      if (width == 0f) {
        path.moveTo(point1);
        path.lineTo(point2);
      } else {
        path.moveTo(scaleAdd(point1, o, -width2));
        path.lineTo(scaleAdd(point2, o, -width2));
        path.lineTo(scaleAdd(point2, o, width2));
        path.lineTo(scaleAdd(point1, o, width2));
        path.closePath();
      }
    }
    return path;
  }

  /**
   * Generate path for a wavy line.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the line start
   * @param point2 Coordinate of the line end
   * @param width Width of the line
   * @return The complete path
   */
  public static Path addWavyLine(Path path, PathPoint point1, PathPoint point2, float width) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for line: " + length);
      return path;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    float width2 = width / 2f;
    PathPoint t = scale(o, width2);
    PathPoint t2 = scale(o, width2 * kappa);

    float spacing = width * 0.96f;
    float spacing2 = spacing / 2f;
    PathPoint s = scale(n, spacing2);
    PathPoint s2 = scale(n, spacing2 * kappa);

    path.moveTo(point1);
    for (int i = 1; i * spacing2 <= length; i++) {
      int j = (i - 1) % 4;
      if (j == 0) {
        path.curveTo(scaleAdd(point1, s, (float) i - 1, t2, -1), scaleAdd(point1, s, i, s2, -1, t, -1), scaleAdd(point1, s, i, t, -1));
      } else if (j == 1) {
        path.curveTo(scaleAdd(point1, s, (float) i - 1, s2, 1, t, -1), scaleAdd(point1, s, i, t2, -1), scaleAdd(point1, s, i));
      } else if (j == 2) {
        path.curveTo(scaleAdd(point1, s, (float) i - 1, t2, 1), scaleAdd(point1, s, i, s2, -1, t, 1), scaleAdd(point1, s, i, t, 1));
      } else {
        path.curveTo(scaleAdd(point1, s, (float) i - 1, s2, 1, t, 1), scaleAdd(point1, s, i, t2, 1), scaleAdd(point1, s, i));
      }
    }
    return path;
  }

  /**
   * Generate path for an arc.
   * 
   * @param path Path to which the generated path should be added
   * @param centerPoint Coordinate of the center
   * @param headPoint Coordinate of the arc's start
   * @param angle Angle extent in radians
   * @param append True if the generated path should be connected to the previous path by a line
   * @return The complete path
   */
  public static Path addArc(Path path, PathPoint centerPoint, PathPoint headPoint, double angle, boolean append) {
    PathPoint d = sub(headPoint, centerPoint);
    float radius = (float) Math.hypot(d.x, d.y);
    if (radius <= 0) {
      logger.warn("Invalid radius for arc: " + radius);
      return path;
    }

    PathPoint n = normalize(d);

    double startAngle = angle(n);

    int quadrantCount = (int) Math.ceil(Math.abs(2d * angle / Math.PI));
    double quadrantAngle = angle / quadrantCount;

    float kappa = (float) (4.0 * (-Math.cos(quadrantAngle) + 2 * Math.cos(quadrantAngle / 2) - 1) / (3 * Math.sin(quadrantAngle)));

    PathPoint[] p = new PathPoint[quadrantCount + 1];
    float[] c = new float[quadrantCount + 1];
    float[] s = new float[quadrantCount + 1];
    for (int i = 0; i <= quadrantCount; i++) {
      double a = startAngle + i * quadrantAngle;
      c[i] = (float) Math.cos(a);
      s[i] = (float) Math.sin(a);
      p[i] = point(centerPoint.x + c[i] * radius, centerPoint.y + s[i] * radius);
    }

    if (!append) {
      path.moveTo(p[0]);
    } else {
      path.lineTo(p[0]);
    }

    for (int i = 0; i < quadrantCount; i++) {
      PathPoint t1 = point(p[i].x - kappa * s[i] * radius, p[i].y + kappa * c[i] * radius);
      PathPoint t2 = point(p[i + 1].x + kappa * s[i + 1] * radius, p[i + 1].y - kappa * c[i + 1] * radius);
      path.curveTo(t1, t2, p[i + 1]);
    }

    return path;
  }

  public static Path addArc(Path path, PathPoint centerPoint, PathPoint headPoint, PathPoint tailPoint, boolean append) {
    double angularSize = GeometryUtils.getDifferenceAngle(headPoint, tailPoint, centerPoint, true);

    return addArc(path, centerPoint, headPoint, angularSize, append);
  }

  /*
   * Generate path for an arc.
   * 
   * @param path Path to which the generated path should be added
   * @param center Coordinate of the center
   * @param point1 Coordinate of the arc's start
   * @param point2 Coordinate of the arc's end
   * @param append True if the generated path should be connected to the previous path by a line
   * @param spacing1 Additional spacing to end point to make room for a arrow head
   * @param spacing2 Additional spacing to end point to make room for a arrow tail
   * @return The complete path
   */

  public static Path addArcTo(Path path, PathPoint point1, PathPoint point2, PathPoint point3, double radius) {

    PathPoint v1 = normalize(sub(point1, point2));
    PathPoint v2 = normalize(sub(point3, point2));

    PathPoint d = normalize(add(v1, v2));

    double alpha = Math.acos(dot(v1, v2));

    double a = radius / Math.tan(alpha / 2d);
    double b = a / Math.cos(alpha / 2d);

    PathPoint m = scaleAdd(point2, d, b);

    PathPoint w1 = scaleAdd(point2, v1, a);
    PathPoint w2 = scaleAdd(point2, v2, a);

    PathPoint u = scaleAdd(point2, d, b - radius);

    PathPoint mu = sub(u, m);
    PathPoint mw1 = sub(w1, m);
    PathPoint mw2 = sub(w2, m);

    float k = (float) (kappa * Math.cos(alpha / 2d));

    if (GeometryUtils.isRightOf(point3, point1, point2)) {
      k = -k;
    }

    PathPoint w1s1 = scale(orthogonal(mw1), -k);
    PathPoint us2 = scale(orthogonal(mu), k / 2f);
    PathPoint us3 = scale(orthogonal(mu), -k / 2f);
    PathPoint w2s4 = scale(orthogonal(mw2), k);

    PathPoint s1 = add(w1, w1s1);
    PathPoint s2 = add(u, us2);
    PathPoint s3 = add(u, us3);
    PathPoint s4 = add(w2, w2s4);

    path.lineTo(w1);
    path.curveTo(s1, s2, u);
    path.curveTo(s3, s4, w2);

    return path;
  }

  /**
   * Generate path for a circle.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the center
   * @param point2 Coordinate of a point on the circle
   * @return The complete path
   */
  public static Path addCircle(Path path, PathPoint point1, PathPoint point2) {
    PathPoint d = sub(point2, point1);
    float length = length(d);

    return addCircle(path, point1, length);
  }

  /**
   * Generate path for a circle.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the center
   * @param length Radius of the circle
   * @return The complete path
   */
  public static Path addCircle(Path path, PathPoint point, float length) {
    AffineTransform transform = AffineTransform.getTranslateInstance(point.x, point.y);
    transform.scale(-length, -length);

    float[] points = new float[24];
    transform.transform(cirlce, 0, points, 0, 12);

    return addSplineCurve(path, points, true);
  }

  /**
   * Generate path for an oval.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the center
   * @param point2 Coordinate of the front
   * @return The complete path
   */
  public static Path addOval(Path path, PathPoint point1, PathPoint point2) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid radius for oval: " + length);
      return path;
    }

    double theta = angle(d) + Math.PI / 2;

    AffineTransform transform = AffineTransform.getTranslateInstance(point1.x, point1.y);
    transform.rotate(theta + Math.PI / 2f);
    transform.scale(-length, -length * 0.4f);

    float[] points = new float[24];
    transform.transform(cirlce, 0, points, 0, 12);

    return addSplineCurve(path, points, true);
  }

  /**
   * Generate path for an oval.
   * 
   * @param path Path to which the generated path should be added
   * @param center Coordinate of the center
   * @param point1 Coordinate of the end point of the first axis
   * @param point2 Coordinate of the end point of the second axis
   * @return The complete path
   */
  public static Path addOval(Path path, PathPoint center, PathPoint point1, PathPoint point2) {
    AffineTransform transform =
            new AffineTransform(point1.x - center.x, point1.y - center.y, point2.x - center.x, point2.y - center.y, center.x, center.y);

    float[] points = new float[24];
    transform.transform(cirlce, 0, points, 0, 12);

    return addSplineCurve(path, points, true);
  }

  /**
   * Generate path for a diamond.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the center
   * @param length Radius of the diamond
   * @return The complete path
   */
  public static Path addDiamond(Path path, PathPoint point, float length) {
    path.moveTo(point(point.x - length, point.y));
    path.lineTo(point(point.x, point.y - length));
    path.lineTo(point(point.x + length, point.y));
    path.lineTo(point(point.x, point.y + length));
    path.closePath();
    return path;
  }

  /**
   * Generate path for a lobe(like the p-orbital).
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the center
   * @param point2 Coordinate of the front
   * @return The complete path
   */
  public static Path addLobe(Path path, PathPoint point1, PathPoint point2) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid radius for lobe: " + length);
      return path;
    }

    double theta = angle(d);

    AffineTransform transform = AffineTransform.getTranslateInstance(point1.x, point1.y);
    transform.scale(-length, -length);
    transform.rotate(theta + Math.PI / 2f);

    float[] points = new float[24];
    transform.transform(lobe, 0, points, 0, 12);

    return addSplineCurve(path, points, true);
  }

  /**
   * Generate path for a polygon.
   * 
   * @param path Path to which the generated path should be added
   * @param points Points of the polygon store in pairs of x- and y-coordinates
   * @param closed True, if the polygon should be closed
   * @return The complete path
   */
  public static Path addPolygon(Path path, float[] points, boolean closed) {
    int count = points.length / 2;

    path.moveTo(point(points[0], points[1]));
    for (int i = 1; i < count; i++) {
      path.lineTo(point(points[i * 2], points[i * 2 + 1]));
    }
    if (closed) {
      path.closePath();
    }
    return path;
  }

  /**
   * Generate path for a B-Spline curve.
   * 
   * @param path Path to which the generated path should be added
   * @param points Points of the curve store in 3-tuples of x,y pairs [point1, control point 1,
   *          control point 2]. The list begins with second control point of the n-th point and end
   *          with the first control point of the n-th point.
   * @param closed True, if the curve should be closed
   * @return The complete path
   */
  public static Path addSplineCurve(Path path, float[] points, boolean closed) {
    int count = points.length / 2;

    // check if enough points exists
    if (count < 4) {
      return path;
    }

    path.moveTo(point(points[2], points[3]));
    for (int i = 4; i < count; i += 3) {
      path.curveTo(point(points[i * 2 - 4], points[i * 2 - 3]), point(points[i * 2 - 2], points[i * 2 - 1]),
              point(points[i * 2], points[i * 2 + 1]));
    }
    if (closed) {
      path.curveTo(point(points[count * 2 - 2], points[count * 2 - 1]), point(points[0], points[1]), point(points[2], points[3]));
    }
    return path;
  }

  /**
   * Generate path for a rectangle.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the upper-left corner
   * @param width Width of the rectangle
   * @param height Height of the rectangle
   * @return The complete path
   */
  public static Path addRectangle(Path path, PathPoint point, float width, float height) {
    path.moveTo(point);
    path.lineTo(point(point.x + width, point.y));
    path.lineTo(point(point.x + width, point.y + height));
    path.lineTo(point(point.x, point.y + height));
    path.closePath();
    return path;
  }

  /**
   * Generate path for a rectangle with rounded corners.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the upper-left corner
   * @param width Width of the rectangle
   * @param height Height of the rectangle
   * @param arcWidth Width of the corners
   * @return The complete path
   */
  public static Path addRoundRectangle(Path path, PathPoint point, float width, float height, float arcWidth) {
    path.moveTo(point(point.x + width / 2f, point.y));
    addArcTo(path, point, point(point.x + width, point.y), point(point.x + width, point.y + height), arcWidth);
    addArcTo(path, point(point.x + width, point.y), point(point.x + width, point.y + height), point(point.x, point.y + height), arcWidth);
    addArcTo(path, point(point.x + width, point.y + height), point(point.x, point.y + height), point, arcWidth);
    addArcTo(path, point(point.x, point.y + height), point, point(point.x + width, point.y), arcWidth);
    path.closePath();
    return path;
  }

  /**
   * Generate path for a rectangle with rounded corners.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the upper-left corner
   * @param width Width of the rectangle
   * @param height Height of the rectangle
   * @param arcWidth Width of the corners
   * @param arcHeight Height of the corners
   * @return The complete path
   */
  public static Path addRoundRectangle(Path path, PathPoint point, float width, float height, float arcWidth, float arcHeight) {
    addArc(path, point(point.x + arcWidth, point.y + arcHeight), point(point.x, point.y + arcHeight), PI2, false);
    addLine(path, point(point.x + arcWidth, point.y), point(point.x + width - arcWidth, point.y), true);
    addArc(path, point(point.x + width - arcWidth, point.y + arcHeight), point(point.x + width - arcWidth, point.y), PI2, true);
    addLine(path, point(point.x + width, point.y + arcHeight), point(point.x + width, point.y + height - arcHeight), true);
    addArc(path, point(point.x + width - arcWidth, point.y + height - arcHeight), point(point.x + width, point.y + height - arcHeight), PI2,
            true);
    addLine(path, point(point.x + width - arcWidth, point.y + height), point(point.x + arcWidth, point.y + height), true);
    addArc(path, point(point.x + arcWidth, point.y + height - arcHeight), point(point.x + arcWidth, point.y + height), PI2, true);
    path.closePath();
    return path;
  }

  /**
   * Generate path for a polygon with rounded corners.
   * 
   * @param path Path to which the generated path should be added
   * @param arcWidth Width of the corners
   * @param points Coordinates of the corners
   * @return The complete path
   */
  public static Path addRoundedPolygon(Path path, float arcWidth, PathPoint...points) {
    if (points.length < 3) {
      return path;
    }

    path.moveTo(scaleAdd(points[0], normalize(sub(points[1], points[0])), arcWidth));

    for (int index = 0; index < points.length; index++) {
      addArcTo(path, points[index], points[(index + 1) % points.length], points[(index + 2) % points.length], arcWidth);
    }

    path.closePath();
    return path;
  }

  /**
   * Generate path for a square bracket.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the upper corner
   * @param point2 Coordinate of the lower corner
   * @param lipSize Size of the bracket lips.
   * @return The complete path
   */
  public static Path addSquareBracket(Path path, PathPoint point1, PathPoint point2, float lipSize) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for square bracket: " + length);
      return path;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    lipSize = (lipSize / 1000f) * length;

    path.moveTo(scaleAdd(point1, o, lipSize));
    path.lineTo(point1);
    path.lineTo(point2);
    path.lineTo(scaleAdd(point2, o, lipSize));
    return path;
  }

  /**
   * Generate path for a round bracket.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the upper corner
   * @param point2 Coordinate of the lower corner
   * @param lipSize Size of the bracket arc.
   * @return The complete path
   */
  public static Path addRoundBracket(Path path, PathPoint point1, PathPoint point2, float lipSize) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for round bracket: " + length);
      return path;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);
    PathPoint m = center(point1, point2);

    lipSize = (lipSize / 200f) * length;

    path.moveTo(point1);
    path.quadTo(scaleAdd(m, o, -lipSize), point2);
    return path;
  }

  /**
   * Generate path for a curly bracket.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the upper corner
   * @param point2 Coordinate of the lower corner
   * @param lipSize Size of the bracket lips.
   * @return The complete path
   */
  public static Path addCurlyBracket(Path path, PathPoint point1, PathPoint point2, float lipSize) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for curly bracket: " + length);
      return path;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    lipSize = (lipSize / 500f) * length;

    path.moveTo(scaleAdd(point1, o, lipSize / 2f));
    path.quadTo(point1, scaleAdd(point1, n, lipSize));
    path.lineTo(scaleAdd(point1, d, 0.5f, n, -lipSize));
    path.quadTo(scaleAdd(point1, d, 0.5f), scaleAdd(point1, d, 0.5f, o, -lipSize / 2f));
    path.quadTo(scaleAdd(point1, d, 0.5f), scaleAdd(point1, d, 0.5f, n, lipSize));
    path.lineTo(scaleAdd(point2, n, -lipSize));
    path.quadTo(point2, scaleAdd(point2, o, lipSize / 2f));
    return path;
  }

  public static Path addCurvesDivision(Path path, Path originalPath, float start, float end) {
    if (start >= end) {
      return path;
    }

    boolean started = false;
    PathPoint currentPoint = null;
    for (int index = 0; index < originalPath.getElementCount(); index++) {
      PathPoint[] elementPoints = originalPath.getElementPoints(index);
      switch (originalPath.getElementCommand(index)) {
        case MOVE_TO: {
          currentPoint = elementPoints[0];
          break;
        }
        case LINE_TO: {
          float partLength = calcLineLength(currentPoint, elementPoints[0]);

          if (end < 0) {
            return path;
          } else if (start <= 0 && partLength < end) {
            if (!started) {
              path.moveTo(currentPoint);
            }
            path.lineTo(elementPoints[0]);
          } else {
            started = addLineDivision(path, currentPoint, elementPoints[0], start, end, started);
          }

          currentPoint = elementPoints[0];

          start -= partLength;
          end -= partLength;
          break;
        }
        case QUAD_TO: {
          float partLength = calcCurveLength(currentPoint, elementPoints[0], elementPoints[0], elementPoints[1]);

          if (end < 0) {
            return path;
          } else if (start <= 0 && partLength < end) {
            if (!started) {
              path.moveTo(currentPoint);
            }
            path.quadTo(elementPoints[0], elementPoints[1]);
          } else {
            started = addCurveDivision(path, currentPoint, elementPoints[0], elementPoints[0], elementPoints[1], start, end, started);
          }

          currentPoint = elementPoints[1];

          start -= partLength;
          end -= partLength;
          break;
        }
        case CUBIC_TO: {
          float partLength = calcCurveLength(currentPoint, elementPoints[0], elementPoints[1], elementPoints[2]);

          if (end < 0) {
            return path;
          } else if (start <= 0 && partLength < end) {
            if (!started) {
              path.moveTo(currentPoint);
            }
            path.curveTo(elementPoints[0], elementPoints[1], elementPoints[2]);
          } else {
            started = addCurveDivision(path, currentPoint, elementPoints[0], elementPoints[1], elementPoints[2], start, end, started);
          }

          currentPoint = elementPoints[2];

          start -= partLength;
          end -= partLength;
          break;
        }
        case CLOSE: {
          break;
        }
      }
    }
    return path;
  }

  public static float getCurveLength(Path path) {
    PathPoint currentPoint = null;
    float length = 0;
    for (int index = 0; index < path.getElementCount(); index++) {
      PathPoint[] elementPoints = path.getElementPoints(index);
      switch (path.getElementCommand(index)) {
        case MOVE_TO: {
          currentPoint = elementPoints[0];
          break;
        }
        case LINE_TO: {
          length += calcLineLength(currentPoint, elementPoints[0]);
          currentPoint = elementPoints[0];
          break;
        }
        case QUAD_TO: {
          length += calcCurveLength(currentPoint, elementPoints[0], elementPoints[0], elementPoints[1]);
          currentPoint = elementPoints[1];
          break;
        }
        case CUBIC_TO: {
          length += calcCurveLength(currentPoint, elementPoints[0], elementPoints[1], elementPoints[2]);
          currentPoint = elementPoints[2];
          break;
        }
        case CLOSE: {
          break;
        }
      }
    }
    return length;
  }

  private static boolean addLineDivision(Path path, PathPoint p1, PathPoint p2, float start, float end, boolean started) {
    PathPoint d = sub(p2, p1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for line: " + length);
      return started;
    }

    if (start - length_tolerance <= 0 && length <= end + length_tolerance) {
      if (!started) {
        path.moveTo(p1);
        started = true;
      }
      path.lineTo(p2);
    } else if (start < length || end < length) {
      PathPoint n = normalize(d);

      float t1 = Math.max(0f, start);
      float t2 = Math.min(length, end);
      PathPoint pn1 = scaleAdd(p1, n, t1);
      PathPoint pn2 = scaleAdd(p1, n, t2);
      if (!started) {
        path.moveTo(pn1);
        started = true;
      }
      path.lineTo(pn2);
    }
    return started;
  }

  public static float calcLineLength(PathPoint point1, PathPoint point2) {
    return length(sub(point2, point1));
  }

  private static final float length_tolerance = 0.001f;

  /**
   * Create a subdivision of a given bezier spline,
   * see http://www.antigrain.com/research/adaptive_bezier/index.html
   * 
   * @param path
   * @param p1 Start point
   * @param p2 First control point
   * @param p3 Second control point
   * @param p4 End point
   * @param start Start length
   * @param end End length
   * @param started True, if the spline doesn't need a move-to command to start the curve
   * @return True, if the resulting spline doesn't need a move-to command to start the curve
   */
  private static boolean addCurveDivision(Path path, PathPoint p1, PathPoint p2, PathPoint p3, PathPoint p4, float start, float end,
    boolean started) {
    if (start >= end || end <= 0) {
      return started;
    }

    // Calculate all the mid-points of the line segments
    PathPoint p12 = midPoint(p1, p2);
    PathPoint p23 = midPoint(p2, p3);
    PathPoint p34 = midPoint(p3, p4);
    PathPoint p123 = midPoint(p12, p23);
    PathPoint p234 = midPoint(p23, p34);
    PathPoint p1234 = midPoint(p123, p234);

    float length = calcCurveLength(p1, p12, p123, p1234);

    if (start - length_tolerance <= 0 && length <= end + length_tolerance) {
      if (!started) {
        path.moveTo(p1);
        started = true;
      }
      path.curveTo(p12, p123, p1234);
    } else if (start < length || end < length) {
      started = addCurveDivision(path, p1, p12, p123, p1234, start, end, started);
    }

    start -= length;
    end -= length;

    if (end <= 0) {
      return started;
    }

    length = calcCurveLength(p1234, p234, p34, p4);

    if (start - length_tolerance <= 0 && length <= end + length_tolerance) {
      if (!started) {
        path.moveTo(p1234);
        started = true;
      }
      path.curveTo(p234, p34, p4);
    } else if (start < length || end < length) {
      started = addCurveDivision(path, p1234, p234, p34, p4, start, end, started);
    }
    return started;
  }

  private static final float distance_tolerance = 1.0f;

  public static float calcCurveLength(PathPoint p1, PathPoint p2, PathPoint p3, PathPoint p4) {
    // Calculate all the mid-points of the line segments
    PathPoint p12 = midPoint(p1, p2);
    PathPoint p23 = midPoint(p2, p3);
    PathPoint p34 = midPoint(p3, p4);
    PathPoint p123 = midPoint(p12, p23);
    PathPoint p234 = midPoint(p23, p34);
    PathPoint p1234 = midPoint(p123, p234);

    float dx = p4.x - p1.x;
    float dy = p4.y - p1.y;

    float d2 = Math.abs(((p2.x - p4.x) * dy - (p2.y - p4.y) * dx));
    float d3 = Math.abs(((p3.x - p4.x) * dy - (p3.y - p4.y) * dx));

    if ((d2 + d3) * (d2 + d3) <= distance_tolerance * (dx * dx + dy * dy)) {
      if (dx == 0.0f) {
        return dy;
      } else if (dy == 0.0f) {
        return dx;
      }

      return (float) Math.sqrt(dx * dx + dy * dy);
    }
    return calcCurveLength(p1, p12, p123, p1234) + calcCurveLength(p1234, p234, p34, p4);
  }

  public static List<PathPoint> getConvexHull(Path path) {
    List<Point2D> points = GrahamScanAlgorithm.getPointsFromPath(path.toShape().getPathIterator(null, 1f));
    List<PathPoint> pathPoints = new ArrayList<>(points.size());
    for (Point2D point : points) {
      pathPoints.add(new PathPoint((float) point.getX(), (float) point.getY()));
    }
    return pathPoints;
  }

  public static Path getStrokedPath(Path path, Stroke stroke) {
    return new Path(stroke.createStrokedShape(path.toShape()));
  }
}
