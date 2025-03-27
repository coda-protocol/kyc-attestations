// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

#[test_only]
module coda_kyc::tests;

use sui::test_scenario::{Self as ts};
use sui::test_utils::{assert_eq};
use sui::clock;

use coda_kyc::attestation::{
    Self,
    OperatorCap,
    IssuerRegistry,
    KycAttestation,
    // Errors
    EIssuerAlreadyExists,
    EIssuerNotFound,
    EIssuerNotAuthorized,
    ENotOriginalIssuer,
    EAttestationAlreadyRevoked
};

// === Test Addresses ===
const ADMIN: address = @0xAb;
const ISSUER_1: address = @0xB1;
const USER_1: address = @0xC1;
const USER_2: address = @0xC2;
const UNAUTHORIZED_USER: address = @0xD;

// === Constants ===
const ONE_DAY_MS: u64 = 24 * 60 * 60 * 1000;
const TWO_DAYS_MS: u64 = 2 * ONE_DAY_MS;

// === Helper ===
fun setup(): ts::Scenario {
    let mut scenario = ts::begin(ADMIN);

    {
        let ctx = ts::ctx(&mut scenario);
        attestation::init_for_testing(ctx);
    };

    scenario
}

// === Tests ===

#[test]
fun test_initalize_result() {
    let mut scenario = setup();

    ts::next_tx(&mut scenario, ADMIN);
    {
        assert!(ts::has_most_recent_for_address<OperatorCap>(ADMIN), 0);
    };

    ts::next_tx(&mut scenario, ADMIN);
    {
        let issuer_registry = ts::take_shared<IssuerRegistry>(&scenario);
        assert!(issuer_registry.test_issuer_count() == 0, 0);
        ts::return_shared(issuer_registry);
    };

    ts::end(scenario);
}

#[test]
fun test_admin_add_remove_issuer_success() {
    let mut scenario = setup();

    // Add the issuer
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));

        assert!(attestation::is_issuer_authorized(&registry, ISSUER_1), 0);
        assert_eq(registry.test_issuer_count(), 1);

        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    // Remove the issuer now
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::remove_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));

        assert!(!attestation::is_issuer_authorized(&registry, ISSUER_1), 0);
        assert_eq(registry.test_issuer_count(), 0);

        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    ts::end(scenario);
}

#[test]
fun test_issue_attestation_success() {
    let mut scenario = setup();
    
    // Add an issuer
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    // Issue an attestation
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        attestation::issue_attestation(&registry, USER_1, ONE_DAY_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
        clock.destroy_for_testing();
    };

    ts::next_tx(&mut scenario, USER_1);
    {
        let attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        assert_eq(attestation.recipient(), USER_1);
        assert_eq(attestation.issuer(), ISSUER_1);
        assert!(attestation.test_is_status_active(), 1);

        ts::return_to_address(USER_1, attestation);
    };

    ts::end(scenario);
}

#[test]
fun test_revoke_attestation_success() {
    let mut scenario = setup();

    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        attestation::issue_attestation(&registry, USER_1, ONE_DAY_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
        clock.destroy_for_testing();
    };

    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let mut attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        assert!(attestation.test_is_status_active(), 1);

        attestation::revoke_attestation(
            &mut attestation,
            ts::ctx(&mut scenario)
        );

        assert!(attestation.test_is_status_revoked(), 1);

        ts::return_to_address(USER_1, attestation);
    };

    ts::end(scenario);
}

#[test]
fun test_get_effective_status() {
    let mut scenario = setup();

    let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

    // Add an issuer
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    // Issue an attestation
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::issue_attestation(&registry, USER_1, ONE_DAY_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
    };

    // Check status of the attestation
    ts::next_tx(&mut scenario, USER_2);
    {
        let attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);
        assert_eq(attestation.test_is_status_active(), true);

        ts::return_to_address(USER_1, attestation);
    };

    // Advance our clock past expiry.
    clock.increment_for_testing(ONE_DAY_MS + 1);

    // Check if our attestation is expired now
    ts::next_tx(&mut scenario, USER_2);
    {
        let attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        let status = attestation.get_effective_status(&clock);
        assert_eq(status.test_is_effective_status_expired(), true);

        ts::return_to_address(USER_1, attestation);
    };

    // Revoke the (already expired) attestation.
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let mut attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        attestation::revoke_attestation(
            &mut attestation,
            ts::ctx(&mut scenario)
        );

        ts::return_to_address(USER_1, attestation);
    };

    // Check status of the attestation
    ts::next_tx(&mut scenario, USER_2);
    {
        let attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        let status = attestation.get_effective_status(&clock);
        assert_eq(status.test_is_effective_status_revoked(), true);

        ts::return_to_address(USER_1, attestation);
    };

    clock.destroy_for_testing();
    ts::end(scenario);
}

#[test]
fun test_get_effective_status_revoked_before_expiry() {
    let mut scenario = setup();

    let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

    // Add an issuer
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    // Issue an attestation for 2 days.
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::issue_attestation(&registry, USER_1, TWO_DAYS_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
    };

    // Advance clock foward by one day, still before expiry
    clock.increment_for_testing(ONE_DAY_MS);

    // Revoke the attestation
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let mut attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        attestation::revoke_attestation(
            &mut attestation,
            ts::ctx(&mut scenario)
        );

        ts::return_to_address(USER_1, attestation);
    };

    // Check the status of the attestation, should be revoked.
    ts::next_tx(&mut scenario, USER_2);
    {
        let attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        let status = attestation.get_effective_status(&clock);
        assert_eq(status.test_is_effective_status_revoked(), true);

        ts::return_to_address(USER_1, attestation);
    };

    // Advance clock by 3 days now
    clock.increment_for_testing(TWO_DAYS_MS + ONE_DAY_MS);

    // Check the status of the attestation, should still be revoked since revocations take priority.
    ts::next_tx(&mut scenario, USER_2);
    {
        let attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);

        let status = attestation.get_effective_status(&clock);
        assert_eq(status.test_is_effective_status_revoked(), true);

        ts::return_to_address(USER_1, attestation);
    };

    clock.destroy_for_testing();
    ts::end(scenario);
}

// === Expected Failures ===
#[test]
#[expected_failure(abort_code = EIssuerAlreadyExists)]
fun test_admin_add_existing_issuer_fails() {
    let mut scenario = setup();

    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = EIssuerNotFound)]
fun test_admin_remove_nonexistent_issuer_fails() {
    let mut scenario = setup();

    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::remove_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));
        
        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = EIssuerNotAuthorized)]
fun test_unauthorized_issue_attestation_fails() {
    let mut scenario = setup();

    ts::next_tx(&mut scenario, UNAUTHORIZED_USER);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        attestation::issue_attestation(&registry, USER_1, ONE_DAY_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
        clock.destroy_for_testing();
    };

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = ENotOriginalIssuer)]
fun test_revoke_attestation_by_non_issuer_fails() {
    let mut scenario = setup();

    // Add the issuer
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));

        assert!(attestation::is_issuer_authorized(&registry, ISSUER_1), 0);
        assert_eq(registry.test_issuer_count(), 1);

        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    // Issue an attestation to user
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        attestation::issue_attestation(&registry, USER_1, ONE_DAY_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
        clock.destroy_for_testing();
    };

    // An unauthorized user tries to revoke
    ts::next_tx(&mut scenario, UNAUTHORIZED_USER);
    {
        let mut attestation = ts::take_from_address(&scenario, USER_1);

        attestation::revoke_attestation(&mut attestation, ts::ctx(&mut scenario));

        ts::return_to_address(USER_1, attestation);
    };

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = EAttestationAlreadyRevoked)]
fun test_revoke_already_revoked_attestation_fails() {
    let mut scenario = setup();

    // Add the issuer
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_address<OperatorCap>(&scenario, ADMIN);
        let mut registry = ts::take_shared<IssuerRegistry>(&scenario);

        attestation::add_issuer(&cap, &mut registry, ISSUER_1, ts::ctx(&mut scenario));

        assert!(attestation::is_issuer_authorized(&registry, ISSUER_1), 0);
        assert_eq(registry.test_issuer_count(), 1);

        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    // Issue an attestation to user
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let registry = ts::take_shared<IssuerRegistry>(&scenario);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        attestation::issue_attestation(&registry, USER_1, ONE_DAY_MS, option::none(), &clock, ts::ctx(&mut scenario));

        ts::return_shared(registry);
        clock.destroy_for_testing();
    };

    // Revoke the attestation
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let mut attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);
        attestation::revoke_attestation(&mut attestation, ts::ctx(&mut scenario));
        ts::return_to_address(USER_1, attestation);
    };

    // Issuer tries to revoke again
    ts::next_tx(&mut scenario, ISSUER_1);
    {
        let mut attestation = ts::take_from_address<KycAttestation>(&scenario, USER_1);
        assert_eq(attestation.test_is_status_revoked(), true);

        attestation::revoke_attestation(&mut attestation, ts::ctx(&mut scenario));
        ts::return_to_address(USER_1, attestation);
    };

    ts::end(scenario);
}

