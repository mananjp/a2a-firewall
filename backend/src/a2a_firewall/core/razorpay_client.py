import hashlib
import hmac
import logging
from typing import Any

import httpx

from a2a_firewall.core.config import settings

logger = logging.getLogger(__name__)


class RazorpayClientError(Exception):
    pass


class RazorpayClient:
    """Async HTTP client for interacting with Razorpay APIs."""

    BASE_URL = "https://api.razorpay.com/v1"

    def __init__(self) -> None:
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
            logger.warning("Razorpay credentials are not fully configured.")
        self.auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)

    async def _request(self, method: str, endpoint: str, **kwargs: Any) -> Any:
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.request(method, url, auth=self.auth, **kwargs)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                err_body = e.response.text
                logger.error(f"Razorpay API Error {e.response.status_code}: {err_body}")
                raise RazorpayClientError(
                    f"Razorpay API request failed: {e.response.status_code}"
                ) from e
            except Exception as e:
                logger.error(f"Razorpay API Request Failed: {e}")
                raise RazorpayClientError(f"Razorpay API request failed: {e}") from e

    async def create_customer(self, name: str, email: str, contact: str | None = None) -> Any:
        """Create a new customer in Razorpay."""
        payload: dict[str, Any] = {"name": name, "email": email, "fail_existing": 0}
        if contact:
            payload["contact"] = contact

        return await self._request("POST", "/customers", json=payload)

    async def get_customer(self, customer_id: str) -> Any:
        """Fetch an existing customer from Razorpay."""
        return await self._request("GET", f"/customers/{customer_id}")

    async def create_subscription(
        self,
        plan_id: str,
        customer_id: str,
        total_count: int | None = None,
    ) -> Any:
        """Create a subscription for a customer.

        The billing period is defined by the Razorpay ``plan_id`` (monthly or
        annual), so it is deliberately not duplicated here. ``total_count`` is
        left unset by default, which makes the subscription renew on its own
        until cancelled. Passing an explicit count caps the number of billing
        cycles — for example ``12`` on a monthly plan bills 12 months up front
        and then stops.
        """
        payload: dict[str, Any] = {
            "plan_id": plan_id,
            "customer_id": customer_id,
            "customer_notify": 1,
        }
        if total_count is not None:
            payload["total_count"] = total_count
        return await self._request("POST", "/subscriptions", json=payload)

    async def get_subscription(self, subscription_id: str) -> Any:
        """Fetch an existing subscription from Razorpay."""
        return await self._request("GET", f"/subscriptions/{subscription_id}")

    async def cancel_subscription(
        self, subscription_id: str, cancel_at_cycle_end: bool = False
    ) -> Any:
        """Cancel an active subscription."""
        payload = {"cancel_at_cycle_end": 1 if cancel_at_cycle_end else 0}
        return await self._request("POST", f"/subscriptions/{subscription_id}/cancel", json=payload)

    def verify_webhook_signature(self, payload_body: str, razorpay_signature: str) -> bool:
        """Verify the signature of incoming webhooks from Razorpay."""
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            return False

        expected_signature = hmac.new(
            settings.RAZORPAY_WEBHOOK_SECRET.encode(), payload_body.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected_signature, razorpay_signature)


razorpay_client = RazorpayClient()
