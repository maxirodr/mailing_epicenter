<?php

namespace App\Services;

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialUserEntity;

class WebAuthnService
{
    private string $rpId;
    private string $rpName;
    private string $origin;

    public function __construct()
    {
        $this->rpId = config('services.webauthn.rp_id', 'localhost');
        $this->rpName = config('services.webauthn.rp_name', 'NexoSmart Mail');
        $this->origin = config('services.webauthn.origin', 'https://localhost');
    }

    public function generateRegistrationOptions(User $user): array
    {
        $rpEntity = PublicKeyCredentialRpEntity::create($this->rpName, $this->rpId);

        $userEntity = PublicKeyCredentialUserEntity::create(
            $user->email,
            (string) $user->id,
            $user->name,
        );

        $excludedCredentials = $user->passkeys->map(function (Passkey $passkey) {
            return PublicKeyCredentialDescriptor::create(
                PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY,
                base64_decode($passkey->credential_id),
                $passkey->transports ?? [],
            );
        })->toArray();

        $options = PublicKeyCredentialCreationOptions::create(
            rp: $rpEntity,
            user: $userEntity,
            challenge: random_bytes(32),
            pubKeyCredParams: [
                PublicKeyCredentialParameters::createPk(-7),   // ES256
                PublicKeyCredentialParameters::createPk(-257),  // RS256
            ],
        );

        $options->excludeCredentials = $excludedCredentials;
        $options->authenticatorSelection = \Webauthn\AuthenticatorSelectionCriteria::create(
            authenticatorAttachment: \Webauthn\AuthenticatorSelectionCriteria::AUTHENTICATOR_ATTACHMENT_PLATFORM,
            residentKey: \Webauthn\AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_PREFERRED,
            userVerification: \Webauthn\AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
        );
        $options->timeout = 60000;
        $options->attestation = PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE;

        // Store in cache keyed by user ID — avoids session corruption
        Cache::put("webauthn_reg_{$user->id}", serialize($options), now()->addMinutes(5));

        return [
            'rp' => ['id' => $this->rpId, 'name' => $this->rpName],
            'user' => [
                'id' => base64url_encode((string) $user->id),
                'name' => $user->email,
                'displayName' => $user->name,
            ],
            'challenge' => base64url_encode($options->challenge),
            'pubKeyCredParams' => [
                ['type' => 'public-key', 'alg' => -7],
                ['type' => 'public-key', 'alg' => -257],
            ],
            'timeout' => 60000,
            'excludeCredentials' => array_map(fn (PublicKeyCredentialDescriptor $c) => [
                'type' => 'public-key',
                'id' => base64url_encode($c->id),
                'transports' => $c->transports,
            ], $excludedCredentials),
            'authenticatorSelection' => [
                'authenticatorAttachment' => 'platform',
                'residentKey' => 'preferred',
                'requireResidentKey' => false,
                'userVerification' => 'required',
            ],
            'attestation' => 'none',
        ];
    }

    public function verifyRegistration(array $credential, User $user): Passkey
    {
        $serialized = Cache::pull("webauthn_reg_{$user->id}");
        $options = $serialized ? unserialize($serialized) : null;

        if (! $options instanceof PublicKeyCredentialCreationOptions) {
            throw new \RuntimeException('No registration options found. Please try again.');
        }

        $attestationStatementSupportManager = AttestationStatementSupportManager::create();
        $attestationStatementSupportManager->add(NoneAttestationStatementSupport::create());

        $csmFactory = new CeremonyStepManagerFactory();
        $csmFactory->setAttestationStatementSupportManager($attestationStatementSupportManager);
        $csmFactory->setSecuredRelyingPartyId([$this->rpId]);
        $creationCsm = $csmFactory->creationCeremony();

        $serializer = (new WebauthnSerializerFactory($attestationStatementSupportManager))->create();

        $publicKeyCredential = $serializer->deserialize(
            json_encode($credential),
            PublicKeyCredential::class,
            'json',
        );

        $authenticatorResponse = $publicKeyCredential->response;
        if (! $authenticatorResponse instanceof AuthenticatorAttestationResponse) {
            throw new \RuntimeException('Invalid authenticator response type.');
        }

        $validator = AuthenticatorAttestationResponseValidator::create($creationCsm);
        $publicKeyCredentialSource = $validator->check(
            $authenticatorResponse,
            $options,
            $this->origin,
        );

        return Passkey::create([
            'user_id' => $user->id,
            'name' => $credential['name'] ?? 'Passkey ' . now()->format('M j, Y'),
            'credential_id' => base64_encode($publicKeyCredentialSource->publicKeyCredentialId),
            'public_key' => base64_encode(serialize($publicKeyCredentialSource)),
            'counter' => $publicKeyCredentialSource->counter,
            'transports' => $credential['response']['transports'] ?? [],
            'aaguid' => $publicKeyCredentialSource->aaguid->toString(),
        ]);
    }

    public function generateAuthenticationOptions(?User $user = null): array
    {
        $allowedCredentials = [];

        if ($user) {
            $allowedCredentials = $user->passkeys->map(function (Passkey $passkey) {
                return PublicKeyCredentialDescriptor::create(
                    PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY,
                    base64_decode($passkey->credential_id),
                    $passkey->transports ?? [],
                );
            })->toArray();
        }

        $options = PublicKeyCredentialRequestOptions::create(
            challenge: random_bytes(32),
        );

        $options->rpId = $this->rpId;
        $options->allowCredentials = $allowedCredentials;
        $options->userVerification = PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED;
        $options->timeout = 60000;

        // For login (no user), use challenge hash as key; for 2FA (with user), use user ID
        $cacheKey = $user
            ? "webauthn_auth_{$user->id}"
            : 'webauthn_auth_' . base64_encode($options->challenge);

        Cache::put($cacheKey, serialize($options), now()->addMinutes(5));

        return [
            'challenge' => base64url_encode($options->challenge),
            'challengeKey' => $cacheKey,
            'rpId' => $this->rpId,
            'allowCredentials' => array_map(fn (PublicKeyCredentialDescriptor $c) => [
                'type' => 'public-key',
                'id' => base64url_encode($c->id),
                'transports' => $c->transports,
            ], $allowedCredentials),
            'userVerification' => 'required',
            'timeout' => 60000,
        ];
    }

    public function verifyAuthentication(array $credential, ?string $challengeKey = null): User
    {
        // Try challenge key first, then try to find by credential
        $serialized = null;
        if ($challengeKey) {
            $serialized = Cache::pull($challengeKey);
        }

        if (! $serialized) {
            // Fallback: try to find by credential's user
            $credentialId = base64url_decode($credential['id']);
            $passkey = Passkey::where('credential_id', base64_encode($credentialId))->first();
            if ($passkey) {
                $serialized = Cache::pull("webauthn_auth_{$passkey->user_id}");
            }
        }

        $options = $serialized ? unserialize($serialized) : null;

        if (! $options instanceof PublicKeyCredentialRequestOptions) {
            throw new \RuntimeException('No authentication options found. Please try again.');
        }

        $credentialId = base64url_decode($credential['id']);
        $passkey = Passkey::where('credential_id', base64_encode($credentialId))->firstOrFail();

        $publicKeyCredentialSource = unserialize(base64_decode($passkey->public_key));
        if (! $publicKeyCredentialSource instanceof PublicKeyCredentialSource) {
            throw new \RuntimeException('Invalid stored credential.');
        }

        $attestationStatementSupportManager = AttestationStatementSupportManager::create();
        $attestationStatementSupportManager->add(NoneAttestationStatementSupport::create());

        $csmFactory = new CeremonyStepManagerFactory();
        $csmFactory->setSecuredRelyingPartyId([$this->rpId]);
        $requestCsm = $csmFactory->requestCeremony();

        $serializer = (new WebauthnSerializerFactory($attestationStatementSupportManager))->create();

        $publicKeyCredential = $serializer->deserialize(
            json_encode($credential),
            PublicKeyCredential::class,
            'json',
        );

        $authenticatorResponse = $publicKeyCredential->response;
        if (! $authenticatorResponse instanceof AuthenticatorAssertionResponse) {
            throw new \RuntimeException('Invalid authenticator response type.');
        }

        $validator = AuthenticatorAssertionResponseValidator::create($requestCsm);
        $updatedSource = $validator->check(
            $publicKeyCredentialSource,
            $authenticatorResponse,
            $options,
            $this->origin,
            $publicKeyCredentialSource->userHandle,
        );

        $passkey->update(['counter' => $updatedSource->counter]);

        return $passkey->user;
    }
}

// Helper functions for base64url encoding
if (! function_exists('base64url_encode')) {
    function base64url_encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}

if (! function_exists('base64url_decode')) {
    function base64url_decode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
    }
}
