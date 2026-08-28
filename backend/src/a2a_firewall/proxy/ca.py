"""Dynamic Certificate Authority (CA) for A2A Transparent Proxy.

Generates and manages a local Root CA, and dynamically signs on-demand SSL leaf certificates
for intercepted hosts (e.g., api.openai.com, api.anthropic.com) with valid Subject Alternative Names.
"""

from __future__ import annotations

import datetime
import ipaddress
import os
import ssl
import tempfile
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


class CertificateAuthority:
    """Manages the local Root CA and dynamic leaf certificate generation."""

    def __init__(
        self, ca_dir: str | Path | None = None, common_name: str = "A2A Firewall Local CA"
    ):
        if ca_dir is None:
            base_dir = Path(os.environ.get("A2A_CA_DIR", Path.home() / ".a2a" / "ca"))
        else:
            base_dir = Path(ca_dir)

        base_dir.mkdir(parents=True, exist_ok=True)
        self.ca_dir = base_dir
        self.common_name = common_name

        self.ca_key_path = self.ca_dir / "ca.key"
        self.ca_cert_path = self.ca_dir / "ca.crt"

        self._root_key: rsa.RSAPrivateKey | None = None
        self._root_cert: x509.Certificate | None = None
        self._cert_cache: dict[str, tuple[bytes, bytes]] = {}  # host -> (cert_pem, key_pem)
        self._ssl_context_cache: dict[str, ssl.SSLContext] = {}

        self._initialize_root_ca()

    def _initialize_root_ca(self) -> None:
        """Load existing Root CA or generate a new one."""
        if self.ca_key_path.exists() and self.ca_cert_path.exists():
            try:
                key_bytes = self.ca_key_path.read_bytes()
                cert_bytes = self.ca_cert_path.read_bytes()
                self._root_key = serialization.load_pem_private_key(
                    key_bytes, password=None, backend=default_backend()
                )  # type: ignore[assignment]
                self._root_cert = x509.load_pem_x509_certificate(
                    cert_bytes, backend=default_backend()
                )
                return
            except Exception:
                # If corrupted, re-generate
                pass

        # Generate new Root CA
        self._root_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend(),
        )

        subject = issuer = x509.Name(
            [
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "A2A Firewall"),
                x509.NameAttribute(NameOID.COMMON_NAME, self.common_name),
            ]
        )

        now = datetime.datetime.now(datetime.UTC)
        self._root_cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(self._root_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650))  # 10 years
            .add_extension(
                x509.BasicConstraints(ca=True, path_length=1),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_cert_sign=True,
                    crl_sign=True,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .add_extension(
                x509.SubjectKeyIdentifier.from_public_key(self._root_key.public_key()),
                critical=False,
            )
            .sign(self._root_key, hashes.SHA256(), default_backend())
        )

        # Save to disk
        self.ca_key_path.write_bytes(
            self._root_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        self.ca_cert_path.write_bytes(self._root_cert.public_bytes(serialization.Encoding.PEM))

    @property
    def root_cert_path(self) -> str:
        """Absolute path to the Root CA certificate."""
        return str(self.ca_cert_path.resolve())

    @property
    def root_cert_pem(self) -> bytes:
        """Root CA certificate in PEM format."""
        assert self._root_cert is not None
        return self._root_cert.public_bytes(serialization.Encoding.PEM)

    def get_certificate_for_host(self, host: str) -> tuple[bytes, bytes]:
        """Generate or retrieve a cached signed leaf certificate and private key for a host.

        Returns (cert_pem_bytes, key_pem_bytes).
        """
        # Strip port if present
        hostname = host.split(":")[0].strip()
        if hostname in self._cert_cache:
            return self._cert_cache[hostname]

        assert self._root_key is not None
        assert self._root_cert is not None

        # Generate leaf private key
        leaf_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend(),
        )

        subject = x509.Name(
            [
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "A2A Firewall Proxied"),
                x509.NameAttribute(NameOID.COMMON_NAME, hostname),
            ]
        )

        # Build Subject Alternative Name (SAN)
        san_names: list[x509.GeneralName] = []
        try:
            ip_obj = ipaddress.ip_address(hostname)
            san_names.append(x509.IPAddress(ip_obj))
        except ValueError:
            san_names.append(x509.DNSName(hostname))
            # Also add wildcard if subdomains might be called
            if not hostname.startswith("*.") and "." in hostname:
                pass

        now = datetime.datetime.now(datetime.UTC)
        leaf_cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(self._root_cert.subject)
            .public_key(leaf_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(
                x509.BasicConstraints(ca=False, path_length=None),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_encipherment=True,
                    content_commitment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .add_extension(
                x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
                critical=False,
            )
            .add_extension(
                x509.SubjectAlternativeName(san_names),
                critical=False,
            )
            .add_extension(
                x509.AuthorityKeyIdentifier.from_issuer_public_key(self._root_key.public_key()),
                critical=False,
            )
            .sign(self._root_key, hashes.SHA256(), default_backend())
        )

        cert_pem = leaf_cert.public_bytes(serialization.Encoding.PEM)
        key_pem = leaf_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )

        self._cert_cache[hostname] = (cert_pem, key_pem)
        return cert_pem, key_pem

    def get_ssl_context_for_host(self, host: str) -> ssl.SSLContext:
        """Create an ssl.SSLContext configured with dynamic cert/key for the given host."""
        hostname = host.split(":")[0].strip()
        if hostname in self._ssl_context_cache:
            return self._ssl_context_cache[hostname]

        cert_pem, key_pem = self.get_certificate_for_host(hostname)

        # Write to temporary files to load into SSLContext
        with tempfile.NamedTemporaryFile("wb", delete=False, suffix=".crt") as cf:
            cf.write(cert_pem)
            cert_tmp = cf.name

        with tempfile.NamedTemporaryFile("wb", delete=False, suffix=".key") as kf:
            kf.write(key_pem)
            key_tmp = kf.name

        try:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(certfile=cert_tmp, keyfile=key_tmp)
            self._ssl_context_cache[hostname] = ctx
            return ctx
        finally:
            try:
                os.remove(cert_tmp)
                os.remove(key_tmp)
            except OSError:
                pass
