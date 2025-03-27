import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { SynthVerifier, KycVerificationStatus } from "../dist";

async function checkUser(address: string) {
  const client = new SuiClient({
    url: getFullnodeUrl("testnet"),
  });

  const verifier = new SynthVerifier({
    suiClient: client,
  });

  console.log(`Checking KYC for ${address}...`);

  const result = await verifier.verifyKycStatus(address);

  console.log(`--------------------------------`);
  console.log(`KYC Status: ${result.status}`);
  console.log(`Details: ${result.details}`);

  if (result.attestation) {
    console.log("Checked Attestation Details:");
    console.log(`  Object ID: ${result.attestation.objectId}`);
    console.log(`  Issuer: ${result.attestation.issuer}`);
    console.log(`  Intended Recipient: ${result.attestation.recipient}`);
    console.log(`  Current Owner: ${result.attestation.currentOwner}`);
    console.log(`  Issued: ${result.attestation.issuedAt.toISOString()}`);
    console.log(
      `  Expires: ${result.attestation.expiresAt?.toISOString() ?? "Never"}`
    );
    console.log(`  Raw Status: ${result.attestation.statusRaw}`);
  }
  console.log(`--------------------------------`);

  // Example of using the status in application logic
  if (result.status === KycVerificationStatus.Verified) {
    console.log("Access Granted: User is verified.");
    // Allow user action...
  } else {
    console.log(
      "Access Denied: User is not verified or attestation is invalid."
    );
    // Show error message or guide user...
  }
}

checkUser(
  "0x1b16ef93ba3d6dc5b502aa799150df2bc634d77ee33ecaeabba77a929367e54d"
).catch(console.error);
