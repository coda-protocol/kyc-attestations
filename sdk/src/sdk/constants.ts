// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

/**
 * The deployed Sui Package ID for the KYC Attestation contract.
 * @internal
 */
export const PACKAGE_ID: string =
  "0x33c8b47d704febf97e109a96fd4bc703a291cb309c53ea8592e271767537e6a3";

/**
 * The Object ID of the shared IssuerRegistry object.
 * @internal
 */
export const ISSUER_REGISTRY_ID: string =
  "0x120d5f874dc8deb0ddae92e68ffac57c715ea2faf8ff8e5c39ed6c9e40b17f89";

/**
 * The Struct Type name for the KycAttestation object.
 * @internal
 */
export const KYC_ATTESTATION_STRUCT_NAME: string = "core::KycAttestation";

/**
 * The Struct Type name for the IssuerRegistry object.
 * @internal
 */
export const ISSUER_REGISTRY_STRUCT_NAME: string = "core::IssuerRegistry";

/**
 * Default cache duration for fetched issuer list (in milliseconds). 5 minutes.
 * @internal
 */
export const DEFAULT_ISSUER_CACHE_DURATION_MS: number = 5 * 60 * 1000;

/*
 * Zero address used for read-only devInspect calls.
 * @internal
 */
export const ZERO_ADDRESS: string = "0x0000000000000000000000000000000000000000000000000000000000000000";