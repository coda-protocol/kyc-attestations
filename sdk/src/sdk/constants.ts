// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

/**
 * The deployed Sui Package ID for the KYC Attestation contract.
 * @internal
 */
export const PACKAGE_ID: string =
  "0x671e73719cd1af973f08a5e17af15a18daba452a8fe919a98fa7d44847b61101";

/**
 * The Object ID of the shared IssuerRegistry object.
 * @internal
 */
export const ISSUER_REGISTRY_ID: string =
  "0xb08d60e09f4b5a988f34034a536d9aea30e159c78e708dcae5231d0102baf5e0";

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
