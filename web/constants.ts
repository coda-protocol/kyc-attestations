export const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID!;
export const ISSUER_REGISTRY_ID =
    process.env.NEXT_PUBLIC_SUI_ISSUER_REGISTRY_ID!;
export const KYC_ATTESTATION_TYPE = `${PACKAGE_ID}::core::KycAttestation`;

export const ZERO_ADDRESS: string =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
