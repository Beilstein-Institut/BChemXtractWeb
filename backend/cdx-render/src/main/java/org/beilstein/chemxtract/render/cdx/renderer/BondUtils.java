package org.beilstein.chemxtract.render.cdx.renderer;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.ZERO_POINT;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.angle;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.diffAngle;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.discriminateAngle;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.getDifferenceAngle;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.getIntersection;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.length;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.normalize;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.orthogonal;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.point;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.scale;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.scaleAdd;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.sub;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.geom.Line2D;
import java.awt.geom.PathIterator;
import java.awt.geom.Rectangle2D;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.render.cdx.renderer.CDGraphicsWriter.TextChar;
import org.beilstein.chemxtract.cdx.CDAtom;
import org.beilstein.chemxtract.cdx.CDBond;
import org.beilstein.chemxtract.cdx.CDDocument;
import org.beilstein.chemxtract.cdx.CDFragment;
import org.beilstein.chemxtract.cdx.CDText;
import org.beilstein.chemxtract.cdx.datatypes.CDBondDisplay;
import org.beilstein.chemxtract.cdx.datatypes.CDBondDoublePosition;
import org.beilstein.chemxtract.cdx.datatypes.CDBondOrder;
import org.beilstein.chemxtract.cdx.datatypes.CDJustification;
import org.beilstein.chemxtract.cdx.datatypes.CDLabelDisplay;

/**
 * Helper class to generate various paths for bonds. This class is used by {@link CDGraphicsWriter}
 * .
 * 
 * @author stephan
 * @version $Id: BondUtils.java,v 1.10 2010-12-07 11:57:15 bsmic Exp $
 */
public class BondUtils {
  private static final float DATIVE_BOND_HEADSIZE = 10f;

  private static final Log logger = LogFactory.getLog(BondUtils.class);

  /** Maximum interval in which angles can vary */
  private static final float ANGLE_SIGMA = 0.1f;

  /** Factor to increase the bold end of the wedges over the "normal" bold width */
  private static final float WEDGE_WIDTH_FACTOR = 1.45f;

  /**
   * Generate path for a simple bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   * @param dashed True, if the bond should be dashed
   */
  public static void addSimpleBond(Path path, BondStructure fragment, int bondIndex, boolean dashed) {
    CurveUtils.addLine(path, fragment.point1[bondIndex], fragment.point2[bondIndex], fragment.atomMargin1[bondIndex],
            fragment.atomMargin2[bondIndex], fragment.width1[bondIndex], fragment.hashSpacing[bondIndex], dashed);
  }

  /**
   * Generate path for a double bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   * @param width1 Width of the first bond
   * @param width2 Width of the second bond
   * @param dashed1 True, if the first bond should be dashed
   * @param dashed2 True, if the second bond should be dashed
   * @param wavy True, if the bonds should be wavy
   */
  public static void addDoubleBond(Path path, BondStructure fragment, int bondIndex, float width1, float width2, boolean dashed1,
    boolean dashed2, boolean wavy) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    PathPoint n = fragment.n[bondIndex];

    double theta = fragment.angle[bondIndex];

    PathPoint o = fragment.o[bondIndex];

    float bondSpacing = fragment.bondSpacing[bondIndex];
    float bondSpacing2 = bondSpacing / 2f;

    float width1_2 = width1 / 2f;
    float width2_2 = width2 / 2f;

    PathPoint point1 = fragment.point1[bondIndex];
    PathPoint point2 = fragment.point2[bondIndex];

    PathPoint leftPoint1 = fragment.leftPoint1[bondIndex];
    PathPoint rightPoint1 = fragment.rightPoint1[bondIndex];
    PathPoint leftPoint2 = fragment.leftPoint2[bondIndex];
    PathPoint rightPoint2 = fragment.rightPoint2[bondIndex];

    double leftAngle1 = fragment.leftBondIndex1[bondIndex] < 0 ? Math.PI : -getDifferenceAngle(theta, point1, leftPoint1);
    double rightAngle1 = fragment.rightBondIndex1[bondIndex] < 0 ? Math.PI : getDifferenceAngle(theta, point1, rightPoint1);
    double leftAngle2 = fragment.leftBondIndex2[bondIndex] < 0 ? Math.PI : getDifferenceAngle(theta + Math.PI, point2, leftPoint2);
    double rightAngle2 = fragment.rightBondIndex2[bondIndex] < 0 ? Math.PI : -getDifferenceAngle(theta + Math.PI, point2, rightPoint2);

    float atomMargin1 = fragment.atomMargin1[bondIndex];
    float atomMargin2 = fragment.atomMargin2[bondIndex];

    if (atomMargin1 + atomMargin2 >= length) {
      logger.warn("Bond too short to be displayed");
      return;
    }

    float hashSpacing = fragment.hashSpacing[bondIndex];
    if (wavy) {
      // TODO use correct margin
      CurveUtils.addLine(path, scaleAdd(point1, o, bondSpacing2), scaleAdd(point2, o, -bondSpacing2), atomMargin1, atomMargin2, width1,
              hashSpacing, dashed1);
      CurveUtils.addLine(path, scaleAdd(point1, o, -bondSpacing2), scaleAdd(point2, o, bondSpacing2), atomMargin1, atomMargin2, width2,
              hashSpacing, dashed2);
    } else {
      CDBondDoublePosition position = fragment.doubleBondPosition[bondIndex];
      switch (position) {
        case AutoCenter:
        case UserCenter: {
          // center middle line so that the bond has equal bounds to the right and to the left
          float centerShift = -width1_2 + width2_2;
          float offsetRight = bondSpacing2 + centerShift;
          float offsetLeft = bondSpacing2 - centerShift;
          if (width1 > fragment.lineWidth[bondIndex] || width2 > fragment.lineWidth[bondIndex]) {
            offsetRight += width1_2;
            offsetLeft += width2_2;
          }

          double intersectionLeft1 = fragment.leftBondIndex1[bondIndex] < 0 ? Float.NaN
                  : getIntersection(scaleAdd(point1, o, offsetLeft), scaleAdd(point2, o, offsetLeft), point1, leftPoint1);
          double intersectionRight1 = fragment.rightBondIndex1[bondIndex] < 0 ? Float.NaN
                  : getIntersection(scaleAdd(point1, o, -offsetRight), scaleAdd(point2, o, -offsetRight), point1, rightPoint1);
          double intersectionLeft2 = fragment.leftBondIndex2[bondIndex] < 0 ? Float.NaN
                  : getIntersection(scaleAdd(point1, o, offsetLeft), scaleAdd(point2, o, offsetLeft), point2, leftPoint2);
          double intersectionRight2 = fragment.rightBondIndex2[bondIndex] < 0 ? Float.NaN
                  : getIntersection(scaleAdd(point1, o, -offsetRight), scaleAdd(point2, o, -offsetRight), point2, rightPoint2);

          PathPoint r1 = scaleAdd(point1, o, -offsetRight, n, atomMargin1);
          if (atomMargin1 == 0 && fragment.rightBondIndex1[bondIndex] >= 0 && !Double.isNaN(intersectionRight1) &&
                  intersectionRight1 > 0f && intersectionRight1 < 1f) {
            PathPoint s = sub(rightPoint1, point1);
            r1 = scaleAdd(point1, s, intersectionRight1);
          }

          PathPoint r2 = scaleAdd(point2, o, -offsetRight, n, -atomMargin2);
          if (atomMargin2 == 0 && fragment.rightBondIndex2[bondIndex] >= 0 && !Double.isNaN(intersectionRight2) &&
                  intersectionRight2 > 0f && intersectionRight2 < 1f) {
            PathPoint s = sub(rightPoint2, point2);
            r2 = scaleAdd(point2, s, intersectionRight2);
          }

          PathPoint l1 = scaleAdd(point1, o, offsetLeft, n, atomMargin1);
          if (atomMargin1 == 0 && fragment.leftBondIndex1[bondIndex] >= 0 && !Double.isNaN(intersectionLeft1) && intersectionLeft1 > 0f &&
                  intersectionLeft1 < 1f) {
            PathPoint s = sub(leftPoint1, point1);
            l1 = scaleAdd(point1, s, intersectionLeft1);
          }

          PathPoint l2 = scaleAdd(point2, o, offsetLeft, n, -atomMargin2);
          if (atomMargin2 == 0 && fragment.leftBondIndex2[bondIndex] >= 0 && !Double.isNaN(intersectionLeft2) && intersectionLeft2 > 0f &&
                  intersectionLeft2 < 1f) {
            PathPoint s = sub(leftPoint2, point2);
            l2 = scaleAdd(point2, s, intersectionLeft2);
          }

          CurveUtils.addLine(path, r1, r2, 0f, 0f, width1, hashSpacing, dashed1);
          CurveUtils.addLine(path, l1, l2, 0f, 0f, width2, hashSpacing, dashed2);
          break;
        }
        case AutoRight:
        case UserRight: {
          float offset = bondSpacing;
          if (width1 > fragment.lineWidth[bondIndex] || width2 > fragment.lineWidth[bondIndex]) {
            offset += width1_2 + width2_2;
          }

          float spacingLeft1 = (float) Math.max(offset / Math.tan(leftAngle1 / 2f), atomMargin1);
          float spacingLeft2 = (float) Math.max(offset / Math.tan(leftAngle2 / 2f), atomMargin2);

          if (dashed1) {
            CurveUtils.addLine(path, point1, point2, atomMargin1, atomMargin2, Math.max(width1, width2), hashSpacing, dashed1);
          } else {
            addBoldBond(path, fragment, bondIndex);
          }

          if (spacingLeft1 + spacingLeft2 < length) {
            CurveUtils.addLine(path, scaleAdd(point1, o, offset), scaleAdd(point2, o, offset), spacingLeft1, spacingLeft2,
                    Math.min(width1, width2), hashSpacing, dashed2);
          }
          break;
        }
        case AutoLeft:
        case UserLeft: {
          float offset = bondSpacing;
          if (width1 > fragment.lineWidth[bondIndex] || width2 > fragment.lineWidth[bondIndex]) {
            offset += width1_2 + width2_2;
          }

          float spacingRight1 = (float) Math.max(offset / Math.tan(rightAngle1 / 2f), atomMargin1);
          float spacingRight2 = (float) Math.max(offset / Math.tan(rightAngle2 / 2f), atomMargin2);

          if (dashed2) {
            CurveUtils.addLine(path, point1, point2, atomMargin1, atomMargin2, Math.max(width1, width2), hashSpacing, dashed1);
          } else {
            addBoldBond(path, fragment, bondIndex);
          }

          if (spacingRight1 + spacingRight2 < length) {
            CurveUtils.addLine(path, scaleAdd(point1, o, -offset), scaleAdd(point2, o, -offset), spacingRight1, spacingRight2,
                    Math.min(width1, width2), hashSpacing, dashed2);
          }
          break;
        }
      }
    }
  }

  /**
   * Generate path for a triple bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   */
  public static void addTripleBond(Path path, BondStructure fragment, int bondIndex) {
    addTripleBond(null, path, fragment, bondIndex);
  }

  public static void addTripleBond(Graphics2D g, Path path, BondStructure fragment, int bondIndex) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    PathPoint o = fragment.o[bondIndex];

    float bondSpacing = fragment.bondSpacing[bondIndex];

    double rightAngle1 = fragment.rightAngle1[bondIndex];
    double leftAngle1 = fragment.leftAngle1[bondIndex];
    double rightAngle2 = fragment.rightAngle2[bondIndex];
    double leftAngle2 = fragment.leftAngle2[bondIndex];

    float atomSpacing1 = fragment.atomMargin1[bondIndex];
    float atomSpacing2 = fragment.atomMargin2[bondIndex];

    float spacingRight1 = (float) Math
            .max(Double.isNaN(rightAngle1) || rightAngle1 >= Math.PI ? 0f : bondSpacing / Math.tan(rightAngle1 / 2f), atomSpacing1);
    float spacingLeft1 = (float) Math.max(Double.isNaN(leftAngle1) || leftAngle1 >= Math.PI ? 0f : bondSpacing / Math.tan(leftAngle1 / 2f),
            atomSpacing1);

    float spacingRight2 = (float) Math
            .max(Double.isNaN(rightAngle2) || rightAngle2 >= Math.PI ? 0f : bondSpacing / Math.tan(rightAngle2 / 2f), atomSpacing2);
    float spacingLeft2 = (float) Math.max(Double.isNaN(leftAngle2) || leftAngle2 >= Math.PI ? 0f : bondSpacing / Math.tan(leftAngle2 / 2f),
            atomSpacing2);

    if (atomSpacing1 + atomSpacing2 >= length) {
      logger.warn("Bond too short to be displayed");
      return;
    }

    PathPoint point1 = fragment.point1[bondIndex];
    PathPoint point2 = fragment.point2[bondIndex];

    float width = fragment.width1[bondIndex];

    addBoldBond(g, path, fragment, bondIndex);

    if (spacingRight1 + spacingLeft2 < length) {
      CurveUtils.addLine(path, scaleAdd(point1, o, bondSpacing), scaleAdd(point2, o, bondSpacing), spacingLeft1, spacingLeft2, width, 0f,
              false);
    }

    if (spacingLeft1 + spacingRight2 < length) {
      CurveUtils.addLine(path, scaleAdd(point1, o, -bondSpacing), scaleAdd(point2, o, -bondSpacing), spacingRight1, spacingRight2, width,
              0f, false);
    }
  }

  /**
   * Generate path for a quadruple bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   */
  public static void addQuadrupleBond(Path path, BondStructure fragment, int bondIndex) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    PathPoint o = fragment.o[bondIndex];

    float bondSpacing = fragment.bondSpacing[bondIndex];
    float bondSpacing2 = bondSpacing / 2f;

    PathPoint point1 = fragment.point1[bondIndex];
    PathPoint point2 = fragment.point2[bondIndex];

    float width = fragment.width1[bondIndex];

    float atomMargin1 = fragment.atomMargin1[bondIndex];
    float atomMargin2 = fragment.atomMargin2[bondIndex];

    CurveUtils.addLine(path, scaleAdd(point1, o, bondSpacing + bondSpacing2), scaleAdd(point2, o, bondSpacing + bondSpacing2), atomMargin1,
            atomMargin2, width, 0f, false);
    CurveUtils.addLine(path, scaleAdd(point1, o, bondSpacing2), scaleAdd(point2, o, bondSpacing2), atomMargin1, atomMargin2, width, 0f,
            false);
    CurveUtils.addLine(path, scaleAdd(point1, o, -bondSpacing2), scaleAdd(point2, o, -bondSpacing2), atomMargin1, atomMargin2, width, 0f,
            false);
    CurveUtils.addLine(path, scaleAdd(point1, o, -(bondSpacing + bondSpacing2)), scaleAdd(point2, o, -(bondSpacing + bondSpacing2)),
            atomMargin1, atomMargin2, width, 0f, false);
  }

  /**
   * Generate path for a bold bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   */
  public static void addBoldBond(Path path, BondStructure fragment, int bondIndex) {
    addBoldBond(null, path, fragment, bondIndex);
  }

  public static void addBoldBond(Graphics2D g, Path path, BondStructure fragment, int bondIndex) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    PathPoint point1 = fragment.a1[bondIndex];
    PathPoint point2 = fragment.a2[bondIndex];

    float width12 = fragment.width1[bondIndex] / 2f;
    float width22 = fragment.width2[bondIndex] / 2f;

    boolean left1 = fragment.leftBondIndex1[bondIndex] < 0;
    boolean right1 = fragment.rightBondIndex1[bondIndex] < 0;
    boolean left2 = fragment.leftBondIndex2[bondIndex] < 0;
    boolean right2 = fragment.rightBondIndex2[bondIndex] < 0;

    PathPoint leftPoint1 = left1 ? ZERO_POINT
            : fragment.leftFactor1[bondIndex] < 0 ? fragment.a1[fragment.leftBondIndex1[bondIndex]]
                    : fragment.a2[fragment.leftBondIndex1[bondIndex]];
    PathPoint rightPoint1 = right1 ? ZERO_POINT
            : fragment.rightFactor1[bondIndex] < 0 ? fragment.a1[fragment.rightBondIndex1[bondIndex]]
                    : fragment.a2[fragment.rightBondIndex1[bondIndex]];
    PathPoint leftPoint2 = left2 ? ZERO_POINT
            : fragment.leftFactor2[bondIndex] < 0 ? fragment.a1[fragment.leftBondIndex2[bondIndex]]
                    : fragment.a2[fragment.leftBondIndex2[bondIndex]];
    PathPoint rightPoint2 = right2 ? ZERO_POINT
            : fragment.rightFactor2[bondIndex] < 0 ? fragment.a1[fragment.rightBondIndex2[bondIndex]]
                    : fragment.a2[fragment.rightBondIndex2[bondIndex]];

    float leftWidth112 = left1 ? 0f
            : !fragment.useWidth[fragment.leftBondIndex1[bondIndex]] ? 0f
                    : (fragment.leftFactor1[bondIndex] > 0 ? fragment.width1[fragment.leftBondIndex1[bondIndex]]
                            : fragment.width2[fragment.leftBondIndex1[bondIndex]]) / 2f;
    float leftWidth122 = left1 ? 0f
            : !fragment.useWidth[fragment.leftBondIndex1[bondIndex]] ? 0f
                    : (fragment.leftFactor1[bondIndex] < 0 ? fragment.width1[fragment.leftBondIndex1[bondIndex]]
                            : fragment.width2[fragment.leftBondIndex1[bondIndex]]) / 2f;
    float rightWidth112 = right1 ? 0f
            : !fragment.useWidth[fragment.rightBondIndex1[bondIndex]] ? 0f
                    : (fragment.rightFactor1[bondIndex] > 0 ? fragment.width1[fragment.rightBondIndex1[bondIndex]]
                            : fragment.width2[fragment.rightBondIndex1[bondIndex]]) / 2f;
    float rightWidth122 = right1 ? 0f
            : !fragment.useWidth[fragment.rightBondIndex1[bondIndex]] ? 0f
                    : (fragment.rightFactor1[bondIndex] < 0 ? fragment.width1[fragment.rightBondIndex1[bondIndex]]
                            : fragment.width2[fragment.rightBondIndex1[bondIndex]]) / 2f;
    float leftWidth212 = left2 ? 0f
            : !fragment.useWidth[fragment.leftBondIndex2[bondIndex]] ? 0f
                    : (fragment.leftFactor2[bondIndex] > 0 ? fragment.width1[fragment.leftBondIndex2[bondIndex]]
                            : fragment.width2[fragment.leftBondIndex2[bondIndex]]) / 2f;
    float leftWidth222 = left2 ? 0f
            : !fragment.useWidth[fragment.leftBondIndex2[bondIndex]] ? 0f
                    : (fragment.leftFactor2[bondIndex] < 0 ? fragment.width1[fragment.leftBondIndex2[bondIndex]]
                            : fragment.width2[fragment.leftBondIndex2[bondIndex]]) / 2f;
    float rightWidth212 = right2 ? 0f
            : !fragment.useWidth[fragment.rightBondIndex2[bondIndex]] ? 0f
                    : (fragment.rightFactor2[bondIndex] > 0 ? fragment.width1[fragment.rightBondIndex2[bondIndex]]
                            : fragment.width2[fragment.rightBondIndex2[bondIndex]]) / 2f;
    float rightWidth222 = right2 ? 0f
            : !fragment.useWidth[fragment.rightBondIndex2[bondIndex]] ? 0f
                    : (fragment.rightFactor2[bondIndex] < 0 ? fragment.width1[fragment.rightBondIndex2[bondIndex]]
                            : fragment.width2[fragment.rightBondIndex2[bondIndex]]) / 2f;

    PathPoint o = fragment.o[bondIndex];

    PathPoint leftO1 = left1 ? ZERO_POINT : scale(fragment.o[fragment.leftBondIndex1[bondIndex]], fragment.leftFactor1[bondIndex]);
    PathPoint rightO1 = right1 ? ZERO_POINT : scale(fragment.o[fragment.rightBondIndex1[bondIndex]], fragment.rightFactor1[bondIndex]);
    PathPoint leftO2 = left2 ? ZERO_POINT : scale(fragment.o[fragment.leftBondIndex2[bondIndex]], fragment.leftFactor2[bondIndex]);
    PathPoint rightO2 = right2 ? ZERO_POINT : scale(fragment.o[fragment.rightBondIndex2[bondIndex]], fragment.rightFactor2[bondIndex]);

    PathPoint l1 = scaleAdd(point1, o, width12);
    PathPoint r1 = scaleAdd(point1, o, -width12);
    PathPoint l2 = scaleAdd(point2, o, width22);
    PathPoint r2 = scaleAdd(point2, o, -width22);

    PathPoint bl1point1 = scaleAdd(point1, leftO1, -leftWidth112);
    PathPoint bl1point2 = scaleAdd(leftPoint1, leftO1, -leftWidth122);

    PathPoint br1point1 = scaleAdd(point1, rightO1, rightWidth112);
    PathPoint br1point2 = scaleAdd(rightPoint1, rightO1, rightWidth122);

    PathPoint bl2point1 = scaleAdd(point2, leftO2, leftWidth212);
    PathPoint bl2point2 = scaleAdd(leftPoint2, leftO2, leftWidth222);

    PathPoint br2point1 = scaleAdd(point2, rightO2, -rightWidth212);
    PathPoint br2point2 = scaleAdd(rightPoint2, rightO2, -rightWidth222);

    double intersectionLeft11 = left1 || Float.isNaN(leftWidth112) ? 0f : getIntersection(l1, l2, bl1point1, bl1point2);
    double intersectionLeft12 = left1 || Float.isNaN(leftWidth112) ? 0f : getIntersection(bl1point1, bl1point2, l1, l2);
    double intersectionRight11 = right1 || Float.isNaN(rightWidth112) ? 0f : getIntersection(r1, r2, br1point1, br1point2);
    double intersectionRight12 = right1 || Float.isNaN(rightWidth112) ? 0f : getIntersection(br1point1, br1point2, r1, r2);
    double intersectionLeft21 = left2 || Float.isNaN(rightWidth212) ? 0f : getIntersection(l1, l2, bl2point1, bl2point2);
    double intersectionLeft22 = left2 || Float.isNaN(rightWidth212) ? 0f : getIntersection(bl2point1, bl2point2, l2, l1);
    double intersectionRight21 = right2 || Float.isNaN(rightWidth212) ? 0f : getIntersection(r1, r2, br2point1, br2point2);
    double intersectionRight22 = right2 || Float.isNaN(rightWidth212) ? 0f : getIntersection(br2point1, br2point2, r2, r1);

    if (g != null) {
      g.setStroke(new BasicStroke(0.3f));
      g.setColor(Color.RED);
      g.draw(new Line2D.Float(l1.x, l1.y, r1.x, r1.y));
      g.draw(new Line2D.Float(l1.x, l1.y, l2.x, l2.y));
      if (!left1) {
        g.draw(new Line2D.Float(bl1point1.x, bl1point1.y, bl1point2.x, bl1point2.y));
      }
      if (!left2) {
        g.draw(new Line2D.Float(bl2point1.x, bl2point1.y, bl2point2.x, bl2point2.y));
      }

      g.setColor(Color.CYAN);
      g.draw(new Line2D.Float(r1.x, r1.y, r2.x, r2.y));
      if (!right1) {
        g.draw(new Line2D.Float(br1point1.x, br1point1.y, br1point2.x, br1point2.y));
      }
      if (!right2) {
        g.draw(new Line2D.Float(br2point1.x, br2point1.y, br2point2.x, br2point2.y));
      }

      g.setColor(Color.GREEN);
      g.draw(new Line2D.Float(point1.x, point1.y, point2.x, point2.y));
      if (!left1) {
        g.draw(new Line2D.Float(point1.x, point1.y, leftPoint1.x, leftPoint1.y));
      }
      if (!right1) {
        g.draw(new Line2D.Float(point1.x, point1.y, rightPoint1.x, rightPoint1.y));
      }
      if (!left2) {
        g.draw(new Line2D.Float(point2.x, point2.y, leftPoint2.x, leftPoint2.y));
      }
      if (!right2) {
        g.draw(new Line2D.Float(point2.x, point2.y, rightPoint2.x, rightPoint2.y));
      }
    }

    float atomMargin1 = fragment.atomMargin1[bondIndex];
    if (atomMargin1 == 0) {
      if (right1 || Double.isNaN(intersectionRight11) || Double.isInfinite(intersectionRight11) /*|| intersectionRight1 <= 0f*/ ||
              intersectionRight11 >= 1f || intersectionRight12 >= 1f) {
        path.moveTo(r1);
      } else {
        path.moveTo(scaleAdd(br1point1, sub(br1point2, br1point1), intersectionRight11));
      }

      if ((!left1 || !right1) && fragment.leftBondIndex1[bondIndex] != fragment.rightBondIndex1[bondIndex]) {
        path.lineTo(point1);
      }

      if (left1 || Double.isNaN(intersectionLeft11) || Double.isInfinite(intersectionLeft11) || intersectionLeft11 >= 1f ||
              intersectionLeft12 >= 1f) {
        path.lineTo(l1);
      } else {
        path.lineTo(scaleAdd(bl1point1, sub(bl1point2, bl1point1), intersectionLeft11));
      }
    } else {
      path.moveTo(r1);
      path.lineTo(l1);
    }

    float atomMargin2 = fragment.atomMargin2[bondIndex];
    if (atomMargin2 == 0) {
      if (left2 || Double.isNaN(intersectionLeft21) || Double.isInfinite(intersectionLeft21) || intersectionLeft21 >= 1f ||
              intersectionLeft22 >= 1f) {
        path.lineTo(l2);
      } else {
        path.lineTo(scaleAdd(bl2point1, sub(bl2point2, bl2point1), intersectionLeft21));
      }

      if ((!left2 || !right2) && fragment.leftBondIndex2[bondIndex] != fragment.rightBondIndex2[bondIndex]) {
        path.lineTo(point2);
      }

      if (right2 || Double.isNaN(intersectionRight21) || Double.isInfinite(intersectionRight21) || intersectionRight21 >= 1f ||
              intersectionRight22 >= 1f) {
        path.lineTo(r2);
      } else {
        path.lineTo(scaleAdd(br2point1, sub(br2point2, br2point1), intersectionRight21));
      }
    } else {
      path.lineTo(l2);
      path.lineTo(r2);
    }

    path.closePath();
  }

  /**
   * Generate path for a hash bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   */
  public static void addHashBond(Path path, BondStructure fragment, int bondIndex) {
    addHashBond(null, path, fragment, bondIndex);
  }

  public static void addHashBond(Graphics2D g, Path path, BondStructure fragment, int bondIndex) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    float atomMargin1 = fragment.atomMargin1[bondIndex];
    float atomMargin2 = fragment.atomMargin2[bondIndex];
    PathPoint point1 = fragment.a1[bondIndex];
    length -= atomMargin1 + atomMargin2;

    float width12 = fragment.width1[bondIndex] / 2f;
    float width22 = fragment.width2[bondIndex] / 2f;

    PathPoint n = fragment.n[bondIndex];
    PathPoint t = scale(fragment.o[bondIndex], width22 - width12);
    PathPoint u = scale(fragment.o[bondIndex], width12);

    // added one hash spacing width if the start or  end points are occupied
    float hashSpacing = fragment.hashSpacing[bondIndex];
    if (atomMargin1 <= 0 && (fragment.leftBondIndex1[bondIndex] >= 0 || fragment.rightBondIndex1[bondIndex] >= 0)) {
      point1 = scaleAdd(point1, n, hashSpacing);
      length -= hashSpacing;
    }
    if (atomMargin2 <= 0 && (fragment.leftBondIndex2[bondIndex] >= 0 || fragment.rightBondIndex2[bondIndex] >= 0)) {
      length -= hashSpacing;
    }

    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    // calculate a uneven count of steps based on the hash spacing
    int steps = (int) Math.floor((length - hashSpacing / 2f) / hashSpacing) * 2 + 1;
    // minimum of 5 hashes
    steps = Math.max(steps, 9);

    // recalculate hash spacing with the given steps 
    hashSpacing = length / steps;

    for (int i = 0; i <= steps; i++) {
      if (i % 2 != 0) {
        continue;
      }

      float factor1 = (float) i / steps;
      float factor2 = (float) i / steps + hashSpacing / length;

      path.moveTo(scaleAdd(point1, n, factor1 * length, t, factor1, u, 1));
      path.lineTo(scaleAdd(point1, n, factor2 * length, t, factor2, u, 1));
      path.lineTo(scaleAdd(point1, n, factor2 * length, t, -factor2, u, -1));
      path.lineTo(scaleAdd(point1, n, factor1 * length, t, -factor1, u, -1));
      path.closePath();
    }
  }

  /**
   * Generate path for a wavy bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   */
  public static void addWavyBond(Path path, BondStructure fragment, int bondIndex) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    PathPoint point1 = fragment.a1[bondIndex];
    PathPoint point2 = fragment.a2[bondIndex];

    float lineWidth = fragment.lineWidth[bondIndex];
    float width = fragment.width1[bondIndex];

    if (lineWidth > 0) {
      Path linePath = new Path();
      CurveUtils.addWavyLine(linePath, point1, point2, width);
      BasicStroke stroke = new BasicStroke(lineWidth, BasicStroke.CAP_SQUARE, BasicStroke.JOIN_BEVEL);
      path.append(stroke.createStrokedShape(linePath.toShape()), false);
    } else {
      CurveUtils.addWavyLine(path, point1, point2, width);
    }
  }

  /**
   * Generate path for a dative bond.
   * 
   * @param path Path to which the generated path should be added
   * @param fragment Fragment helper
   * @param bondIndex Index of the bond
   */
  public static void addDativeBond(Path path, BondStructure fragment, int bondIndex) {
    float length = fragment.length[bondIndex];
    if (length <= 0) {
      logger.warn("Invalid length for bond: " + length);
      return;
    }

    // reduce head size if the size is greater than the bond length
    length -= fragment.atomMargin1[bondIndex] + fragment.atomMargin2[bondIndex];
    float headSize = Math.min(Math.abs(DATIVE_BOND_HEADSIZE + fragment.width1[bondIndex]), length * ArrowUtils.HEADSIZE_REDUCTION_FACTOR);

    PathPoint point1 = fragment.a1[bondIndex];
    PathPoint point2 = fragment.a2[bondIndex];

    ArrowUtils.addArrowHead(path, point2, (float) fragment.angle[bondIndex], headSize, headSize * ArrowUtils.HEADSIZE_FACTOR,
            (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * headSize, true, false);

    point2 = scaleAdd(point2, fragment.n[bondIndex], -headSize * ArrowUtils.HEADSIZE_FACTOR);

    float width = fragment.width1[bondIndex];
    if (width > 0) {
      CurveUtils.addLine(path, point1, point2, 0f, 0f, width, 0f, false);
    } else {
      path.moveTo(point1);
      path.lineTo(point2);
    }
  }

  /**
   * Calculate the bounding boy around an atom.
   * 
   * @param node Atom
   * @param marginWidth Spacing between atom label and bonds
   * @return Bounding box
   */
  public static Rectangle2D getBoundingBox(CDAtom node, float marginWidth) {
    Rectangle2D.Float boundingsBox = new Rectangle2D.Float(node.getPosition2D().getX(), node.getPosition2D().getY(), 0f, 0f);
    if (node.getText() != null) {
      CDText text = node.getText();
      boundingsBox.add(new Rectangle2D.Float(text.getBounds().getMinX(), text.getBounds().getMinY(), text.getBounds().getWidth(),
              text.getBounds().getHeight()));
    }

    if (boundingsBox.getWidth() > 0 || boundingsBox.getHeight() > 0) {
      return new Rectangle2D.Double(boundingsBox.getMinX() - marginWidth, boundingsBox.getMinY() - marginWidth,
              boundingsBox.getWidth() + 2f * marginWidth, boundingsBox.getHeight() + 2f * marginWidth);
    }
    return boundingsBox;
  }

  public static float getWidth(CDDocument document, CDBond bond) {
    if (bond == null) {
      return 0f;
    }

    float lineWidth = bond.getSettings().getLineWidth();
    if (lineWidth == 0) {
      lineWidth = document.getSettings().getLineWidth();
    }
    if (lineWidth == 0) {
      lineWidth = 1f;
    }

    float boldWidth = bond.getSettings().getBoldWidth();
    if (boldWidth == 0) {
      boldWidth = document.getSettings().getBoldWidth();
    }
    if (boldWidth == 0) {
      boldWidth = 4f;
    }

    return (bond.getBondDisplay() == CDBondDisplay.Bold) ? boldWidth : lineWidth;
  }

  /**
   * Find intersection of the line and the atom label shape to calculate the atom margin.
   * 
   * @param shape Atom label shape
   * @param point1 Coordinate of the first point of the bond
   * @param point2 Coordinate of the second point of the bond
   * @return Value within [0,1] if an intersection exists
   */
  public static double getAtomMargin(Shape shape, PathPoint point1, PathPoint point2) {
    double margin = 0f;
    float[] coords = new float[6];
    PathPoint point = ZERO_POINT;
    PathPoint firstPoint = ZERO_POINT;
    boolean first = true;
    if (shape != null) {
      for (PathIterator i = shape.getPathIterator(null); !i.isDone(); i.next()) {
        int type = i.currentSegment(coords);
        switch (type) {
          case PathIterator.SEG_MOVETO: {
            firstPoint = point = point(coords[0], coords[1]);
            first = false;
            break;
          }
          case PathIterator.SEG_LINETO: {
            PathPoint newPoint = point(coords[0], coords[1]);
            if (!first) {
              double r = getIntersection(point, newPoint, point1, point2);
              double s = getIntersection(point1, point2, point, newPoint);
              if (!Double.isNaN(r) && !Double.isInfinite(r) && r >= 0 && r <= 1 && !Double.isNaN(s) && !Double.isInfinite(s) && s >= 0 &&
                      s <= 1) {
                margin = Math.max(margin, r);
              }
            }
            point = newPoint;
            first = false;
            break;
          }
          case PathIterator.SEG_QUADTO: {
            PathPoint newPoint = point(coords[2], coords[3]);
            if (!first) {
              double r = getIntersection(point, newPoint, point1, point2);
              double s = getIntersection(point1, point2, point, newPoint);
              if (!Double.isNaN(r) && !Double.isInfinite(r) && r >= 0 && r <= 1 && !Double.isNaN(s) && !Double.isInfinite(s) && s >= 0 &&
                      s <= 1) {
                margin = Math.max(margin, r);
              }
            }
            point = newPoint;
            first = false;
            break;
          }
          case PathIterator.SEG_CUBICTO: {
            PathPoint newPoint = point(coords[4], coords[5]);
            if (!first) {
              double r = getIntersection(point, newPoint, point1, point2);
              double s = getIntersection(point1, point2, point, newPoint);
              if (!Double.isNaN(r) && !Double.isInfinite(r) && r >= 0 && r <= 1 && !Double.isNaN(s) && !Double.isInfinite(s) && s >= 0 &&
                      s <= 1) {
                margin = Math.max(margin, r);
              }
            }
            point = newPoint;
            first = false;
            break;
          }
          case PathIterator.SEG_CLOSE: {
            PathPoint newPoint = firstPoint;
            if (!first) {
              double r = getIntersection(point, newPoint, point1, point2);
              double s = getIntersection(point1, point2, point, newPoint);
              if (!Double.isNaN(r) && !Double.isInfinite(r) && r >= 0 && r <= 1 && !Double.isNaN(s) && !Double.isInfinite(s) && s >= 0 &&
                      s <= 1) {
                margin = Math.max(margin, r);
              }
            }
            point = newPoint;
            first = true;
            break;
          }
        }
      }
    }
    return margin;
  }

  /**
   * Helper class to calculate, hold and store different intermediate properties and values.
   */
  public static class BondStructure {
    public final CDFragment fragment;

    public final int atomCount;
    public final CDAtom[] atoms;
    public final TextChar[][] characters;

    // convex hull of atoms/labels
    public final Shape[] boundingShape;

    public final int bondCount;
    public final CDBond[] bonds;

    // atom at begin of bond
    public final CDAtom[] atom1;

    // atom at end of bond
    public final CDAtom[] atom2;

    public final int[] atomIndex1;
    public final int[] atomIndex2;

    // coordinates of the start and end node
    public final PathPoint[] point1;
    public final PathPoint[] point2;

    public final float[] lineWidth;
    public final float[] boldWidth;
    public final float[] hashSpacing;
    public final float[] bondSpacing;

    // margin between bond end and edge of atom/label
    public final float[] marginWidth;

    // angle in relation to coordinate system
    public final double[] angle;

    // margin between bond end and center of atom/label
    public final float[] atomMargin1;
    public final float[] atomMargin2;

    // width of bond at begin and end
    public final float[] width1;
    public final float[] width2;
    // flag if the bond has an finite width, which can be used to calculate
    // the intersection point of neighbor bonds
    public final boolean[] useWidth;

    // vector of the bonds between the start node and end node 
    public final PathPoint[] d;
    // total length of the bond vector
    public final float[] length;
    // normal vector of the bonds
    public final PathPoint[] n;
    // othogonal vector of the bonds
    public final PathPoint[] o;

    // Properties of the left neighbor bond at the first atom:
    // Coordinate of the second node of the left neighbor bond 
    public final PathPoint[] leftPoint1;
    // Angle of the left neighbor bond
    public final double[] leftAngle1;
    // 1 if the bonds shares first atom of neighbor bond, -1 if the bonds shares the second atom
    public final int[] leftFactor1;
    // bond with at the connected side of the neighbor bond
    public final float[] leftWidth1;
    // index of the neighbor bond
    public final int[] leftBondIndex1;

    // Properties of the right neighbor bond at the first atom:
    public final PathPoint[] rightPoint1;
    public final double[] rightAngle1;
    public final int[] rightFactor1;
    public final float[] rightWidth1;
    public final int[] rightBondIndex1;

    // Properties of the left neighbor bond at the second atom:
    public final PathPoint[] leftPoint2;
    public final double[] leftAngle2;
    public final int[] leftFactor2;
    public final float[] leftWidth2;
    public final int[] leftBondIndex2;

    // Properties of the right neighbor bond at the second atom:
    public final PathPoint[] rightPoint2;
    public final double[] rightAngle2;
    public final int[] rightFactor2;
    public final float[] rightWidth2;
    public final int[] rightBondIndex2;

    // position of the double bonds (left/center/right)
    private CDBondDoublePosition[] doubleBondPosition;

    // Real start and end coordinate of the bond, which differs from
    // the coordinates of the node if the nodes have a label
    public final PathPoint[] a1;
    public final PathPoint[] a2;

    // if bond would be drawn by a thick area, these would be the
    // coordinates of the edges
    public final PathPoint[] l1;
    public final PathPoint[] r1;
    public final PathPoint[] l2;
    public final PathPoint[] r2;

    public BondStructure(CDFragment fragment) {
      this.fragment = fragment;

      atomCount = fragment.getAtoms().size();
      atoms = fragment.getAtoms().toArray(new CDAtom[atomCount]);
      characters = new TextChar[atomCount][];
      boundingShape = new Shape[atomCount];

      bondCount = fragment.getBonds().size();
      bonds = fragment.getBonds().toArray(new CDBond[bondCount]);
      atom1 = new CDAtom[bondCount];
      atom2 = new CDAtom[bondCount];
      atomIndex1 = new int[bondCount];
      atomIndex2 = new int[bondCount];
      point1 = new PathPoint[bondCount];
      point2 = new PathPoint[bondCount];
      lineWidth = new float[bondCount];
      boldWidth = new float[bondCount];
      hashSpacing = new float[bondCount];
      bondSpacing = new float[bondCount];
      marginWidth = new float[bondCount];
      angle = new double[bondCount];
      atomMargin1 = new float[bondCount];
      atomMargin2 = new float[bondCount];
      width1 = new float[bondCount];
      width2 = new float[bondCount];
      useWidth = new boolean[bondCount];
      d = new PathPoint[bondCount];
      length = new float[bondCount];
      n = new PathPoint[bondCount];
      o = new PathPoint[bondCount];
      leftPoint1 = new PathPoint[bondCount];
      leftAngle1 = new double[bondCount];
      leftFactor1 = new int[bondCount];
      leftWidth1 = new float[bondCount];
      leftBondIndex1 = new int[bondCount];
      rightPoint1 = new PathPoint[bondCount];
      rightAngle1 = new double[bondCount];
      rightFactor1 = new int[bondCount];
      rightWidth1 = new float[bondCount];
      rightBondIndex1 = new int[bondCount];
      leftPoint2 = new PathPoint[bondCount];
      leftAngle2 = new double[bondCount];
      leftFactor2 = new int[bondCount];
      leftWidth2 = new float[bondCount];
      leftBondIndex2 = new int[bondCount];
      rightPoint2 = new PathPoint[bondCount];
      rightAngle2 = new double[bondCount];
      rightFactor2 = new int[bondCount];
      rightWidth2 = new float[bondCount];
      rightBondIndex2 = new int[bondCount];
      doubleBondPosition = new CDBondDoublePosition[bondCount];

      a1 = new PathPoint[bondCount];
      a2 = new PathPoint[bondCount];

      l1 = new PathPoint[bondCount];
      r1 = new PathPoint[bondCount];
      l2 = new PathPoint[bondCount];
      r2 = new PathPoint[bondCount];
    }

    /**
     * Return the index of an atom in this fragment.
     * 
     * @param atom Atom
     * @return Index of the atom
     */
    public int indexOf(CDAtom atom) {
      for (int i = 0; i < atomCount; i++) {
        if (atoms[i] == atom) {
          return i;
        }
      }
      return -1;
    }

    /**
     * Returns the index of the bond in this fragment.
     * 
     * @param bond Bond
     * @return Index of the bond
     */
    public int indexOf(CDBond bond) {
      for (int i = 0; i < bondCount; i++) {
        if (bonds[i] == bond) {
          return i;
        }
      }
      return -1;
    }

    /**
     * Calculate the attachment point of the bonds, for example if the bond is attached to a given
     * character of an atom label.
     */
    public void calculateAttachmentPoints() {
      for (int i = 0; i < bondCount; i++) {
        atom1[i] = bonds[i].getBegin();
        atom2[i] = bonds[i].getEnd();
        atomIndex1[i] = indexOf(atom1[i]);
        atomIndex2[i] = indexOf(atom2[i]);

        point1[i] = point(atom1[i].getPosition2D().getX(), atom1[i].getPosition2D().getY());
        point2[i] = point(atom2[i].getPosition2D().getX(), atom2[i].getPosition2D().getY());

        if (bonds[i].getBeginAttach() >= 0) {
          TextChar[] characters1 = characters[atomIndex1[i]];
          if (characters1 != null) {
            int attach = bonds[i].getBeginAttach();
            // inverse sequence for right alignment
            if (atom1[i].getText() != null && atom1[i].getText().getSettings().getLabelJustification() == CDJustification.Right &&
                    atom1[i].getLabelDisplay() != CDLabelDisplay.Right) {
              attach = characters1.length - attach - 1;
            }

            Rectangle2D charactersBounds = characters1[attach].bounds;
            point1[i] = point((float) charactersBounds.getCenterX(), (float) charactersBounds.getCenterY());
          } else {
            logger.warn("Could not get attachment point of text character");
          }
        }

        if (bonds[i].getEndAttach() >= 0) {
          TextChar[] characters2 = characters[atomIndex2[i]];
          if (characters2 != null) {
            int attach = bonds[i].getEndAttach();
            // inverse sequence for right alignment
            if (atom2[i].getText() != null && atom2[i].getText().getSettings().getLabelJustification() == CDJustification.Right &&
                    atom2[i].getLabelDisplay() != CDLabelDisplay.Right) {
              attach = characters2.length - attach - 1;
            }

            Rectangle2D charactersBounds = characters2[attach].bounds;
            point2[i] = point((float) charactersBounds.getCenterX(), (float) charactersBounds.getCenterY());
          } else {
            logger.warn("Could not get attachment point of text character");
          }
        }
      }
    }

    /**
     * Calculate the different bond parameters like the bond length, bond vector or the orthogonal
     * bond vector.
     */
    public void calculateParameters() {
      for (int i = 0; i < bondCount; i++) {
        d[i] = sub(point2[i], point1[i]);
        length[i] = length(d[i]);

        if (length[i] <= 0) {
          angle[i] = 0;
          n[i] = ZERO_POINT;
          o[i] = ZERO_POINT;
          continue;
        }

        angle[i] = discriminateAngle(angle(d[i]));
        n[i] = normalize(d[i]);
        o[i] = orthogonal(n[i]);
      }
    }

    /**
     * Retrieve the bond properties like line width bond spacing etc. and store them.
     * 
     * @param document ChemDraw document
     */
    public void retrieveProperties(CDDocument document) {
      for (int i = 0; i < bondCount; i++) {
        CDBond bond = bonds[i];

        lineWidth[i] = bond.getSettings().getLineWidth();
        if (lineWidth[i] == 0) {
          lineWidth[i] = document.getSettings().getLineWidth();
        }
        if (lineWidth[i] == 0) {
          lineWidth[i] = 1f;
        }

        boldWidth[i] = bond.getSettings().getBoldWidth();
        if (boldWidth[i] == 0) {
          boldWidth[i] = document.getSettings().getBoldWidth();
        }
        if (boldWidth[i] == 0) {
          boldWidth[i] = 4f;
        }

        hashSpacing[i] = bond.getSettings().getHashSpacing();
        if (hashSpacing[i] == 0) {
          hashSpacing[i] = document.getSettings().getHashSpacing();
        }
        if (hashSpacing[i] == 0) {
          hashSpacing[i] = 2.9f;
        }

        bondSpacing[i] = bond.getSettings().getBondSpacing();
        if (bondSpacing[i] == 0) {
          bondSpacing[i] = document.getSettings().getBondSpacing();
        }
        if (bondSpacing[i] == 0) {
          bondSpacing[i] = 4f;
        }
        bondSpacing[i] = length[i] * bondSpacing[i] / 100.0f;
        // set minimum for bond spacing to twice of the line width
        bondSpacing[i] = Math.max(bondSpacing[i], lineWidth[i] * 2f);
        if (bond.getSettings().getBondSpacingAbs() != 0) {
          bondSpacing[i] = bond.getSettings().getBondSpacingAbs();
        }
        bondSpacing[i] = Math.abs(bondSpacing[i]);

        marginWidth[i] = bond.getSettings().getMarginWidth();
        if (marginWidth[i] == 0) {
          marginWidth[i] = document.getSettings().getMarginWidth();
        }
        if (marginWidth[i] == 0) {
          marginWidth[i] = lineWidth[i] * 8f;
        }

        if (bond.getBondOrder() == CDBondOrder.Single || bond.getBondOrder() == CDBondOrder.OneHalf) {
          if (bond.getBondDisplay() == CDBondDisplay.Dash) {
            width1[i] = width2[i] = lineWidth[i];
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.Hash) {
            width1[i] = width2[i] = boldWidth[i];
            useWidth[i] = false;
          } else if (bond.getBondDisplay() == CDBondDisplay.WedgedHashBegin) {
            width1[i] = lineWidth[i];
            width2[i] = boldWidth[i] * WEDGE_WIDTH_FACTOR;
            useWidth[i] = false;
          } else if (bond.getBondDisplay() == CDBondDisplay.WedgedHashEnd) {
            width1[i] = boldWidth[i] * WEDGE_WIDTH_FACTOR;
            width2[i] = lineWidth[i];
            useWidth[i] = false;
          } else if (bond.getBondDisplay() == CDBondDisplay.WedgeBegin) {
            width1[i] = lineWidth[i];
            width2[i] = boldWidth[i] * WEDGE_WIDTH_FACTOR;
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.WedgeEnd) {
            width1[i] = boldWidth[i] * WEDGE_WIDTH_FACTOR;
            width2[i] = lineWidth[i];
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.HollowWedgeBegin) {
            width1[i] = lineWidth[i];
            width2[i] = boldWidth[i] * WEDGE_WIDTH_FACTOR;
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.HollowWedgeEnd) {
            width1[i] = boldWidth[i] * WEDGE_WIDTH_FACTOR;
            width2[i] = lineWidth[i];
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.Bold) {
            width1[i] = width2[i] = boldWidth[i];
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.Wavy) {
            width1[i] = width2[i] = boldWidth[i];
            useWidth[i] = false;
          } else {
            width1[i] = width2[i] = lineWidth[i];
            useWidth[i] = true;
          }
        } else if (bond.getBondOrder() == CDBondOrder.Double || bond.getBondOrder() == CDBondOrder.TwoHalf) {
          if (bond.getBondDisplay() == CDBondDisplay.Wavy) {
            width1[i] = width2[i] = boldWidth[i];
            useWidth[i] = true;
          } else if (bond.getBondDisplay() == CDBondDisplay.Bold) {
            width1[i] = width2[i] = boldWidth[i];
            useWidth[i] = true;
          } else {
            width1[i] = width2[i] = lineWidth[i];
            useWidth[i] = true;
          }
        } else if (bond.getBondOrder() == CDBondOrder.Triple) {
          width1[i] = width2[i] = lineWidth[i];
          useWidth[i] = true;
        } else if (bond.getBondOrder() == CDBondOrder.Quadruple) {
          width1[i] = width2[i] = lineWidth[i];
          useWidth[i] = false;
        } else if (bond.getBondOrder() == CDBondOrder.Dative) {
          width1[i] = width2[i] = lineWidth[i];
        } else {
          width1[i] = width2[i] = lineWidth[i];
          useWidth[i] = false;
        }
      }
    }

    /**
     * Calculate the atom margins if a atom label is given. The atom margin is the spacing between
     * atom label and bond.
     */
    public void calculateMargins() {
      for (int i = 0; i < bondCount; i++) {
        Stroke nodeOutlineStroke = new BasicStroke(marginWidth[i] * 2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
        double atomMargin1 = 0f;
        if (boundingShape[atomIndex1[i]] != null) {
          atomMargin1 = getAtomMargin(nodeOutlineStroke.createStrokedShape(boundingShape[atomIndex1[i]]), point1[i], point2[i]);
        } else {
          logger.warn("Could not get bounding shape of node");
          Rectangle2D boundingBox1 = getBoundingBox(atom1[i], marginWidth[i]);
          if (d[i].x > 0) {
            if (d[i].y > 0) {
              atomMargin1 =
                      (float) Math.min((boundingBox1.getMaxX() - point1[i].x) / d[i].x, (boundingBox1.getMaxY() - point1[i].y) / d[i].y);
            } else if (d[i].y < 0) {
              atomMargin1 =
                      (float) Math.min((boundingBox1.getMaxX() - point1[i].x) / d[i].x, (boundingBox1.getMinY() - point1[i].y) / d[i].y);
            } else {
              atomMargin1 = (float) ((boundingBox1.getMaxX() - point1[i].x) / d[i].x);
            }
          } else if (d[i].x < 0) {
            if (d[i].y > 0) {
              atomMargin1 =
                      (float) Math.min((boundingBox1.getMinX() - point1[i].x) / d[i].x, (boundingBox1.getMaxY() - point1[i].y) / d[i].y);
            } else if (d[i].y < 0) {
              atomMargin1 =
                      (float) Math.min((boundingBox1.getMinX() - point1[i].x) / d[i].x, (boundingBox1.getMinY() - point1[i].y) / d[i].y);
            } else {
              atomMargin1 = (float) ((boundingBox1.getMinX() - point1[i].x) / d[i].x);
            }
          } else {
            if (d[i].y > 0) {
              atomMargin1 = (float) ((boundingBox1.getMaxY() - point1[i].y) / d[i].y);
            } else if (d[i].y < 0) {
              atomMargin1 = (float) ((boundingBox1.getMinY() - point1[i].y) / d[i].y);
            }
          }
        }
        this.atomMargin1[i] = (float) (atomMargin1 * length[i]);
        a1[i] = scaleAdd(point1[i], n[i], this.atomMargin1[i]);

        double atomMargin2 = 0f;
        if (boundingShape[atomIndex2[i]] != null) {
          atomMargin2 = getAtomMargin(nodeOutlineStroke.createStrokedShape(boundingShape[atomIndex2[i]]), point2[i], point1[i]);
        } else {
          logger.warn("Could not get bounding shape of node");
          Rectangle2D boundingBox2 = BondUtils.getBoundingBox(atom2[i], marginWidth[i]);
          if (d[i].x > 0) {
            if (d[i].y > 0) {
              atomMargin2 =
                      (float) Math.min((point2[i].x - boundingBox2.getMinX()) / d[i].x, (point2[i].y - boundingBox2.getMinY()) / d[i].y);
            } else if (d[i].y < 0) {
              atomMargin2 =
                      (float) Math.min((point2[i].x - boundingBox2.getMinX()) / d[i].x, (point2[i].y - boundingBox2.getMaxY()) / d[i].y);
            } else {
              atomMargin2 = (float) ((point2[i].x - boundingBox2.getMinX()) / d[i].x);
            }
          } else if (d[i].x < 0) {
            if (d[i].y > 0) {
              atomMargin2 =
                      (float) Math.min((point2[i].x - boundingBox2.getMaxX()) / d[i].y, (point2[i].y - boundingBox2.getMinY()) / d[i].y);
            } else if (d[i].y < 0) {
              atomMargin2 =
                      (float) Math.min((point2[i].x - boundingBox2.getMaxX()) / d[i].x, (point2[i].y - boundingBox2.getMaxY()) / d[i].y);
            } else {
              atomMargin2 = (float) ((point2[i].x - boundingBox2.getMaxX()) / d[i].x);
            }
          } else {
            if (d[i].y > 0) {
              atomMargin2 = (float) ((point2[i].y - boundingBox2.getMinY()) / d[i].y);
            } else if (d[i].y < 0) {
              atomMargin2 = (float) ((point2[i].y - boundingBox2.getMaxY()) / d[i].y);
            }
          }
        }
        this.atomMargin2[i] = (float) (atomMargin2 * length[i]);
        a2[i] = scaleAdd(point2[i], n[i], -this.atomMargin2[i]);
      }
    }

    /**
     * Find next neighbors of bonds and calculate their angles to each other.
     */
    public void calculateNeibours() {
      for (int i = 0; i < bondCount; i++) {
        findNextBond(i, true, true, false);
        findNextBond(i, true, false, false);
        findNextBond(i, false, true, false);
        findNextBond(i, false, false, false);
      }
    }

    /**
     * Calculate position of the double bonds.
     */
    public void calculateDoubleBondPosition() {
      float limit = (float) (Math.PI - ANGLE_SIGMA);
      for (int i = 0; i < bondCount; i++) {
        CDBond bond = bonds[i];
        doubleBondPosition[i] = bond.getBondDoublePosition();
        boolean left1 = !Double.isNaN(leftAngle1[i]) && leftAngle1[i] < limit;
        boolean right1 = !Double.isNaN(rightAngle1[i]) && rightAngle1[i] < limit;
        boolean left2 = !Double.isNaN(leftAngle2[i]) && leftAngle2[i] < limit;
        boolean right2 = !Double.isNaN(rightAngle2[i]) && rightAngle2[i] < limit;

        switch (doubleBondPosition[i]) {
          case AutoCenter:
          case AutoLeft:
          case AutoRight:
            if (left1 && !right1) {
              doubleBondPosition[i] = CDBondDoublePosition.AutoRight;
              break;
            }
            if (!left1 && right1) {
              doubleBondPosition[i] = CDBondDoublePosition.AutoLeft;
              break;
            }
            if (left2 && !right2) {
              doubleBondPosition[i] = CDBondDoublePosition.AutoRight;
              break;
            }
            if (!left2 && right2) {
              doubleBondPosition[i] = CDBondDoublePosition.AutoLeft;
              break;
            }
            if (!left1 && !right1 && bond.getBondDisplay() != CDBondDisplay.Bold) {
              doubleBondPosition[i] = CDBondDoublePosition.AutoCenter;
              break;
            }
            if (!left2 && !right2 && bond.getBondDisplay() != CDBondDisplay.Bold) {
              doubleBondPosition[i] = CDBondDoublePosition.AutoCenter;
              break;
            }
            break;
          default:
        }

        // check for ketenes to modify the double bond position
        for (int j = 0; j < bondCount; j++) {
          if (i != j && (atomIndex1[i] == atomIndex1[j] || atomIndex2[i] == atomIndex2[j] || atomIndex1[i] == atomIndex2[j]) &&
                  bonds[j].getBondOrder() == CDBondOrder.Double) {
            double diff = Math.abs(diffAngle(angle[i], angle[j]));
            // if diametral
            if (diff <= ANGLE_SIGMA || diff >= Math.PI - ANGLE_SIGMA) {
              logger.debug("Found ketene, so made double position center");
              doubleBondPosition[i] = CDBondDoublePosition.UserCenter;
            }
          }
        }

        if (bonds[i].getBondOrder() == CDBondOrder.Double &&
                (doubleBondPosition[i] == CDBondDoublePosition.AutoCenter || doubleBondPosition[i] == CDBondDoublePosition.UserCenter)) {
          useWidth[i] = false;
        }
      }
    }

    /**
     * Update list of neighbor bonds ignoring some bonds like centered double bonds or hash bonds.
     */
    public void updateNeibours() {
      for (int i = 0; i < bondCount; i++) {
        findNextBond(i, true, true, true);
        findNextBond(i, true, false, true);
        findNextBond(i, false, true, true);
        findNextBond(i, false, false, true);
      }
    }

    /**
     * Returns the atom of the bond, which is next to a specific bond.
     * 
     * @param bondIndex Index of the bond
     * @param firstAtom True, if the center atom is the first atom of the bond
     * @param left True, if the atom should come from the next left bond, otherwise to the next
     *          right bond
     * @param ignoreBonds True, if some special bonds should be ignore like centered double bonds or
     *          hash bonds
     */
    public void findNextBond(int bondIndex, boolean firstAtom, boolean left, boolean ignoreBonds) {
      int centerAtomIndex = firstAtom ? atomIndex1[bondIndex] : atomIndex2[bondIndex];

      double angle = firstAtom ? this.angle[bondIndex] : this.angle[bondIndex] + Math.PI;
      angle = discriminateAngle(angle);

      double minAngle = 2.0 * Math.PI;
      if (left) {
        if (firstAtom) {
          rightAngle1[bondIndex] = Float.NaN;
          rightBondIndex1[bondIndex] = -1;
        } else {
          leftAngle2[bondIndex] = Float.NaN;
          leftBondIndex2[bondIndex] = -1;
        }
      } else {
        if (firstAtom) {
          leftAngle1[bondIndex] = Float.NaN;
          leftBondIndex1[bondIndex] = -1;
        } else {
          rightAngle2[bondIndex] = Float.NaN;
          rightBondIndex2[bondIndex] = -1;
        }
      }
      for (int bondIndex2 = 0; bondIndex2 < bondCount; bondIndex2++) {
        if (bondIndex != bondIndex2 && (atomIndex1[bondIndex2] == centerAtomIndex || atomIndex2[bondIndex2] == centerAtomIndex)) {
          if (ignoreBonds && useWidth[bondIndex] && !useWidth[bondIndex2]) {
            continue;
          }

          boolean reverseBond2 = atomIndex2[bondIndex2] == centerAtomIndex;

          double angle2 = reverseBond2 ? this.angle[bondIndex2] + Math.PI : this.angle[bondIndex2];
          angle2 = discriminateAngle(angle2);

          double diff = diffAngle(angle, angle2);
          diff = (left ? +1 : -1) * diff;

          if (diff < 0) {
            diff = 2 * Math.PI + diff;
          }

          if (diff > 0 && diff < minAngle) {
            minAngle = diff;

            if (left) {
              if (firstAtom) {
                rightPoint1[bondIndex] = reverseBond2 ? point1[bondIndex2] : point2[bondIndex2];
                rightAngle1[bondIndex] = minAngle;
                rightWidth1[bondIndex] = reverseBond2 ? width2[bondIndex2] : width1[bondIndex2];
                rightFactor1[bondIndex] = reverseBond2 ? -1 : 1;
                rightBondIndex1[bondIndex] = bondIndex2;
              } else {
                leftPoint2[bondIndex] = reverseBond2 ? point1[bondIndex2] : point2[bondIndex2];
                leftAngle2[bondIndex] = minAngle;
                leftWidth2[bondIndex] = reverseBond2 ? width2[bondIndex2] : width1[bondIndex2];
                leftFactor2[bondIndex] = reverseBond2 ? -1 : 1;
                leftBondIndex2[bondIndex] = bondIndex2;
              }
            } else {
              if (firstAtom) {
                leftPoint1[bondIndex] = reverseBond2 ? point1[bondIndex2] : point2[bondIndex2];
                leftAngle1[bondIndex] = minAngle;
                leftWidth1[bondIndex] = reverseBond2 ? width2[bondIndex2] : width1[bondIndex2];
                leftFactor1[bondIndex] = reverseBond2 ? -1 : 1;
                leftBondIndex1[bondIndex] = bondIndex2;
              } else {
                rightPoint2[bondIndex] = reverseBond2 ? point1[bondIndex2] : point2[bondIndex2];
                rightAngle2[bondIndex] = minAngle;
                rightWidth2[bondIndex] = reverseBond2 ? width2[bondIndex2] : width1[bondIndex2];
                rightFactor2[bondIndex] = reverseBond2 ? -1 : 1;
                rightBondIndex2[bondIndex] = bondIndex2;
              }
            }
          }
        }
      }
    }

    public void calculateOuterBounds() {
      for (int i = 0; i < bondCount; i++) {
        float width12 = width1[i] / 2f;
        float width22 = width2[i] / 2f;

        l1[i] = scaleAdd(a1[i], o[i], width12);
        r1[i] = scaleAdd(a1[i], o[i], -width12);
        l2[i] = scaleAdd(a2[i], o[i], width22);
        r2[i] = scaleAdd(a2[i], o[i], -width22);
      }
    }
  }
}
