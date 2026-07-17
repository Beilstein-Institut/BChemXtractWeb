package org.beilstein.chemxtract.render.cdx.renderer;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;

import java.awt.BasicStroke;
import java.awt.geom.AffineTransform;

import org.apache.commons.logging.*;
import org.beilstein.chemxtract.cdx.datatypes.*;

/**
 * Helper class to generate various paths for arrows. This class is used by {@link CDGraphicsWriter}
 * .
 * 
 * @author stephan
 * @version $Id: ArrowUtils.java,v 1.10 2014-06-12 11:32:59 bsnie Exp $
 */
public class ArrowUtils {
  private static final Log logger = LogFactory.getLog(ArrowUtils.class);

  public static final float HEADSIZE_FACTOR = 0.875f;
  public static final double HEAD_ANGULARSIZE = Math.toRadians(13.0);
  public static final double ARC_HEAD_ANGULARSIZE = Math.toRadians(17.0);
  public static final float HEADSIZE_REDUCTION_FACTOR = 2f / 3f /*0.7f*/;
  public static final float ARC_HEADSIZE_REDUCTION_FACTOR = 0.0068f /*0.37f*/;

  /**
   * Generate path for arrow head for an arc.
   * 
   * @param path Path to which the generated path should be added
   * @param centerPoint Coordinate of the arc center
   * @param headPoint Coordinate of the arc start point
   * @param tailPoint Coordinate of the arc end point
   * @param perspectiveTransform Perspective transformation
   * @param ccw True, if the arc is counter-clock wise orientated around the center
   * @param headSize Size of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param shaftSize Size of the arrow shaft
   * @param shaftSpacing Spacing between the two shafts
   * @param shaftRatio Factor to decrease the size of one shaft in relation to the other shaft
   * @param dashed True, if the shaft should be dashed
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @return New path of the arrow
   */
  public static Path addArcArrow(Path path, PathPoint centerPoint, PathPoint headPoint, PathPoint tailPoint,
    AffineTransform perspectiveTransform, /*AffineTransform inversePerspectiveTransform,*/boolean ccw, float headSize, float headCenterSize,
    float headWidth, float shaftSize, float shaftSpacing, float shaftRatio, boolean dashed, CDArrowHeadPositionType headType,
    CDArrowHeadPositionType tailType) {
    if (shaftSpacing <= 0f) {
      addArcArrow(path, centerPoint, headPoint, tailPoint, perspectiveTransform, /*inversePerspectiveTransform,*/ccw, 1f, headSize,
              headCenterSize, headWidth, shaftSize, dashed, headType, tailType);
    } else {
      PathPoint n1 = normalize(sub(headPoint, centerPoint));
      PathPoint n2 = normalize(sub(tailPoint, centerPoint));

      // correction of the shaft spacing for the perspective transformation
      if (perspectiveTransform != null) {
        PathPoint point1 = point(1f, 1f);
        PathPoint point2 = point(1f, 0f);
        PathPoint point3 = point(0f, 1f);
        point1 = GeometryUtils.transform(perspectiveTransform, point1);
        point2 = GeometryUtils.transform(perspectiveTransform, point2);
        point3 = GeometryUtils.transform(perspectiveTransform, point3);
        shaftSpacing /= Math.min(length(sub(point2, point1)), length(sub(point3, point1)));
      }

      float shaftSpacing2 = shaftSpacing / 2f;

      addArcArrow(path, centerPoint, scaleAdd(headPoint, n1, shaftSpacing2), scaleAdd(tailPoint, n2, shaftSpacing2), perspectiveTransform,
              /*inversePerspectiveTransform,*/ccw, 1f, headSize, headCenterSize, headWidth, shaftSize, dashed, headType,
              CDArrowHeadPositionType.None);

      // decrease size of the second arrow by the shaft ratio factor

      addArcArrow(path, centerPoint, scaleAdd(headPoint, n1, -shaftSpacing2), scaleAdd(tailPoint, n2, -shaftSpacing2), perspectiveTransform,
              /*inversePerspectiveTransform,*/ccw, shaftRatio, headSize, headCenterSize, headWidth, shaftSize, dashed,
              CDArrowHeadPositionType.None, tailType);
    }
    return path;
  }

  /**
   * Generate path for arrow head for an arc.
   * 
   * @param path Path to which the generated path should be added
   * @param centerPoint Coordinate of the arc center
   * @param headPoint Coordinate of the arc start point
   * @param tailPoint Coordinate of the arc end point
   * @param perspectiveTransform Perspective transformation
   * @param ccw True, if the arc is counter-clock wise orientated around the center
   * @param ratio Ratio factor to decrease the arc length from 0 to 1
   * @param headSize Size of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param shaftSize Size of the arrow shaft
   * @param dashed True, if the shaft should be dashed
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @return New path of the arrow
   */
  public static Path addArcArrow(Path path, PathPoint centerPoint, PathPoint headPoint, PathPoint tailPoint,
    AffineTransform perspectiveTransform, /*AffineTransform inversePerspectiveTransform,*/boolean ccw, float ratio, float headSize,
    float headCenterSize, float headWidth, float shaftSize, boolean dashed, CDArrowHeadPositionType headType,
    CDArrowHeadPositionType tailType) {
    ratio = Math.max(ratio, 1f);
    float factor = (ratio - 1) / ratio;

    Path curve = null;
    if (perspectiveTransform != null/* && inversePerspectiveTransform != null*/) {
      double angularSize = GeometryUtils.getDifferenceAngle(headPoint, tailPoint, centerPoint, ccw);

      if (ratio != 1f) {
        PathPoint d = sub(headPoint, centerPoint);
        float radius = length(d);
        double angle = angle(d);
        angle += angularSize * factor / 2f;
        angularSize -= angularSize * factor;

        curve = CurveUtils.addArc(new Path(), centerPoint, scaleAdd(centerPoint, anglePoint(angle), radius), angularSize, false);
      } else {
        curve = CurveUtils.addArc(new Path(), centerPoint, headPoint, angularSize, false);
      }

      curve.transform(perspectiveTransform);
    } else {
      double angularSize = GeometryUtils.getDifferenceAngle(headPoint, tailPoint, centerPoint, ccw);

      if (ratio != 1f) {
        PathPoint d = sub(headPoint, centerPoint);
        float radius = length(d);
        double angle = angle(d);
        angle += angularSize * factor / 2f;
        angularSize -= angularSize * factor;

        curve = CurveUtils.addArc(new Path(), centerPoint, scaleAdd(centerPoint, anglePoint(angle), radius), angularSize, false);
      } else {
        curve = CurveUtils.addArc(new Path(), centerPoint, headPoint, angularSize, false);
      }
    }
    return addCurveArrow(path, curve, perspectiveTransform, /*inversePerspectiveTransform,*/headSize, headCenterSize, headWidth, shaftSize,
            dashed, headType, tailType);
  }

  /**
   * Create an arrow of a curve.
   * 
   * @param path New path of the arrow
   * @param splinePath Path of the curve
   * @param perspectiveTransform Perspective transformation
   * @param headSize Size of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param shaftSize Size of the arrow shaft
   * @param dashed True, if the shaft should be dashed
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @return New path of the arrow
   */
  public static Path addCurveArrow(Path path, Path splinePath,
    AffineTransform perspectiveTransform, /*AffineTransform inversePerspectiveTransform,*/
    float headSize, float headCenterSize, float headWidth, float shaftSize, boolean dashed, CDArrowHeadPositionType headType,
    CDArrowHeadPositionType tailType) {

    boolean tail = tailType != CDArrowHeadPositionType.Unspecified && tailType != CDArrowHeadPositionType.None;
    boolean head = headType != CDArrowHeadPositionType.Unspecified && headType != CDArrowHeadPositionType.None;

    // ChemDraw allows negative head sizes
    headSize = Math.abs(headSize);

    // head width limit
    headWidth = Math.max(headWidth, shaftSize * 1.5f);

    // determine start- and endpoint and length of the curve
    PathPoint headPoint = splinePath.getFirstPoint();
    PathPoint tailPoint = splinePath.getLastPoint();
    float length = CurveUtils.getCurveLength(splinePath);

    // head size reduction
    {
      // decrease size if the head size if bigger than a fraction of the length
      float scale = (2f / 3f) * length / headSize;

      if (scale < 1f) {
        headSize *= scale;
        headCenterSize *= scale;
        headWidth *= scale;
      }
    }

    // calculate spacing at the head and the tail for the arrow heads
    float spacing1 = head ? headCenterSize : 0f;
    float spacing2 = tail ? headCenterSize : 0f;

    // add shaft to the path
    Path shaftPath = CurveUtils.addCurvesDivision(new Path(), splinePath, spacing1, length - spacing2);
    PathPoint shaftHeadPoint = shaftPath.getFirstPoint();
    PathPoint shaftTailPoint = shaftPath.getLastPoint();

    PathPoint shaftHeadDirection = null;
    PathPoint shaftTailDirection = null;
    try {
      shaftHeadDirection = shaftPath.getFirstDirection();
      shaftTailDirection = shaftPath.getLastDirection();
    } catch (IllegalStateException e) {
      return null;
    }

    path.append(CurveUtils.getStrokedPath(shaftPath, !dashed ? new BasicStroke(shaftSize, BasicStroke.CAP_SQUARE, BasicStroke.JOIN_BEVEL)
            : new BasicStroke(shaftSize, BasicStroke.CAP_BUTT, BasicStroke.JOIN_BEVEL, 0f, new float[] { 3 }, 0f)));

    // add arrow head at the head of the shaft
    if (head) {
      PathPoint nh = normalize(sub(headPoint, shaftHeadPoint));
      PathPoint oh = orthogonal(shaftHeadDirection);

      if (headType == CDArrowHeadPositionType.HalfRight) {
        // change direction to be flush with the shaft 
        headPoint = scaleAdd(headPoint, oh, shaftSize / 2f);
        shaftHeadPoint = scaleAdd(shaftHeadPoint, oh, shaftSize / 2f);
        nh = normalize(sub(headPoint, shaftHeadPoint));

        // compensate head width because of the shift
        headWidth += shaftSize / 2f;

        addArrowHead(path, headPoint, nh, headSize, headCenterSize, headWidth, false, false);
      } else if (headType == CDArrowHeadPositionType.HalfLeft) {
        // change direction to be flush with the shaft
        headPoint = scaleAdd(headPoint, oh, -shaftSize / 2f);
        shaftHeadPoint = scaleAdd(shaftHeadPoint, oh, -shaftSize / 2f);
        nh = normalize(sub(headPoint, shaftHeadPoint));

        // compensate head width because of the shift
        headWidth += shaftSize / 2f;

        addArrowHead(path, headPoint, nh, headSize, headCenterSize, headWidth, false, true);
      } else {
        addArrowHead(path, headPoint, nh, headSize, headCenterSize, headWidth, true, false);
      }
    }

    // add arrow head to the tail of the shaft
    if (tail) {
      PathPoint nt = normalize(sub(tailPoint, shaftTailPoint));
      PathPoint ot = orthogonal(shaftTailDirection);

      if (tailType == CDArrowHeadPositionType.HalfRight) {
        // change direction to be flush with the shaft
        tailPoint = scaleAdd(tailPoint, ot, shaftSize / 2f);
        shaftTailPoint = scaleAdd(shaftTailPoint, ot, shaftSize / 2f);
        nt = normalize(sub(tailPoint, shaftTailPoint));

        // compensate head width because of the shift
        headWidth += shaftSize / 2f;

        addArrowHead(path, tailPoint, nt, headSize, headCenterSize, headWidth, false, false);
      } else if (tailType == CDArrowHeadPositionType.HalfLeft) {
        // change direction to be flush with the shaft 
        tailPoint = scaleAdd(tailPoint, ot, -shaftSize / 2f);
        shaftTailPoint = scaleAdd(shaftTailPoint, ot, -shaftSize / 2f);
        nt = normalize(sub(tailPoint, shaftTailPoint));

        // compensate head width because of the shift
        headWidth += shaftSize / 2f;

        addArrowHead(path, tailPoint, nt, headSize, headCenterSize, headWidth, false, true);
      } else {
        addArrowHead(path, tailPoint, nt, headSize, headCenterSize, headWidth, true, false);
      }
    }
    return path;
  }

  /**
   * Generate path for an arrow head.
   * 
   * @param path Path to which the generated path should be added
   * @param tailPoint Coordinate of the arrow start point
   * @param headPoint Coordinate of the arrow end point
   * @param headSize Size of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param shaftSize Size of the arrow shaft
   * @param shaftSpacing Spacing between the two shafts, other 0 for one shaft
   * @param shaftRatio Ratio of lengths between the shafts
   * @param dashed True, if the shaft should be dashed
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @param noGoType Type of the no go
   * @param dipole True for dipole arrows
   */
  public static void addSolidArrow(Path path, PathPoint tailPoint, PathPoint headPoint, float headSize, float headCenterSize,
    float headWidth, float shaftSize, float shaftSpacing, float shaftRatio, boolean dashed, CDArrowHeadPositionType headType,
    CDArrowHeadPositionType tailType, CDNoGoType noGoType, boolean dipole) {

    if (shaftSpacing <= 0f) {
      addSolidArrow(path, tailPoint, headPoint, headSize, headCenterSize, headWidth, shaftSize, dashed, headType, tailType, noGoType,
              dipole);
      return;
    }

    PathPoint d = sub(headPoint, tailPoint);

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    float shaftSpacing2 = shaftSpacing / 2f;

    CDArrowHeadPositionType arrow1HeadType = CDArrowHeadPositionType.None;
    if (headType == CDArrowHeadPositionType.HalfLeft || headType == CDArrowHeadPositionType.Full) {
      arrow1HeadType = CDArrowHeadPositionType.HalfLeft;
    }

    CDArrowHeadPositionType arrow1TailType = CDArrowHeadPositionType.None;
    if (tailType == CDArrowHeadPositionType.HalfRight || tailType == CDArrowHeadPositionType.Full) {
      arrow1TailType = CDArrowHeadPositionType.HalfRight;
    }

    addSolidArrow(path, scaleAdd(tailPoint, o, shaftSpacing2, n, shaftSize), scaleAdd(headPoint, o, shaftSpacing2), headSize,
            headCenterSize, headWidth, shaftSize, dashed, arrow1HeadType, arrow1TailType, noGoType, dipole);

    // decrease size of the second arrow by the shaft ratio factor
    shaftRatio = Math.max(shaftRatio, 1f);
    float factor = (shaftRatio - 1) / (2f * shaftRatio);
    tailPoint = scaleAdd(tailPoint, d, factor);
    headPoint = scaleAdd(headPoint, d, -factor);

    CDArrowHeadPositionType arrow2HeadType = CDArrowHeadPositionType.None;
    if (headType == CDArrowHeadPositionType.HalfRight || headType == CDArrowHeadPositionType.Full) {
      arrow2HeadType = CDArrowHeadPositionType.HalfRight;
    }

    CDArrowHeadPositionType arrow2TailType = CDArrowHeadPositionType.None;
    if (tailType == CDArrowHeadPositionType.HalfLeft || tailType == CDArrowHeadPositionType.Full) {
      arrow2TailType = CDArrowHeadPositionType.HalfLeft;
    }

    addSolidArrow(path, scaleAdd(tailPoint, o, -shaftSpacing2), scaleAdd(headPoint, o, -shaftSpacing2, n, -shaftSize), headSize,
            headCenterSize, headWidth, shaftSize, dashed, arrow2HeadType, arrow2TailType, noGoType, dipole);
  }

  /**
   * Generate path for an arrow head.
   * 
   * @param path Path to which the generated path should be added
   * @param tailPoint Coordinate of the arrow start point
   * @param headPoint Coordinate of the arrow end point
   * @param headSize Size of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param shaftSize Size of the arrow shaft
   * @param dashed True, if the shaft should be dashed
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @param noGoType Type of the no go
   * @param dipole True for dipole arrows
   */
  public static void addSolidArrow(Path path, PathPoint tailPoint, PathPoint headPoint, float headSize, float headCenterSize,
    float headWidth, float shaftSize, boolean dashed, CDArrowHeadPositionType headType, CDArrowHeadPositionType tailType,
    CDNoGoType noGoType, boolean dipole) {
    PathPoint d = sub(headPoint, tailPoint);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for arrow: " + length);
      return;
    }

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    addCurveArrow(path, CurveUtils.addLine(new Path(), headPoint, tailPoint, false), null, /*null,*/headSize, headCenterSize, headWidth,
            shaftSize, dashed, headType, tailType);

    if (noGoType == CDNoGoType.Cross) {
      float headSize3 = headWidth * 2f;
      PathPoint m = scale(add(tailPoint, headPoint), 1f / 2f);

      CurveUtils.addLine(path, scaleAdd(m, o, headSize3, n, headSize3), scaleAdd(m, o, -headSize3, n, -headSize3), shaftSize, false);

      CurveUtils.addLine(path, scaleAdd(m, o, -headSize3, n, headSize3), scaleAdd(m, o, headSize3, n, -headSize3), shaftSize, false);
    } else if (noGoType == CDNoGoType.Hash) {
      float headSize3 = headWidth * 2f;
      PathPoint m = scale(add(tailPoint, headPoint), 1f / 2f);

      CurveUtils.addLine(path, scaleAdd(m, o, headSize3, n, headSize3), scaleAdd(m, o, -headSize3), shaftSize, false);

      CurveUtils.addLine(path, scaleAdd(m, o, -headSize3, n, -headSize3), scaleAdd(m, o, headSize3), shaftSize, false);
    }

    if (dipole) {
      CurveUtils.addLine(path, scaleAdd(tailPoint, o, headWidth, n, headWidth), scaleAdd(tailPoint, o, -headWidth, n, headWidth), shaftSize,
              false);
    }
  }

  /**
   * Generate path for a hollow arrow.
   * 
   * @param path Path to which the generated path should be added
   * @param tailPoint Coordinate of the arrow start point
   * @param headPoint Coordinate of the arrow end point
   * @param headSize Size of the arrow head
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @param noGoType Type of the no go
   */
  public static void addHollowArrow(Path path, PathPoint tailPoint, PathPoint headPoint, float headSize, CDArrowHeadPositionType headType,
    CDArrowHeadPositionType tailType, CDNoGoType noGoType) {
    PathPoint d = sub(headPoint, tailPoint);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for arrow: " + length);
      return;
    }

    headSize = Math.min(Math.abs(headSize), length * HEADSIZE_REDUCTION_FACTOR);

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    float headSize2 = headSize / 2f;

    boolean tail = tailType != CDArrowHeadPositionType.Unspecified && tailType != CDArrowHeadPositionType.None;
    boolean head = headType != CDArrowHeadPositionType.Unspecified && headType != CDArrowHeadPositionType.None;

    if (tail) {
      path.moveTo(scaleAdd(tailPoint, o, headSize2, n, headSize));
      path.lineTo(scaleAdd(tailPoint, o, headSize, n, headSize));
      path.lineTo(tailPoint);
      path.lineTo(scaleAdd(tailPoint, o, -headSize, n, headSize));
      path.lineTo(scaleAdd(tailPoint, o, -headSize2, n, headSize));
    } else {
      path.moveTo(scaleAdd(tailPoint, o, headSize2));
      path.lineTo(scaleAdd(tailPoint, o, -headSize2));
    }

    if (head) {
      path.lineTo(scaleAdd(headPoint, o, -headSize2, n, -headSize));
      path.lineTo(scaleAdd(headPoint, o, -headSize, n, -headSize));
      path.lineTo(headPoint);
      path.lineTo(scaleAdd(headPoint, o, headSize, n, -headSize));
      path.lineTo(scaleAdd(headPoint, o, headSize2, n, -headSize));
    } else {
      path.lineTo(scaleAdd(headPoint, o, -headSize2));
      path.lineTo(scaleAdd(headPoint, o, headSize2));
    }

    path.closePath();

    if (noGoType == CDNoGoType.Cross) {
      float headSize3 = headSize * 2f;
      PathPoint m = center(tailPoint, headPoint);

      path.moveTo(scaleAdd(m, o, headSize3, n, headSize3));
      path.lineTo(scaleAdd(m, o, -headSize3, n, -headSize3));

      path.moveTo(scaleAdd(m, o, -headSize3, n, headSize3));
      path.lineTo(scaleAdd(m, o, headSize3, n, -headSize3));
    } else if (noGoType == CDNoGoType.Hash) {
      float headSize3 = headSize * 2f;
      PathPoint m = center(tailPoint, headPoint);

      path.moveTo(scaleAdd(m, o, headSize3, n, headSize3));
      path.lineTo(scaleAdd(m, o, -headSize3));

      path.moveTo(scaleAdd(m, o, -headSize3, n, -headSize3));
      path.lineTo(scaleAdd(m, o, headSize3));
    }
  }

  /**
   * Generate path for a retro-synthetic arrow.
   * 
   * @param path Path to which the generated path should be added
   * @param point1 Coordinate of the arrow start point
   * @param point2 Coordinate of the arrow end point
   * @param headSize Size of the arrow head
   * @param headType Type of the arrow head the the head
   * @param tailType Type of the arrow head at the tail
   * @param noGoType Type of the no go
   */
  public static void addAngleArrow(Path path, PathPoint point1, PathPoint point2, float headSize, CDArrowHeadPositionType headType,
    CDArrowHeadPositionType tailType, CDNoGoType noGoType) {
    PathPoint d = sub(point2, point1);
    float length = length(d);
    if (length <= 0) {
      logger.warn("Invalid length for arrow: " + length);
      return;
    }

    headSize = Math.min(Math.abs(headSize), length * HEADSIZE_REDUCTION_FACTOR);

    PathPoint n = normalize(d);
    PathPoint o = orthogonal(n);

    float headSize2 = headSize / 2f;

    // tail head
    if (tailType == CDArrowHeadPositionType.HalfRight) {
      path.moveTo(point1);
      path.lineTo(scaleAdd(point1, o, headSize, n, headSize));
    } else if (tailType == CDArrowHeadPositionType.HalfLeft) {
      path.moveTo(point1);
      path.lineTo(scaleAdd(point1, o, -headSize, n, headSize));
    } else if (tailType == CDArrowHeadPositionType.Full) {
      path.moveTo(scaleAdd(point1, o, headSize, n, headSize));
      path.lineTo(point1);
      path.lineTo(scaleAdd(point1, o, -headSize, n, headSize));
    }

    // left shaft side
    if (tailType == CDArrowHeadPositionType.Full || tailType == CDArrowHeadPositionType.HalfRight) {
      path.moveTo(scaleAdd(point1, o, headSize2, n, headSize2));
    } else {
      path.moveTo(scaleAdd(point1, o, headSize2));
    }
    if (headType == CDArrowHeadPositionType.Full || headType == CDArrowHeadPositionType.HalfLeft) {
      path.lineTo(scaleAdd(point2, o, headSize2, n, -headSize2));
    } else {
      path.lineTo(scaleAdd(point2, o, headSize2));
    }

    // right shaft side
    if (tailType == CDArrowHeadPositionType.Full || tailType == CDArrowHeadPositionType.HalfLeft) {
      path.moveTo(scaleAdd(point1, o, -headSize2, n, headSize2));
    } else {
      path.moveTo(scaleAdd(point1, o, -headSize2));
    }
    if (headType == CDArrowHeadPositionType.Full || headType == CDArrowHeadPositionType.HalfRight) {
      path.lineTo(scaleAdd(point2, o, -headSize2, n, -headSize2));
    } else {
      path.lineTo(scaleAdd(point2, o, -headSize2));
    }

    // head head
    if (headType == CDArrowHeadPositionType.HalfLeft) {
      path.moveTo(point2);
      path.lineTo(scaleAdd(point2, o, headSize, n, -headSize));
    } else if (headType == CDArrowHeadPositionType.HalfRight) {
      path.moveTo(point2);
      path.lineTo(scaleAdd(point2, o, -headSize, n, -headSize));
    } else if (headType == CDArrowHeadPositionType.Full) {
      path.moveTo(scaleAdd(point2, o, -headSize, n, -headSize));
      path.lineTo(point2);
      path.lineTo(scaleAdd(point2, o, headSize, n, -headSize));
    }

    if (noGoType == CDNoGoType.Cross) {
      float headSize3 = headSize * 2f;
      PathPoint m = center(point1, point2);

      path.moveTo(scaleAdd(m, o, headSize3, n, headSize3));
      path.lineTo(scaleAdd(m, o, -headSize3, n, -headSize3));

      path.moveTo(scaleAdd(m, o, -headSize3, n, headSize3));
      path.lineTo(scaleAdd(m, o, headSize3, n, -headSize3));
    } else if (noGoType == CDNoGoType.Hash) {
      float headSize3 = headSize * 2f;
      PathPoint m = center(point1, point2);

      path.moveTo(scaleAdd(m, o, headSize3, n, headSize3));
      path.lineTo(scaleAdd(m, o, -headSize3));

      path.moveTo(scaleAdd(m, o, -headSize3, n, -headSize3));
      path.lineTo(scaleAdd(m, o, headSize3));
    }
  }

  /**
   * Generate path for an arrow head.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the arrow head end point
   * @param direction Angle of the direction of the arrow head in radians
   * @param headSize Length of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param full True for full arrow heads otherwise for half arrow heads
   * @param leftSide True, if the half arrow head shows to the left
   */
  public static void addArrowHead(Path path, PathPoint point, double direction, float headSize, float headCenterSize, float headWidth,
    boolean full, boolean leftSide) {
    addArrowHead(path, point, anglePoint(direction), headSize, headCenterSize, headWidth, full, leftSide);
  }

  /**
   * Generate path for an arrow head.
   * 
   * @param path Path to which the generated path should be added
   * @param point Coordinate of the arrow head end point
   * @param n Normal vector
   * @param headSize Length of the arrow head
   * @param headCenterSize Size of the arrow head tip to the bow.
   * @param headWidth Width of the arrow head
   * @param full True for full arrow heads otherwise for half arrow heads
   * @param leftSide True, if the half arrow head shows to the left
   */
  public static void addArrowHead(Path path, PathPoint point, PathPoint n, float headSize, float headCenterSize, float headWidth,
    boolean full, boolean leftSide) {
    if (headCenterSize == 0 || headSize == 0f) {
      return;
    }
    float width2 = headWidth / 2f * headCenterSize / headSize;
    PathPoint o = orthogonal(n);

    PathPoint f3 = scaleAdd(point, n, -headCenterSize);

    path.moveTo(point);
    if (leftSide || full) {
      PathPoint f1 = scaleAdd(point, n, -headSize, o, headWidth);
      PathPoint f2 = scaleAdd(point, n, -headCenterSize, o, width2);
      path.lineTo(f1);
      path.curveTo(f1, f2, f3);
    } else {
      path.lineTo(f3);
    }
    if (!leftSide || full) {
      PathPoint f4 = scaleAdd(point, n, -headCenterSize, o, -width2);
      PathPoint f5 = scaleAdd(point, n, -headSize, o, -headWidth);
      path.curveTo(f4, f5, f5);
    }
    path.closePath();
  }
}
