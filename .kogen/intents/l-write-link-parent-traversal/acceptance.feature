Feature: write_file follows a link before .. like the filesystem and the reading tools

  # Request case 1: a relative link inside the workspace.
  Scenario: A link followed by .. writes beside the link's target and reads back
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"dirs":["dest/child"],"links":[["link","dest/child"]],"path":"link/../note.txt","read":true,"observe":["dest/note.txt","note.txt"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","read":"1\twritten","files":{"dest/note.txt":"written","note.txt":null}}
      """

  # Request case 2: an absolute link target outside the workspace.
  Scenario: An absolute link target outside the workspace writes beside that target
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"dirs":["$OUT/child"],"links":[["link","$OUT/child"]],"path":"link/../note.txt","observe":["$OUT/note.txt","note.txt"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","files":{"$OUT/note.txt":"written","note.txt":null}}
      """

  # Request case 3: no link before .. keeps today's cleaned location.
  Scenario: A missing folder before .. is written at the cleaned location
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"path":"a/../b.txt","observe":["b.txt","a"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","files":{"b.txt":"written","a":null}}
      """

  Scenario: An existing folder before .. is written at the cleaned location
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"dirs":["sub"],"path":"./sub/../b.txt","read":true,"observe":["b.txt","sub/b.txt"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","read":"1\twritten","files":{"b.txt":"written","sub/b.txt":null}}
      """

  Scenario: Missing folders after a cleaned .. are still created
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"path":"a/../new/b.txt","observe":["new/b.txt","a"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","files":{"new/b.txt":"written","a":null}}
      """

  # Request case 4: protection compares the resolved destination.
  Scenario: A protected resolved destination is refused and unchanged
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"dirs":["dest/child"],"files":{"dest/note.txt":"keep"},"links":[["link","dest/child"]],"protected":["dest/note.txt"],"path":"link/../note.txt","observe":["dest/note.txt","note.txt"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"refused: dest/note.txt is part of the approved acceptance baseline","kind":"protected","files":{"dest/note.txt":"keep","note.txt":null}}
      """

  Scenario: A protected lexical form alone does not refuse a write that resolves elsewhere
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"dirs":["dest/child"],"files":{"note.txt":"keep"},"links":[["link","dest/child"]],"protected":["note.txt"],"path":"link/../note.txt","observe":["dest/note.txt","note.txt"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","files":{"dest/note.txt":"written","note.txt":"keep"}}
      """

  Scenario: A protected path without a link before .. keeps its refusal
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"files":{"b.txt":"keep"},"protected":["b.txt"],"path":"a/../b.txt","observe":["b.txt","a"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"refused: b.txt is part of the approved acceptance baseline","kind":"protected","files":{"b.txt":"keep","a":null}}
      """

  # Request case 5: unresolvable links before .. are file errors that create nothing.
  Scenario: A link loop before .. is a file error
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"links":[["loop","loop"]],"path":"loop/../note.txt","observe":["note.txt","loop"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"error: loop/../note.txt: eloop","kind":"file_error","files":{"note.txt":null,"loop":"<link>"}}
      """

  Scenario: A link to a missing folder before .. is a file error
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"links":[["gone","missing/dir"]],"path":"gone/../note.txt","observe":["note.txt","missing","gone"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"error: gone/../note.txt: enoent","kind":"file_error","files":{"note.txt":null,"missing":null,"gone":"<link>"}}
      """

  # Request case 6: ~ and NUL keep their current results.
  Scenario: A home path is still written in the home folder
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"path":"~/x","observe":["$HOME/x","x"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"ok","kind":"","files":{"$HOME/x":"written","x":null}}
      """

  Scenario: A path with a NUL byte is still a badarg file error
    When l-write-link-parent-traversal: write_file runs on the fixture:
      """
      {"path":"a\u0000b.txt","observe":["a"]}
      """
    Then l-write-link-parent-traversal: the outcome is:
      """
      {"text":"error: a\u0000b.txt: badarg","kind":"file_error","files":{"a":null}}
      """
