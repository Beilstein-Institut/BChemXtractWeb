package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.geom.AffineTransform;
import java.util.ArrayList;
import java.util.List;

public class GeometryUtils {
  /** Point with the coordinates (0/0) */
  public static final PathPoint ZERO_POINT = point(0f, 0f);

  /**
   * Create new point with given coordinates
   * 
   * @param x X-Coordinate
   * @param y Y-Coordinate
   * @return New point
   */
  public static PathPoint point(float x, float y) {
    return new PathPoint(x, y);
  }

  /**
   * Adds one point to another point.
   * 
   * @param point1 First point
   * @param point2 Second point
   * @return New point
   */
  public static PathPoint add(PathPoint point1, PathPoint point2) {
    return new PathPoint(point1.x + point2.x, point1.y + point2.y);
  }

  /**
   * Sum all coordinate of a list of points.
   * 
   * @param points List of point
   * @return New point
   */
  public static PathPoint add(PathPoint...points) {
    float x = 0;
    float y = 0;
    for (PathPoint point : points) {
      x += point.x;
      y += point.y;
    }
    return new PathPoint(x, y);
  }

  /**
   * Adds a constant to a point.
   * 
   * @param point Point
   * @param value Constant value
   * @return New point
   */
  public static PathPoint add(PathPoint point, float value) {
    return new PathPoint(point.x + value, point.y + value);
  }

  /**
   * Subtracts one point from another point.
   * 
   * @param point1 First point
   * @param point2 Second point
   * @return New point
   */
  public static PathPoint sub(PathPoint point1, PathPoint point2) {
    return new PathPoint(point1.x - point2.x, point1.y - point2.y);
  }

  /**
   * Multiplies the coordinates of the given point with a factor.
   * 
   * @param point Point
   * @param scale Factor
   * @return New Point
   */
  public static PathPoint scale(PathPoint point, float scale) {
    return new PathPoint(point.x * scale, point.y * scale);
  }

  /**
   * Multiplies the coordinates of the given point with a factor.
   * 
   * @param point Point
   * @param scale Factor
   * @return New Point
   */
  public static PathPoint scale(PathPoint point, double scale) {
    return new PathPoint((float) (point.x * scale), (float) (point.y * scale));
  }

  /**
   * Multiplies the coordinates of the one point with a factor adds to the second point.
   * 
   * @param point1 First point
   * @param point2 Second point, which will be multiplied with the factor
   * @param scale Factor
   * @return New Point
   */
  public static PathPoint scaleAdd(PathPoint point1, PathPoint point2, float scale) {
    return new PathPoint(point1.x + point2.x * scale, point1.y + point2.y * scale);
  }

  /**
   * Multiplies the coordinates of the one point with a factor adds to the second point.
   * 
   * @param point1 First point
   * @param point2 Second point, which will be multiplied with the factor
   * @param scale Factor
   * @return New point
   */
  public static PathPoint scaleAdd(PathPoint point1, PathPoint point2, double scale) {
    return new PathPoint(point1.x + (float) (point2.x * scale), point1.y + (float) (point2.y * scale));
  }

  /**
   * Adds scaled coordinates of multiple points to a given point
   * 
   * @param point1 First point
   * @param point2 Second point
   * @param scale2 Scale factor for the second point
   * @param point3 Third point
   * @param scale3 Scale factor for the third point
   * @return New point with the sum of of all scale coordinates
   */
  public static PathPoint scaleAdd(PathPoint point1, PathPoint point2, float scale2, PathPoint point3, float scale3) {
    return new PathPoint(point1.x + point2.x * scale2 + point3.x * scale3, point1.y + point2.y * scale2 + point3.y * scale3);
  }

  /**
   * Adds scaled coordinates of multiple points to a given point
   * 
   * @param point1 First point
   * @param point2 Second point
   * @param scale2 Scale factor for the second point
   * @param point3 Third point
   * @param scale3 Scale factor for the third point
   * @param point4 Fourth point
   * @param scale4 Scale factor for the fourth point
   * @return New point with the sum of of all scale coordinates
   */
  public static PathPoint scaleAdd(PathPoint point1, PathPoint point2, float scale2, PathPoint point3, float scale3, PathPoint point4,
    float scale4) {
    return new PathPoint(point1.x + point2.x * scale2 + point3.x * scale3 + point4.x * scale4,
            point1.y + point2.y * scale2 + point3.y * scale3 + point4.y * scale4);
  }

  /**
   * Returns a inverse point/vector.
   * 
   * @param point Point
   * @return Inverse point
   */
  public static PathPoint inverse(PathPoint point) {
    return new PathPoint(-point.x, -point.y);
  }

  /**
   * Returns the middle point of two point, which lies between these points.
   * 
   * @param point1 First point
   * @param point2 Second point
   * @return Middle point
   */
  public static PathPoint midPoint(PathPoint point1, PathPoint point2) {
    return new PathPoint((point1.x + point2.x) / 2f, (point1.y + point2.y) / 2f);
  }

  /**
   * Create a unity vector for the given angle.
   * 
   * @param angle Angle
   * @return New point
   */
  public static PathPoint anglePoint(double angle) {
    if (Double.isNaN(angle) || Double.isInfinite(angle)) {
      throw new IllegalArgumentException("Invalid angle: " + angle);
    }
    return new PathPoint((float) Math.cos(angle), (float) Math.sin(angle));
  }

  /**
   * Returns the distance to the origin for the given point.
   * 
   * @param point Point
   * @return Distance to the origin or length of the vector
   */
  public static float length(PathPoint point) {
    return (float) Math.hypot(point.x, point.y);
  }

  /**
   * Returns the angle to the origin.
   * 
   * @param point Point
   * @return Angle to the origin
   */
  public static double angle(PathPoint point) {
    return Math.atan2(point.y, point.x);
  }

  /**
   * Returns the orthogonal vector.
   * 
   * @param point Point or vector
   * @return Orthogonal vector
   */
  public static PathPoint orthogonal(PathPoint point) {
    return new PathPoint(point.y, -point.x);
  }

  /**
   * Returns the vector of length 1 for the given vector.
   * 
   * @param point Vector
   * @return Normalized vector
   */
  public static PathPoint normalize(PathPoint point) {
    float length = length(point);
    return new PathPoint(point.x / length, point.y / length);
  }

  /**
   * Return the dot product of two vectors.
   * 
   * @param point1 Vector 1
   * @param point2 Vector 2
   * @return Dot product
   */
  public static float dot(PathPoint point1, PathPoint point2) {
    return point1.x * point2.x + point1.y * point2.y;
  }

  /**
   * Returns the center between two points.
   * 
   * @param point1 Point 1
   * @param point2 Point 2
   * @return Center point
   */
  public static PathPoint center(PathPoint point1, PathPoint point2) {
    return new PathPoint((point1.x + point2.x) / 2f, (point1.y + point2.y) / 2f);
  }

  /**
   * Invert the coordinates of the given point.
   * 
   * @param point Point
   * @return New Point
   */
  public static PathPoint invert(PathPoint point) {
    return new PathPoint(-point.x, -point.y);
  }

  /**
   * Returns the difference angle between a line and a point.
   * 
   * @param angle Angle of the line in radians
   * @param point1 Coordinate of a point on the line
   * @param point2 Coordinate of the point
   * @return Difference angle in radians
   */
  public static double getDifferenceAngle(double angle, PathPoint point1, PathPoint point2) {
    angle = discriminateAngle(angle);

    PathPoint d = sub(point2, point1);

    double angle2 = angle(d);
    angle2 = discriminateAngle(angle2);

    return diffAngle(angle, angle2);
  }

  /**
   * Discriminate an angle to an interval [0,2pi].
   * 
   * @param angle Angle in radians
   * @return Angle in an interval [0,2pi].
   */
  public static double discriminateAngle(double angle) {
    while (angle < 0) {
      angle += 2 * Math.PI;
    }
    while (angle > 2 * Math.PI) {
      angle -= 2 * Math.PI;
    }
    return angle;
  }

  /**
   * Returns the difference angle between two angles.
   * 
   * @param angle First angle in radians
   * @param angle2 Second angle in radians
   * @return Difference angle in an interval [-pi,pi].
   */
  public static double diffAngle(double angle, double angle2) {
    double diff = angle2 - angle;
    if (diff > Math.PI) {
      diff = diff - 2 * Math.PI;
    } else if (diff < -Math.PI) {
      diff = 2 * Math.PI + diff;
    }
    return diff;
  }

  public static double getDifferenceAngle(PathPoint point1, PathPoint point2, PathPoint center, boolean ccw) {
    PathPoint d = sub(point1, center);
    PathPoint d2 = sub(point2, center);

    // always smaller or equal than 180°
    double fraction = dot(d, d2) / length(d) / length(d2);
    fraction = Math.min(Math.max(fraction, -1), 1);
    double angle = Math.acos(fraction);
    if (ccw) {
      if (isLeftOf(point2, center, point1)) {
        return angle;
      }
      return Math.PI + Math.PI - angle;
    }
    if (isRightOf(point2, center, point1)) {
      return -angle;
    }
    return -Math.PI - Math.PI + angle;
  }

  /**
   * Returns twice the area of the oriented triangle (a, b, c), i.e., the area is positive if the
   * triangle is oriented counterclockwise.
   */
  public static float getTriArea(PathPoint a, PathPoint b, PathPoint c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  /**
   * Returns TRUE if the point d is inside the circle defined by the points a, b, c. See Guibas and
   * Stolfi (1985) p.107.
   */
  public boolean isInCircle(PathPoint a, PathPoint b, PathPoint c, PathPoint d) {
    return dot(a, a) * getTriArea(b, c, d) - dot(b, b) * getTriArea(a, c, d) + dot(c, c) * getTriArea(a, b, d) -
            dot(d, d) * getTriArea(a, b, c) > 0;
  }

  /**
   * Returns TRUE if the points a, b, c are in a counterclockwise order.
   */
  public static boolean isCCW(PathPoint a, PathPoint b, PathPoint c) {
    return (getTriArea(a, b, c) > 0);
  }

  public static boolean isRightOf(PathPoint p, PathPoint point1, PathPoint point2) {
    return isCCW(p, point2, point1);
  }

  public static boolean isLeftOf(PathPoint p, PathPoint point1, PathPoint point2) {
    return isCCW(p, point1, point2);
  }

  /**
   * Give the fractional factor of the intersection point of line b1 and line b2. The fraction is
   * measured depending on line b2. The intersection must be between 0 and 1 to have an intersection
   * point.
   * 
   * @param b1point1 First point of the first line
   * @param b1point2 Second point of the first line
   * @param b2point1 First point of the second line
   * @param b2point2 Second point of the second line
   * @return Value of the intersection. If a intersection exists then value is in interval [0,1]
   */
  public static double getIntersection(PathPoint b1point1, PathPoint b1point2, PathPoint b2point1, PathPoint b2point2) {
    return ((double) (b1point2.x - b1point1.x) * (double) (b1point1.y - b2point1.y) -
            (double) (b1point2.y - b1point1.y) * (double) (b1point1.x - b2point1.x)) /
            ((double) (b2point2.y - b2point1.y) * (double) (b1point2.x - b1point1.x) -
                    (double) (b2point2.x - b2point1.x) * (double) (b1point2.y - b1point1.y));
  }

  public static AffineTransform createPerspectiveTransform(PathPoint center, PathPoint majorAxis, PathPoint minorAxis) {
    return new AffineTransform(majorAxis.x - center.x, majorAxis.y - center.y, minorAxis.x - center.x, minorAxis.y - center.y, center.x,
            center.y);
  }

  public static PathPoint transform(AffineTransform transform, PathPoint point) {
    float[] pointValues = new float[2];
    pointValues[0] = point.x;
    pointValues[1] = point.y;
    float[] newPointValues = new float[2];
    transform.transform(pointValues, 0, newPointValues, 0, 1);
    return new PathPoint(newPointValues[0], newPointValues[1]);

  }

  public static PathPoint[] transform(AffineTransform transform, PathPoint[] points) {
    int count = points.length * 2;
    float[] pointValues = new float[count];
    {
      int index = 0;
      for (PathPoint point : points) {
        pointValues[index++] = point.x;
        pointValues[index++] = point.y;
      }
    }
    float[] newPointValues = new float[count];
    transform.transform(pointValues, 0, newPointValues, 0, points.length);

    PathPoint[] newPoints = new PathPoint[points.length];
    for (int index = 0; index < points.length; index++) {
      newPoints[index] = point(newPointValues[index * 2], newPointValues[index * 2 + 1]);
    }
    return newPoints;
  }

  public static List<PathPoint> transform(AffineTransform transform, List<PathPoint> points) {
    int count = points.size() * 2;
    float[] pointValues = new float[count];
    {
      int index = 0;
      for (PathPoint point : points) {
        pointValues[index++] = point.x;
        pointValues[index++] = point.y;
      }
    }
    float[] newPointValues = new float[count];
    transform.transform(pointValues, 0, newPointValues, 0, points.size());

    List<PathPoint> newPoints = new ArrayList<>(points.size());
    for (int index = 0; index < points.size(); index++) {
      newPoints.add(point(newPointValues[index * 2], newPointValues[index * 2 + 1]));
    }
    return newPoints;
  }

}
