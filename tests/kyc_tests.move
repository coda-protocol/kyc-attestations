// Copyright (c) Coda labs.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module coda_kyc::tests;

use sui::table;
use sui::test_scenario::{Self as ts};
use sui::clock::{Clock};

use coda_kyc::attestation::{
    Self,
    OperatorCap,
    IssuerRegistry,
    RevocationRegistry
};

// === Test Addresses ===
const ADMIN: address = @0xAb;
const ISSUER_1: address = @0xB1;
const ISSUER_2: address = @0xB2;
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
        assert!(issuer_registry.issuer_count() == 0, 0);
        ts::return_shared(issuer_registry);

        let revocation_registry = ts::take_shared<RevocationRegistry>(&scenario);
        assert!(revocation_registry.revoked_count() == 0, 1);
        ts::return_shared(revocation_registry);
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
        assert!(attestation::issuer_count(&registry) == 1, 1);

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
        assert!(attestation::issuer_count(&registry) == 0, 1);

        ts::return_shared(registry);
        ts::return_to_address(ADMIN, cap);
    };

    ts::end(scenario);
}