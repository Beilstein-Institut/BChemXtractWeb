package org.beilstein.chemxtract.render.graphic;

import java.awt.*;
import java.awt.geom.Rectangle2D;
import java.io.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Stack;

import org.apache.commons.logging.*;
import org.beilstein.chemxtract.cdx.*;
import org.beilstein.chemxtract.cdx.reader.CDXMLReader;
import org.beilstein.chemxtract.cdx.reader.CDXReader;
import org.beilstein.chemxtract.render.cdx.renderer.CDGraphicsWriter;

/**
 * Graphic reader for the ChemDraw graphic format.
 * 
 * @author stephan
 * @version $Id: CDXGraphicReader.java,v 1.18 2014-06-12 11:32:55 bsnie Exp $
 */
public class CDXGraphicReader {
  private static final Log logger = LogFactory.getLog(CDXGraphicReader.class);

  /**
   * Reads the graphic from an {@link InputStream}
   * 
   * @param in {@link InputStream} from which the graphic should be read
   * @return Graphic
   * @throws IOException Occurs if the reader couldn't read the graphic from the {@link InputStream}
   * @throws IOException Occurs if an exception occur during the generation of the graphic
   */
  public static Graphic readGraphic(InputStream in) throws IOException {
    CDDocument document = CDXReader.readDocument(in);

    return new CDXGraphic(document);
  }

  public static Graphic readXMLGraphic(InputStream in) throws IOException {
    CDDocument document = CDXMLReader.readDocument(in);

    return new CDXGraphic(document);
  }

  /**
   * Create graphic instance of a {@link CDDocument}.
   * 
   * @param document Instance of {@link CDDocument}
   * @return Graphic
   */
  public static Graphic readGraphic(CDDocument document) {
    return new CDXGraphic(document);
  }

  /**
   * Implementation of the {@link Graphic} interface.
   */
  public static class CDXGraphic extends AbstractGraphic {
    // Conversion factor to convert size from 72 dpi to 96 dpi
    private static final double CONVERSION = 72f / 70f;

    // Extra margin around graphic
    private static final double EXTRA_MARGIN = 0f;

    private final CDDocument document;
    private java.util.List<?> selectedObjects;
    private Rectangle2D selectionBounds = null;

    private CDXGraphic(CDDocument document) {
      this.document = document;

      CDRectangle boundingBox = document.getBoundingBox();

      double margin = EXTRA_MARGIN;
      margin += document.getSettings().getBoldWidth();

      setOriginalBounds(new Rectangle2D.Double(boundingBox.getMinX() - margin, boundingBox.getMinY() - margin,
              boundingBox.getWidth() + 2 * margin, boundingBox.getHeight() + 2 * margin));
      setBounds(new Rectangle2D.Double(0f, 0f, (boundingBox.getWidth() + 2 * margin) * CONVERSION,
              (boundingBox.getHeight() + 2 * margin) * CONVERSION));
      setSelectedObjects(getHighlightedObjects(document));
    }

    /**
     * Returns the underlying {@link CDDocument} instance, which is used to render the graphic.
     * 
     * @return {@link CDDocument} instance
     */
    public CDDocument getDocument() {
      return document;
    }

    public java.util.List<?> getSelectedObjects() {
      return selectedObjects;
    }

    public void setSelectedObjects(java.util.List<?> selectedObjects) {
      this.selectedObjects = selectedObjects;
    }

    public Rectangle2D getSelectionBounds() {
      return selectionBounds;
    }

    @Override
    public GraphicType getType() {
      return GraphicType.CDX;
    }

    @Override
    public void paintIntern(Graphics2D g) throws IOException {
      if (logger.isDebugEnabled()) {
        g.setColor(Color.RED);
        g.draw(getOriginalBounds());
      }
      selectionBounds = CDGraphicsWriter.writeDocument(document, selectedObjects, g);
    }

    private List<CDObject> getHighlightedObjects(CDDocument document) {
      //CDPage page = document.getPages().get(0);
      //List<CDFragment> frags = page.getFragments();
      List<CDFragment> frags = getListOfFragments(document);
      List<CDObject> selectedObjects = new ArrayList<CDObject>();
      for (CDFragment frag : frags) {
        for (CDAtom atom : frag.getAtoms()) {
          if (atom.getSettings().getHighlightColor() != null) {
            selectedObjects.add(atom);
          }
        }
        for (CDBond bond : frag.getBonds()) {
          if (bond.getSettings().getHighlightColor() != null) {
            selectedObjects.add(bond);
          }
        }
      }
      return selectedObjects;
    }

    private List<CDFragment> getListOfFragments(CDDocument document) {
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
      return fragments;
    }

  }
}
