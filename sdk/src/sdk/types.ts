// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

import { SuiClient } from "@mysten/sui/client";

/**
 * Configuration options required when instantiating the SynthVerifier.
 */
export interface SynthVerifierOptions {
  /** An initialized SuiClient instance connected to the desired network (testnet, mainnet, etc.). */
  suiClient: SuiClient;
  /** Optional: Duration in milliseconds to cache the authorized issuer list. Defaults to 5 minutes. */
  issuerCacheDurationMs?: number;
}

/**
 * Represents the possible outcomes of a KYC verification check.
 */
export enum KycVerificationStatus {
  /** User has a valid, active attestation from an authorized issuer, owned by the correct recipient. */
  Verified = "Verified",
  /** No attestation object found for the user from an authorized issuer. */
  NotVerified = "NotVerified",
  /** Attestation found, but it has expired based on its timestamp and the Clock. */
  Expired = "Expired",
  /** Attestation found, but its internal status is Revoked. */
  Revoked = "Revoked",
  /** Attestation found, but its current owner does not match the intended recipient therfor invalid. */
  Invalid = "Invalid",
  /** An error occurred during the verification process (RPC error, unexpected data format, etc.). */
  Error = "Error",
}

/**
 * Detailed result of a KYC verification check.
 */
export interface KycVerificationResult {
  /** The overall status of the verification. */
  status: KycVerificationStatus;
  /** Provides more details about the status (e.g., error message, object ID checked). */
  details: string;
  /** If status is Verified, Expired, Revoked, or Invalid, includes details of the checked attestation. */
  attestation?: {
    objectId: string;
    issuer: string;
    recipient: string; // The intended recipient stored inside the object
    currentOwner?: string; // The actual current owner (if available and relevant, e.g., for Transferred status)
    issuedAt: Date;
    expiresAt: Date | null;
    statusRaw: string; // The raw internal status ('Active' or 'Revoked')
  };
}

/**
 * Internal representation of attestation fields for easier access.
 * @internal
 */
export interface KycAttestationFields {
  id: { id: string };
  recipient: string;
  issuer: string;
  issuance_timestamp_ms: string;
  expiry_timestamp_ms: string;
  status: { fields: { name: string } }; // Simple enum structure { fields: { name: "Active" | "Revoked" } }
  verification_data_hash: { fields: { vec: number[] } } | null; // Option<vector<u8>> structure
}
