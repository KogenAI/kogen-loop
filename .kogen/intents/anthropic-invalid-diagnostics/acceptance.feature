Feature: Explain invalid native Anthropic streams without changing outcomes
  Background:
    Given the invalid Anthropic matrix is:
      """
      {
        "invalid_legacy": {
          "Provider":"d82e74579e47ca29d2a68a057386e572cae9eacc80e8ee7370621e9416b941a3",
          "Direct":"2377eb1e6d655121efc194c4009c795aed2e9b00c87b1b28775ca02aa6c7282f",
          "Session":"603d9cc4947c4754d42184c62faad0fa9a74f2a330befef6c65b27666b9bf111",
          "CLI":"0b26d0f4e866e988ce26f5fa1c6faed875a8b19661cf2ea2b4d7a5f2431f9453"
        },
        "invalid": [
          {"name":"overloaded","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"overloaded_error"}},
          {"name":"api","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"api_error"}},
          {"name":"error_alone","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"overloaded_error"}},
          {"name":"max_tokens","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"non_success_stop","stop_reason":"max_tokens"}},
          {"name":"blank","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"empty_result","stop_reason":"end_turn"}},
          {"name":"delta","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"unsupported_delta","delta_type":"citations_delta"}},
          {"name":"block","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"unsupported_block","block_type":"server_tool_use"}},
          {"name":"unknown_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"unknown"}},
          {"name":"typed_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"unknown"}},
          {"name":"missing_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"unknown"}},
          {"name":"err_invalid_request_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"invalid_request_error"}},
          {"name":"err_authentication_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"authentication_error"}},
          {"name":"err_billing_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"billing_error"}},
          {"name":"err_permission_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"permission_error"}},
          {"name":"err_not_found_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"not_found_error"}},
          {"name":"err_request_too_large","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"request_too_large"}},
          {"name":"err_rate_limit_error","facades":["Provider"],"diagnostic":{"anthropic_invalid":"sse_error","error_type":"rate_limit_error"}},
          {"name":"refusal","facades":["Provider"],"diagnostic":{"anthropic_invalid":"non_success_stop","stop_reason":"refusal"}},
          {"name":"pause_turn","facades":["Provider"],"diagnostic":{"anthropic_invalid":"non_success_stop","stop_reason":"pause_turn"}},
          {"name":"stop_sequence","facades":["Provider"],"diagnostic":{"anthropic_invalid":"non_success_stop","stop_reason":"stop_sequence"}},
          {"name":"unknown_stop","facades":["Provider"],"diagnostic":{"anthropic_invalid":"non_success_stop","stop_reason":"unknown"}},
          {"name":"typed_stop","facades":["Provider"],"diagnostic":{"anthropic_invalid":"non_success_stop","stop_reason":"unknown"}},
          {"name":"changed_stop","facades":["Provider"],"diagnostic":{"anthropic_invalid":"changed_stop_reason","stop_reason":"tool_use"}},
          {"name":"blank_tool","facades":["Provider"],"diagnostic":{"anthropic_invalid":"empty_result","stop_reason":"tool_use"}},
          {"name":"whitespace","facades":["Provider"],"diagnostic":{"anthropic_invalid":"empty_result","stop_reason":"end_turn"}},
          {"name":"unknown_delta","facades":["Provider"],"diagnostic":{"anthropic_invalid":"unsupported_delta","delta_type":"unknown"}},
          {"name":"typed_delta","facades":["Provider"],"diagnostic":{"anthropic_invalid":"unsupported_delta","delta_type":"unknown"}},
          {"name":"wrong_delta","facades":["Provider"],"diagnostic":{"anthropic_invalid":"unsupported_delta","delta_type":"signature_delta"}},
          {"name":"unknown_block","facades":["Provider"],"diagnostic":{"anthropic_invalid":"unsupported_block","block_type":"unknown"}},
          {"name":"typed_block","facades":["Provider"],"diagnostic":{"anthropic_invalid":"unsupported_block","block_type":"unknown"}},
          {"name":"index","facades":["Provider"],"diagnostic":{"anthropic_invalid":"ordering_or_shape"}},
          {"name":"order","facades":["Provider"],"diagnostic":{"anthropic_invalid":"ordering_or_shape"}},
          {"name":"shape","facades":["Provider"],"diagnostic":{"anthropic_invalid":"ordering_or_shape"}},
          {"name":"after_stop","facades":["Provider"],"diagnostic":{"anthropic_invalid":"event_after_stop"}},
          {"name":"frame_json","facades":["Provider"],"diagnostic":{"anthropic_invalid":"frame_json_or_shape"}},
          {"name":"frame_shape","facades":["Provider"],"diagnostic":{"anthropic_invalid":"frame_json_or_shape"}},
          {"name":"tool_json","facades":["Provider"],"diagnostic":{"anthropic_invalid":"tool_input_json"}},
          {"name":"usage","facades":["Provider"],"diagnostic":{"anthropic_invalid":"invalid_usage_shape"}},
          {"name":"duplicate","facades":["Provider"],"diagnostic":{"anthropic_invalid":"duplicate_tool_id"}},
          {"name":"tool_id","facades":["Provider"],"diagnostic":{"anthropic_invalid":"invalid_block","block_type":"tool_use"}},
          {"name":"tool_name","facades":["Provider"],"diagnostic":{"anthropic_invalid":"invalid_block","block_type":"tool_use"}},
          {"name":"tool_input","facades":["Provider"],"diagnostic":{"anthropic_invalid":"invalid_block","block_type":"tool_use"}},
          {"name":"signature","facades":["Provider"],"diagnostic":{"anthropic_invalid":"invalid_block","block_type":"thinking"}},
          {"name":"privacy","facades":["Provider","Direct","Session","CLI"],"diagnostic":{"anthropic_invalid":"unsupported_block","block_type":"server_tool_use"}}
        ],
        "controls": [
          {"name":"text","facades":["Provider","Direct","Session","CLI"],"legacy":{"Provider":"8219814b4cf82640dcfac545b48842ccd6c18d0ab01bf4b57acf383dc758a49a","Direct":"65e0c289af84280f6171203605f2c61ab4ea6cf55f677c59b5455f4dad157939","Session":"9d0cdb53707f0df3aa1873d4139ee0d49fdc26be2500fd273e79328c1c66b2e1","CLI":"4e239e464388a55b212db809c4bba7372e92f5f0942dc0c64f3b90dad7dd76f9"}},
          {"name":"tool","facades":["Provider"],"legacy":{"Provider":"e6adcad9229a9bd02ecea0917fc429dcd8a4f340282dbc60e08bbdcf08328b8e"}},
          {"name":"end_tool","facades":["Provider"],"legacy":{"Provider":"0d438693df7e225feb797498c2a1744c9c5e0e1f555a3ffe0a5408132853da22"}},
          {"name":"cut","facades":["Provider"],"legacy":{"Provider":"aa65678459cbe018b02279a605100cdda9346cff6fd4dfbf2ef9cd9f9d50d6cb"}},
          {"name":"cut_json","facades":["Provider"],"legacy":{"Provider":"aa65678459cbe018b02279a605100cdda9346cff6fd4dfbf2ef9cd9f9d50d6cb"}},
          {"name":"cut_exhaust","facades":["Provider"],"legacy":{"Provider":"2d1f4167d1273b6137daa49316128ab73f58399df4e78d0ab6f90010874fd002"}},
          {"name":"http429529","facades":["Provider"],"legacy":{"Provider":"a484b0abde9ee140db2945f1c46a4b46b2f04643c775dfa2edf14d43f23e0a66"}},
          {"name":"http5xx","facades":["Provider"],"legacy":{"Provider":"dff161f0bd0a558d42545a05e87c8733db4b344f2e99d82ff23227420b790348"}},
          {"name":"http400","facades":["Provider"],"legacy":{"Provider":"e38495ef41f2cdc9c3a2b5c093c0eb6273bf0f532359b468363e50bfc98b5448"}},
          {"name":"http401","facades":["Provider"],"legacy":{"Provider":"7f8382db122a2e8cc3efaf36dc464268e11b1fba2e078a55e7c06bede8694081"}},
          {"name":"context","facades":["Provider"],"legacy":{"Provider":"210de494148f671efba9639d1cfd6e3cd53b7571e943398f7b10d76be02a73b7"}},
          {"name":"interrupt","facades":["Provider"],"legacy":{"Provider":"773e2fb7923d0ed017a019de649e765b48f7e0502c51c8edad52c3754b2d8043"}},
          {"name":"other_chatgpt","facades":["Provider"],"legacy":{"Provider":"f28325317b9d17da070145708d8df1b479cd0c7988812da458ca134d55b28ec1"}},
          {"name":"other_chatgpt_single","facades":["Provider"],"legacy":{"Provider":"85bab8fdf0252ff7838bbd32cfd47aa88e14c8bd3f48b30a3a87bfa2b3121f38"}},
          {"name":"other_supergrok","facades":["Provider"],"legacy":{"Provider":"a6237ad72222ed1305c5d1d2bd8c2a6710d5d4565ea89c3a8bc5d34c576ca495"}},
          {"name":"other_opencode-go","facades":["Provider"],"legacy":{"Provider":"0fa2ebc895beb5aff8cb3a137254874fc01544df6fb974dc93fe72ca59723704"}},
          {"name":"other_openai-compatible","facades":["Provider"],"legacy":{"Provider":"1f6c11d97c7c65b609011bd2cfc22cf581cf046a02c880f447c1f4cd43f23e49"}}
        ]
      }
      """

  Scenario Outline: Observe distinct allowlisted diagnostics through public facades
    When I collect the "invalid" Anthropic matrix under umask "<mask>"
    Then the invalid Anthropic diagnostics match the matrix
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Independently preserve rejected outcomes and legacy evidence
    When I collect the "invalid" Anthropic matrix under umask "<mask>"
    Then the invalid Anthropic legacy observations match the matrix
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Independently preserve successful transient refusal and other-provider controls
    When I collect the "controls" Anthropic matrix under umask "<mask>"
    Then the invalid Anthropic legacy observations match the matrix
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Preserve complete text tool history and invalid-batch replay behavior
    When I exercise the existing complete Anthropic replay controls under umask "<mask>"
    Then the complete Anthropic replay controls all pass
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario: Preserve original tests goldens provenance configuration and unrelated source
    Then the Anthropic preservation digest is "31a09f8944707777065e692de72275f349a367ed3599b078f992b213a8543fcd"

  Scenario: Document the additive v1 diagnostic contract
    Then the caller contract documents these optional diagnostics:
      """
      ["anthropic_invalid","error_type","stop_reason","block_type","delta_type","unknown","provider_failure","invalid_response","ttft_ms","usage_state"]
      """
