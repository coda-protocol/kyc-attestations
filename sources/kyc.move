// Copyright (c) Coda labs.
// SPDX-License-Identifier: Apache-2.0

/// # KYC Attestation
/// 
/// This module provides a system for issuing and managing non-transferable
/// KYC (Know Your Customer) attestations on the Sui network.
/// 
/// ## Core Concepts:
/// *   **Issuer Registry:** A shared `Table` managed by an Operator, listing authorized addresses
///     that can issue KYC attestations.
/// *   **Operator Capability:** An `OperatorCap` object, initially given to the deployer, required
///     to manage the `IssuerRegistry`.
/// *   **KYC Attestation:** A `KycAttestation` object representing proof of KYC for a specific
///     `recipient`. It is issued by an authorized `issuer`, has an optional expiry,
///     and can be `Revoked`.
/// *   **Non-Transferable:** Once issued, the `KycAttestation` object is frozen using
///     `transfer::public_freeze_object`, preventing the recipient or anyone else from
///     transferring it.
/// *   **Status Check:** A view function `get_effective_status` allows anyone to check the
///     current validity of an attestation, considering its status and expiry.
///
/// ## Flow:
/// 1.  Deployer initializes the module, receiving the `OperatorCap` and sharing the `IssuerRegistry`.
/// 2.  Admin uses `OperatorCap` to add authorized issuer addresses to the `IssuerRegistry`.
/// 3.  An authorized issuer calls `issue_attestation`, providing the recipient address and
///     expiry details. This creates a `KycAttestation` object.
/// 4.  The newly created `KycAttestation` object is frozen and transferred to the recipient.
/// 5.  The original issuer can call `revoke_attestation` to invalidate the object.
/// 6.  Anyone can call `get_effective_status` on a `KycAttestation` object ID to check if it's
///     currently considered Active, Expired, or Revoked.
///
module coda_kyc::attestation;

use sui::event;
use sui::clock::{Clock};
use sui::table::{Self, Table};

// === Errors ===

/// The specified address is already registered as an issuer.
const EIssuerAlreadyExists: u64 = 1;
/// The specified address is not found in the issuer registry.
const EIssuerNotFound: u64 = 2;
/// The caller is not authorized to issue attestations.
const EIssuerNotAuthorized: u64 = 3;
/// The caller is not the original issuer of this attestation.
const ENotOriginalIssuer: u64 = 4;

// === Events ===

public struct KycIssued has copy, drop {
    object_id: ID,
    recipient: address,
    issuer: address,
    expiry_timestamp_ms: u64
}

public struct KycRevoked has copy, drop {
    object_id: ID,
    issuer: address
}

public struct IssuerRegistryUpdated has copy, drop {
    admin: address,
    issuer_affected: address,
    added: bool
}

// === Enumerators ===

/// Represents the on-chain status of the attestation.
public enum KycStatusInternal has copy, store, drop {
    Active,
    Revoked
}

/// Represents the effective status when checked against the current time.
/// Returned by `get_effective_status`
public enum KycEffectiveStatus {
    Active,
    Expired,
    Revoked
}

// === Structs ===

/// Capability granting operator rights over the `IssuerRegistry`.
public struct OperatorCap has key, store {
    id: UID
}

public struct IssuerRegistry has key {
    id: UID,
    issuers: Table<address, bool>
}

/// Shared registry containing ID's of revoked `KycAttestations` objects.
/// Key: ID of the revoked `KycAttestations` object.
/// Value: Timestamp (ms) when it was revoked.
public struct RevocationRegistry has key {
    id: UID,
    revoked_attestations: Table<ID, u64>
}

public struct KycAttestation has key, store {
    id: UID,
    recipient: address,
    issuer: address,
    issuance_timestamp_ms: u64,
    expiry_timestamp_ms: u64,
    verification_data_hash: Option<vector<u8>>
}

//

fun init(ctx: &mut TxContext) {
    transfer::transfer(OperatorCap {
        id: object::new(ctx)
    }, ctx.sender());

    transfer::share_object(IssuerRegistry {
        id: object::new(ctx),
        issuers: table::new<address, bool>(ctx)
    });

    transfer::share_object(RevocationRegistry {
        id: object::new(ctx),
        revoked_attestations: table::new<ID, u64>(ctx)
    });
}

// === Admin Functions ===

public entry fun add_issuer(
    _: &OperatorCap,
    registry: &mut IssuerRegistry,
    issuer: address,
    ctx: &mut TxContext
) {
    assert!(!table::contains(&registry.issuers, issuer), EIssuerAlreadyExists);

    table::add(&mut registry.issuers, issuer, true);

    event::emit(IssuerRegistryUpdated {
        admin: ctx.sender(),
        issuer_affected: issuer,
        added: true
    });
}

public entry fun remove_issuer(
    _: &OperatorCap,
    registry: &mut IssuerRegistry,
    issuer: address,
    ctx: &TxContext
) {
    assert!(table::contains(&registry.issuers, issuer), EIssuerNotFound);

    // Remove the issuer; the boolean value is discarded.
    let _ = table::remove(&mut registry.issuers, issuer);

    event::emit(IssuerRegistryUpdated {
        admin: ctx.sender(),
        issuer_affected: issuer,
        added: false
    });
}

// === Issuer Functions ===

/// Issues a new, non-transferable `KycAttestation` object to a recipient.
/// Can only be called by an address present in the `IssuerRegistry`.
public entry fun issue_attestation(
    registry: &IssuerRegistry,
    recipient: address,
    expiry_offset_ms: u64,
    verification_data_hash: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let issuer = ctx.sender();
    assert!(table::contains(&registry.issuers, issuer), EIssuerNotAuthorized);

    let current_time_ms = clock.timestamp_ms();
    let expiry_timestamp_ms = if (expiry_offset_ms > 0) {
        current_time_ms + expiry_offset_ms
    } else {
        0
    };

    let attestation = KycAttestation {
        id: object::new(ctx),
        recipient,
        issuer,
        issuance_timestamp_ms: current_time_ms,
        expiry_timestamp_ms,
        verification_data_hash
    };

    event::emit(KycIssued {
        object_id: object::id(&attestation),
        recipient,
        issuer,
        expiry_timestamp_ms,
    });

    transfer::public_freeze_object(attestation);
}

/// Revokes an existing `KycAttestation`.
/// Can only be called by the original issuer of the specific attestation.
public entry fun revoke_attestation(
    attestation: &KycAttestation,
    revocation_registry: &mut RevocationRegistry,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let revoker = ctx.sender();
    assert!(revoker == attestation.issuer, ENotOriginalIssuer);

    let attestation_id = object::id(attestation);
    assert!(!table::contains(&revocation_registry.revoked_attestations, attestation_id));

    let revocation_timestamp_ms = clock.timestamp_ms();
    table::add(
        &mut revocation_registry.revoked_attestations,
        attestation_id,
        revocation_timestamp_ms
    );

    event::emit(KycRevoked {
        object_id: attestation_id,
        issuer: revoker
    });
}

// === View Functions ===

/// Checks if a given address is currently authorized in the IssuerRegistry.
public fun is_issuer_authorized(registry: &IssuerRegistry, issuer_address: address): bool {
    table::contains(&registry.issuers, issuer_address)
}

/// Checks if a specific KycAttestation ID is present in the RevocationRegistry.
public fun is_revoked(registry: &RevocationRegistry, id: ID): bool {
    table::contains(&registry.revoked_attestations, id)
}

/// Returns the effective status of the attestation, considering its
/// internal status and expiry time relative to the current time provided by the Clock.
public fun get_effective_status(
    attestation: &KycAttestation,
    revocation_registry: &RevocationRegistry,
    clock: &Clock
): KycEffectiveStatus {
    if (is_revoked(revocation_registry, object::id(attestation))) {
        KycEffectiveStatus::Revoked
    } else {
        let current_time_ms = clock.timestamp_ms();

        if (attestation.expiry_timestamp_ms != 0 && current_time_ms >= attestation.expiry_timestamp_ms) {
            KycEffectiveStatus::Expired
        } else {
            KycEffectiveStatus::Active
        }
    }
}

/// Returns the recipient address stored in the attestation.
public fun recipient(attestation: &KycAttestation): address { attestation.recipient }

/// Returns the issuer address stored in the attestation.
public fun issuer(attestation: &KycAttestation): address { attestation.issuer }

/// Returns the expiry timestamp (ms) stored in the attestation.
public fun expiry_timestamp_ms(attestation: &KycAttestation): u64 { attestation.expiry_timestamp_ms }

/// Returns the optional verification data hash.
public fun verification_data_hash(attestation: &KycAttestation): &Option<vector<u8>> {
    &attestation.verification_data_hash
}

// === Testing Helpers ===

#[test_only]
public(package) fun issuer_count(registry: &IssuerRegistry): u64 {
    table::length(&registry.issuers)
}

#[test_only]
public(package) fun revoked_count(registry: &RevocationRegistry): u64 {
    table::length(&registry.revoked_attestations)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}