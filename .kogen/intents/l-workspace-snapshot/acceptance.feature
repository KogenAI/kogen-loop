Feature: The opening round of a small repository carries a bounded workspace snapshot
  In a new Session whose list_files and read_file tools are enabled, a repository of at most
  64 listed paths whose shown files total at most 32768 bytes opens with the unchanged task
  text and one more user message: a fixed header, the exact list_files output and the exact
  read_file output of every listed file of at most 4096 bytes. Any other opening, a resumed
  round and every later request are unchanged.

  Scenario: A small repository opens with the task, then the exact list_files and read_file outputs
    When I run the workspace snapshot CLI fixture "small"
    Then the workspace snapshot observations are:
      """
      {"requests":2,"inputItems":2,"userTexts":["fixture task","SNAPSHOT"],"secondUserTexts":["fixture task","SNAPSHOT"],"listingMatchesListFiles":true,"sectionsMatchReadFile":true,"exit":0,"snapshot":"Workspace at the start of the task: the output of list_files, then read_file of every listed file of up to 4096 bytes (larger or binary files are listed only). Files you change later are not updated here.\n\nlist_files:\n\"caf\\303\\251 notes.md\"\nempty.txt\nnotes/todo.txt\n.gitignore\nMakefile\nREADME.md\nsrc/main.go\n\nread_file \"café notes.md\":\n1\tnote\n\nread_file \"empty.txt\":\n\n\nread_file \"notes/todo.txt\":\n1\ttodo\n\nread_file \".gitignore\":\n1\tbuild/\n\nread_file \"Makefile\":\n1\ttest:\n2\t\tgo test ./...\n\nread_file \"README.md\":\n1\t# Demo\n2\t\n3\tRun make.\n\nread_file \"src/main.go\":\n1\tpackage main\n2\t\n3\tfunc main() {}"}
      """

  Scenario: Larger, binary, invalid UTF-8, refused and non-regular files are listed only
    When I run the workspace snapshot CLI fixture "kinds"
    Then the workspace snapshot observations are:
      """
      {"requests":2,"inputItems":2,"userTexts":["fixture task","SNAPSHOT"],"secondUserTexts":["fixture task","SNAPSHOT"],"listingMatchesListFiles":true,"sectionsMatchReadFile":true,"exit":0,"listing":["binary.dat","\"caf\\303\\251 notes.md\"","exact.txt","gone.txt","latin1.txt","lines.txt","link.txt","outside.txt","over.txt","pipe","small.txt"],"shown":["café notes.md","exact.txt","lines.txt","link.txt","small.txt"]}
      """

  Scenario: 64 listed paths get a snapshot and 65 open with the task alone
    When I run the workspace snapshot CLI fixture "paths"
    Then the workspace snapshot observations are:
      """
      {"64":{"requests":2,"inputItems":2,"userTexts":["fixture task","SNAPSHOT"],"secondUserTexts":["fixture task","SNAPSHOT"],"listingMatchesListFiles":true,"sectionsMatchReadFile":true,"exit":0,"listed":64,"shown":["f00.txt","f01.txt","f02.txt","f03.txt","f04.txt","f05.txt","f06.txt","f07.txt","f08.txt","f09.txt","f10.txt","f11.txt","f12.txt","f13.txt","f14.txt","f15.txt","f16.txt","f17.txt","f18.txt","f19.txt","f20.txt","f21.txt","f22.txt","f23.txt","f24.txt","f25.txt","f26.txt","f27.txt","f28.txt","f29.txt","f30.txt","f31.txt","f32.txt","f33.txt","f34.txt","f35.txt","f36.txt","f37.txt","f38.txt","f39.txt","f40.txt","f41.txt","f42.txt","f43.txt","f44.txt","f45.txt","f46.txt","f47.txt","f48.txt","f49.txt","f50.txt","f51.txt","f52.txt","f53.txt","f54.txt","f55.txt","f56.txt","f57.txt","f58.txt","f59.txt","f60.txt","f61.txt","f62.txt","f63.txt"]},"65":{"requests":1,"inputItems":1,"userTexts":["fixture task"],"exit":0}}
      """

  Scenario: Shown files of 32768 bytes get a snapshot and 32769 open with the task alone
    When I run the workspace snapshot CLI fixture "bytes"
    Then the workspace snapshot observations are:
      """
      {"32768":{"requests":2,"inputItems":2,"userTexts":["fixture task","SNAPSHOT"],"secondUserTexts":["fixture task","SNAPSHOT"],"listingMatchesListFiles":true,"sectionsMatchReadFile":true,"exit":0,"listing":["big.txt","k0.txt","k1.txt","k2.txt","k3.txt","k4.txt","k5.txt","k6.txt","k7.txt"],"shown":["k0.txt","k1.txt","k2.txt","k3.txt","k4.txt","k5.txt","k6.txt","k7.txt"]},"32769":{"requests":1,"inputItems":1,"userTexts":["fixture task"],"exit":0}}
      """

  Scenario: Only a non-empty Git repository gets a snapshot
    When I run the workspace snapshot CLI fixture "roots"
    Then the workspace snapshot observations are:
      """
      {"repository":{"requests":2,"inputItems":2,"userTexts":["fixture task","SNAPSHOT"],"secondUserTexts":["fixture task","SNAPSHOT"],"listingMatchesListFiles":true,"sectionsMatchReadFile":true,"exit":0,"listing":["a.txt"],"shown":["a.txt"]},"not-git":{"requests":1,"inputItems":1,"userTexts":["fixture task"],"exit":0},"empty-repo":{"requests":1,"inputItems":1,"userTexts":["fixture task"],"exit":0}}
      """

  Scenario: Only a session with both list_files and read_file gets a snapshot
    When I run the workspace snapshot CLI fixture "tools"
    Then the workspace snapshot observations are:
      """
      {"list_files and read_file":{"requests":2,"inputItems":2,"userTexts":["fixture task","SNAPSHOT"],"secondUserTexts":["fixture task","SNAPSHOT"],"listingMatchesListFiles":true,"sectionsMatchReadFile":true,"exit":0,"shown":["café notes.md","empty.txt","notes/todo.txt",".gitignore","Makefile","README.md","src/main.go"]},"read_file and shell":{"requests":1,"inputItems":1,"userTexts":["fixture task"],"exit":0},"list_files and shell":{"requests":1,"inputItems":1,"userTexts":["fixture task"],"exit":0}}
      """

  Scenario: A resumed round adds no new snapshot
    When I run the workspace snapshot CLI fixture "resume"
    Then the workspace snapshot observations are:
      """
      {"openingUserTexts":["fixture task","SNAPSHOT"],"resumedUserTexts":["fixture task","SNAPSHOT","more feedback"],"resumedRequests":1,"exit":0}
      """
