"""Unit tests for CertificateAuthority and dynamic SSL certificate generation."""

import ssl
import tempfile
from pathlib import Path

from cryptography import x509

from a2a_firewall.proxy.ca import CertificateAuthority


def test_ca_initialization():
    """Verify Root CA generates valid self-signed certificate and key."""
    with tempfile.TemporaryDirectory() as tmpdir:
        ca = CertificateAuthority(ca_dir=tmpdir, common_name="Test CA")

        assert Path(ca.root_cert_path).exists()
        assert Path(ca.ca_key_path).exists()

        # Parse certificate
        cert = x509.load_pem_x509_certificate(ca.root_cert_pem)
        assert cert.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME)[0].value == "Test CA"


def test_dynamic_host_cert_generation():
    """Verify dynamic host certificates are signed by Root CA with correct SAN."""
    with tempfile.TemporaryDirectory() as tmpdir:
        ca = CertificateAuthority(ca_dir=tmpdir)

        # Generate cert for api.openai.com
        cert_pem, key_pem = ca.get_certificate_for_host("api.openai.com")
        assert b"BEGIN CERTIFICATE" in cert_pem
        assert b"BEGIN RSA PRIVATE KEY" in key_pem

        cert = x509.load_pem_x509_certificate(cert_pem)
        san_ext = cert.extensions.get_extension_for_oid(x509.ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
        san_names = [name.value for name in san_ext.value]  # type: ignore[attr-defined]
        assert "api.openai.com" in san_names

        # Verify caching works
        cert2, key2 = ca.get_certificate_for_host("api.openai.com")
        assert cert_pem == cert2
        assert key_pem == key2


def test_ssl_context_creation():
    """Verify dynamic SSL context creation for TLS server."""
    with tempfile.TemporaryDirectory() as tmpdir:
        ca = CertificateAuthority(ca_dir=tmpdir)
        ctx = ca.get_ssl_context_for_host("api.anthropic.com")
        assert isinstance(ctx, ssl.SSLContext)
