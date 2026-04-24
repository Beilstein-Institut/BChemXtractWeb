from app.errors import (
    BridgeError,
    InvalidQueryError,
    QueryTooLargeError,
    _BRIDGE_ERROR_MAP,
)


def test_invalid_query_error_is_bridge_error():
    err = InvalidQueryError("bad syntax at position 3")
    assert isinstance(err, BridgeError)
    assert str(err) == "bad syntax at position 3"


def test_query_too_large_error_is_bridge_error():
    err = QueryTooLargeError("query has 250 atoms (max 200)")
    assert isinstance(err, BridgeError)
    assert "250" in str(err)


def test_invalid_query_error_is_mapped_to_422():
    mapping = {cls: (status, code) for cls, status, code in _BRIDGE_ERROR_MAP}
    assert mapping[InvalidQueryError] == (422, "INVALID_QUERY")


def test_query_too_large_error_is_mapped_to_422():
    mapping = {cls: (status, code) for cls, status, code in _BRIDGE_ERROR_MAP}
    assert mapping[QueryTooLargeError] == (422, "QUERY_TOO_LARGE")
