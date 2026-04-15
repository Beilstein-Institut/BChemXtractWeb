"""Quick test: extract SMILES from a CDX file via JPype with per-structure error handling.

Usage (from backend container or with conda env):
    python scripts/test_extract_smiles.py /path/to/file.cdx
"""
import sys
import time

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/test_extract_smiles.py <file.cdx>")
        sys.exit(1)

    filepath = sys.argv[1]
    with open(filepath, "rb") as f:
        file_bytes = f.read()

    print(f"File: {filepath} ({len(file_bytes)} bytes)")

    # Detect format
    from app.services.format_detector import detect_format
    format_type = detect_format(file_bytes)
    print(f"Format: {format_type}")

    # Initialize JVM
    from app.config import settings
    from app.services.jvm_bridge import initialize_jvm
    initialize_jvm(settings)

    import jpype

    # Read document
    ByteArrayInputStream = jpype.JClass("java.io.ByteArrayInputStream")
    stream = ByteArrayInputStream(file_bytes)

    if format_type == "cdx":
        Reader = jpype.JClass("org.beilstein.chemxtract.cdx.CDXReader")
    else:
        Reader = jpype.JClass("org.beilstein.chemxtract.cdx.CDXMLReader")

    document = Reader.readDocument(stream)
    print(f"Document read OK: {document}")

    # Extract substances
    BCXSubstanceInfo = jpype.JClass("org.beilstein.chemxtract.model.BCXSubstanceInfo")
    SubstanceXtractor = jpype.JClass("org.beilstein.chemxtract.xtractor.SubstanceXtractor")

    info = BCXSubstanceInfo()
    xtractor = SubstanceXtractor()

    print("\nCalling xtractUnique...")
    start = time.perf_counter()
    substances = xtractor.xtractUnique(document, info)
    elapsed = time.perf_counter() - start
    print(f"xtractUnique completed in {elapsed:.1f}s")
    print(f"Fragments: {info.getNoFragments()}, InChIs: {info.getNoInchis()}, Substances: {info.getNoSubstances()}")
    print(f"Total substances returned: {len(substances) if substances else 0}")

    if not substances:
        print("No substances extracted.")
        return

    # Extract SMILES from each substance with try-catch
    print(f"\n{'='*60}")
    print(f"Extracting SMILES from {len(substances)} substances:")
    print(f"{'='*60}\n")

    success_count = 0
    error_count = 0

    for i, s in enumerate(substances):
        try:
            smiles = str(s.getSmiles() or "")
            ext_smiles = str(s.getExtendedSmiles() or "")
            formula = str(s.getMolecularFormula() or "")
            inchi_key = str(s.getInchiKey() or "")

            if smiles:
                success_count += 1
                print(f"  [{i+1}] SMILES: {smiles}")
                if formula:
                    print(f"       Formula: {formula}")
                if inchi_key:
                    print(f"       InChIKey: {inchi_key}")
            else:
                print(f"  [{i+1}] (empty SMILES, formula={formula})")
        except Exception as exc:
            error_count += 1
            print(f"  [{i+1}] ERROR: {exc}")

    print(f"\n{'='*60}")
    print(f"Results: {success_count} with SMILES, {error_count} errors, {len(substances) - success_count - error_count} empty")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
