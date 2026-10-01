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

    async def create_plan(
        self,
        name: str,
        amount_in_paise: int,
        period: str = "monthly",  # daily | weekly | monthly | yearly
        interval: int = 1,
        currency: str = "INR",
        description: str | None = None,
    ) -> Any:
        """Create a subscription plan in Razorpay."""
        payload: dict[str, Any] = {
            "period": period,
            "interval": interval,
            "item": {
                "name": name,
                "amount": amount_in_paise,
                "currency": currency,
                "description": description or name,
            },
        }
        return await self._request("POST", "/plans", json=payload)

    async def get_plan(self, plan_id: str) -> Any:
        """Fetch plan details from Razorpay."""
        return await self._request("GET", f"/plans/{plan_id}")

    async def create_order(
        self,
        amount_in_paise: int,
        currency: str = "INR",
        receipt: str | None = None,
        notes: dict[str, Any] | None = None,
    ) -> Any:
        """Create a standard one-time checkout order in Razorpay."""
        payload: dict[str, Any] = {
            "amount": amount_in_paise,
            "currency": currency,
            "receipt": receipt or f"rcpt_{uuid.uuid4().hex[:10]}",
            "notes": notes or {},
        }
        return await self._request("POST", "/orders", json=payload)

    async def create_subscription(
        self,
        plan_id: str,
        customer_id: str,
        total_count: int | None = None,
    ) -> Any:
        """Create a subscription for a customer.

        The billing period is defined by the Razorpay ``plan_id``. In the Razorpay
        Subscriptions API, ``total_count`` is required (representing max billing cycles).
        Defaults to 60 (5 years) if omitted.
        """
        payload: dict[str, Any] = {
            "plan_id": plan_id,
            "customer_id": customer_id,
            "customer_notify": 1,
            "total_count": total_count if total_count is not None else 60,
        }
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

    def verify_subscription_payment_signature(
        self, razorpay_payment_id: str, razorpay_subscription_id: str, razorpay_signature: str
    ) -> bool:
        """Verify payment signature for a subscription checkout callback."""
        if not settings.RAZORPAY_KEY_SECRET:
            return False
        msg = f"{razorpay_payment_id}|{razorpay_subscription_id}"
        expected = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(), msg.encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, razorpay_signature)

    def verify_order_payment_signature(
        self, razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str
    ) -> bool:
        """Verify payment signature for a standard order checkout callback."""
        if not settings.RAZORPAY_KEY_SECRET:
            return False
        msg = f"{razorpay_order_id}|{razorpay_payment_id}"
        expected = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(), msg.encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, razorpay_signature)


razorpay_client = RazorpayClient()
