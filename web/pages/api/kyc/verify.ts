import { NextApiRequest, NextApiResponse } from "next";
import { KycVerificationResult, KycVerificationStatus } from "@/types/kyc";
import { suiClient } from "@/lib/sui-client";
import { checkOnChainStatus } from "@/lib/kyc";
import { KYC_ATTESTATION_TYPE } from "@/constants";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const statusPriority = {
    [KycVerificationStatus.Verified]: 5,
    [KycVerificationStatus.Expired]: 4,
    [KycVerificationStatus.Revoked]: 3,
    [KycVerificationStatus.Invalid]: 2,
    [KycVerificationStatus.NotVerified]: 1,
    [KycVerificationStatus.Error]: 0,
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<KycVerificationResult | { error: string }>
) {
    console.log("we here");

    // Auth
    const apiKey = req.headers["x-api-key"] as string;
    console.log(apiKey);
    // todo;

    // rate limit / quota check

    // validation
    let verificationResult: KycVerificationResult;

    const { address } = req.body;
    if (!address || !isValidSuiAddress(normalizeSuiAddress(address))) {
        return res.status(400).json({
            status: KycVerificationStatus.Error,
            details:
                "Invalid Sui address provided. Please check the address and try again.",
        });
    }

    try {
        const res = await suiClient.getOwnedObjects({
            owner: address,
            filter: { StructType: KYC_ATTESTATION_TYPE },
            options: { showContent: true, showType: true, showOwner: true },
        });

        if (res.data.length === 0) {
            verificationResult = {
                status: KycVerificationStatus.NotVerified,
                details: "No KYC attestations found for this address.",
            };
        }

        let bestResult: KycVerificationResult = {
            status: KycVerificationStatus.NotVerified,
            details: "No valid KYC attestation found.",
        };

        for (const obj of res.data) {
            if (!obj.data || obj.data.content?.dataType !== "moveObject")
                continue;

            const objectId = obj.data.objectId;
            const attestationData = obj.data.content.fields as any;
            const recipient = attestationData.recipient;

            // check if we have ownership information and if it has the correct properties.
            // otherwise, we just skip non-address owned objects.
            const ownerInfo = obj.data.owner;
            let currentOwner: string | undefined;

            if (
                ownerInfo &&
                typeof ownerInfo === "object" &&
                "AddressOwner" in ownerInfo
            ) {
                currentOwner = ownerInfo.AddressOwner;
            } else {
                continue;
            }

            const attestationDetails = {
                objectId,
                issuer: attestationData.issuer,
                recipient,
                currentOwner,
                issuedAt: new Date(
                    Number(attestationData.issuance_timestamp_ms)
                ),
                expiresAt:
                    Number(attestationData.expiry_timestamp_ms) > 0
                        ? new Date(Number(attestationData.expiry_timestamp_ms))
                        : null,
                statusRaw:
                    attestationData.status?.variant === "Active"
                        ? "Active"
                        : "Revoked",
            };

            if (currentOwner !== recipient) {
                if (bestResult.status === KycVerificationStatus.NotVerified) {
                    bestResult = {
                        status: KycVerificationStatus.Invalid,
                        details: `Attestation object ${objectId} owner does not match intended recipient.`,
                        attestation: attestationDetails,
                    };
                }

                continue;
            }

            let currentSdkStatus: KycVerificationStatus;
            try {
                const effectiveStatusStr = await checkOnChainStatus(objectId);
                switch (effectiveStatusStr) {
                    case "Active":
                        currentSdkStatus = KycVerificationStatus.Verified;
                        break;
                    case "Expired":
                        currentSdkStatus = KycVerificationStatus.Expired;
                        break;
                    case "Revoked":
                        currentSdkStatus = KycVerificationStatus.Revoked;
                        break;
                    default:
                        throw new Error(
                            `Unknown status string: ${effectiveStatusStr}`
                        );
                }
            } catch (error) {
                console.error(
                    `Failed to get on-chain status for ${objectId}: ${error}`
                );
                currentSdkStatus = KycVerificationStatus.Error;

                // update bestResult only if error is better than current best (e.g., if best is NotVerified)
                if (
                    statusPriority[KycVerificationStatus.Error] >
                    statusPriority[bestResult.status]
                ) {
                    bestResult = {
                        status: KycVerificationStatus.Error,
                        details: `Failed to check on-chain status for potential attestation ${objectId}: ${error}`,
                        attestation: attestationDetails,
                    };
                }
                continue;
            }

            const currentResult: KycVerificationResult = {
                status: currentSdkStatus,
                details: `This user currently has a valid and ${currentSdkStatus.toLowerCase()} KYC attestation.`,
                attestation: attestationDetails,
            };

            // if verified, we're done. otherwise, update bestResult if current is better.
            if (currentResult.status === KycVerificationStatus.Verified) {
                bestResult = currentResult;
                break;
            }

            if (
                statusPriority[currentResult.status] >
                statusPriority[bestResult.status]
            ) {
                bestResult = currentResult;
            }
        }

        verificationResult = bestResult;
    } catch (error) {
        console.error(`A fatal error occured when verifing ${address}`, error);
        return res.status(500).json({
            status: KycVerificationStatus.Error,
            details: `Internal Server Error: ${error || "Verification Failed"}`,
        });
    }

    return res.status(200).json(verificationResult);
}
