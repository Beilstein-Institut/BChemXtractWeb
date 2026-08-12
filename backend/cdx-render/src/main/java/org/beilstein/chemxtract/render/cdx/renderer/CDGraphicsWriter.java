package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.render.IOUtils;
import org.beilstein.chemxtract.cdx.*;
import org.beilstein.chemxtract.cdx.datatypes.*;
import org.beilstein.chemxtract.cdx.datatypes.CDStyledString.CDXChunk;
import org.beilstein.chemxtract.render.cdx.renderer.BondUtils.BondStructure;
import org.beilstein.chemxtract.render.graphic.*;
import org.beilstein.chemxtract.render.pdf.PDFFontUtils;

import java.awt.*;
import java.awt.font.FontRenderContext;
import java.awt.font.GlyphVector;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.text.AttributedString;
import java.util.List;
import java.util.*;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.angle;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.length;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.normalize;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.scale;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.sub;
import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;
import static org.beilstein.chemxtract.render.cdx.renderer.Transform3DUtils.normalize;
import static org.beilstein.chemxtract.render.cdx.renderer.Transform3DUtils.sub;
import static org.beilstein.chemxtract.render.cdx.renderer.Transform3DUtils.*;

/**
 * Renderer for ChemDraw files. This class renders the content of a {@link CDDocument} to a
 * {@link Graphics2D} instance.
 *
 * @author stephan
 * @version $Id: CDGraphicsWriter.java,v 1.25 2014-06-12 11:32:59 bsnie Exp $
 */
public class CDGraphicsWriter {
  private static final String PICTURE_TYPE_NOT_SUPPORTED = "Not supported";

  private static final Log logger = LogFactory.getLog(CDGraphicsWriter.class);

  private CDDocument document;

  private final Color shadowColor = Color.BLACK;
  private final float shadowOffset = 3.5f;
  private final float cornerWidth = 5f;

  private final Color TRANSPARENT_WHITE = new Color(1f, 1f, 1f, 0f);

  // List of known abbreviations
  private static String[] nicknames = null;

  static {
    try {
      nicknames = IOUtils.getTextLines(IOUtils.readText(CDGraphicsWriter.class.getResourceAsStream("nicknames.txt")));
    } catch (IOException e) {
      logger.error("Could not read nicknames", e);
    }
  }

  private Java2DFigure rootFigure;

  private Graphics2D g;

  /**
   * Map between ChemDraw object and the corresponding graphical figure
   */
  private final Map<Object,Java2DFigure> figures = new HashMap<>();

  /**
   * Helping classes for fragments, which stores intermediate geometry values
   */
  private BondStructure[] fragmentHelpers;

  /**
   * List of ChemDraw objects, which should be highlighted
   */
  private List<?> selectedObjects = null;

  public CDGraphicsWriter(CDDocument document, Graphics2D g) {
    this.document = document;
    this.g = g;
  }

  /**
   * Render a ChemDraw document to a {@link Graphics2D} instance.
   *
   * @param document ChemDraw document
   * @param g        {@link Graphics2D} instance
   */
  public static void writeDocument(CDDocument document, Graphics2D g) {
    CDGraphicsWriter writer = new CDGraphicsWriter(document, g);
    writer.writeDocument(g);
  }

  /**
   * Render a ChemDraw document to a {@link Graphics2D} instance.
   *
   * @param document        ChemDraw document
   * @param selectedObjects List objects, which should be highlighted
   * @param g               {@link Graphics2D} instance
   * @return Bounding box around the selected objects
   */
  public static Rectangle2D writeDocument(CDDocument document, List<?> selectedObjects, Graphics2D g) {
    CDGraphicsWriter writer = new CDGraphicsWriter(document, g);
    writer.setSelectedObjects(selectedObjects);
    return writer.writeDocument(g);
  }

  /**
   * Return the list of selected objects.
   *
   * @return List of selected objects
   */
  public List<?> getSelectedObjects() {
    return selectedObjects;
  }

  /**
   * Sets the list of selected objects
   *
   * @param selectedObjects List of selected objects
   */
  public void setSelectedObjects(List<?> selectedObjects) {
    this.selectedObjects = selectedObjects;
  }

  /**
   * Render ChemDraw document in a graphical context
   *
   * @param g Graphical context
   * @return Bounds of the selection shape
   */
  private Rectangle2D writeDocument(Graphics2D g) {
    logger.debug("write document");

    Java2DFigure figure = new Java2DFigure();
    figures.put(document, figure);
    figure.setModel(document);
    figure.setPaint(ConverterUtils.convertColor(document.getSettings().getColor()));
    figure.setStroke(ConverterUtils.convertStroke(document.getSettings().getLineWidth()));

    rootFigure = figure;

    // preliminary calculations and generations of Java2DFigures
    writeFragments();

    // main traversal of object tree
    for (CDPage page : document.getPages()) {
      rootFigure.addFigure(writePage(page));
    }

    // currently not used
    if (document.getTemplateGrid() != null) {
      writeTemplateGrid(document.getTemplateGrid());
    }

    Rectangle2D selectionBounds = null;
    if (selectedObjects != null) {
      //selectionBounds = paintSelectionShapes(selectedObjects, figure, new Color(0x86abd9), new Color(0x6E8DB3));
      selectionBounds = paintSelectionShapes(selectedObjects, figure);
      selectionBounds = g.getTransform().createTransformedShape(selectionBounds).getBounds2D();
    }

    figure.setStroke(g.getStroke());
    figure.setFont(g.getFont());
    figure.setComposite(g.getComposite());
    figure.setClip(g.getClip());
    figure.setPaint(g.getPaint());
    figure.setTransform(g.getTransform());

    // first collect all graphical presentations in a flat structure
    List<Java2DFigure> figures = new ArrayList<>();
    collectFigures(figures, figure, figure.clone());
    // sort the graphical presentations by the z-order
    sortFiguresByZOrder(figures);
    // and paint the presentations
    paintFigures(figures);

    return selectionBounds;
  }

  /**
   * Collect all figure of the figure hierarchy in a flat structure.
   *
   * @param figures  Flat list of all figures
   * @param original One figure of the hierarchy
   * @param figure   Figure with the inherited properties of all descending figures
   */
  private void collectFigures(List<Java2DFigure> figures, Java2DFigure original, Java2DFigure figure) {
    int zOrder = figure.getZOrder();
    Font font = figure.getFont();
    Stroke stroke = figure.getStroke();
    Paint paint = figure.getPaint();
    Shape clip = figure.getClip();
    AffineTransform transform = figure.getTransform();
    Object model = figure.getModel();

    for (Java2DFigure child : original.getChildren()) {
      if (!figures.contains(child)) {
        Java2DFigure clone = child.clone();
        if (clone.getZOrder() == 0) {
          clone.setZOrder(zOrder);
        }
        if (clone.getFont() == null) {
          clone.setFont(font);
        }
        if (clone.getStroke() == null) {
          clone.setStroke(stroke);
        }
        if (clone.getPaint() == null) {
          clone.setPaint(paint);
        }
        if (clone.getClip() == null) {
          clone.setClip(clip);
        }
        if (clone.getTransform() == null) {
          clone.setTransform(transform);
        } else {
          AffineTransform transform2 = new AffineTransform(transform);
          transform2.concatenate(clone.getTransform());
          clone.setTransform(transform2);
        }
        if (clone.getModel() == null) {
          clone.setModel(model);
        }

        // don't add figures, which have nothing to paint
        if (clone.getClass() != Java2DFigure.class) {
          figures.add(clone);
        }
        collectFigures(figures, child, clone);
      }
    }
  }

  /**
   * Sort a list of figures by their z-order
   *
   * @param figures List of figures
   */
  private void sortFiguresByZOrder(List<Java2DFigure> figures) {
    Collections.sort(figures, new Comparator<Java2DFigure>() {
      @Override
      public int compare(Java2DFigure figure1, Java2DFigure figure2) {
        return figure1.getZOrder() - figure2.getZOrder();
      }
    });
  }

  /**
   * Paint a list of figure in the current graphic context
   *
   * @param figures List fo figures
   */
  private void paintFigures(List<Java2DFigure> figures) {
    for (Java2DFigure figure : figures) {
      if (figure.getStroke() != null && !figure.getStroke().equals(g.getStroke())) {
        g.setStroke(figure.getStroke());
      }

      if (figure.getPaint() != null && !figure.getPaint().equals(g.getPaint())) {
        g.setPaint(figure.getPaint());
      }

      if (figure.getFont() != null && !figure.getFont().equals(g.getFont())) {
        g.setFont(figure.getFont());
      }

      if (figure.getTransform() != null && !figure.getTransform().equals(g.getTransform())) {
        g.setTransform(figure.getTransform());
      }

      if (figure.getClip() != null && !figure.getClip().equals(g.getClip())) {
        g.setClip(figure.getClip());
      }

      if (figure.getComposite() != null && !figure.getComposite().equals(g.getComposite())) {
        g.setComposite(figure.getComposite());
      }

      figure.paintFigure(g);
    }
  }

  /**
   * Generate a graphical presentation of all fragments.
   */
  private void writeFragments() {
    // generate a list of all fragments
    Stack<CDObject> objects = new Stack<>();
    List<CDFragment> fragments = new ArrayList<>();
    objects.addAll(document.getPages());
    // breadth-first search
    while (!objects.isEmpty()) {
      CDObject object = objects.pop();
      if (object instanceof CDPage) {
        CDPage page = (CDPage) object;
        objects.addAll(page.getBracketedGroups());
        objects.addAll(page.getFragments());
        objects.addAll(page.getGroups());
        objects.addAll(page.getNamedAlternativeGroups());
      } else if (object instanceof CDGroup) {
        CDGroup group = (CDGroup) object;
        objects.addAll(group.getFragments());
        objects.addAll(group.getGroups());
        objects.addAll(group.getNamedAlternativeGroups());
      } else if (object instanceof CDAltGroup) {
        CDAltGroup altgroup = (CDAltGroup) object;
        objects.addAll(altgroup.getFragments());
        objects.addAll(altgroup.getGroups());
      } else if (object instanceof CDFragment) {
        CDFragment fragment = (CDFragment) object;
        fragments.add(fragment);
      }
    }

    // generate helping class for the geometry calculations for each fragment
    fragmentHelpers = new BondStructure[fragments.size()];

    // generate figures of atoms, graphics, spline, object tag, text, arrows that are associated to fragment
    for (int i = 0; i < fragmentHelpers.length; i++) {
      CDFragment fragment = fragments.get(i);
      fragmentHelpers[i] = new BondStructure(fragments.get(i));

      Java2DFigure figure = new Java2DFigure();
      figure.setModel(fragment);
      figures.put(fragment, figure);

      for (CDAtom atom : fragment.getAtoms()) {
        Java2DFigure atomFigure = writeAtom(atom);
        figure.addFigure(atomFigure);
        if (atomFigure != null) {
          fragmentHelpers[i].boundingShape[fragmentHelpers[i].indexOf(atom)] = atomFigure.getShape();
        }
      }
      for (CDGraphic graphic : fragment.getGraphics()) {
        figure.addFigure(writeGraphic(graphic));
      }
      for (CDSpline curve : fragment.getCurves()) {
        figure.addFigure(writeSpline(curve));
      }
      for (CDObjectTag objectTag : fragment.getObjectTags()) {
        figure.addFigure(writeObjectTag(objectTag));
      }
      for (CDText text : fragment.getTexts()) {
        figure.addFigure(writeText(text, null));
      }
      for (CDArrow arrow : fragment.getArrows()) {
        figure.addFigure(writeArrow(arrow));
      }
      for (CDColoredMolecularArea area : fragment.getColoredMolecularAreas()) {
        figure.addFigure(writeColoredMolecularArea(area));
      }

      fragmentHelpers[i].calculateAttachmentPoints();
      fragmentHelpers[i].calculateParameters();
      fragmentHelpers[i].retrieveProperties(document);
      fragmentHelpers[i].calculateMargins();
      fragmentHelpers[i].calculateNeibours();
      fragmentHelpers[i].calculateDoubleBondPosition();
      fragmentHelpers[i].updateNeibours();
    }

    // generate figures of bonds associated to fragment
    for (int i = 0; i < fragmentHelpers.length; i++) {
      CDFragment fragment = fragmentHelpers[i].fragment;
      Java2DFigure figure = figures.get(fragment);

      for (CDBond bond : fragment.getBonds()) {
        figure.addFigure(writeBond(bond));
      }
    }
  }

  private int getFragmentIndex(CDAtom atom) {
    for (int fragmentIndex = 0; fragmentIndex < fragmentHelpers.length; fragmentIndex++) {
      if (fragmentHelpers[fragmentIndex].indexOf(atom) >= 0) {
        return fragmentIndex;
      }
    }
    return -1;
  }

  private int getFragmentIndex(CDBond bond) {
    for (int fragmentIndex = 0; fragmentIndex < fragmentHelpers.length; fragmentIndex++) {
      if (fragmentHelpers[fragmentIndex].indexOf(bond) >= 0) {
        return fragmentIndex;
      }
    }
    return -1;
  }

  /**
   * Generate a graphical presentation of a ChemDraw page.
   * Here all objects that are not contained in fragments are handled.
   *
   * @param page ChemDraw page
   * @return Graphical figure
   */
  private Java2DFigure writePage(CDPage page) {
    logger.debug("write page");

    Java2DFigure figure = new Java2DFigure();
    for (CDGroup group : page.getGroups()) {
      figure.addFigure(writeGroup(group));
    }
    for (CDFragment fragment : page.getFragments()) {
      figure.addFigure(writeFragment(fragment));
    }
    for (CDText text : page.getTexts()) {
      figure.addFigure(writeText(text, null));
    }
    for (CDGraphic graphic : page.getGraphics()) {
      figure.addFigure(writeGraphic(graphic));
    }
    for (CDBracket bracketedGroup : page.getBracketedGroups()) {
      figure.addFigure(writeBracketedGroup(bracketedGroup));
    }
    for (CDSpline curve : page.getCurves()) {
      figure.addFigure(writeSpline(curve));
    }
    for (CDPicture embeddedObject : page.getEmbeddedObjects()) {
      figure.addFigure(writePicture(embeddedObject));
    }
    for (CDTable table : page.getTables()) {
      figure.addFigure(writeTable(table));
    }
    for (CDAltGroup namedAlternativeGroup : page.getNamedAlternativeGroups()) {
      figure.addFigure(writeNamedAlternativeGroup(namedAlternativeGroup));
    }
    for (CDReactionScheme reactionScheme : page.getReactionSchemes()) {
      figure.addFigure(writeReactionScheme(reactionScheme));
    }
    for (CDReactionStep reactionStep : page.getReactionSteps()) {
      figure.addFigure(writeReactionStep(reactionStep));
    }
    for (CDSpectrum spectrum : page.getSpectra()) {
      figure.addFigure(writeSpectrum(spectrum));
    }
    for (CDTLCPlate tlcPlate : page.getTLCPlates()) {
      figure.addFigure(writeTLCPlate(tlcPlate));
    }
    for (CDArrow arrow : page.getArrows()) {
      figure.addFigure(writeArrow(arrow));
    }
    return figure;
  }

  private Java2DFigure writeFragment(CDFragment fragment) {
    return figures.get(fragment);
  }

  /**
   * Generate a graphical presentation of a ChemDraw atom.
   *
   * @param atom ChemDraw atom
   * @return Graphical figure
   */
  private Java2DFigure writeAtom(CDAtom atom) {
    if (figures.get(atom) != null) {
      logger.debug("Atom figure is already generated");
      return figures.get(atom);
    }
    Java2DFigure figure = new Java2DFigure();
    figures.put(atom, figure);
    figure.setModel(atom);

    if (atom.getText() != null) {
      figure.addFigure(writeText(atom.getText(), atom));
    }
    for (CDObjectTag objectTag : atom.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    // store point in an own structure
    PathPoint point = point(atom.getPosition2D().getX(), atom.getPosition2D().getY());

    if (logger.isDebugEnabled()) {
      g.setColor(Color.ORANGE);
      g.fill(new Ellipse2D.Float(point.x - 1, point.y - 1, 2, 2));
    }

    Color color = Color.BLACK;
    if (atom.getColor() != null) {
      color = ConverterUtils.convertColor(atom.getColor());
      figure.setPaint(color);
    }

    float lineWidth = atom.getSettings().getLineWidth();
    if (lineWidth == 0) {
      lineWidth = document.getSettings().getLineWidth();
    }
    if (lineWidth == 0) {
      lineWidth = 1f;
    }

    // added embellishments to the atom
    if (atom.isHDot()) {
      Path path = new Path();
      CurveUtils.addCircle(path, point, lineWidth * 2.5f);
      PathFigure pathFigure = new PathFigure(path, false, true);
      pathFigure.setPaint(color);
      figure.addFigure(pathFigure);
    } else if (atom.isHDash()) {
      Path path = new Path();
      float width = lineWidth * 2.5f;
      float width2 = width / 2f;
      CurveUtils.addLine(path, point(point.x - width2, point.y - width), point(point.x + width2, point.y - width), false);
      CurveUtils.addLine(path, point(point.x - width2, point.y - 2f * width), point(point.x + width2, point.y - 2f * width), false);
      PathFigure pathFigure = new PathFigure(path);
      pathFigure.setPaint(color);
      figure.addFigure(pathFigure);
    }

    // added further embellishments to the atom
    if (atom.getAttachmentPointType() == CDExternalConnectionType.Diamond) {
      Path path = new Path();
      CurveUtils.addDiamond(path, point, lineWidth * 4f);
      PathFigure pathFigure = new PathFigure(path, false, true);
      pathFigure.setZOrder(atom.getZOrder());
      pathFigure.setPaint(color);
      figure.addFigure(pathFigure);

    } else if (atom.getAttachmentPointType() == CDExternalConnectionType.PolymerBead) {
      Path path = new Path();
      CurveUtils.addCircle(path, point, lineWidth * 10f);
      Java2DFigure shadedFigure = ShadedFigureCreator.createFigure(path, color);
      shadedFigure.setZOrder(atom.getZOrder());
      shadedFigure.setPaint(color);
      figure.addFigure(shadedFigure);
      PathFigure pathFigure = new PathFigure(path);
      pathFigure.setStroke(new BasicStroke(lineWidth));
      pathFigure.setZOrder(atom.getZOrder());
      pathFigure.setPaint(color);
      figure.addFigure(pathFigure);

    } else if (atom.getAttachmentPointType() == CDExternalConnectionType.Wavy) {
      int fragmentIndex = getFragmentIndex(atom);
      if (fragmentIndex >= 0) {
        BondStructure fragmentHelper = fragmentHelpers[fragmentIndex];
        PathPoint d = ZERO_POINT;
        for (CDBond bond : fragmentHelper.bonds) {
          if (bond.getBegin() == atom) {
            d = point(bond.getEnd().getPosition2D().getX() - point.x, bond.getEnd().getPosition2D().getY() - point.y);
            break;
          } else if (bond.getEnd() == atom) {
            d = point(bond.getBegin().getPosition2D().getX() - point.x, bond.getBegin().getPosition2D().getY() - point.y);
            break;
          }
        }
        float length = (float) Math.hypot(d.x, d.y);
        if (length > 0) {
          PathPoint n = scale(d, 1f / length);
          PathPoint o = point(n.y, -n.x);

          float width = lineWidth * 8f;
          Path path = new Path();
          CurveUtils.addWavyLine(path, scaleAdd(point, o, width), scaleAdd(point, o, -width), lineWidth * 1.5f);
          PathFigure pathFigure = new PathFigure(path);
          pathFigure.setStroke(new BasicStroke(lineWidth));
          pathFigure.setZOrder(atom.getZOrder());
          pathFigure.setPaint(color);
          figure.addFigure(pathFigure);
          // add figure to node shape to calculate the padding
        } else {
          logger.warn("Could not find fragment for atom " + atom);
        }
      }

    } else if (atom.getAttachmentPointType() == CDExternalConnectionType.Star) {
      TextFigure textFigure = new TextFigure("*", point.x, point.y);
      String fontFamily = "SansSerif";
      if (atom.getSettings().getLabelFont() != null && atom.getSettings().getLabelFont().getName() != null) {
        fontFamily = atom.getSettings().getLabelFont().getName();
      } else if (document.getSettings().getLabelFont() != null && document.getSettings().getLabelFont().getName() != null) {
        fontFamily = document.getSettings().getLabelFont().getName();
      }
      float fontSize = 11f;
      if (atom.getSettings().getLabelSize() > 0) {
        fontSize = atom.getSettings().getLabelSize();
      } else if (document.getSettings().getLabelSize() > 0) {
        fontSize = document.getSettings().getLabelSize();
      }
      textFigure.setFont(FontCreator.createFont(fontFamily, fontSize, false, false, false));
      textFigure.setZOrder(atom.getZOrder());
      textFigure.setPaint(color);
      figure.addFigure(textFigure);
    }

    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw bond.
   *
   * @param bond ChemDraw bond
   * @return Graphical figure
   */
  private Java2DFigure writeBond(CDBond bond) {
    if (figures.get(bond) != null) {
      logger.debug("Bond figure is already generated");
      return figures.get(bond);
    }

    logger.debug("\nwrite Bond");

    Java2DFigure figure = new Java2DFigure();
    figures.put(bond, figure);
    figure.setModel(bond);
    figure.setZOrder(bond.getZOrder());
    figure.setVisible(bond.isVisible());
    figure.setPaint(ConverterUtils.convertColor(bond.getColor()));

    for (CDObjectTag objectTag : bond.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    int fragmentIndex = getFragmentIndex(bond);
    int bondIndex = fragmentHelpers[fragmentIndex].indexOf(bond);
    if (bondIndex < 0) {
      throw new IllegalStateException("Didn't found bond " + bond);
    }
    BondStructure fragmentHelper = fragmentHelpers[fragmentIndex];

    figure.setStroke(new BasicStroke(fragmentHelper.lineWidth[bondIndex], BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));

    if (bond.getColor() != null) {
      figure.setPaint(ConverterUtils.convertColor(bond.getColor()));
    }

    logger.debug("orders=" + bond.getBondOrder() + " display=" + bond.getBondDisplay() + " display2=" + bond.getBondDisplay2() +
            " doublePosition=" + bond.getBondDoublePosition());

    // determine the shape of the bonds, which this bond are crossing to stamp the gap
    Path crossingBondsPath = null;
    if (bond.getCrossingBonds() != null) {
      Stroke bondOutlineStroke =
              new BasicStroke(fragmentHelper.marginWidth[bondIndex] * 2f, BasicStroke.CAP_SQUARE, BasicStroke.JOIN_BEVEL);
      for (CDBond crossingBond : bond.getCrossingBonds()) {
        // use z-order to recognize the bond, which are above this bond
        boolean bondAbove = crossingBond.getZOrder() > bond.getZOrder();
        // if 3d coordinates exists then use the z-coordinate to determine, which bond is above
        if (bond.getBegin().getPosition3D() != null || bond.getEnd().getPosition3D() != null ||
                crossingBond.getBegin().getPosition3D() != null || crossingBond.getEnd().getPosition3D() != null) {
          float z1 = 0;
          float z2 = 0;
          if (bond.getBegin().getPosition3D() != null && bond.getEnd().getPosition3D() != null) {
            z1 = (bond.getBegin().getPosition3D().getZ() + bond.getEnd().getPosition3D().getZ()) / 2f;
          }
          if (crossingBond.getBegin().getPosition3D() != null && crossingBond.getEnd().getPosition3D() != null) {
            z2 = (crossingBond.getBegin().getPosition3D().getZ() + crossingBond.getEnd().getPosition3D().getZ()) / 2f;
          }

          bondAbove = z2 < z1;
        }
        if (bondAbove) {
          writeBond(crossingBond);
          Java2DFigure bondFigure = figures.get(crossingBond);
          if (bondFigure != null) {
            Shape boundsShape = bondFigure.getShape();
            if (boundsShape != null) {
              if (crossingBondsPath == null) {
                crossingBondsPath = new Path();
              }
              Area hull = GrahamScanAlgorithm.createConvexHull(bondOutlineStroke.createStrokedShape(boundsShape));
              if (hull != null) {
                crossingBondsPath.append(hull, false);
              }
            }
          }
        }
      }
    }

    // generate graphical presentation based of the bond order and display type
    switch (bond.getBondOrder()) {
      case Single: {
        switch (bond.getBondDisplay()) {
          case Dash: {
            Path path = new Path();
            BondUtils.addSimpleBond(path, fragmentHelper, bondIndex, true);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case Hash: {
            Path path = new Path();
            BondUtils.addHashBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case WedgedHashBegin: {
            Path path = new Path();
            BondUtils.addHashBond(g, path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case WedgedHashEnd: {
            Path path = new Path();
            BondUtils.addHashBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case WedgeBegin: {
            Path path = new Path();
            BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case WedgeEnd: {
            Path path = new Path();
            BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case HollowWedgeBegin: {
            Path path = new Path();
            BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, true, false));
            break;
          }
          case HollowWedgeEnd: {
            Path path = new Path();
            BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, true, false));
            break;
          }
          case Bold: {
            Path path = new Path();
            BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case Wavy: {
            Path path = new Path();
            BondUtils.addWavyBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          default: {
            Path path = new Path();
            BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
        }
        break;
      }
      case Double: {
        switch (bond.getBondDisplay()) {
          case Wavy: {
            Path path = new Path();
            BondUtils.addDoubleBond(path, fragmentHelper, bondIndex, fragmentHelper.lineWidth[bondIndex],
                    fragmentHelper.lineWidth[bondIndex], false, false, true);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          case Bold: {
            Path path = new Path();
            BondUtils.addDoubleBond(path, fragmentHelper, bondIndex, fragmentHelper.lineWidth[bondIndex],
                    fragmentHelper.boldWidth[bondIndex], false, false, false);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
          default: {
            Path path = new Path();
            BondUtils.addDoubleBond(path, fragmentHelper, bondIndex, fragmentHelper.lineWidth[bondIndex],
                    fragmentHelper.lineWidth[bondIndex], false, false, false);
            if (crossingBondsPath != null) {
              path = CurveUtils.subtract(path, crossingBondsPath);
            }
            figure.addFigure(new PathFigure(path, false, true));
            break;
          }
        }
        break;
      }
      case OneHalf: {
        Path path = new Path();
        if (bond.getBondDisplay() == CDBondDisplay.Dash || bond.getBondDisplay2() == CDBondDisplay.Dash) {
          BondUtils.addDoubleBond(path, fragmentHelper, bondIndex, fragmentHelper.lineWidth[bondIndex], fragmentHelper.lineWidth[bondIndex],
                  bond.getBondDisplay() == CDBondDisplay.Dash, bond.getBondDisplay2() == CDBondDisplay.Dash, false);
        } else {
          BondUtils.addBoldBond(path, fragmentHelper, bondIndex);
        }
        if (crossingBondsPath != null) {
          path = CurveUtils.subtract(path, crossingBondsPath);
        }
        figure.addFigure(new PathFigure(path, false, true));
        break;
      }
      case TwoHalf: {
        Path path = new Path();
        BondUtils.addDoubleBond(path, fragmentHelper, bondIndex, fragmentHelper.lineWidth[bondIndex], fragmentHelper.lineWidth[bondIndex],
                bond.getBondDisplay() == CDBondDisplay.Dash, bond.getBondDisplay2() == CDBondDisplay.Dash, false);
        if (crossingBondsPath != null) {
          path = CurveUtils.subtract(path, crossingBondsPath);
        }
        figure.addFigure(new PathFigure(path, false, true));
        break;
      }
      case Triple: {
        Path path = new Path();
        BondUtils.addTripleBond(path, fragmentHelper, bondIndex);
        if (crossingBondsPath != null) {
          path = CurveUtils.subtract(path, crossingBondsPath);
        }
        figure.addFigure(new PathFigure(path, false, true));
        break;
      }
      case Quadruple: {
        Path path = new Path();
        BondUtils.addQuadrupleBond(path, fragmentHelper, bondIndex);
        if (crossingBondsPath != null) {
          path = CurveUtils.subtract(path, crossingBondsPath);
        }
        figure.addFigure(new PathFigure(path, false, true));
        break;
      }
      case Dative: {
        Path path = new Path();
        BondUtils.addDativeBond(path, fragmentHelper, bondIndex);
        if (crossingBondsPath != null) {
          path = CurveUtils.subtract(path, crossingBondsPath);
        }
        figure.addFigure(new PathFigure(path, false, true));
        break;
      }
      default: {
        logger.warn("Bond order not correct recognized: " + bond.getBondOrder());
        Path path = new Path();
        BondUtils.addSimpleBond(path, fragmentHelper, bondIndex, false);
        if (crossingBondsPath != null) {
          path = CurveUtils.subtract(path, crossingBondsPath);
        }
        figure.addFigure(new PathFigure(path, false, true));
        break;
      }
    }
    return figure;
  }

  private void writeTemplateGrid(CDTemplateGrid templateGrid) {
    // no graphical presentation
  }

  /**
   * Generate a graphical presentation of a ChemDraw group.
   *
   * @param group ChemDraw group
   * @return Graphical figure
   */
  private Java2DFigure writeGroup(CDGroup group) {
    logger.debug("write group");

    Java2DFigure figure = new Java2DFigure();
    for (CDGraphic graphic : group.getGraphics()) {
      figure.addFigure(writeGraphic(graphic));
    }
    for (CDGroup group2 : group.getGroups()) {
      figure.addFigure(writeGroup(group2));
    }
    for (CDFragment fragment : group.getFragments()) {
      figure.addFigure(writeFragment(fragment));
    }
    for (CDText text : group.getCaptions()) {
      figure.addFigure(writeText(text, null));
    }
    for (CDSpline curve : group.getCurves()) {
      figure.addFigure(writeSpline(curve));
    }
    for (CDAltGroup namedAlternativeGroup : group.getNamedAlternativeGroups()) {
      figure.addFigure(writeNamedAlternativeGroup(namedAlternativeGroup));
    }
    for (CDReactionStep reactionStep : group.getReactionSteps()) {
      figure.addFigure(writeReactionStep(reactionStep));
    }
    for (CDSpectrum spectrum : group.getSpectra()) {
      figure.addFigure(writeSpectrum(spectrum));
    }
    for (CDPicture embeddedObject : group.getEmbeddedObjects()) {
      figure.addFigure(writePicture(embeddedObject));
    }
    for (CDObjectTag objectTag : group.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }
    for (CDArrow arrow : group.getArrows()) {
      figure.addFigure(writeArrow(arrow));
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw text.
   *
   * @param text ChemDraw text
   * @return Graphical figure
   */
  private Java2DFigure writeText(CDText text, CDAtom atom) {
    logger.debug("write text Text=\"" + text.getText() + "\"");

    Java2DFigure figure = new Java2DFigure();
    figures.put(text, figure);
    figure.setModel(text);
    figure.setZOrder(calculateZOrder(text, atom));
    figure.setVisible(text.isVisible());
    figure.setPaint(ConverterUtils.convertColor(text.getColor()));

    for (CDObjectTag objectTag : text.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    CDRectangle boundingBox = text.getBounds();
    Rectangle2D bounds =
            new Rectangle2D.Float(boundingBox.getLeft(), boundingBox.getTop(), boundingBox.getWidth(), boundingBox.getHeight());

    logger.debug("Bounds =" + bounds);

    if (logger.isDebugEnabled()) {
      g.setColor(Color.RED);
      g.setStroke(new BasicStroke(0.5f));
      g.draw(bounds);
      g.setColor(Color.GREEN);
      g.fill(new Ellipse2D.Float(text.getPosition2D().getX() - 1, text.getPosition2D().getY() - 1, 2, 2));
    }

    CDStyledString styledString = text.getText();
    if (text.getText() == null) {
      return null;
    }
    String textText = text.getText().getText();
    if (textText == null || textText.length() <= 0) {
      return null;
    }

    // generate array of TextChar instances
    List<TextChar> characters = getCharacters(styledString);
    float maxFontSize = calculateMaxFontSize(characters);
    logger.debug("calculated maxFontSize: " + maxFontSize);

    // set sub- and superscript for the formulas
    logger.debug("Set formula");
    setFormula(styledString, characters);

    for (TextChar character : characters) {
      logger.debug("Character='" + character.character + "' font-family=" + character.fontFamily + " size=" + character.fontSize +
              " bold=" + character.bold + " italic=" + character.italic + " underline=" + character.underline + " formula=" +
              character.formula + " subscript=" + character.subscript + " superscript=" + character.superscript + " color=" +
              character.color);
    }

    logger.debug(
            "text=\"" + ConverterUtils.convertText(textText) + "\" node alignment=" + (atom != null ? atom.getLabelDisplay() : "null") +
                    " text alignment=" + text.getLabelAlignment() + " text justification=" + text.getSettings().getLabelJustification());

    // set alignment of characters
    if (atom != null && atom.getLabelDisplay() == CDLabelDisplay.Auto) {
      characters = setAlignment(text.getLabelAlignment(), text.getSettings().getLabelJustification(), characters, 0, characters.size());
      logger.debug("aligned text=" + characters);
    }

    FontRenderContext frc = new FontRenderContext(null, true, true);
    for (TextChar character : characters) {
      float fontSize = character.fontSize;
      if (character.subscript || character.superscript) {
        fontSize *= 0.75f;
      }
      character.font = FontCreator.createFont(character.fontFamily, fontSize, character.bold, character.italic, character.underline);
      character.glyphVector = character.font.createGlyphVector(frc, new char[] { character.character });
    }

    // position of the text
    float x = text.getPosition2D().getX();
    float y = text.getPosition2D().getY();

    double rotationAngle = Math.toRadians(text.getAngle());
    figure.setTransform(AffineTransform.getRotateInstance(rotationAngle, x, y));

    float horizontalShift = 0;
    float verticalShift = 0;

    float lineHeight = text.getLineHeight();
    if (lineHeight <= 0) {
      int maxLines = text.getLineStarts().size();
      float availableHeight = (float) bounds.getHeight();
      lineHeight = availableHeight / maxLines;
      logger.debug("Line height not specified, will use " + lineHeight);
    }
    if (logger.isDebugEnabled()) {
      g.setColor(Color.MAGENTA);
      g.draw(new Line2D.Float(x, y, x, y - maxFontSize));
    }

    // character indices of the position for new lines
    List<Integer> lineStarts = new ArrayList<>(text.getLineStarts());

    float[] absoluteLineWidths = new float[lineStarts.size() + 1];
    int[] lineWidths = new int[lineStarts.size() + 1];
    int previousStart = 0;
    int line = 0;
    float maxAbsoluteLineWidth = 0f;
    int maxLineWidth = 0;
    if (!lineStarts.contains(characters.size())) {
      lineStarts.add(characters.size());
    }

    for (int lineStart : lineStarts) {
      lineStart = Math.min(lineStart, characters.size());
      if (lineStart - previousStart <= 0) {
        continue;
      }
      StringBuilder lineText = new StringBuilder();
      for (int i = previousStart; i < lineStart; i++) {
        lineText.append(characters.get(i).character);
      }
      AttributedString attributedString = new AttributedString(lineText.toString());
      for (int i = previousStart; i < lineStart; i++) {
        int position = i - previousStart;
        attributedString.addAttribute(TextAttribute.FONT, characters.get(i).font, position, position + 1);
      }
      TextLayout textLayout = new TextLayout(attributedString.getIterator(), frc);
      for (int i = previousStart; i < lineStart; i++) {
        int position = i - previousStart;
        characters.get(i).bounds = textLayout.getBlackBoxBounds(position, position + 1).getBounds2D();
        characters.get(i).advance =
                (float) textLayout.getLogicalHighlightShape(position, lineStart - previousStart - 1).getBounds2D().getMinX();
      }

      lineWidths[line] = lineStart - previousStart;
      absoluteLineWidths[line] = (float) textLayout.getBounds().getWidth();

      // calculate maximum line width
      if (maxAbsoluteLineWidth < absoluteLineWidths[line]) {
        maxAbsoluteLineWidth = absoluteLineWidths[line];
        maxLineWidth = lineWidths[line];
      }

      previousStart = lineStart;
      line++;
    }

    logger.debug("Line height = " + lineHeight + " Line starts=" + lineStarts + " Max line width(absolute) = " + maxAbsoluteLineWidth +
            " Max line width = " + maxLineWidth);

    // layout text
    line = 0;
    for (int i = 0; i < characters.size(); i++) {
      TextChar character = characters.get(i);
      if (i == 0 || lineStarts.contains(i)) {
        logger.debug("Start new line");
        if (i > 0) {
          line++;
          verticalShift += lineHeight;
        }
        if (text.getJustification() == CDJustification.Left) {
          horizontalShift = 0;
        } else if (text.getJustification() == CDJustification.Right) {
          horizontalShift = -absoluteLineWidths[line];
        } else if (text.getJustification() == CDJustification.Center) {
          horizontalShift = -absoluteLineWidths[line] / 2f;
        } else {
          horizontalShift = 0;
        }
      }

      logger.debug("Charcter index=" + i + " Symbol=" + character.character);

      float scriptShift = 0f;
      if (character.subscript) {
        scriptShift = character.fontSize * 0.2f;
      }
      if (character.superscript) {
        scriptShift = -character.fontSize * 0.35f;
      }

      float positionX = x + horizontalShift + character.advance;
      float positionY = y + verticalShift + scriptShift;

      Rectangle2D charBounds = character.bounds;
      character.bounds = new Rectangle2D.Double(x + horizontalShift + character.advance, charBounds.getMinY() + positionY,
              charBounds.getWidth(), charBounds.getHeight());

      if (logger.isDebugEnabled()) {
        g.setColor(Color.GREEN);
        g.draw(character.bounds);
      }

      StringBuilder sb = new StringBuilder();
      sb.append(character.character);
      while (i + 1 < characters.size() && !lineStarts.contains(i + 1) && characters.get(i + 1).isCompatible(character)) {
        i++;
        character = characters.get(i);

        charBounds = character.bounds;
        character.bounds = new Rectangle2D.Double(x + horizontalShift + character.advance, charBounds.getMinY() + positionY,
                charBounds.getWidth(), charBounds.getHeight());

        if (logger.isDebugEnabled()) {
          g.setColor(Color.GREEN);
          g.draw(character.bounds);
        }

        if (!Character.isISOControl(character.character)) {
          sb.append(character.character);
        }
      }

      if (sb.length() > 0) {
        logger.debug("Create figure for text chunk \"" + sb.toString() + "\" at (" + positionX + "/" + positionY + ")");
        TextFigure textFigure = new TextFigure(sb.toString(), positionX, positionY);
        textFigure.setFont(character.font);
        textFigure.setPaint(character.color);
        figure.addFigure(textFigure);
      }

      if (logger.isDebugEnabled()) {
        g.setColor(Color.BLUE);
        g.fill(new Ellipse2D.Float(positionX - 0.5f, positionY - 0.5f, 1, 1));
      }
    }

    // textChars.put(text, characters);
    if (atom != null) {
      int fragmentIndex = getFragmentIndex(atom);
      if (fragmentIndex >= 0) {
        BondStructure fragmentHelper = fragmentHelpers[fragmentIndex];
        fragmentHelper.characters[fragmentHelper.indexOf(atom)] = characters.toArray(new TextChar[characters.size()]);
      } else {
        logger.warn("Could not find fragment for atom " + atom);
      }
    }

    return figure;
  }

  private int calculateZOrder(CDText text, CDAtom atom) {
    return text.getZOrder() != 0 ? text.getZOrder() : atom != null ? atom.getZOrder() : 0;
  }

  private float calculateMaxFontSize(List<TextChar> characters) {
    float maxFontSize = 0f;
    for (TextChar character : characters) {
      maxFontSize = Math.max(maxFontSize, character.fontSize);
    }
    if (maxFontSize == 0) {
      maxFontSize = 12f;
    }
    return maxFontSize;
  }

  /**
   * Generate a list of character for a given styled string.
   *
   * @param styledString Styled string
   * @return List of characters
   */
  private List<TextChar> getCharacters(CDStyledString styledString) {
    String textText = styledString.getText();
    List<TextChar> characters = new ArrayList<>(textText.length());
    int position = 0;

    for (CDXChunk chunk : styledString.getChunks()) {
      String chunkText = chunk.getText();
      int length = chunkText.length();

      String fontFamily = chunk.getFont() != null ? chunk.getFont().getName() : PDFFontUtils.LIBERATION_SERIF;

      boolean convertSymbolText = fontFamily.equals("Symbol");

      float fontSize = chunk.getFontSize() > 0 ? chunk.getFontSize() : 12f;
      boolean bold = chunk.getFontType() != null ? chunk.getFontType().isBold() : false;
      boolean italic = chunk.getFontType() != null ? chunk.getFontType().isItalic() : false;
      boolean underline = chunk.getFontType() != null ? chunk.getFontType().isUnderline() : false;
      boolean subscript = chunk.getFontType() != null ? chunk.getFontType().isSubscript() : false;
      boolean superscript = chunk.getFontType() != null ? chunk.getFontType().isSuperscript() : false;
      boolean formula = chunk.getFontType() != null ? chunk.getFontType().isFormula() : false;
      Color color = chunk.getColor() != null ? ConverterUtils.convertColor(chunk.getColor()) : Color.BLACK;

      for (int i = position; i < position + length; i++) {
        TextChar character = new TextChar();
        if (convertSymbolText) {
          character.character = IOUtils.convertSymbolChar(chunkText.charAt(i - position));
          logger.debug("Convert symbol character " + chunkText.charAt(i - position) + " (0x" +
                  Integer.toHexString(chunkText.charAt(i - position)) + ") to " + character.character + "(0x" +
                  Integer.toHexString(character.character) + ")");
        } else {
          character.character = chunkText.charAt(i - position);
        }
        character.fontFamily = fontFamily;
        character.fontSize = fontSize;
        character.bold = bold;
        character.italic = italic;
        character.underline = underline;
        character.formula = formula;
        character.subscript = subscript;
        character.superscript = superscript;
        character.color = color;
        characters.add(character);

        logger.debug("Character='" + character.character + "' font-family=" + character.fontFamily + " size=" + character.fontSize +
                " bold=" + character.bold + " italic=" + character.italic + " underline=" + character.underline + " formula=" +
                character.formula + " subscript=" + character.subscript + " superscript=" + character.superscript + " color=" +
                character.color);
      }

      position += length;
    }
    logger.debug("Characters=" + characters);
    return characters;
  }

  /**
   * Set the super- and subscript flag correctly for formula strings
   *
   * @param styledString Styled string
   * @param characters   List of characters
   */
  private void setFormula(CDStyledString styledString, List<TextChar> characters) {
    int length = characters.size();
    boolean positiveCharge = false;
    boolean negativeCharge = false;
    for (TextChar character : characters) {
      if (character.character == '+') {
        positiveCharge = true;
      }
      if (character.character == '-') {
        negativeCharge = true;
      }
    }
    // superscript single charges if both occur in th e text
    boolean interpretSingleCharges = positiveCharge && negativeCharge;
    logger.debug("Interpret single charges: " + interpretSingleCharges);
    for (int i = 0; i < length; i++) {
      TextChar character = characters.get(i);
      TextChar previousCharacter = null;
      if (i > 0) {
        previousCharacter = characters.get(i - 1);
      }
      logger.debug("Test character " + character + " at position " + i);
      // mark digits as subscript except at the beginning
      if (character.formula && Character.isDigit(character.character) && i > 0 && previousCharacter != null &&
              (Character.isLetter(previousCharacter.character) || ")}]".indexOf(previousCharacter.character) >= 0)) {
        logger.debug("Found subscript part");
        int start = i;
        character.subscript = true;
        character.formula = false;
        // following digits or colons
        while (i + 1 < length && characters.get(i + 1).formula &&
                (Character.isDigit(characters.get(i + 1).character) || characters.get(i + 1).character == ',')) {
          i++;
          if (start < i) {
            characters.get(i).subscript = true;
            characters.get(i).formula = false;
          }
        }
        continue;
      }
      if (character.formula && (character.character == '+' || character.character == '-') && i > 0 && previousCharacter != null &&
              (Character.isLetter(previousCharacter.character) || Character.isDigit(previousCharacter.character) ||
                      ")}]".indexOf(previousCharacter.character) >= 0)) {
        logger.debug("Found superscript part");
        // mark plus or minus as superscript if it stand at the end or a digit follows
        if (i + 1 == length || interpretSingleCharges ||
                (characters.get(i + 1).formula && Character.isDigit(characters.get(i + 1).character))) {
          logger.debug("Set " + character + " to superscript");
          character.superscript = true;
          character.formula = false;
        }
        // mark following digits as superscript
        while (i + 1 < length && characters.get(i + 1).formula && Character.isDigit(characters.get(i + 1).character)) {
          i++;
          characters.get(i).superscript = true;
          characters.get(i).formula = false;
        }
        continue;
      }
      character.formula = false;
    }
    logger.debug("Set formula to " + characters);
  }

  /**
   * Change ordering of of the characters based of alignment and justification.
   *
   * @param alignment     Text alignment
   * @param justification Justification of the node
   * @param characters    List for characters
   * @param start         Start index of the investigated characters
   * @param length        Length of the part of the investigated characters
   * @return New list of charcters
   */
  private List<TextChar> setAlignment(CDLabelDisplay alignment, CDJustification justification, List<TextChar> characters, int start,
    int length) {
    if (length <= 0) {
      return new ArrayList<>();
    }
    List<TextChar> newCharacters = new ArrayList<>();
    if (justification == CDJustification.Right) {
      for (int i = start; i < start + length; i++) {
        int[] group = findGroupToken(characters, i);
        if (group != null) {
          // found group
          if (logger.isDebugEnabled()) {
            StringBuilder tokenText = new StringBuilder();
            for (int j = group[0]; j <= group[1]; j++) {
              tokenText.append(characters.get(j));
            }
            logger.debug("Found token group: " + tokenText);
          }

          // add closing bracket and factor
          for (int j = group[1]; j >= group[0]; j--) {
            newCharacters.add(0, characters.get(j));
          }
          // invert content of the group
          List<TextChar> content = setAlignment(alignment, justification, characters, i + 1, group[0] - i - 1);
          for (int j = content.size() - 1; j >= 0; j--) {
            newCharacters.add(0, content.get(j));
          }
          // add beginning bracket
          newCharacters.add(0, characters.get(i));

          // search the next group
          i = group[1];
          continue;
        }

        // find normal token
        int end = findToken(characters, i);
        if (logger.isDebugEnabled()) {
          StringBuilder tokenText = new StringBuilder();
          for (int j = i; j <= end; j++) {
            tokenText.append(characters.get(j));
          }
          logger.debug("Found token: " + tokenText);
        }
        for (int j = end; j >= i; j--) {
          newCharacters.add(0, characters.get(j));
        }

        // search the next group
        i = end;
      }
      return newCharacters;
    }
    if (alignment == CDLabelDisplay.Below) {
      for (int i = start; i < start + length; i++) {
        int[] group = findGroupToken(characters, i);
        if (group != null) {
          // use default alignment for the group and following tokens
          break;
        }
        int end = findToken(characters, i);
        for (int j = i; j <= end; j++) {
          newCharacters.add(characters.get(j));
        }
        // if the label do have a rest
        if (end - start + 1 < length) {
          TextChar newLineChar = new TextChar();
          newLineChar.character = '\n';
          newLineChar.color = characters.get(i).color;
          newLineChar.font = characters.get(i).font;
          newLineChar.fontFamily = characters.get(i).fontFamily;
          newLineChar.fontSize = characters.get(i).fontSize;
          newCharacters.add(newLineChar);
          for (int j = end + 1; j < start + length; j++) {
            newCharacters.add(characters.get(j));
          }
        }
        return newCharacters;
      }
    }
    if (alignment == CDLabelDisplay.Above) {
      for (int i = start; i < start + length; i++) {
        int[] group = findGroupToken(characters, i);
        if (group != null) {
          // use default alignment for the group and following tokens
          break;
        }
        int end = findToken(characters, i);
        logger.debug("Found token start=" + i + " end=" + end);
        // if the label do have a rest
        if (end - start + 1 < length) {
          for (int j = end + 1; j < start + length; j++) {
            newCharacters.add(characters.get(j));
          }
          TextChar newLineChar = new TextChar();
          newLineChar.character = '\n';
          newLineChar.color = characters.get(i).color;
          newLineChar.font = characters.get(i).font;
          newLineChar.fontFamily = characters.get(i).fontFamily;
          newLineChar.fontSize = characters.get(i).fontSize;
          newCharacters.add(newLineChar);
        }
        for (int j = start; j <= end; j++) {
          newCharacters.add(characters.get(j));
        }
        return newCharacters;
      }
    }
    // default order
    for (int i = start; i < start + length; i++) {
      newCharacters.add(characters.get(i));
    }
    return newCharacters;
  }

  /**
   * Find a structure unit in the list of characters,
   *
   * @param characters List of characters
   * @param start      Start index of the investigated part
   * @return End index of the found structure unit
   */
  private int findToken(List<TextChar> characters, int start) {
    int length = characters.size();
    int result = start;
    // try to find atoms with a beginning upper-case letter
    if (Character.isLetter(characters.get(start).character) && Character.isUpperCase(characters.get(start).character)) {
      // following lower-case letters
      int end = start;
      boolean foundPrefix = false;
      while (end + 1 < length && Character.isLowerCase(characters.get(end + 1).character)) {
        // find beginning prefix
        if (end + 3 < length && characters.get(end + 2).character == '-' && Character.isUpperCase(characters.get(end + 3).character)) {
          foundPrefix = true;
          break;
        }
        end++;
      }
      // following apostrophes
      while (!foundPrefix && end + 1 < length && (characters.get(end + 1).character == '\'' || characters.get(end + 1).character == '\"')) {
        end++;
      }
      // following digits
      while (!foundPrefix && end + 1 < length && Character.isDigit(characters.get(end + 1).character)) {
        end++;
      }
      logger.debug("found token start=" + start + " end=" + end);
      if (end > result) {
        result = end;
      }
    }

    // try to find atoms with a prefix
    if (start + 2 < length && Character.isLowerCase(characters.get(start).character) && characters.get(start + 1).character == '-' &&
            Character.isUpperCase(characters.get(start + 2).character)) {
      // following lower-case letters
      int end = start + 2;
      while (end + 1 < length && Character.isLowerCase(characters.get(end + 1).character)) {
        end++;
      }
      // following apostrophes
      while (end + 1 < length && (characters.get(end + 1).character == '\'' || characters.get(end + 1).character == '\"')) {
        end++;
      }
      // following digits
      while (end + 1 < length && Character.isDigit(characters.get(end + 1).character)) {
        end++;
      }
      logger.debug("found token start=" + start + " end=" + end);
      if (end > result) {
        result = end;
      }
    }

    // try to find a nick name
    outer: for (int j = 0; j < nicknames.length; j++) {
      String nickname = nicknames[j];
      // if nick doen't fit into the length
      if (start + nickname.length() > length) {
        continue;
      }
      // try every nickname
      for (int k = 0; k < nickname.length(); k++) {
        int end = start + k;
        // find differences
        if (characters.get(end).character != nickname.charAt(k)) {
          continue outer;
        }
        // found complete nickname
        if (k + 1 == nickname.length()) {
          logger.debug("found nickname start=" + start + " end=" + end);
          if (end > result) {
            result = end;
          }
          break outer;
        }
      }
    }

    // try to find charges
    if (characters.get(start).character == '+' || characters.get(start).character == '-' ||
            Character.isDigit(characters.get(start).character)) {
      // following digits
      int end = start;
      while (end + 1 < length && Character.isDigit(characters.get(end + 1).character)) {
        end++;
      }
      logger.debug("found charge start=" + start + " end=" + end);
      if (end > result) {
        result = end;
      }
    }
    return result;
  }

  /**
   * Find a group in a list of characters.
   *
   * @param characters List of characters
   * @param start      Start index of the investigated part
   * @return Array of the end of the group and the end including the group numerators
   */
  private int[] findGroupToken(List<TextChar> characters, int start) {
    int length = characters.size();

    if ("({[".indexOf(characters.get(start).character) >= 0) {
      int level = 0;
      for (int i = start; i < length; i++) {
        if ("({[".indexOf(characters.get(i).character) >= 0) {
          level++;
        } else if (")}]".indexOf(characters.get(i).character) >= 0) {
          level--;

          // find end of token
          if (level == 0) {
            int end = i;
            // following digits
            while (i + 1 < length && Character.isDigit(characters.get(i + 1).character)) {
              i++;
            }
            logger.debug("found group start=" + start + " close=" + end + " end=" + i);
            return new int[] { end, i };
          }
        }
      }
    }
    return null;
  }

  /**
   * Generate a graphical presentation of a ChemDraw graphic.
   *
   * @param graphic ChemDraw graphic
   * @return Graphical figure
   */
  private Java2DFigure writeGraphic(CDGraphic graphic) {
    if (graphic.getSupersededBy() != null && graphic.getSupersededBy() instanceof CDArrow) {
      return writeArrow((CDArrow) graphic.getSupersededBy());
    }

    logger.debug("write graphic");

    Java2DFigure figure = new Java2DFigure();
    figures.put(graphic, figure);
    figure.setModel(graphic);
    figure.setZOrder(graphic.getZOrder());
    figure.setVisible(graphic.isVisible());
    figure.setPaint(ConverterUtils.convertColor(graphic.getColor()));

    for (CDObjectTag objectTag : graphic.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    float lineWidth = graphic.getSettings().getLineWidth();
    if (lineWidth == 0) {
      lineWidth = document.getSettings().getLineWidth();
    }
    if (lineWidth == 0) {
      lineWidth = 1f;
    }
    figure.setStroke(ConverterUtils.convertStroke(lineWidth));

    float boldWidth = graphic.getSettings().getBoldWidth();
    if (boldWidth == 0) {
      boldWidth = document.getSettings().getBoldWidth();
    }
    if (boldWidth == 0) {
      boldWidth = 4f;
    }

    float hashSpacing = document.getSettings().getHashSpacing();
    if (hashSpacing == 0) {
      hashSpacing = 2.9f;
    }

    Color color = Color.BLACK;
    if (graphic.getColor() != null) {
      color = ConverterUtils.convertColor(graphic.getColor());
      figure.setPaint(color);
    }

    switch (graphic.getGraphicType()) {
      case Arc: {
        writeArc(graphic, figure, lineWidth, boldWidth);
        break;
      }
      case Bracket: {
        writeBracket(graphic, figure);
        break;
      }
      case Line: {
        writeLine(graphic, figure, lineWidth, boldWidth, hashSpacing);
        break;
      }
      case Orbital: {
        writeOrbital(graphic, figure, color);
        break;
      }
      case Oval: {
        writeOval(graphic, figure, color, lineWidth, boldWidth);
        break;
      }
      case Rectangle: {
        writeRectangle(graphic, figure, color, lineWidth, boldWidth);
        break;
      }
      case Symbol: {
        writeSymbol(graphic, figure);
        break;
      }
      case Undefined: {
        // ignore
        logger.warn("Graphic with type " + graphic.getGraphicType() + " ignored");
        break;
      }
      default: {
        // ignore
        logger.warn("Graphic with type " + graphic.getGraphicType() + " ignored");
        break;
      }
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw colored molecular area.
   *
   * @param area ChemDraw colored molecular area
   * @return Graphical figure
   */
  private Java2DFigure writeColoredMolecularArea(CDColoredMolecularArea area) {
    logger.debug("write colored molecular area");

    Java2DFigure figure = new Java2DFigure();
    figures.put(area, figure);
    figure.setModel(area);
    figure.setZOrder(area.getZOrder());
    figure.setVisible(area.isVisible());
    figure.setPaint(ConverterUtils.convertColor(area.getBackgroundColor()));

    for (CDObjectTag objectTag : area.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    float lineWidth = area.getSettings().getLineWidth();
    if (lineWidth == 0) {
      lineWidth = document.getSettings().getLineWidth();
    }
    if (lineWidth == 0) {
      lineWidth = 1f;
    }
    figure.setStroke(ConverterUtils.convertStroke(lineWidth));

    float boldWidth = area.getSettings().getBoldWidth();
    if (boldWidth == 0) {
      boldWidth = document.getSettings().getBoldWidth();
    }
    if (boldWidth == 0) {
      boldWidth = 4f;
    }

    float hashSpacing = document.getSettings().getHashSpacing();
    if (hashSpacing == 0) {
      hashSpacing = 2.9f;
    }

    Color color = Color.BLACK;
    if (area.getBackgroundColor() != null) {
      color = ConverterUtils.convertColor(area.getBackgroundColor());
      figure.setPaint(color);
    }

    writePolygon(area, figure, color, lineWidth, boldWidth);
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw arc graphic.
   *
   * @param graphic   ChemDraw graphic
   * @param figure    Graphical figure
   * @param lineWidth Current line width
   * @param boldWidth Current line width of bold lines
   */
  private void writeArc(CDGraphic graphic, Java2DFigure figure, float lineWidth, float boldWidth) {
    CDRectangle boundingBox = graphic.getBounds();
    if (logger.isDebugEnabled()) {
      logger.debug("Arc arrow type=" + graphic.getArrowType() + " line type=" + graphic.getLineType());
      g.setColor(Color.RED);
      g.setStroke(new BasicStroke(0.5f));
      g.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));
    }

    PathPoint centerPoint = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint headPoint = point(boundingBox.getLeft(), boundingBox.getTop());

    PathPoint majorAxisEnd = point(1f, 0f);
    PathPoint minorAxisEnd = point(0f, 1f);

    double angularSize =
            Math.toRadians(graphic.getArrowType() == CDArrowType.NoHead ? -graphic.getArcAngularSize() : graphic.getArcAngularSize());

    PathPoint tailPoint =
            add(scale(anglePoint(angle(sub(headPoint, centerPoint)) + angularSize), length(sub(headPoint, centerPoint))), centerPoint);

    // generate perspective transformation by the major and minor axis
    AffineTransform perspectiveTransform = null;
    AffineTransform inversePerspectiveTransform = null;
    if (graphic.getCenter3D() != null && graphic.getMajorAxisEnd3D() != null && graphic.getMinorAxisEnd3D() != null) {
      centerPoint = point(boundingBox.getCenterX(), boundingBox.getCenterX());
      majorAxisEnd = point(boundingBox.getLeft(), boundingBox.getTop());
      minorAxisEnd = point(boundingBox.getRight(), boundingBox.getBottom());

      centerPoint = point(graphic.getCenter3D().getX(), graphic.getCenter3D().getY());
      majorAxisEnd = point(graphic.getMajorAxisEnd3D().getX(), graphic.getMajorAxisEnd3D().getY());
      minorAxisEnd = point(graphic.getMinorAxisEnd3D().getX(), graphic.getMinorAxisEnd3D().getY());

      perspectiveTransform = GeometryUtils.createPerspectiveTransform(centerPoint, majorAxisEnd, minorAxisEnd);
      inversePerspectiveTransform = null;
      try {
        inversePerspectiveTransform = perspectiveTransform.createInverse();
      } catch (NoninvertibleTransformException e) {
        throw new IllegalStateException(e);
      }
      PathPoint originalCenterPoint = GeometryUtils.transform(inversePerspectiveTransform, centerPoint);
      PathPoint originalHeadPoint = GeometryUtils.transform(inversePerspectiveTransform, headPoint);

      PathPoint originalTailPoint = add(scale(anglePoint(angle(sub(originalHeadPoint, originalCenterPoint)) + angularSize),
              length(sub(originalHeadPoint, originalCenterPoint))), originalCenterPoint);
      tailPoint = GeometryUtils.transform(perspectiveTransform, originalTailPoint);

    }

    boolean ccw = angularSize > 0;
    float headSize = graphic.getArrowHeadSize();
    float headCenterSize = graphic.getArrowHeadSize() * ArrowUtils.HEADSIZE_FACTOR;
    float headWidth = (float) Math.sin(ArrowUtils.ARC_HEAD_ANGULARSIZE) * graphic.getArrowHeadSize();
    float shaftSize = graphic.getLineType().isBold() ? boldWidth : lineWidth;
    CDArrowHeadPositionType headType = graphic.getArrowType() == CDArrowType.FullHead ? CDArrowHeadPositionType.Full
            : graphic.getArrowType() == CDArrowType.HalfHead ? CDArrowHeadPositionType.HalfRight : CDArrowHeadPositionType.None;
    CDArrowHeadPositionType tailType = CDArrowHeadPositionType.None;

    Path path = new Path();

    ArrowUtils.addArcArrow(path, centerPoint, headPoint, tailPoint, perspectiveTransform, /*inversePerspectiveTransform,*/ccw, headSize,
            headCenterSize, headWidth, shaftSize, 0f, 0f, graphic.getLineType().isDashed(), headType, tailType);

    PathFigure pathFigure = new PathFigure(path, false, true);
    figure.addFigure(pathFigure);
  }

  /**
   * Generate a graphical presentation of a ChemDraw bracket graphic.
   *
   * @param graphic ChemDraw graphic
   * @param figure  Graphical figure
   */
  private void writeBracket(CDGraphic graphic, Java2DFigure figure) {
    CDRectangle boundingBox = graphic.getBounds();
    if (logger.isDebugEnabled()) {
      logger.debug("Bracket " + boundingBox + " types=" + graphic.getBracketType());
      g.setColor(Color.RED);
      g.setStroke(new BasicStroke(0.5f));
      g.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));
    }

    PathPoint point1 = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint point2 = point(boundingBox.getLeft(), boundingBox.getTop());

    float lipSize = graphic.getBracketLipSize();

    Path path = new Path();
    switch (graphic.getBracketType()) {
      case Curly: {
        CurveUtils.addCurlyBracket(path, point1, point2, lipSize);
        break;
      }
      case Round: {
        CurveUtils.addRoundBracket(path, point1, point2, lipSize);
        break;
      }
      case Square: {
        CurveUtils.addSquareBracket(path, point1, point2, lipSize);
        break;
      }
      default: {
        logger.warn("Bracket type unsupported:" + graphic.getBracketType());
      }
    }
    figure.addFigure(new PathFigure(path));
  }

  /**
   * Generate a graphical presentation of a ChemDraw line graphic.
   *
   * @param graphic     ChemDraw graphic
   * @param figure      Graphical figure
   * @param lineWidth   Current line width
   * @param boldWidth   Current line width of bold lines
   * @param hashSpacing Hash spacing
   */
  private void writeLine(CDGraphic graphic, Java2DFigure figure, float lineWidth, float boldWidth, float hashSpacing) {
    CDRectangle boundingBox = graphic.getBounds();
    if (logger.isDebugEnabled()) {
      logger.debug("Line " + boundingBox);
      g.setColor(Color.RED);
      g.setStroke(new BasicStroke(0.5f));
      g.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));
    }

    PathPoint point1 = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint point2 = point(boundingBox.getLeft(), boundingBox.getTop());

    float headSize = graphic.getArrowHeadSize();

    // generate shape based on the arrow type and line type
    Path path = new Path();
    if (graphic.getArrowType() == CDArrowType.FullHead) {
      ArrowUtils.addSolidArrow(path, point1, point2, Math.abs(headSize) * lineWidth,
              Math.abs(headSize) * ArrowUtils.HEADSIZE_FACTOR * lineWidth,
              (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * Math.abs(headSize) * lineWidth,
              graphic.getLineType().isBold() ? boldWidth : lineWidth, 0f, 1f, graphic.getLineType().isDashed(),
              CDArrowHeadPositionType.Full, CDArrowHeadPositionType.None, CDNoGoType.None, false);
      PathFigure pathFigure = new PathFigure(path, false, true);
      figure.addFigure(pathFigure);
    } else if (graphic.getArrowType() == CDArrowType.Hollow) {
      ArrowUtils.addHollowArrow(path, point1, point2, headSize * lineWidth, CDArrowHeadPositionType.Full, CDArrowHeadPositionType.None,
              CDNoGoType.None);
      figure.addFigure(new PathFigure(path));
    } else if (graphic.getArrowType() == CDArrowType.RetroSynthetic) {
      ArrowUtils.addAngleArrow(path, point1, point2, headSize * lineWidth, CDArrowHeadPositionType.Full, CDArrowHeadPositionType.None,
              CDNoGoType.None);
      figure.addFigure(new PathFigure(path));
    } else if (graphic.getArrowType() == CDArrowType.HalfHead) {
      ArrowUtils.addSolidArrow(path, point1, point2, Math.abs(headSize), Math.abs(headSize) * ArrowUtils.HEADSIZE_FACTOR,
              (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * Math.abs(headSize), graphic.getLineType().isBold() ? boldWidth : lineWidth,
              0f, 1f, graphic.getLineType().isDashed(),
              graphic.getArrowHeadSize() >= 0 ? CDArrowHeadPositionType.HalfLeft : CDArrowHeadPositionType.HalfRight,
              CDArrowHeadPositionType.None, CDNoGoType.None, false);
      figure.addFigure(new PathFigure(path, false, true));
    } else if (graphic.getArrowType() == CDArrowType.Resonance) {
      ArrowUtils.addSolidArrow(path, point1, point2, Math.abs(headSize), Math.abs(headSize) * ArrowUtils.HEADSIZE_FACTOR,
              (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * Math.abs(headSize), graphic.getLineType().isBold() ? boldWidth : lineWidth,
              0f, 1f, graphic.getLineType().isDashed(), CDArrowHeadPositionType.Full, CDArrowHeadPositionType.Full, CDNoGoType.None, false);
      figure.addFigure(new PathFigure(path, false, true));
    } else if (graphic.getArrowType() == CDArrowType.Equilibrium) {
      headSize = Math.abs(headSize) * (graphic.getLineType().isBold() ? boldWidth : lineWidth);

      ArrowUtils.addSolidArrow(path, point1, point2, Math.abs(headSize), Math.abs(headSize) * ArrowUtils.HEADSIZE_FACTOR,
              (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * Math.abs(headSize), graphic.getLineType().isBold() ? boldWidth : lineWidth,
              lineWidth * 4f, 1f, graphic.getLineType().isDashed(), CDArrowHeadPositionType.HalfLeft, CDArrowHeadPositionType.HalfLeft,
              CDNoGoType.None, false);
      figure.addFigure(new PathFigure(path, false, true));
    } else if (graphic.getArrowType() == CDArrowType.NoGo) {
      ArrowUtils.addSolidArrow(path, point1, point2, Math.abs(headSize) * lineWidth,
              Math.abs(headSize) * ArrowUtils.HEADSIZE_FACTOR * lineWidth,
              (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * Math.abs(headSize) * lineWidth,
              graphic.getLineType().isBold() ? boldWidth : lineWidth, 0f, 1f, graphic.getLineType().isDashed(),
              CDArrowHeadPositionType.Full, CDArrowHeadPositionType.None, CDNoGoType.Cross, false);
      PathFigure pathFigure = new PathFigure(path, false, true);
      figure.addFigure(pathFigure);
    } else if (graphic.getArrowType() == CDArrowType.Dipole) {
      ArrowUtils.addSolidArrow(path, point1, point2, Math.abs(headSize) * lineWidth,
              Math.abs(headSize) * ArrowUtils.HEADSIZE_FACTOR * lineWidth,
              (float) Math.sin(ArrowUtils.HEAD_ANGULARSIZE) * Math.abs(headSize) * lineWidth,
              graphic.getLineType().isBold() ? boldWidth : lineWidth, 0f, 1f, graphic.getLineType().isDashed(),
              CDArrowHeadPositionType.Full, CDArrowHeadPositionType.None, CDNoGoType.None, true);
      PathFigure pathFigure = new PathFigure(path, false, true);
      figure.addFigure(pathFigure);
    } else if (graphic.getArrowType() == CDArrowType.NoHead) {
      if (graphic.getLineType().isWavy()) {
        CurveUtils.addWavyLine(path, point1, point2, boldWidth);
        figure.addFigure(new PathFigure(path));
      } else {
        CurveUtils.addLine(path, point1, point2, graphic.getLineType().isBold() ? 1.5f : 0f, graphic.getLineType().isDashed());
        figure.addFigure(new PathFigure(path, true, true));
      }
    } else {
      logger.warn("Arrow type " + graphic.getArrowType() + " not supported");
    }
  }

  /**
   * Generate a graphical presentation of a ChemDraw orbital graphic.
   *
   * @param graphic ChemDraw graphic
   * @param figure  Graphical figure
   * @param color   Current color
   */

  void writeOrbital(CDGraphic graphic, Java2DFigure figure, Color color) {
    OrbitalWriter orbitalWriter = new OrbitalWriter(g);
    orbitalWriter.writeOrbital(graphic, figure, color);
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
    OvalWriter ovalWriter = new OvalWriter(g, shadowColor, shadowOffset);
    ovalWriter.writeOval(graphic, figure, color, lineWidth, boldWidth);
  }

  /**
   * Generate a graphical presentation of a ChemDraw colored molecular area.
   *
   * @param area ChemDraw colored molecular area
   * @param figure    Graphical figure
   * @param lineWidth Current line width
   * @param boldWidth Current line width of bold lines
   */
  void writePolygon(CDColoredMolecularArea graphic, Java2DFigure figure, Color color, float lineWidth, float boldWidth) {
    PolygonWriter polygonWriter = new PolygonWriter(g, shadowColor, shadowOffset);
    polygonWriter.writePolygon(graphic, figure, color, lineWidth, boldWidth);
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
    RectangleWriter rectangleWriter = new RectangleWriter(g, shadowColor, shadowOffset, cornerWidth);
    rectangleWriter.writeRectangle(graphic, figure, color, lineWidth, boldWidth);
  }

  void writeSymbol(CDGraphic graphic, Java2DFigure figure) {
    SymbolWriter writer = new SymbolWriter(g);
    writer.writeSymbol(graphic, figure);
  }

  /**
   * Generate a graphical presentation of a ChemDraw arrow.
   *
   * @param arrow ChemDraw arrow
   * @return Graphical figure
   */
  private Java2DFigure writeArrow(CDArrow arrow) {
    logger.debug("write arrow");

    if (figures.get(arrow) != null) {
      return null;
    }

    Java2DFigure figure = new Java2DFigure();
    figures.put(arrow, figure);
    figure.setModel(arrow);
    figure.setZOrder(arrow.getZOrder());
    figure.setVisible(arrow.isVisible());
    figure.setPaint(ConverterUtils.convertColor(arrow.getColor()));

    for (CDObjectTag objectTag : arrow.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    float lineWidth = arrow.getSettings().getLineWidth();
    if (lineWidth == 0) {
      lineWidth = document.getSettings().getLineWidth();
    }
    if (lineWidth == 0) {
      lineWidth = 1f;
    }

    float boldWidth = arrow.getSettings().getBoldWidth();
    if (boldWidth == 0) {
      boldWidth = document.getSettings().getBoldWidth();
    }
    if (boldWidth == 0) {
      boldWidth = 4f;
    }

    Color color = Color.BLACK;
    if (arrow.getColor() != null) {
      color = ConverterUtils.convertColor(arrow.getColor());
      figure.setPaint(color);
    }

    if (arrow.getLineType().isBold()) {
      if (arrow.getLineType().isDashed()) {
        figure.setStroke(new BasicStroke(boldWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 3.0f, new float[] { 4.0f }, 0.0f));
      } else {
        figure.setStroke(new BasicStroke(boldWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER));
      }
    } else if (arrow.getLineType().isDashed()) {
      figure.setStroke(new BasicStroke(lineWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 3.0f, new float[] { 3.0f }, 0.0f));
    } else {
      figure.setStroke(new BasicStroke(lineWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER));
    }

    PathPoint head = point(arrow.getHead3D().getX(), arrow.getHead3D().getY());
    PathPoint tail = point(arrow.getTail3D().getX(), arrow.getTail3D().getY());
    PathPoint center = point(arrow.getCenter3D().getX(), arrow.getCenter3D().getY());

    if (logger.isDebugEnabled()) {
      g.setColor(Color.ORANGE);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getBounds().getLeft() - 2, arrow.getBounds().getTop() - 2, 4, 4));

      g.setColor(Color.YELLOW);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getBounds().getRight() - 2, arrow.getBounds().getBottom() - 2, 4, 4));

      g.setColor(Color.CYAN);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getHead3D().getX() - 2, arrow.getHead3D().getY() - 2, 4, 4));
      g.setColor(Color.GREEN);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getCenter3D().getX() - 2, arrow.getCenter3D().getY() - 2, 4, 4));
      g.setColor(Color.RED);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getTail3D().getX() - 2, arrow.getTail3D().getY() - 2, 4, 4));

      g.draw(new Line2D.Float(arrow.getCenter3D().getX(), arrow.getCenter3D().getY(), arrow.getHead3D().getX(), arrow.getHead3D().getY()));
      g.draw(new Line2D.Float(arrow.getCenter3D().getX(), arrow.getCenter3D().getY(), arrow.getTail3D().getX(), arrow.getTail3D().getY()));
      g.draw(new Line2D.Float(arrow.getHead3D().getX(), arrow.getHead3D().getY(), arrow.getTail3D().getX(), arrow.getTail3D().getY()));

      g.setColor(Color.MAGENTA);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getMajorAxisEnd3D().getX() - 1, arrow.getMajorAxisEnd3D().getY() - 1, 2, 2));
      g.setColor(Color.BLUE);
      g.setStroke(new BasicStroke(0.5f));
      g.fill(new Ellipse2D.Float(arrow.getMinorAxisEnd3D().getX() - 1, arrow.getMinorAxisEnd3D().getY() - 1, 2, 2));

      g.setColor(Color.GREEN);
      if (arrow.getMajorAxisEnd3D() != null) {
        g.draw(new Line2D.Float(arrow.getCenter3D().getX(), arrow.getCenter3D().getY(), arrow.getMajorAxisEnd3D().getX(),
                arrow.getMajorAxisEnd3D().getY()));
      }
      if (arrow.getMinorAxisEnd3D() != null) {
        g.draw(new Line2D.Float(arrow.getCenter3D().getX(), arrow.getCenter3D().getY(), arrow.getMinorAxisEnd3D().getX(),
                arrow.getMinorAxisEnd3D().getY()));

        g.draw(new Line2D.Float(arrow.getMajorAxisEnd3D().getX(), arrow.getMajorAxisEnd3D().getY(), arrow.getMinorAxisEnd3D().getX(),
                arrow.getMinorAxisEnd3D().getY()));
      }
      g.setColor(Color.BLACK);

    }

    // check if the shaft is an arc
    if (arrow.getAngularSize() != 0) {
      if (logger.isDebugEnabled()) {
        g.setColor(Color.MAGENTA);
        g.setStroke(new BasicStroke(0.5f));
        float r = (float) Math.hypot(center.x - head.x, center.y - head.y);
        g.draw(new Ellipse2D.Float(center.x - r, center.y - r, 2 * r, 2 * r));

      }

      // the angular size is not always correct. Use the start and end point to calculate the angular size correctly

      boolean ccw = arrow.getAngularSize() > 0;

      // calculate the perspective transformation by the major and minor axis
      AffineTransform perspectiveTransform = null;

      if (arrow.getMajorAxisEnd3D() != null && arrow.getMinorAxisEnd3D() != null) {
        PathPoint majorAxisEnd = null;
        PathPoint minorAxisEnd = null;
        if (arrow.getMajorAxisEnd3D() != null) {
          majorAxisEnd = point(arrow.getMajorAxisEnd3D().getX(), arrow.getMajorAxisEnd3D().getY());
        }
        if (arrow.getMinorAxisEnd3D() != null) {
          minorAxisEnd = point(arrow.getMinorAxisEnd3D().getX(), arrow.getMinorAxisEnd3D().getY());
        }

        {
          float[] pHead = arrow.getHead3D().getValues();
          float[] pTail = arrow.getTail3D().getValues();
          float[] pCenter = arrow.getCenter3D().getValues();

          float[] pMajor = arrow.getMajorAxisEnd3D().getValues();
          float[] pMinor = arrow.getMinorAxisEnd3D().getValues();

          float[] vMajor = sub(pMajor, pCenter);
          float[] vMinor = sub(pMinor, pCenter);
          float[] vNormal = normalize(cross(vMajor, vMinor));

          // if the coordinate system is rotated, then invert the clockwise rotation about the center
          if (vNormal[2] < 0) {
            ccw = !ccw;
          }

          float[] transform = new float[16];
          transform[0] = vMajor[0];
          transform[4] = vMajor[1];
          transform[8] = vMajor[2];
          transform[12] = 0.0f;

          transform[1] = vMinor[0];
          transform[5] = vMinor[1];
          transform[9] = vMinor[2];
          transform[13] = 0.0f;

          transform[2] = vNormal[0];
          transform[6] = vNormal[1];
          transform[10] = vNormal[2];
          transform[14] = 0.0f;

          transform[3] = pCenter[0];
          transform[7] = pCenter[1];
          transform[11] = pCenter[2];
          transform[15] = 1.0f;

          float[] inverseTransform = Transform3DUtils.invertMatrix(transform);

          float[] originalHead = Transform3DUtils.transform(pHead, inverseTransform);
          float[] originalTail = Transform3DUtils.transform(pTail, inverseTransform);
          float[] originalCenter = Transform3DUtils.transform(pCenter, inverseTransform);
          head = point(originalHead[0], originalHead[1]);
          tail = point(originalTail[0], originalTail[1]);
          center = point(originalCenter[0], originalCenter[1]);
        }

        perspectiveTransform = GeometryUtils.createPerspectiveTransform(point(arrow.getCenter3D().getX(), arrow.getCenter3D().getY()),
                majorAxisEnd, minorAxisEnd);
      }

      Path path = new Path();
      ArrowUtils.addArcArrow(path, center, head, tail, perspectiveTransform, /*inversePerspectiveTransform,*/ccw, arrow.getHeadSize(),
              arrow.getHeadCenterSize(), arrow.getHeadWidth(), arrow.getLineType().isBold() ? boldWidth : lineWidth,
              arrow.getShaftSpacing(), arrow.getEquilibriumRatio(), arrow.getLineType().isDashed(), arrow.getArrowHeadPositionStart(),
              arrow.getArrowHeadPositionTail());

      PathFigure pathFigure = new PathFigure(path, false, true);
      figure.addFigure(pathFigure);
    } else {
      Path path = new Path();
      if (arrow.getArrowHeadType() == CDArrowHeadType.Solid) {
        // combination of solid and wavy draws a wavy line, see bug 6017
        if (arrow.getLineType().isWavy()) {
          CurveUtils.addWavyLine(path, tail, head, boldWidth);
          figure.addFigure(new PathFigure(path));
        } else {

          ArrowUtils.addSolidArrow(path, tail, head, arrow.getHeadSize() * lineWidth, arrow.getHeadCenterSize() * lineWidth,
                  arrow.getHeadWidth() * lineWidth, arrow.getLineType().isBold() ? boldWidth : lineWidth, arrow.getShaftSpacing(),
                  arrow.getEquilibriumRatio(), arrow.getLineType().isDashed(), arrow.getArrowHeadPositionStart(),
                  arrow.getArrowHeadPositionTail(), arrow.getNoGoType(), arrow.isDipole());
          PathFigure pathFigure = new PathFigure(path, false, true);
          figure.addFigure(pathFigure);
        }
      } else if (arrow.getArrowHeadType() == CDArrowHeadType.Hollow) {

        ArrowUtils.addHollowArrow(path, tail, head, arrow.getHeadSize() * lineWidth, arrow.getArrowHeadPositionStart(),
                arrow.getArrowHeadPositionTail(), arrow.getNoGoType());
        if (arrow.getFillType() == CDFillType.Shaded) {
          figure.addFigure(ShadedFigureCreator.createFigure(path, color));
        } else if (arrow.getFillType() == CDFillType.Solid) {
          figure.addFigure(new PathFigure(path, true, true));
        } else {
          figure.addFigure(new PathFigure(path));
        }
      } else if (arrow.getArrowHeadType() == CDArrowHeadType.Angle) {

        ArrowUtils.addAngleArrow(path, tail, head, arrow.getHeadSize() * lineWidth, arrow.getArrowHeadPositionStart(),
                arrow.getArrowHeadPositionTail(), arrow.getNoGoType());
        figure.addFigure(new PathFigure(path));
      } else {

        if (arrow.getLineType().isWavy()) {
          CurveUtils.addWavyLine(path, tail, head, boldWidth);
          figure.addFigure(new PathFigure(path));
        } else {
          CurveUtils.addLine(path, tail, head, arrow.getLineType().isBold() ? 1.5f : 0f, arrow.getLineType().isDashed());
          figure.addFigure(new PathFigure(path, true, true));
        }
      }
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw bracketed group.
   *
   * @param bracketedGroup ChemDraw bracketed group
   * @return Graphical figure
   */
  private Java2DFigure writeBracketedGroup(CDBracket bracketedGroup) {
    Java2DFigure figure = new Java2DFigure();
    for (CDBracket bracketedGroup2 : bracketedGroup.getBrackets()) {
      figure.addFigure(writeBracketedGroup(bracketedGroup2));
    }
    for (CDBracketAttachment bracketAttachment : bracketedGroup.getBracketAttachments()) {
      figure.addFigure(writeBracketAttachment(bracketAttachment));
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw bracket attachment.
   *
   * @param bracketAttachment ChemDraw bracket attachment
   * @return Graphical figure
   */
  private Java2DFigure writeBracketAttachment(CDBracketAttachment bracketAttachment) {
    Java2DFigure figure = new Java2DFigure();
    for (CDCrossingBond crossingBond : bracketAttachment.getCrossingBonds()) {
      figure.addFigure(writeCrossingBond(crossingBond));
    }
    return figure;
  }

  private Java2DFigure writeCrossingBond(CDCrossingBond crossingBond) {
    // no graphical presentation
    return null;
  }

  private void writeSplitter(CDSplitter splitter) {
    // no graphical presentation
    return;
  }

  /**
   * Generate a graphical presentation of a ChemDraw TLC plate.
   *
   * @param tlcPlate ChemDraw TLC plate
   * @return Graphical figure
   */
  private Java2DFigure writeTLCPlate(CDTLCPlate tlcPlate) {
    Java2DFigure figure = new Java2DFigure();
    figures.put(tlcPlate, figure);
    figure.setModel(tlcPlate);
    figure.setZOrder(tlcPlate.getZOrder());
    figure.setVisible(tlcPlate.isVisible());
    figure.setPaint(ConverterUtils.convertColor(tlcPlate.getColor()));
    figure.setStroke(ConverterUtils.convertStroke(tlcPlate.getSettings().getLineWidth()));

    for (CDObjectTag objectTag : tlcPlate.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }
    for (CDTLCLane tlcLane : tlcPlate.getLanes()) {
      figure.addFigure(writeTLCLane(tlcLane));
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw TLC lane.
   *
   * @param tlcLane ChemDraw TLC lane
   * @return Graphical figure
   */
  private Java2DFigure writeTLCLane(CDTLCLane tlcLane) {
    Java2DFigure figure = new Java2DFigure();
    for (CDObjectTag objectTag : tlcLane.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }
    for (CDTLCSpot tlcSpot : tlcLane.getSpots()) {
      figure.addFigure(writeTLCSpot(tlcSpot));
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw TLC spot.
   *
   * @param tlcSpot ChemDraw TLC spot
   * @return Graphical figure
   */
  private Java2DFigure writeTLCSpot(CDTLCSpot tlcSpot) {
    Java2DFigure figure = new Java2DFigure();
    figures.put(tlcSpot, figure);
    figure.setModel(tlcSpot);
    figure.setVisible(tlcSpot.isVisible());
    figure.setPaint(ConverterUtils.convertColor(tlcSpot.getColor()));

    for (CDObjectTag objectTag : tlcSpot.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }
    return figure;
  }

  private void writeConstraint(CDConstraint constraint) {
    for (CDObjectTag objectTag : constraint.getObjectTags()) {
      writeObjectTag(objectTag);
    }
    // no graphical presentation
  }

  private void writeGeometry(CDGeometry geometry) {
    for (CDObjectTag objectTag : geometry.getObjectTags()) {
      writeObjectTag(objectTag);
    }
    // no graphical presentation
  }

  private void writeBorder(CDBorder border) {
    // no graphical presentation
  }

  private void writeCrossReference(CDCrossReference crossReference) {
    // no graphical presentation
  }

  private void writeSequence(CDSequence sequence) {
    // no graphical presentation
  }

  /**
   * Generate a graphical presentation of a ChemDraw spectrum.
   *
   * @param spectrum ChemDraw spectrum
   * @return Graphical figure
   */
  private Java2DFigure writeSpectrum(CDSpectrum spectrum) {
    Java2DFigure figure = new Java2DFigure();
    figures.put(spectrum, figure);
    figure.setModel(spectrum);
    figure.setZOrder(spectrum.getZOrder());
    figure.setVisible(spectrum.isVisible());
    figure.setPaint(ConverterUtils.convertColor(spectrum.getColor()));
    figure.setStroke(ConverterUtils.convertStroke(spectrum.getSettings().getLineWidth()));

    for (CDObjectTag objectTag : spectrum.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    CDRectangle boundingBox = spectrum.getBounds();
    float x1 = boundingBox.getLeft();
    float y1 = boundingBox.getTop();
    float x2 = boundingBox.getRight();
    float y2 = boundingBox.getBottom();

    if (spectrum.getXAxisLabel() != null) {
      TextLayout tl = new TextLayout(spectrum.getXAxisLabel(), g.getFont(), g.getFontRenderContext());
      Rectangle2D bounds = tl.getBounds();
      figure.addFigure(new TextFigure(spectrum.getXAxisLabel(), (float) (x1 + (x2 - x1 - bounds.getWidth()) / 2),
              (float) (y2 - bounds.getHeight())));
      y2 -= bounds.getHeight();
    }

    x1 += 5f;
    y1 += 5f;
    x2 -= 5f;
    y2 -= 25f; // 30f;
    g.setColor(Color.DARK_GRAY);
    g.setStroke(new BasicStroke(0.5f));
    g.draw(new Rectangle2D.Float(x1, y1, x2 - x1, y2 - y1));

    // calculate the minimum and maximum value
    double[] dataPoints = spectrum.getDataPoint();
    double minValue = dataPoints[0];
    double maxValue = dataPoints[0];
    for (double dataPoint : dataPoints) {
      minValue = Math.min(minValue, dataPoint);
      maxValue = Math.max(maxValue, dataPoint);
    }

    double xMax = spectrum.getXLow() + spectrum.getXSpacing() * (dataPoints.length - 1);
    int s1 = (int) Math.ceil(spectrum.getXLow());
    int s2 = (int) Math.floor(xMax);

    float dx = (float) ((x2 - x1) / (xMax - spectrum.getXLow()));
    if (s1 - 0.5 >= spectrum.getXLow()) {
      float x = x2 - (s1 - 0.5f) * dx;
      figure.addFigure(new PathFigure(CurveUtils.addLine(new Path(), point(x, y2), point(x, y2 + 2.5f), false)));
    }
    for (int s = s1; s <= s2; s++) {
      float x = x2 - s * dx;
      figure.addFigure(new PathFigure(CurveUtils.addLine(new Path(), point(x, y2), point(x, y2 + 5f), false)));
      TextLayout tl = new TextLayout(String.valueOf(s), g.getFont(), g.getFontRenderContext());
      Rectangle2D bounds = tl.getBounds();
      figure.addFigure(new TextFigure(String.valueOf(s), (float) (x - bounds.getWidth() / 2), (float) (y2 + 5f + bounds.getHeight())));

      if (s + 0.5 <= xMax) {
        x = x2 - (s + 0.5f) * dx;
        figure.addFigure(new PathFigure(CurveUtils.addLine(new Path(), point(x, y2), point(x, y2 + 2.5f), false)));
      }
    }

    y1 += 10f;
    y2 -= 10f;
    Path path = new Path();
    boolean first = true;
    float x = x2;
    dx = (x2 - x1) / dataPoints.length;
    float dy = (float) ((y2 - y1) / (maxValue - minValue));
    for (double dataPoint : dataPoints) {
      if (first) {
        path.moveTo(point(x, (float) dataPoint));
        first = false;
      } else {
        path.lineTo(point(x, y2 - (float) (dataPoint - minValue) * dy));
      }
      x -= dx;
    }
    figure.addFigure(new PathFigure(path));
    return figure;
  }

  private Java2DFigure writeReactionStep(CDReactionStep reactionStep) {
    // nothing
    return null;
  }

  private Java2DFigure writeReactionScheme(CDReactionScheme reactionScheme) {
    Java2DFigure figure = new Java2DFigure();
    for (CDReactionStep reactionStep : reactionScheme.getSteps()) {
      figure.addFigure(writeReactionStep(reactionStep));
    }
    // no graphical presentation
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw named alternative group.
   *
   * @param namedAlternativeGroup ChemDraw named alternative group
   * @return Graphical figure
   */
  private Java2DFigure writeNamedAlternativeGroup(CDAltGroup namedAlternativeGroup) {
    Java2DFigure figure = new Java2DFigure();
    for (CDGroup group : namedAlternativeGroup.getGroups()) {
      figure.addFigure(writeGroup(group));
    }
    for (CDFragment fragment : namedAlternativeGroup.getFragments()) {
      figure.addFigure(writeFragment(fragment));
    }
    for (CDText text : namedAlternativeGroup.getCaptions()) {
      figure.addFigure(writeText(text, null));
    }
    for (CDObjectTag objectTag : namedAlternativeGroup.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw table.
   *
   * @param table ChemDraw table
   * @return Graphical figure
   */
  private Java2DFigure writeTable(CDTable table) {
    Java2DFigure figure = new Java2DFigure();
    for (CDPage page : table.getPages()) {
      figure.addFigure(writePage(page));
    }
    for (CDObjectTag objectTag : table.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw picture.
   *
   * @param picture ChemDraw picture
   * @return Graphical figure
   */
  private Java2DFigure writePicture(CDPicture picture) {
    GraphicFigure figure = new GraphicFigure();
    figures.put(picture, figure);
    figure.setModel(picture);
    figure.setZOrder(picture.getZOrder());
    figure.setPaint(ConverterUtils.convertColor(picture.getColor()));
    figure.setTransform(AffineTransform.getRotateInstance(Math.toRadians(picture.getRotationAngle()), picture.getBounds().getCenterX(),
            picture.getBounds().getCenterY()));

    for (CDObjectTag objectTag : picture.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    Graphic graphic = null;
    try {
      if (picture.getGif() != null) {
        graphic = GIFGraphicReader.readGraphic(new ByteArrayInputStream(picture.getGif()));
      }
      if (picture.getTiff() != null) {
        graphic = TIFFGraphicReader.readGraphic(new ByteArrayInputStream(picture.getTiff()));
      }
      if (picture.getPng() != null) {
        graphic = PNGGraphicReader.readGraphic(new ByteArrayInputStream(picture.getPng()));
      }
      if (picture.getJpeg() != null) {
        graphic = JPEGGraphicReader.readGraphic(new ByteArrayInputStream(picture.getJpeg()));
      }
      if (picture.getBmp() != null) {
        graphic = BMPGraphicReader.readGraphic(new ByteArrayInputStream(picture.getBmp()));
      }
      if (picture.getWindowsMetafile() != null) {
        graphic = WMFGraphicReader.readGraphic(new ByteArrayInputStream(picture.getWindowsMetafile()));
      }
      if (picture.getEnhancedMetafile() != null) {
        graphic = EMFGraphicReader.readGraphic(new ByteArrayInputStream(picture.getEnhancedMetafile()));
      }
    } catch (IOException e) {
      logger.error("Unable to read graphic", e);
    }
    Rectangle2D bounds = new Rectangle2D.Double(picture.getBounds().getMinX(), picture.getBounds().getMinY(),
            picture.getBounds().getWidth(), picture.getBounds().getHeight());
    if (graphic != null) {
      graphic.setBounds(bounds);
      figure.setGraphic(graphic);
    } else {
      Path path = new Path(bounds);
      CurveUtils.addLine(path, point((float) bounds.getMinX(), (float) bounds.getMinY()),
              point((float) bounds.getMaxX(), (float) bounds.getMaxY()), false);
      Java2DFigure box = new PathFigure(path);
      box.setPaint(Color.RED);
      figure.addFigure(box);
      TextFigure text = new TextFigure(PICTURE_TYPE_NOT_SUPPORTED, 0, 0);
      text.setFont(new Font("default", Font.PLAIN, (int) document.getSettings().getCaptionSize()));
      Rectangle2D textBounds = text.getShape().getBounds2D();
      text.setX((float) (bounds.getCenterX() - textBounds.getWidth() / 2));
      text.setY((float) (bounds.getCenterY() + textBounds.getHeight() / 2));
      text.setPaint(Color.RED);
      figure.addFigure(text);
    }
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw spline.
   *
   * @param spline ChemDraw spline
   * @return Graphical figure
   */
  private Java2DFigure writeSpline(CDSpline spline) {
    logger.debug("write curve");

    Java2DFigure figure = new Java2DFigure();
    figures.put(spline, figure);
    figure.setModel(spline);
    figure.setZOrder(spline.getZOrder());
    figure.setVisible(spline.isVisible());
    figure.setPaint(ConverterUtils.convertColor(spline.getColor()));

    for (CDObjectTag objectTag : spline.getObjectTags()) {
      figure.addFigure(writeObjectTag(objectTag));
    }

    List<CDPoint2D> points = spline.getPoints2D();
    if (points == null) {
      return null;
    }
    int count = 0;
    if (spline.getPoints2D() != null) {
      count = spline.getPoints2D().size();
    }
    if (count <= 0) {
      // no points
    }

    float lineWidth = spline.getSettings().getLineWidth();
    if (lineWidth == 0) {
      lineWidth = document.getSettings().getLineWidth();
    }
    if (lineWidth == 0) {
      lineWidth = 1f;
    }

    float boldWidth = document.getSettings().getBoldWidth();
    if (boldWidth == 0) {
      boldWidth = 4f;
    }

    Color color = Color.BLACK;
    if (spline.getColor() != null) {
      color = ConverterUtils.convertColor(spline.getColor());
      figure.setPaint(color);
    }

    // generate arrow head of the end
    float headSize = (spline.getLineType().isBold() ? 7f * boldWidth : 6f * lineWidth);
    float centerHeadSize = headSize * ArrowUtils.HEADSIZE_FACTOR;
    float headWidth = (float) Math.sin(ArrowUtils./*HEAD_ANGULARSIZE*/ARC_HEAD_ANGULARSIZE) * headSize;
    if (spline.getArrowHeadPositionAtEnd() != CDArrowHeadPositionType.Unspecified &&
            spline.getArrowHeadPositionAtEnd() != CDArrowHeadPositionType.None) {
      boolean found = false;
      for (int i = 0; i < points.size(); i++) {
        PathPoint point1 = point(points.get(1).getX(), points.get(1).getY());
        PathPoint point2 = point(points.get(i).getX(), points.get(i).getY());

        PathPoint d = sub(point1, point2);
        // for the 0.point invert vector
        if (i < 1) {
          d = invert(d);
        }
        float length = length(d);

        if (length > 0) {
          PathPoint n = normalize(d);

          Path path = new Path();
          ArrowUtils.addArrowHead(path, scaleAdd(point1, n, centerHeadSize), angle(d), headSize, centerHeadSize, headWidth,
                  spline.getArrowHeadPositionAtEnd() == CDArrowHeadPositionType.Full,
                  spline.getArrowHeadPositionAtEnd() == CDArrowHeadPositionType.HalfLeft);
          figure.addFigure(new PathFigure(path, true, true));
          found = true;
          break;
        }
      }
      if (!found) {
        logger.warn("Could not calculate tangent for arrow head");
      }
    }

    // generate arrow head of the start
    if (spline.getArrowHeadPositionAtStart() != CDArrowHeadPositionType.Unspecified &&
            spline.getArrowHeadPositionAtStart() != CDArrowHeadPositionType.None) {
      boolean found = false;
      for (int i = 1; i < points.size(); i++) {
        PathPoint point1 = point(points.get(count - 2).getX(), points.get(count - 2).getY());
        PathPoint point2 = point(points.get(count - i).getX(), points.get(count - i).getY());

        PathPoint d = sub(point1, point2);
        // for the n-1.point invert vector
        if (i < 2) {
          d = invert(d);
        }
        float length = length(d);

        if (length > 0) {
          PathPoint n = normalize(d);

          Path path = new Path();
          ArrowUtils.addArrowHead(path, scaleAdd(point1, n, centerHeadSize), angle(d), headSize, centerHeadSize, headWidth,
                  spline.getArrowHeadPositionAtStart() == CDArrowHeadPositionType.Full,
                  spline.getArrowHeadPositionAtStart() == CDArrowHeadPositionType.HalfLeft);
          figure.addFigure(new PathFigure(path, true, true));
          found = true;
          break;
        }
      }
      if (!found) {
        logger.warn("Could not calculate tangent for arrow head");
      }
    }

    // generate curve of the spline
    float[] points2 = new float[count * 2];
    for (int i = 0; i < count; i++) {
      points2[i * 2] = points.get(i).getX();
      points2[i * 2 + 1] = points.get(i).getY();
    }
    Path path = new Path();
    CurveUtils.addSplineCurve(path, points2, spline.isClosed());
    PathFigure splineFigure = new PathFigure(path);
    if (spline.getFillType() == CDFillType.Solid) {
      splineFigure.setFill(true);
    } else if (spline.getFillType() == CDFillType.Shaded) {
      splineFigure.addFigure(ShadedFigureCreator.createFigure(path, color));
    }

    if (spline.getLineType().isBold()) {
      if (spline.getLineType().isDashed()) {
        splineFigure
                .setStroke(new BasicStroke(boldWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 10.75f }, 0.0f));
      } else {
        splineFigure.setStroke(new BasicStroke(boldWidth));
      }
    } else if (spline.getLineType().isDashed()) {
      splineFigure.setStroke(new BasicStroke(lineWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 3.0f }, 0.0f));
    } else {
      figure.setStroke(new BasicStroke(lineWidth));
    }

    figure.addFigure(splineFigure);
    return figure;
  }

  /**
   * Generate a graphical presentation of a ChemDraw object tag.
   *
   * @param objectTag ChemDraw object tag
   * @return Graphical figure
   */
  private Java2DFigure writeObjectTag(CDObjectTag objectTag) {
    Java2DFigure figure = new Java2DFigure();
    figures.put(objectTag, figure);
    figure.setModel(objectTag);

    for (CDText text : objectTag.getTexts()) {
      figure.addFigure(writeText(text, null));
    }
    return figure;
  }

  private void writeChemicalProperty(CDChemicalProperty chemicalProperty) {
    // no graphical presentation
    return;
  }

  /**
   * Paint the selected shapes (bonds and/or atoms)
   *
   * @param selectedObjects List of all selected ChemDraw Objects
   * @param figure          Root figure
   * @return Rectangular bounds of the selection shape
   */
  private Rectangle2D paintSelectionShapes(List<?> selectedObjects, Java2DFigure figure) {
    Map<Area,Color> bondAreas = new HashMap<Area,Color>();
    Map<Area,Color> atomAreas = new HashMap<Area,Color>();
    Map<Area,Color> atomLabelAreas = new HashMap<Area,Color>();
    findSelectedAreas(selectedObjects, bondAreas, atomAreas, atomLabelAreas, figure);

    Area area = new Area();

    // first handle the bond areas (may not overlap the nodes)
    for (Area tmp : bondAreas.keySet()) {
      Color col = bondAreas.get(tmp);
      area.add(tmp);
      BasicStroke stroke = new BasicStroke(5, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
      tmp.add(new Area(stroke.createStrokedShape(tmp)));
      g.setPaint(col);
      g.fill(tmp);
      g.setStroke(new BasicStroke(0.5f));
      g.setPaint(col);
      g.draw(tmp);
    }

    // then handle the atom areas without labels
    // just paint a circle in the center of the atom without surrounding stroke
    for (Area tmp : atomAreas.keySet()) {
      Color col = atomAreas.get(tmp);
      area.add(tmp);
      g.setPaint(col);
      g.fill(tmp);
      g.setStroke(new BasicStroke(0.5f));
      g.setPaint(col);
      g.draw(tmp);
    }

    // then handle the atom label areas
    // surround the label with a stroke
    for (Area tmp : atomLabelAreas.keySet()) {
      Color col = atomLabelAreas.get(tmp);
      area.add(tmp);
      BasicStroke stroke = new BasicStroke(5, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
      tmp.add(new Area(stroke.createStrokedShape(tmp)));
      g.setPaint(col);
      g.fill(tmp);
      g.setStroke(new BasicStroke(0.5f));
      g.setPaint(col);
      g.draw(tmp);
    }

    g.setPaint(Color.BLACK);
    return area.getBounds2D();
  }

  /**
   * Determine the shape of all selected objects.
   *
   * @param selectedObjects List of all selected ChemDraw Objects
   * @param area            Current shape of the selected objects
   * @param figure          Current figure of the figure hierarchy
   */
  private void findSelectedAreas(List<?> selectedObjects, Map<Area,Color> bondAreas, Map<Area,Color> atomAreas,
    Map<Area,Color> atomLabelAreas, Java2DFigure figure) {
    for (Java2DFigure child : figure.getChildren()) {
      if (selectedObjects.contains(child.getModel())) {
        CDObject cdchild = (CDObject) child.getModel();
        CDColor hlColor = cdchild.getSettings().getHighlightColor();
        Color highlightColor = ConverterUtils.convertColor(hlColor);
        if (cdchild instanceof CDBond) {
          Area area = new Area(child.getShape());
          bondAreas.put(area, highlightColor);
        } else if (cdchild instanceof CDAtom) {
          Area area = new Area(child.getShape());
          CDAtom atom = (CDAtom) cdchild;
          if (atom.getText() == null) {
            area = createAtomHighlightArea(atom, hlColor);
            atomAreas.put(area, highlightColor);
          } else {
            atomLabelAreas.put(area, highlightColor);
          }
        } else {
          System.out.println("WARNING: other class than bond or node found: " + cdchild.getClass().getName());
        }
      } else {
        findSelectedAreas(selectedObjects, bondAreas, atomAreas, atomLabelAreas, child);
      }
    }
  }

  /**
   * For an atom without text label, create a small filled circle.
   * @param atom
   * @param hlColor
   * @return
   */
  private Area createAtomHighlightArea(CDAtom atom, CDColor hlColor) {
    float thickness = 2.7f;
    Color highlightColor = ConverterUtils.convertColor(hlColor);
    CDPoint2D coords = atom.getPosition2D();
    CDRectangle bounds = new CDRectangle();
    bounds.setLeft(coords.getX() + thickness);
    bounds.setRight(coords.getX());
    bounds.setTop(coords.getY());
    bounds.setBottom(coords.getY());
    CDGraphic nodeArea = new CDGraphic();
    nodeArea.setBounds(bounds);
    nodeArea.setCenter3D(new CDPoint3D(coords.getX(), coords.getY(), 0));
    nodeArea.setMajorAxisEnd3D(new CDPoint3D(coords.getX() + thickness, coords.getY(), 0));
    nodeArea.setMinorAxisEnd3D(new CDPoint3D(coords.getX(), coords.getY() + thickness, 0));
    nodeArea.setGraphicType(CDGraphicType.Oval);
    CDOvalType ovalType = new CDOvalType();
    ovalType.setCircle(true);
    ovalType.setFilled(true);
    nodeArea.setOvalType(ovalType);
    nodeArea.setColor(hlColor);
    Java2DFigure nodeAreaFig = new Java2DFigure();
    writeOval(nodeArea, nodeAreaFig, highlightColor, 5, 5);
    Area area = new Area(nodeAreaFig.getShape());
    return area;
  }

  /**
   * Intermediate help class to store the information about each individual text character during
   * the rendering of text.
   */
  public static class TextChar {
    char character;
    String fontFamily;
    float fontSize;
    boolean bold;
    boolean italic;
    boolean underline;
    boolean formula;
    boolean subscript;
    boolean superscript;
    Color color;
    Font font;
    GlyphVector glyphVector;
    Rectangle2D bounds;
    float advance;

    public boolean isCompatible(TextChar textChar) {
      return fontFamily.equals(textChar.fontFamily) && fontSize == textChar.fontSize && bold == textChar.bold &&
              italic == textChar.italic && underline == textChar.underline && subscript == textChar.subscript &&
              superscript == textChar.superscript && color.equals(textChar.color);
    }

    @Override
    public String toString() {
      StringBuilder sb = new StringBuilder();
      sb.append(character);
      if (formula) {
        sb.append("(formula)");
      } else {
        if (subscript) {
          sb.append("(sub)");
        }
        if (superscript) {
          sb.append("(sup)");
        }
      }
      return sb.toString();
    }
  }

}
