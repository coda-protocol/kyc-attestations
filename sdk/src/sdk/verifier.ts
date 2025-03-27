// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import {
  DEFAULT_ISSUER_CACHE_DURATION_MS,
  ISSUER_REGISTRY_ID,
  ISSUER_REGISTRY_STRUCT_NAME,
  KYC_ATTESTATION_STRUCT_NAME,
  PACKAGE_ID,
} from "./constants";
import { KycVerificationResult, KycVerificationStatus } from "./types";

export interface SynthVerifierOptions {
  /** An initialized SuiClient instance connected to the desired network (testnet, mainnet, etc.). */
  suiClient: SuiClient;
  /** Optional: Duration in milliseconds to cache the authorized issuer list. Defaults to 5 minutes. */
  issuerCacheDurationMs?: number;
}

export class SynthVerifier {
  readonly client: SuiClient;
  readonly packageId: string;
  readonly issuerRegistryId: string;

  readonly kycAttestationType: string;
  readonly issuerRegistryType: string;

  private cacheDurationMs: number;
  private authorizedIssuers: Set<string> | null = null;
  private lastIssuerFetchTime: number = 0;

  constructor(options: SynthVerifierOptions) {
    if (!options?.suiClient) {
      throw new Error("SynthVerifier: Requires a valid instance of SuiClient");
    }

    this.client = options.suiClient;
    this.packageId = PACKAGE_ID;
    this.issuerRegistryId = ISSUER_REGISTRY_ID;

    this.kycAttestationType = `${this.packageId}::${KYC_ATTESTATION_STRUCT_NAME}`;
    this.issuerRegistryType = `${this.packageId}::${ISSUER_REGISTRY_STRUCT_NAME}`;

    this.cacheDurationMs =
      options.issuerCacheDurationMs || DEFAULT_ISSUER_CACHE_DURATION_MS;
  }

  private async fetchAuthorizedIssuers(forceRefresh = false) {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.authorizedIssuers &&
      now - this.lastIssuerFetchTime < this.cacheDurationMs
    ) {
      return this.authorizedIssuers;
    }

    console.debug(
      "[SynthVerifier] Fetching authorized issuers from registry..."
    );
    try {
      const registryObject = await this.client.getObject({
        id: this.issuerRegistryId,
        options: { showContent: true },
      });

      console.log(registryObject);

      // @dev: Parse the registry object and extract the list of authorized issuers
    } catch (error) {
      console.error(
        "[SynthVerifier] Error fetching authorized issuers:",
        error
      );
    }
  }

  /**
   * Calls the `get_effective_status` view function on the contract for a specific attestation.
   * @param attestationObjectId - The ID of the KycAttestation object.
   * @returns The effective status string ('Active', 'Expired', 'Revoked') or throws on error.
   * @internal
   */
  private async checkStatus(objectId: string): Promise<string> {
    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${this.packageId}::core::get_effective_status`,
        arguments: [tx.object(objectId), tx.object(SUI_CLOCK_OBJECT_ID)],
      });

      // const result = await this.client.devInspectTransactionBlock({
      //     sender: null,
      //     transactionBlock: tx
      // });

      return "";
    } catch (error) {
      console.error(
        `[SynthVerifier] Error calling get_effective_status for ${objectId}:`,
        error
      );
      throw new Error(`Error checking attestation status: ${error}`);
    }
  }

  async verifyKycStatus(address: string): Promise<KycVerificationResult> {
    // @dev: fetch authorized issuers here to check against later.

    try {
      const res = await this.client.getOwnedObjects({
        owner: address,
        filter: { StructType: this.kycAttestationType },
        options: { showContent: true, showType: true, showOwner: true },
      });

      console.debug(
        `[SynthVerifier] Found ${res.data.length} potential KYC objects.`
      );

      if (res.data.length === 0) {
        return {
          status: KycVerificationStatus.NotVerified,
          details: "No KYC attestations found for this address.",
        };
      }

      // placeholder
      return {
        status: KycVerificationStatus.Verified,
        details: "KYC verified.",
      };

      // todo;
    } catch (error) {
      console.error(
        `[SynthVerifier] Error fetching KYC attestations for ${address}:`,
        error
      );
      return {
        status: KycVerificationStatus.Error,
        details: `SDK Error: ${error}`,
      };
    }
  }
}
