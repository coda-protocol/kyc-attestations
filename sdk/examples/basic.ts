import { CodaKyc, KycVerificationStatus } from "../dist";

const verifier = new CodaKyc({
    apiKey: "my-api-key",
});

async function checkUser(address: string) {
    console.log(`Checking KYC for ${address}...`);

    const result = await verifier.verifyKycStatus(address);

    console.log(`--------------------------------`);
    console.log(`KYC Status: ${result.status}`);
    console.log(`Details: ${result.details}`);

    if (result.attestation) {
        console.log("Attestation Details:");
        console.log(`  Object ID: ${result.attestation.objectId}`);
        console.log(`  Issuer: ${result.attestation.issuer}`);
        console.log(`  Intended Recipient: ${result.attestation.recipient}`);
        console.log(`  Current Owner: ${result.attestation.currentOwner}`);
        console.log(`  Issued: ${result.attestation.issuedAt.toISOString()}`);
        console.log(`  Expires: ${result.attestation.expiresAt?.toISOString() ?? "Never"}`);
        console.log(`  Raw Status: ${result.attestation.statusRaw}`);
    }
    console.log(`--------------------------------`);

    // @dev application logic example
    if (result.status === KycVerificationStatus.Verified) {
        console.log("Access Granted: User is verified.");
    } else {
        console.log("Access Denied: User is not verified or attestation is invalid.");
    }
}

checkUser("0xfaac5bf9dd7da0706425a88413c7467b1f00a1df730ca71eca229950196a657b").catch(console.error);
