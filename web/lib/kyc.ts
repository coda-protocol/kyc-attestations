import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { suiClient } from "./sui-client";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, ZERO_ADDRESS } from "@/constants";

/**
 * Calls the `get_effective_status` view function on the KYC contract
 * using devInspectTransactionBlock to determine the current status of an attestation.
 *
 * @param objectId - The Object ID of the KycAttestation to check.
 * @returns A Promise resolving to the status string ("Active", "Expired", "Revoked").
 * @throws If the devInspect call fails or the result cannot be parsed.
 */
export async function checkOnChainStatus(
    objectId: string
): Promise<"Active" | "Expired" | "Revoked"> {
    if (!objectId) {
        throw new Error("Missing required arguments for checkOnChainStatus.");
    }

    const target = `${PACKAGE_ID}::core::get_effective_status`;
    const expectedReturnType = `${PACKAGE_ID}::core::KycEffectiveStatus`;

    try {
        const tx = new Transaction();

        tx.moveCall({
            target,
            arguments: [tx.object(objectId), tx.object(SUI_CLOCK_OBJECT_ID)],
        });

        const result = await suiClient.devInspectTransactionBlock({
            sender: ZERO_ADDRESS,
            transactionBlock: tx,
        });

        if (result.effects.status.status !== "success") {
            throw new Error(
                `On-chain status check failed: ${
                    result.effects.status.error || "Unknown Execution Error"
                }`
            );
        }

        // Extract the return value
        // devInspect returns results for each command; moveCall is usually the first.
        // returnValues is an array of [valueBytes: number[], type: string]
        const returnValue = result.results?.[0]?.returnValues?.[0];
        if (
            !returnValue ||
            !Array.isArray(returnValue) ||
            returnValue.length !== 2
        ) {
            throw new Error(
                "Could not parse return value from on-chain status check."
            );
        }

        const [valueBytes, typeString] = returnValue;

        // Verify that the returned type matches the expected enum type.
        if (typeString !== expectedReturnType) {
            throw new Error(
                `Unexpected return type from on-chain status check.`
            );
        }

        // Decode the BCS bytes for the simple enum (index-based)
        // KycEffectiveStatus { Active (0), Expired (1), Revoked (2) }
        if (!valueBytes || valueBytes.length === 0) {
            throw new Error("Empty value bytes received for status enum.");
        }

        const statusIndex = valueBytes[0];
        switch (statusIndex) {
            case 0:
                return "Active";
            case 1:
                return "Expired";
            case 2:
                return "Revoked";
            default:
                throw new Error(
                    `Unknown status index ${statusIndex} received from on-chain check.`
                );
        }
    } catch (error) {
        console.error(
            `Error in checkOnChainStatus for object ${objectId}:`,
            error
        );
        throw new Error("An error has occured when checking on-chain status:");
    }
}
