Feature: Chat Completions responses are streamed

  This feature checks the Chat Completions route (opencode-go and openai-compatible) against local fixture servers on a simulated clock.

  Scenario: No byte for 60 seconds then three chunks succeeds without an idle timeout
    When chat-completions-streaming: I run the provider test "TestChatStreamSlowFirstChunkSucceeds"
    Then chat-completions-streaming: the provider test ran and passed

  Scenario: Keep-alive comments for 60 seconds then silence end in the idle timeout
    When chat-completions-streaming: I run the provider test "TestChatStreamKeepAlivesAreNotProgress"
    Then chat-completions-streaming: the provider test ran and passed

  Scenario: A first chunk after 40 seconds then no byte for 200 seconds ends in the 180 seconds idle timeout
    When chat-completions-streaming: I run the provider test "TestChatStreamSilenceAfterFirstChunkIsIdle"
    Then chat-completions-streaming: the provider test ran and passed

  Scenario: A host that ignores stream and answers one JSON body is normalized as before
    When chat-completions-streaming: I run the provider test "TestChatStreamPlainJSONBodyIsStillAccepted"
    Then chat-completions-streaming: the provider test ran and passed

  Scenario: A call whose arguments arrive in four fragments is one tool call
    When chat-completions-streaming: I run the provider test "TestChatStreamAssemblesFragmentedArguments"
    Then chat-completions-streaming: the provider test ran and passed

  Scenario: The request asks for a stream and adds only stream_options
    When chat-completions-streaming: I run the provider test "TestChatStreamRequestBody"
    Then chat-completions-streaming: the provider test ran and passed
