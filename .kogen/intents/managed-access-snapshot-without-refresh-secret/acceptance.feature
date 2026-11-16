Feature: Managed access snapshots without refresh secrets
  This feature covers a local-fixture-only managed credential mode of the native ChatGPT provider.

  Scenario: Managed snapshot is accepted and invalid material is refused before dispatch
    When managed-access-snapshot-without-refresh-secret: I run the managed driver test "TestManagedAccessAcceptedAndRefused"
    Then managed-access-snapshot-without-refresh-secret: the driver test ran and passed

  Scenario: Expiry and rejection stop with owner refresh required and later snapshots resume
    When managed-access-snapshot-without-refresh-secret: I run the managed driver test "TestManagedExpiryRejectionAndResume"
    Then managed-access-snapshot-without-refresh-secret: the driver test ran and passed

  Scenario: Shared read-only snapshot under atomic replacement
    When managed-access-snapshot-without-refresh-secret: I run the managed driver test "TestManagedSharedSnapshotConcurrency"
    Then managed-access-snapshot-without-refresh-secret: the driver test ran and passed

  Scenario: Offline status distinguishes managed from interactive credentials
    When managed-access-snapshot-without-refresh-secret: I run the managed driver test "TestManagedStatusIsOfflineAndLocal"
    Then managed-access-snapshot-without-refresh-secret: the driver test ran and passed

  Scenario: Caller contract documents the managed credential contract
    When managed-access-snapshot-without-refresh-secret: I read the caller contract
    Then managed-access-snapshot-without-refresh-secret: it documents the managed file contract, freshness and identity checks, the single refresh owner, the failure and resume path and the local status limit
