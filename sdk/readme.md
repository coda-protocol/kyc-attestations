## @coda/kyc

This is the SDK for interacting with and verifing KYC attestations on the Sui Network.

## Installation

```
npm i @coda/kyc

pnpm i @coda/kyc

yarn add @coda/kyc
```

## Get Started

A simple implementation for KYC attestation verification.

```typescript
import { CodaKyc, KycVerificationStatus } from "@coda/kyc";

const client = new SuiClient({
    url: getFullnodeUrl("mainnet"),
});

const verifier = new CodaKyc({
    suiClient: client,
});

async function isUserVerified(address: string): Promise<boolean> {
    if (!address) return false;

    const result = await verifier.verifyKycStatus(address);

    return result.status === KycVerificationStatus.Verified;
}

const isVerified = await isUserVerified("0xAABB");
if (isVerified) {
    // User has a valid KYC attestation
} else {
    // User doesn't have a valid, non-expired/revoked KYC attestation.
}
```

Fetching and reading attestation details which are queried from on-chain.

```typescript
import { CodaKyc, KycVerificationStatus } from "@coda/kyc";

const client = new SuiClient({
    url: getFullnodeUrl("mainnet"),
});

const verifier = new CodaKyc({
    suiClient: client,
});

async function getAttestationDetails(address: string) {
    if (!address) return false;

    const result = await verifier.verifyKycStatus(address);

    // @dev you can get object details directly from the `attestation` object
    // this will return fields which are queried from on-chain.
    if (result.attestation) {
        console.log("Attestation Details:");
        console.log(`  Object ID: ${result.attestation.objectId}`);
        console.log(`  Issuer: ${result.attestation.issuer}`);
        console.log(`  Intended Recipient: ${result.attestation.recipient}`);
        console.log(`  Current Owner: ${result.attestation.currentOwner}`);
        console.log(`  Issued: ${result.attestation.issuedAt.toISOString()}`);
        console.log(
            `  Expires: ${
                result.attestation.expiresAt?.toISOString() ?? "Never"
            }`
        );
        console.log(`  Raw Status: ${result.attestation.statusRaw}`);

        return result.attestation;
    }

    return null;
}
```
