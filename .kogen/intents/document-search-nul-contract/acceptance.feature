Feature: Correct the documented search_text NUL behavior
  This feature corrects evidence ev-98b04ef0 without changing search_text behavior or tests.

  Scenario: Describe refusal without changing unrelated search claims
    Given document-search-nul-contract: the caller contract is available
    Then document-search-nul-contract: it preserves these search claims
      """
      Go's `regexp.Compile` (RE2 syntax, case-sensitive, no flags)
      `\b`, `\d`, `\s`, `\w`, alternation and classes mean the same on every host
      a pattern RE2 cannot express (a backreference, a lookaround, `\Z`) returns `error: invalid pattern: <reason>`
      `grep -z -n -I -E --untracked -e "" -- [pathspec]`
      parses each record `<path>NUL<line number>NUL<text>LF`
      keeps the records whose `<text>` (the line without its LF) the pattern matches
      prints `<rendered path>:<number>:<text>` lines joined with `\n`
      status 1, or no kept record, is `(no matches)`
      inclusion rules (tracked and untracked files, not ignored ones), Git's order, deduplication, root containment, pathspec handling
      the 16384-byte bound at delivery
      """
    Then document-search-nul-contract: it documents NUL refusal with error "error: pattern contains a NUL character" and classification "git_failed"
    Then document-search-nul-contract: it does not claim patterns are cut at the first NUL
    Then document-search-nul-contract: the error kind table includes NUL patterns under "git_failed"
