"""Hill-system molecular-formula ordering (app.services.formula)."""

from app.services.formula import formula_sort_key


def _sorted(formulas: list[str]) -> list[str]:
    return sorted(formulas, key=formula_sort_key)


def test_carbon_count_is_numeric_not_lexical():
    # The reported bug: a raw string sort gives C41 < C62 < C7 < CH4 because
    # '4' < '6' < '7' < 'H'. Hill ordering sorts by carbon count numerically.
    formulas = ["C41H32O11", "C62H52O18", "C7H8O2", "CH4O3S"]
    assert _sorted(formulas) == ["CH4O3S", "C7H8O2", "C41H32O11", "C62H52O18"]


def test_hydrogen_breaks_carbon_ties():
    assert _sorted(["C6H12O6", "C6H6"]) == ["C6H6", "C6H12O6"]


def test_other_elements_break_ties_alphabetically():
    # Same C and H → compare remaining elements alphabetically (N before O).
    assert _sorted(["C7H8O2", "C7H8N2"]) == ["C7H8N2", "C7H8O2"]


def test_fewer_elements_sorts_before_superset():
    assert _sorted(["C7H8O2", "C7H8"]) == ["C7H8", "C7H8O2"]


def test_carbon_free_sorts_before_carbon_containing():
    assert _sorted(["CH4", "H2O"]) == ["H2O", "CH4"]


def test_two_letter_elements_parsed_whole():
    # Cl must parse as one element, not C + l.
    key = formula_sort_key("CHCl3")
    assert key == (1, 1, (("Cl", 3),))


def test_empty_formula_sorts_first():
    assert _sorted(["C2H6", ""]) == ["", "C2H6"]


def test_charge_and_bracket_noise_ignored():
    # Only Element[count] runs contribute; a trailing charge is ignored.
    assert formula_sort_key("C6H5+") == (6, 5, ())
