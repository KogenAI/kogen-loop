Feature: L-SHELL-UTF8 shell delivery
  Scenario: Binary shell output is normalized before the next provider request
    When I run UTF8 regression "TestLShellUTF8BinaryRequest" in "conformance"
    Then the UTF8 regression must have run and passed
    # Required test: a real shell prints 3000 random bytes; assert the captured source is invalid UTF-8.
    # Also print deterministic isolated FF/FE bytes mixed with valid multibyte text.
    # At the fake provider's next request, assert valid UTF-8 before serialization,
    # U+FFFD replacement for the deterministic case, and equality to decoded wire text.

  Scenario: Delivery transformation covers the byte bound and expansion
    When I run UTF8 regression "TestLShellUTF8DeliveryCases" in "tools"
    Then the UTF8 regression must have run and passed
    # Required test: empty, ASCII, valid multibyte and malformed strings, with sizes
    # 16383, 16384, 16385; invalid replacement expansion must still respect 16384.
    # Assert valid UTF-8, U+FFFD replacement, idempotence, valid fitting bytes unchanged,
    # and unchanged valid-text first-4096/head-tail omission semantics.

  Scenario: Shell multibyte and cut results preserve existing behavior
    When I run UTF8 regression "TestLShellUTF8ValidAndCutRequest" in "conformance"
    Then the UTF8 regression must have run and passed
    # Required test: real shell prints valid Δ🙂 text fitting the bound, then oversized
    # valid text. Include status prefix in expected output. Observe second provider
    # request before serialization and decoded wire text. Fitting bytes match exactly;
    # oversized output keeps the prior 4096-byte head, suffix and exact omission count.
