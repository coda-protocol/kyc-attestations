// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import {
    ISSUER_REGISTRY_ID,
    ISSUER_REGISTRY_STRUCT_NAME,
    KYC_ATTESTATION_STRUCT_NAME,
    PACKAGE_ID,
    ZERO_ADDRESS,
} from "./constants";
import { KycVerificationResult, KycVerificationStatus } from "./types";

export interface CodaKycOptions {
    /** An initialized SuiClient instance connected to the desired network (testnet, mainnet, etc.). */
    suiClient: SuiClient;
}

export class CodaKyc {
    readonly client: SuiClient;
    readonly packageId: string;
    readonly issuerRegistryId: string;

    readonly kycAttestationType: string;
    readonly issuerRegistryType: string;

    constructor(options: CodaKycOptions) {
        if (!options?.suiClient) {
            throw new Error(
                "[Coda KYC] You must pass a valid instance of SuiClient"
            );
        }

        this.client = options.suiClient;
        this.packageId = PACKAGE_ID;
        this.issuerRegistryId = ISSUER_REGISTRY_ID;

        this.kycAttestationType = `${this.packageId}::${KYC_ATTESTATION_STRUCT_NAME}`;
        this.issuerRegistryType = `${this.packageId}::${ISSUER_REGISTRY_STRUCT_NAME}`;
    }

    /**
     * Calls the `get_effective_status` view function on the contract for a specific attestation.
     * @param objectId - The ID of the KycAttestation object.
     * @returns The effective status string ('Active', 'Expired', 'Revoked') or throws on error.
     * @internal
     */
    private async checkStatus(objectId: string): Promise<string> {
        try {
            const tx = new Transaction();

            tx.moveCall({
                target: `${this.packageId}::core::get_effective_status`,
                arguments: [
                    tx.object(objectId),
                    tx.object(SUI_CLOCK_OBJECT_ID),
                ],
            });

            const result = await this.client.devInspectTransactionBlock({
                sender: ZERO_ADDRESS,
                transactionBlock: tx,
            });

            if (result.effects.status.status !== "success") {
                throw new Error(
                    `devInspect failed: ${
                        result.effects.status.error || "Unknown Error"
                    }`
                );
            }

            const returnValue = result.results?.[0]?.returnValues?.[0];
            if (!returnValue) {
                throw new Error(
                    "Could not parse return values from get_effective_status."
                );
            }

            // decode the bcs bytes for the KycEffectiveStatus enum
            const returnType = `${this.packageId}::core::KycEffectiveStatus`;
            if (returnValue[1] !== returnType) {
                throw new Error(`Unexpected return type: ${returnValue[1]}`);
            }

            const statusIndex = returnValue[0][0];
            if (statusIndex === 0) return "Active";
            if (statusIndex === 1) return "Expired";
            if (statusIndex === 2) return "Revoked";

            throw new Error(`Unknown status index returned: ${statusIndex}`);
        } catch (error) {
            console.error(
                `[Coda KYC] Error calling get_effective_status for ${objectId}:`,
                error
            );
            throw new Error(`Error checking attestation status: ${error}`);
        }
    }

    /**
     * Verifies the KYC status of a user by checking their owned KycAttestation objects.
     * Performs checks for ownership validity (owner == recipient), and on-chain status (Active/Expired/Revoked).
     *
     * @param address - The address of the user to verify.
     * @returns A Promise resolving to a KycVerificationResult object.
     */
    async verifyKycStatus(address: string): Promise<KycVerificationResult> {
        try {
            const res = await this.client.getOwnedObjects({
                owner: address,
                filter: { StructType: this.kycAttestationType },
                options: { showContent: true, showType: true, showOwner: true },
            });

            if (res.data.length === 0) {
                return {
                    status: KycVerificationStatus.NotVerified,
                    details: "No KYC attestations found for this address.",
                };
            }

            let result: KycVerificationResult = {
                status: KycVerificationStatus.NotVerified,
                details:
                    "No valid KYC attestation found from an authorized issuer.",
            };

            for (const obj of res.data) {
                // @dev basic validation of the object structure before we begin
                if (
                    !obj.data ||
                    obj.data.content?.dataType !== "moveObject" ||
                    obj.data.content.type !== this.kycAttestationType
                ) {
                    console.warn(
                        "Skipping an unexpected object structure:",
                        obj.data?.objectId
                    );
                    continue;
                }

                const data = obj.data.content.fields as any;
                const objectId = obj.data.objectId;
                const recipient = data.recipient;

                // @dev check if we have ownership information and if it has the correct properties.
                const ownerInfo = obj.data?.owner;
                let currentOwner: string | undefined = undefined;

                if (
                    ownerInfo &&
                    typeof ownerInfo === "object" &&
                    "AddressOwner" in ownerInfo
                ) {
                    currentOwner = ownerInfo.AddressOwner;
                } else {
                    console.warn(
                        `[Coda KYC] Skipping object ${objectId} - could not determine address owner.`,
                        ownerInfo
                    );
                    continue;
                }

                const attestationDetails = {
                    objectId,
                    issuer: data.issuer,
                    recipient,
                    currentOwner,
                    issuedAt: new Date(Number(data.issuance_timestamp_ms)),
                    expiresAt:
                        Number(data.expiry_timestamp_ms) > 0
                            ? new Date(Number(data.expiry_timestamp_ms))
                            : null,
                    statusRaw:
                        data.status?.variant === "Active"
                            ? "Active"
                            : "Revoked",
                };

                // @dev check if our attestation recipient matches the object owner.
                // if it is not then this attestation is now invalid.
                if (currentOwner !== recipient) {
                    console.warn(
                        `[Coda KYC] Object ${objectId} owner (${currentOwner}) does not match recipient (${recipient}). Attestation considered transferred/invalid.`
                    );

                    if (result.status === KycVerificationStatus.NotVerified) {
                        result = {
                            status: KycVerificationStatus.Invalid,
                            details: `Attestation object ${objectId} owner does not match intended recipient.`,
                            attestation: attestationDetails,
                        };
                    }

                    continue;
                }

                // @dev check for the on-chain effective status of the attestation.
                let effectiveStatusStr: string;
                try {
                    effectiveStatusStr = await this.checkStatus(objectId);
                } catch (error) {
                    console.error(
                        `[Coda KYC] Failed to query on-chain status for attestation ${objectId}: ${error}`
                    );

                    if (result.status === KycVerificationStatus.NotVerified) {
                        result = {
                            status: KycVerificationStatus.Error,
                            details: `Failed to query on-chain status for attestation ${objectId}.`,
                        };
                    }

                    continue;
                }

                // @dev map the effective status string from on-chain to the sdk status enum
                let currentStatus: KycVerificationStatus;
                switch (effectiveStatusStr) {
                    case "Active":
                        currentStatus = KycVerificationStatus.Verified;
                        break;
                    case "Expired":
                        currentStatus = KycVerificationStatus.Expired;
                        break;
                    case "Revoked":
                        currentStatus = KycVerificationStatus.Revoked;
                        break;
                    default:
                        console.error(
                            `[Coda KYC] Unknown effective status string ${effectiveStatusStr}`
                        );
                        currentStatus = KycVerificationStatus.Error;
                        if (
                            result.status === KycVerificationStatus.NotVerified
                        ) {
                            result = {
                                status: KycVerificationStatus.Error,
                                details: `Received unknown effective status '${effectiveStatusStr}' for ${objectId}.`,
                            };
                        }
                        continue;
                }

                // @dev construct a result for this specific object
                const currentResult: KycVerificationResult = {
                    status: currentStatus,
                    details: `Attestation ${objectId}: Status is ${currentStatus}`,
                    attestation: attestationDetails,
                };

                // @dev if we already have a verified attestation, we can just stop here.
                if (currentResult.status === KycVerificationStatus.Verified) {
                    return currentResult;
                }

                // @dev if the `currentResult` is better than initial `result` we just swap.
                const statusPriority = {
                    [KycVerificationStatus.Verified]: 5,
                    [KycVerificationStatus.Expired]: 4,
                    [KycVerificationStatus.Revoked]: 3,
                    [KycVerificationStatus.Invalid]: 2,
                    [KycVerificationStatus.NotVerified]: 1,
                    [KycVerificationStatus.Error]: 0,
                };

                if (
                    statusPriority[currentResult.status] >
                    statusPriority[result.status]
                ) {
                    result = currentResult;
                }
            }

            return result;
        } catch (error) {
            console.error(
                `[Coda KYC] Error fetching KYC attestations for ${address}`,
                error
            );
            return {
                status: KycVerificationStatus.Error,
                details: `SDK Error: ${error}`,
            };
        }
    }
}
