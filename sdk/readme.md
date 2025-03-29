## @codalabs/kyc

You can make use of this library to interact with [Coda KYC](coda.ac)'s 'Know Your Customer' protocol. To acquire an api key, please use the dashboard. For specific requests you can contact **@opiateful** on Telegram.

## Installation

```
npm i @codalabs/kyc
```

## Get Started

A simple implementation for KYC attestation verification.

```typescript
import { CodaKyc, KycVerificationStatus } from "@codalabs/kyc";

const verifier = new CodaKyc({
    apiKey: "my-api-key",
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
import { CodaKyc, KycVerificationStatus } from "@codalabs/kyc";

const verifier = new CodaKyc({
    apiKey: "my-api-key",
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
        console.log(`  Expires: ${result.attestation.expiresAt?.toISOString() ?? "Never"}`);
        console.log(`  Raw Status: ${result.attestation.statusRaw}`);

        return result.attestation;
    }

    return null;
}
```

### Attribution

Please reference or mention `Powered By Coda Labs` if you're using this SDK.
