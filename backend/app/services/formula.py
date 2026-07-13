"""Molecular-formula parsing and ordering helpers.

Pure string parsing only — deliberately free of JPype/CDK so any caller (the
browse endpoint, the extractor's heavy-atom guard) can import it without
touching the JVM.
"""

import re

# Element token = one uppercase letter + optional lowercase (e.g. C, Cl, Na),
# followed by an optional count. Bounded quantifiers only — no catastrophic
# backtracking. This is the single molecular-formula parser for the backend.
_ELEMENT_COUNT_RE = re.compile(r"([A-Z][a-z]?)(\d*)")


def element_counts(formula: str) -> dict[str, int]:
    """Parse a molecular-formula string into ``{element: count}``.

    Charge suffixes and brackets are ignored — only ``Element[count]`` runs
    contribute; an empty/unparseable formula yields an empty dict. ponytail:
    flat regex parse, no nested groups or hydrate dots; correct for CDK's flat
    Hill formulas, revisit if bracketed formulae appear.
    """
    counts: dict[str, int] = {}
    for element, count in _ELEMENT_COUNT_RE.findall(formula or ""):
        if not element:
            continue
        counts[element] = counts.get(element, 0) + (int(count) if count else 1)
    return counts


def formula_sort_key(formula: str) -> tuple[int, int, tuple[tuple[str, int], ...]]:
    """Hill-system sort key for a molecular formula string.

    Orders by carbon count, then hydrogen count, then the remaining elements
    alphabetically as ``(symbol, count)`` pairs. This makes counts sort
    numerically (``C1 < C7 < C41 < C62`` — not the lexical ``C41 < C62 < C7``
    a raw string ``ORDER BY`` produces) and breaks ties element-aware
    (e.g. ``C7H8N…`` before ``C7H8O…``). A carbon-free formula (carbon = 0)
    sorts ahead of any carbon-containing one; an empty/unparseable formula
    sorts first of all.

    Parsing is delegated to :func:`element_counts`.
    """
    counts = element_counts(formula)
    carbon = counts.pop("C", 0)
    hydrogen = counts.pop("H", 0)
    others = tuple(sorted(counts.items()))
    return (carbon, hydrogen, others)
