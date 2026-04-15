"""Debug: test SMILES extraction from a CDX file step by step.

Run inside Docker: docker exec -w /app <container> python scripts/debug_smiles.py /tmp/test.cdx
"""
import sys
import time
import traceback

import jpype


def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else "/tmp/test.cdx"

    # Start JVM if needed
    if not jpype.isJVMStarted():
        import glob
        import os
        script_dir = os.path.dirname(os.path.abspath(__file__))
        search_paths = [
            os.path.join(script_dir, "..", "jars", "*.jar"),
            "/app/jars/*.jar",
        ]
        jars = []
        for p in search_paths:
            jars = glob.glob(p)
            if jars:
                break
        if not jars:
            print(f"ERROR: No JAR found in {search_paths}")
            return
        jpype.startJVM(classpath=jars, convertStrings=True)
        print(f"JVM started with {jars[0]}")
    else:
        print("JVM already running")

    with open(filepath, "rb") as f:
        file_bytes = f.read()
    print(f"File: {filepath} ({len(file_bytes)} bytes)")

    # Step 1: Parse document
    print("\n=== Step 1: Parse document ===")
    ByteArrayInputStream = jpype.JClass("java.io.ByteArrayInputStream")
    CDXReader = jpype.JClass("org.beilstein.chemxtract.cdx.reader.CDXReader")

    t0 = time.perf_counter()
    document = CDXReader.readDocument(ByteArrayInputStream(file_bytes))
    print(f"Parsed in {time.perf_counter()-t0:.2f}s")

    # Step 2: Get fragments
    print("\n=== Step 2: Get fragments ===")
    CDDocumentUtils = jpype.JClass("org.beilstein.chemxtract.cdx.CDDocumentUtils")
    fragments = list(CDDocumentUtils.getListOfFragments(document))
    print(f"Fragments: {len(fragments)}")

    # Step 3: Convert fragments + generic SMILES (NO InChI)
    print("\n=== Step 3: FragmentConverter + SmilesGenerator.generic() ===")
    FragmentConverter = jpype.JClass("org.beilstein.chemxtract.converter.FragmentConverter")
    SilentChemObjectBuilder = jpype.JClass("org.openscience.cdk.silent.SilentChemObjectBuilder")
    SmilesGenerator = jpype.JClass("org.openscience.cdk.smiles.SmilesGenerator")

    builder = SilentChemObjectBuilder.getInstance()
    converter = FragmentConverter(builder)
    smigen_generic = SmilesGenerator.generic()

    mols = []  # save converted molecules for step 4
    t_start = time.perf_counter()
    for i, frag in enumerate(fragments):
        try:
            mol = converter.convert(frag)
            if mol is None or mol.getAtomCount() == 0:
                mols.append(None)
                print(f"  [{i+1}] empty")
                continue
            mols.append(mol)
            t0 = time.perf_counter()
            smi = str(smigen_generic.create(mol) or "")
            dt = time.perf_counter() - t0
            print(f"  [{i+1}] atoms={mol.getAtomCount()} time={dt:.3f}s SMILES={smi[:80]}")
        except Exception as e:
            mols.append(None)
            print(f"  [{i+1}] ERROR: {e}")
    print(f"Total generic(): {time.perf_counter()-t_start:.2f}s")

    # Step 4: Test absolute() on each molecule individually
    print("\n=== Step 4: SmilesGenerator.absolute() — per molecule ===")
    smigen_abs = SmilesGenerator.absolute()
    t_start = time.perf_counter()
    for i, mol in enumerate(mols):
        if mol is None:
            continue
        try:
            t0 = time.perf_counter()
            smi = str(smigen_abs.create(mol) or "")
            dt = time.perf_counter() - t0
            flag = " *** SLOW ***" if dt > 2 else ""
            print(f"  [{i+1}] atoms={mol.getAtomCount()} time={dt:.3f}s{flag} SMILES={smi[:80]}")
        except Exception as e:
            print(f"  [{i+1}] ERROR ({type(e).__name__}): {e}")
            traceback.print_exc()
    print(f"Total absolute(): {time.perf_counter()-t_start:.2f}s")

    # Step 5: Test xtractUnique to see exactly where it hangs
    print("\n=== Step 5: xtractUnique (will hang if InChI is the problem) ===")
    print("Starting xtractUnique... (Ctrl+C to abort)")
    BCXSubstanceInfo = jpype.JClass("org.beilstein.chemxtract.model.BCXSubstanceInfo")
    SubstanceXtractor = jpype.JClass("org.beilstein.chemxtract.xtractor.SubstanceXtractor")

    info = BCXSubstanceInfo()
    xtractor = SubstanceXtractor()
    t0 = time.perf_counter()
    try:
        substances = xtractor.xtractUnique(document, info)
        dt = time.perf_counter() - t0
        print(f"xtractUnique completed in {dt:.2f}s — {len(substances)} substances")
    except KeyboardInterrupt:
        dt = time.perf_counter() - t0
        print(f"\nAborted after {dt:.1f}s")
    except Exception as e:
        dt = time.perf_counter() - t0
        print(f"xtractUnique failed after {dt:.2f}s: {e}")


if __name__ == "__main__":
    main()
