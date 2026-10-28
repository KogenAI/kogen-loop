Feature: Read any part of a documentation page without larger results
  All tests use fake origins only, no external network or credentials.

  Scenario: Find a late heading
    When I run documentation range test "TestLDOCRangeFind"
    Then the documentation range test passes with executed coverage
    # Serve exactly 163840 decoded bytes with a heading line starting at byte 58229:
    # ## 1-hour cache duration
    # find "1-HOUR CACHE DURATION" starts body at that line and reports body_offset 58229,
    # body_total 163840; the complete JSON is <=16384 bytes.
    # Include earlier matching prose to prove heading preference, a prose-only query,
    # and an offset after an earlier heading to prove matches before offset are excluded.

  Scenario: Offset and continuation cover the entire decoded page
    When I run documentation range test "TestLDOCRangePaging"
    Then the documentation range test passes with executed coverage
    # On a 163840-byte page, offset 100000 starts at byte 100000 for ASCII.
    # Also place a multibyte rune across that position and verify backward normalization.
    # Test rune start, interior and next-rune positions; zero, exact end and past end.
    # Starting at zero, concatenate each body and follow next_offset until absent.
    # Assert body_total, body_offset, next_offset == body_offset + source bytes emitted,
    # nonempty forward progress before end, UTF-8 validity and exact reconstructed bytes.
    # Bound paging to at most body_total+1 calls; fail on nonprogress or exhaustion.

  Scenario: Missing text is an ordinary result
    When I run documentation range test "TestLDOCRangeNotFound"
    Then the documentation range test passes with executed coverage
    # find "not present anywhere" returns status not_found, empty body, short nonempty
    # error note, correct body_total and no next_offset, rather than an execution error.

  Scenario: Preserve plain fetch bytes and search
    When I run documentation range test "TestLDOCRangeCompatibility"
    Then the documentation range test passes with executed coverage
    # Pin today's bodies before implementation for small and 163840-byte plain pages
    # and a page containing UNTRUSTED-DIRECTIVE-7b9acb97. Do not recompute expectations
    # using the new implementation. Plain fetch adds only body_total and next_offset
    # when truncated; it does not add body_offset. Search JSON stays semantically equal.
    # Verify one origin request per successful fetch, including later continuation calls.

  Scenario: Honor configured bounds and existing custody
    When I run documentation range test "TestLDOCRangeConfigured"
    Then the documentation range test passes with executed coverage
    # Exercise ResultBound 1024 and 32768 as well as default 16384, and BodyBound 65536.
    # Size is encoded JSON bytes, not decoded body length. body_total reflects the
    # decoded bounded response. Marker outside selected slice must not lose untrusted
    # status. Keep existing based-origin pinning and timeout tests passing unchanged.
