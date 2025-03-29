// Copyright (c) Coda labs.
// SPDX-License-Identifier: ISC

import { CodaKycOptions, KycVerificationResult, KycVerificationStatus } from "./types";

const DEFAULT_API_BASE_URL = "https://coda.ac/api/kyc/v1";

export class CodaKyc {
    readonly apiKey: string;
    readonly apiBaseUrl: string;

    constructor(options: CodaKycOptions) {
        if (!options?.apiKey) {
            throw new Error("[Coda KYC] You must pass a valid api key, you can get one from the dashboard.");
        }

        this.apiKey = options.apiKey;
        this.apiBaseUrl = options.apiBaseUrl || DEFAULT_API_BASE_URL;

        if (!this.apiKey.trim()) {
            throw new Error("[Coda KYC] The api key field cannot be empty.");
        }
    }

    /**
     * Verifies the KYC status of a user by calling the backend verification service.
     *
     * @param userSuiAddress - The Sui address of the user to verify.
     * @returns A Promise resolving to a KycVerificationResult object from the API.
     */
    async verifyKycStatus(address: string): Promise<KycVerificationResult> {
        const endpoint = `${this.apiBaseUrl}/verify`;

        if (!address || !address.startsWith("0x")) {
            return {
                status: KycVerificationStatus.Error,
                details: "Invalid address provided.",
            };
        }

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "api-key": this.apiKey,
                },
                body: JSON.stringify({ address }),
            });

            let result: KycVerificationResult | { error?: string } | null = null;
            let details: string;

            try {
                result = await response.json();
            } catch (error) {
                details = "An error occured when parsing response. Please try again.";
                return {
                    status: KycVerificationStatus.Error,
                    details,
                };
            }

            if (!response.ok) {
                if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
                    // prioritize the 'error' field if present in the JSON response
                    details = result.error;
                } else if (
                    result &&
                    typeof result === "object" &&
                    "details" in result &&
                    typeof result.details === "string"
                ) {
                    // if no 'error' field, check for 'details' (might be a structured error response like KycVerificationResult)
                    details = result.details;
                } else {
                    // fallback if neither 'error' nor 'details' is found in the parsed JSON
                    details = `API Error: ${response.status} ${response.statusText}.`;
                }

                const status =
                    result &&
                    typeof result === "object" &&
                    "status" in result &&
                    Object.values(KycVerificationStatus).includes(result.status as KycVerificationStatus)
                        ? (result.status as KycVerificationStatus)
                        : KycVerificationStatus.Error;

                return {
                    status,
                    details,
                    attestation: (result as KycVerificationResult)?.attestation,
                };
            }

            if (
                !result ||
                typeof result !== "object" ||
                !("status" in result) ||
                !Object.values(KycVerificationStatus).includes(result.status as KycVerificationStatus)
            ) {
                return {
                    status: KycVerificationStatus.Error,
                    details: "Received invalid status from verification service.",
                };
            }

            return result as KycVerificationResult;
        } catch (error) {
            return {
                status: KycVerificationStatus.Error,
                details: `SDK Error: ${error}`,
            };
        }
    }
}
