export function isWebAuthnSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface RegistrationOptions {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout?: number;
  excludeCredentials?: Array<{ type: 'public-key'; id: string; transports?: string[] }>;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
  attestation?: string;
}

export interface AuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials?: Array<{ type: 'public-key'; id: string; transports?: string[] }>;
  userVerification?: string;
  timeout?: number;
}

export async function createPasskeyCredential(options: RegistrationOptions) {
  const publicKey: PublicKeyCredentialCreationOptions = {
    rp: options.rp,
    user: {
      id: base64UrlToBuffer(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    challenge: base64UrlToBuffer(options.challenge),
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      type: p.type as PublicKeyCredentialType,
      alg: p.alg,
    })),
    timeout: options.timeout,
    excludeCredentials: options.excludeCredentials?.map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: base64UrlToBuffer(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    authenticatorSelection: options.authenticatorSelection
      ? {
          authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment as AuthenticatorAttachment | undefined,
          residentKey: options.authenticatorSelection.residentKey as ResidentKeyRequirement | undefined,
          requireResidentKey: options.authenticatorSelection.requireResidentKey,
          userVerification: options.authenticatorSelection.userVerification as UserVerificationRequirement | undefined,
        }
      : undefined,
    attestation: (options.attestation ?? 'none') as AttestationConveyancePreference,
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;

  if (!credential) throw new Error('Credential creation failed');

  const attestationResponse = credential.response as AuthenticatorAttestationResponse;

  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(attestationResponse.clientDataJSON),
      attestationObject: bufferToBase64Url(attestationResponse.attestationObject),
      transports: attestationResponse.getTransports?.() ?? [],
    },
  };
}

export async function getPasskeyAssertion(options: AuthenticationOptions) {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBuffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: options.allowCredentials?.map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: base64UrlToBuffer(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    userVerification: (options.userVerification ?? 'required') as UserVerificationRequirement,
    timeout: options.timeout,
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;

  if (!credential) throw new Error('Assertion failed');

  const assertionResponse = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(assertionResponse.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertionResponse.authenticatorData),
      signature: bufferToBase64Url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle
        ? bufferToBase64Url(assertionResponse.userHandle)
        : null,
    },
  };
}
