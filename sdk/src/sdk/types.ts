// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

import { SuiClient } from "@mysten/sui/client";

/**
 * Represents the possible outcomes of a KYC verification check.
 */
export enum KycVerificationStatus {
    /** User has a valid, active attestation from an authorized issuer, owned by the correct recipient. */
    Verified = "Verified",
    /** No attestation object found for the user from an authorized issuer. */
    NotVerified = "NotVerified",
    /** Attestation found, but it has expired based on its expiration timestamp. */
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
    status: KycVerificationStatus;
    details: string;
    attestation?: {
        objectId: string;
        issuer: string;
        recipient: string;
        currentOwner?: string;
        issuedAt: Date;
        expiresAt: Date | null;
        statusRaw: string; // The raw internal on-chain status ('Active' or 'Revoked')
    };
}
