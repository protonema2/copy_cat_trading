import base64
import hashlib
import hmac
import os
import secrets

try:
    from cryptography.fernet import Fernet
except ImportError:  # pragma: no cover - fallback keeps old local envs bootable until dependencies are installed.
    Fernet = None


ENCRYPTED_PREFIX = "enc:v1:"
FERNET_PREFIX = "enc:v2:"


def is_encrypted(value: str | None) -> bool:
    return bool(value and (value.startswith(ENCRYPTED_PREFIX) or value.startswith(FERNET_PREFIX)))


def encryption_key() -> bytes:
    key = os.getenv("TELEGRAM_SESSION_ENCRYPTION_KEY") or os.getenv("DASHBOARD_AUTH_SECRET")
    if not key:
        key = "change-me-before-production"
    return hashlib.sha256(key.encode("utf-8")).digest()


def encrypt_text(value: str | None) -> str | None:
    if value is None or is_encrypted(value):
        return value

    if Fernet is not None:
        token = Fernet(fernet_key()).encrypt(value.encode("utf-8")).decode("ascii")
        return FERNET_PREFIX + token

    nonce = secrets.token_bytes(16)
    plaintext = value.encode("utf-8")
    ciphertext = xor_stream(plaintext, nonce)
    body = nonce + ciphertext
    signature = hmac.new(encryption_key(), body, hashlib.sha256).digest()
    return ENCRYPTED_PREFIX + base64.urlsafe_b64encode(body + signature).decode("ascii")


def decrypt_text(value: str | None) -> str | None:
    if value is None:
        return value

    if value.startswith(FERNET_PREFIX):
        if Fernet is None:
            raise RuntimeError("cryptography is required to decrypt Telegram session data")
        return Fernet(fernet_key()).decrypt(value[len(FERNET_PREFIX):].encode("ascii")).decode("utf-8")

    if not value.startswith(ENCRYPTED_PREFIX):
        return value

    raw = base64.urlsafe_b64decode(value[len(ENCRYPTED_PREFIX):].encode("ascii"))
    if len(raw) < 48:
        raise ValueError("Encrypted value is malformed")

    body = raw[:-32]
    signature = raw[-32:]
    expected_signature = hmac.new(encryption_key(), body, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError("Encrypted value signature is invalid")

    nonce = body[:16]
    ciphertext = body[16:]
    return xor_stream(ciphertext, nonce).decode("utf-8")


def xor_stream(data: bytes, nonce: bytes) -> bytes:
    key = encryption_key()
    output = bytearray()
    counter = 0

    while len(output) < len(data):
        block = hmac.new(
            key,
            nonce + counter.to_bytes(8, "big"),
            hashlib.sha256,
        ).digest()
        output.extend(block)
        counter += 1

    return bytes(item ^ stream for item, stream in zip(data, output))


def fernet_key() -> bytes:
    return base64.urlsafe_b64encode(encryption_key())
