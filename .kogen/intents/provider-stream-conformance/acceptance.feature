Feature: Deliver standalone offline affinity and complete batch coverage
  This test-only continuation closes only findingM-64's six selected gaps.
  New native Go tests exercise the real provider and Direct/Run/Session/CLI boundaries.
  Required cases cannot be replaced by a passing package with no matching tests.
  Negative controls use the same observation checkers as their corresponding positives.
  No production, policy, credential, vendor, pin or runtime changes are authorized.

  Scenario Outline: Verify the refusal and provider-cache restore matrix offline
    Given the provider-stream Go coverage contract is:
      """
      {
        "package":"kogen-loop/provider",
        "suite":"TestProviderStreamAffinity",
        "tests":[
          "TestProviderStreamAffinity/session_id_single_false",
          "TestProviderStreamAffinity/session_id_single_true",
          "TestProviderStreamAffinity/key_unknown_parameter_single_false",
          "TestProviderStreamAffinity/key_unknown_parameter_single_true",
          "TestProviderStreamAffinity/key_unsupported_parameter_single_false",
          "TestProviderStreamAffinity/key_unsupported_parameter_single_true",
          "TestProviderStreamAffinity/key_invalid_parameter_single_false",
          "TestProviderStreamAffinity/key_invalid_parameter_single_true",
          "TestProviderStreamAffinity/negative_controls/extra_session_refusal_request",
          "TestProviderStreamAffinity/negative_controls/missing_affinity_header",
          "TestProviderStreamAffinity/negative_controls/changed_affinity_identity",
          "TestProviderStreamAffinity/negative_controls/changed_retry_body",
          "TestProviderStreamAffinity/negative_controls/key_after_cache_restore"
        ]
      }
      """
    When I execute the provider-stream coverage with umask "<mask>"
    Then every required provider-stream test executes once and passes
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Verify public-loop replay, events and zero invalid-batch effects offline
    Given the provider-stream Go coverage contract is:
      """
      {
        "package":"kogen-loop/conformance",
        "suite":"TestProviderStreamConformance",
        "tests":[
          "TestProviderStreamConformance/ChatGPT_Direct",
          "TestProviderStreamConformance/ChatGPT_CLI_Transcript",
          "TestProviderStreamConformance/Anthropic_Direct_end_turn",
          "TestProviderStreamConformance/Anthropic_Session_end_turn",
          "TestProviderStreamConformance/Anthropic_CLI_end_turn",
          "TestProviderStreamConformance/Anthropic_Session_tool_use",
          "TestProviderStreamConformance/Anthropic_CLI_tool_use",
          "TestProviderStreamConformance/Anthropic_Direct_invalid_later",
          "TestProviderStreamConformance/Anthropic_Session_invalid_later",
          "TestProviderStreamConformance/Anthropic_CLI_invalid_later",
          "TestProviderStreamConformance/negative_controls/missing_retry_header",
          "TestProviderStreamConformance/negative_controls/changed_resume_identity",
          "TestProviderStreamConformance/negative_controls/missing_resumed_key",
          "TestProviderStreamConformance/negative_controls/duplicate_tool_execution",
          "TestProviderStreamConformance/negative_controls/missing_tool_execution",
          "TestProviderStreamConformance/negative_controls/duplicate_assistant_replay",
          "TestProviderStreamConformance/negative_controls/split_tool_results",
          "TestProviderStreamConformance/negative_controls/wrong_tool_result_id",
          "TestProviderStreamConformance/negative_controls/reordered_tool_results",
          "TestProviderStreamConformance/negative_controls/changed_tool_result_content",
          "TestProviderStreamConformance/negative_controls/lost_opaque_block_or_signature",
          "TestProviderStreamConformance/negative_controls/dropped_stop_reason",
          "TestProviderStreamConformance/negative_controls/wrong_end_turn_marker",
          "TestProviderStreamConformance/negative_controls/leaked_invalid_call",
          "TestProviderStreamConformance/negative_controls/leaked_invalid_hook",
          "TestProviderStreamConformance/negative_controls/leaked_invalid_event",
          "TestProviderStreamConformance/negative_controls/leaked_invalid_side_effect",
          "TestProviderStreamConformance/negative_controls/wrong_invalid_attempt_count"
        ]
      }
      """
    When I execute the provider-stream coverage with umask "<mask>"
    Then every required provider-stream test executes once and passes
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario: Preserve the baseline and correct only stale delivery status
    Then only additive offline tests and this README status are delivered:
      """
      At initial adoption, this tree adopted an external reference into a fresh native Build. External extraction history is not native authorship, approval or verification. At that first delivery, no current Kogen consumer, synchronized copy or digest pin was claimed here. No public release, global install, remote push or Kogen synchronization was part of that initial delivery.

      Published and pinned baseline observed on 27 October 2026, when this continuation started: public `origin` (`git@github.com:KogenAI/kogen-loop.git`) `main` was `bbf3fdd6d2e79b96eab6af23bcd6d66212893388`, and Kogen `main` at `bb663a593fb3499c2e3c86ffc27847f8ea0860cc` vendored this module through `cli/third_party/kogen-loop`, pinned in `cli/loop-pin.json` with `source_head` `bbf3fdd6d2e79b96eab6af23bcd6d66212893388`, 88 files and digest `4e1332b9f0aa686d76040466a965a43a5169ba9295631cf7bb9b8f62fb946638`. Later commits reach Kogen only when Kogen updates its own vendored copy and pin. This change does not modify Kogen, its vendored copy or its pin, install anything globally or switch a runtime.
      """
