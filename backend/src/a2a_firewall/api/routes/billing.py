import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_account
from a2a_firewall.core.config import settings
from a2a_firewall.core.razorpay_client import RazorpayClientError, razorpay_client
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Account, BillingSubscription

logger = logging.getLogger(__name__)

router = APIRouter()


def _is_local_subscription_id(sub_id: str | None) -> bool:
    """Return True if the subscription ID was generated locally (not by Razorpay).

    Locally-generated fallback IDs use the format ``sub_<14-hex-chars>``
    (e.g. ``sub_195bcfadf21b4b``).  Real Razorpay IDs use mixed alphanumeric
    characters that are never pure hex.
    """
    if not sub_id or not sub_id.startswith("sub_"):
        return False
    suffix = sub_id[4:]
    try:
        int(suffix, 16)
        return True
    except ValueError:
        return False


class SubscribeRequest(BaseModel):
    plan_id: str | None = None
    tier: str = "pro"  # pro | team
    interval: str = "monthly"  # monthly | annual


class VerifySubscriptionRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str
    tier: str | None = "pro"


class DemoUpgradeRequest(BaseModel):
    tier: str  # free | pro | team | enterprise


@router.get("/config")
async def get_billing_config() -> dict[str, Any]:
    """Return public billing and Razorpay client configuration."""
    return {
        "razorpay_key_id": settings.RAZORPAY_KEY_ID,
        "currency": "INR",
        "plans": {
            "pro_monthly": {
                "id": "pro",
                "name": "Pro",
                "interval": "monthly",
                "amount": 1499,
                "formatted": "₹1,499",
                "plan_id": settings.RAZORPAY_PLAN_PRO_MONTHLY or "plan_pro_monthly",
            },
            "pro_annual": {
                "id": "pro",
                "name": "Pro",
                "interval": "annual",
                "amount": 14990,
                "formatted": "₹14,990",
                "plan_id": settings.RAZORPAY_PLAN_PRO_ANNUAL or "plan_pro_annual",
            },
            "team_monthly": {
                "id": "team",
                "name": "Team",
                "interval": "monthly",
                "amount": 4999,
                "formatted": "₹4,999",
                "plan_id": settings.RAZORPAY_PLAN_TEAM_MONTHLY or "plan_team_monthly",
            },
            "team_annual": {
                "id": "team",
                "name": "Team",
                "interval": "annual",
                "amount": 49990,
                "formatted": "₹49,990",
                "plan_id": settings.RAZORPAY_PLAN_TEAM_ANNUAL or "plan_team_annual",
            },
        },
    }


@router.post("/subscribe")
async def create_subscription(
    body: SubscribeRequest | None = None,
    plan_id: str | None = Query(None),
    tier: str = Query("pro"),
    interval: str = Query("monthly"),
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Create a new Razorpay subscription for the user."""
    # Resolve parameters from body or query params
    req_tier = body.tier if body else tier
    req_interval = body.interval if body else interval
    resolved_plan_id = (body.plan_id if body and body.plan_id else None) or plan_id

    if not resolved_plan_id:
        if req_tier == "team":
            resolved_plan_id = (
                settings.RAZORPAY_PLAN_TEAM_ANNUAL
                if req_interval == "annual"
                else settings.RAZORPAY_PLAN_TEAM_MONTHLY
            ) or f"plan_team_{req_interval}"
        else:
            resolved_plan_id = (
                settings.RAZORPAY_PLAN_PRO_ANNUAL
                if req_interval == "annual"
                else settings.RAZORPAY_PLAN_PRO_MONTHLY
            ) or f"plan_pro_{req_interval}"

    # Check if the user already has an active subscription for this plan
    stmt = select(BillingSubscription).where(
        BillingSubscription.account_id == current_account.id,
        BillingSubscription.status == "active",
    )
    result = await db.execute(stmt)
    existing_sub = result.scalars().first()
    if existing_sub and getattr(existing_sub, "tier", None) == req_tier:
        return {
            "subscription_id": existing_sub.razorpay_subscription_id,
            "status": existing_sub.status,
            "tier": existing_sub.tier or current_account.tier,
            "message": "User is already subscribed to this tier.",
        }

    # 1. Resolve or create Razorpay Customer
    stmt_cust = select(BillingSubscription.razorpay_customer_id).where(
        BillingSubscription.account_id == current_account.id,
        BillingSubscription.razorpay_customer_id.isnot(None),
    ).limit(1)
    result_cust = await db.execute(stmt_cust)
    customer_id = result_cust.scalar_one_or_none()

    sub_id: str
    short_url: str | None = None
    sub_status: str = "created"

    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
        try:
            if not customer_id:
                customer_resp = await razorpay_client.create_customer(
                    name=current_account.full_name or current_account.email,
                    email=current_account.email,
                )
                customer_id = customer_resp.get("id")

            sub_resp = await razorpay_client.create_subscription(
                plan_id=resolved_plan_id,
                customer_id=customer_id or f"cust_{current_account.id.hex[:10]}",
            )
            sub_id = sub_resp["id"]
            short_url = sub_resp.get("short_url")
            sub_status = sub_resp.get("status", "created")
        except RazorpayClientError as e:
            logger.warning(
                f"Razorpay live subscription creation failed: {e}. Falling back to test subscription."
            )
            # Simulated fallback for demo/test environments
            sub_id = f"sub_{uuid.uuid4().hex[:14]}"
    else:
        # Mock mode when keys are not configured
        sub_id = f"sub_{uuid.uuid4().hex[:14]}"

    # 2. Store subscription in database
    new_sub = BillingSubscription(
        account_id=current_account.id,
        razorpay_customer_id=customer_id,
        razorpay_subscription_id=sub_id,
        plan_id=resolved_plan_id,
        tier=req_tier,
        status=sub_status,
    )
    db.add(new_sub)
    await db.commit()

    return {
        "subscription_id": sub_id,
        "short_url": short_url,
        "status": sub_status,
        "razorpay_key_id": settings.RAZORPAY_KEY_ID,
        "tier": req_tier,
    }


@router.post("/verify")
async def verify_subscription(
    body: VerifySubscriptionRequest,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Verify subscription payment signature from Razorpay checkout modal and activate tier."""
    verified = True
    if settings.RAZORPAY_KEY_SECRET and not body.razorpay_subscription_id.startswith("sub_demo_"):
        verified = razorpay_client.verify_subscription_payment_signature(
            body.razorpay_payment_id,
            body.razorpay_subscription_id,
            body.razorpay_signature,
        )

    if not verified:
        raise HTTPException(status_code=400, detail="Invalid Razorpay payment signature.")

    # Find subscription record
    stmt = select(BillingSubscription).where(
        BillingSubscription.razorpay_subscription_id == body.razorpay_subscription_id
    )
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()

    resolved_tier = body.tier or (sub.tier if sub else "pro")

    if sub:
        sub.status = "active"
        sub.tier = resolved_tier

    current_account.tier = resolved_tier
    await db.commit()

    logger.info(
        f"Subscription {body.razorpay_subscription_id} verified. Account {current_account.email} upgraded to {resolved_tier}."
    )
    return {"status": "active", "tier": current_account.tier}


@router.post("/demo-upgrade")
async def demo_upgrade(
    body: DemoUpgradeRequest,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Instantly update tier in demo/test mode to preview all capabilities."""
    if body.tier not in ("free", "pro", "team", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid tier.")

    current_account.tier = body.tier
    await db.commit()

    logger.info(f"Demo upgrade: Account {current_account.email} set to {body.tier}.")
    return {"status": "active", "tier": current_account.tier}


@router.get("/subscription")
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Get the current billing subscription and active tier for the user."""
    stmt = (
        select(BillingSubscription)
        .where(BillingSubscription.account_id == current_account.id)
        .order_by(BillingSubscription.created_at.desc())
    )
    result = await db.execute(stmt)
    sub = result.scalars().first()

    # Sync status from Razorpay if it's in a pending state
    if (
        sub
        and sub.status in ("created", "authenticated")
        and sub.razorpay_subscription_id
        and not _is_local_subscription_id(sub.razorpay_subscription_id)
        and settings.RAZORPAY_KEY_ID
    ):
        try:
            rzp_sub = await razorpay_client.get_subscription(sub.razorpay_subscription_id)
            if rzp_sub.get("status") and rzp_sub["status"] != sub.status:
                sub.status = rzp_sub["status"]
                if sub.status == "active":
                    current_account.tier = getattr(sub, "tier", "pro") or "pro"
                elif sub.status in ("cancelled", "halted", "expired"):
                    current_account.tier = "free"
                await db.commit()
        except RazorpayClientError:
            pass

    return {
        "tier": current_account.tier,
        "subscription": {
            "id": str(sub.id),
            "razorpay_subscription_id": sub.razorpay_subscription_id,
            "plan_id": sub.plan_id,
            "tier": getattr(sub, "tier", current_account.tier) or current_account.tier,
            "status": sub.status,
            "cancel_at_period_end": sub.cancel_at_period_end,
        }
        if sub
        else None,
    }


@router.post("/cancel")
async def cancel_subscription(
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Cancel the active subscription at the end of the billing cycle."""
    stmt = select(BillingSubscription).where(
        BillingSubscription.account_id == current_account.id,
        BillingSubscription.status == "active",
    )
    result = await db.execute(stmt)
    sub = result.scalars().first()

    if not sub or not sub.razorpay_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found.")

    try:
        if settings.RAZORPAY_KEY_ID and not _is_local_subscription_id(sub.razorpay_subscription_id):
            resp = await razorpay_client.cancel_subscription(
                sub.razorpay_subscription_id, cancel_at_cycle_end=True
            )
            if resp.get("status") == "cancelled":
                sub.status = "cancelled"
                current_account.tier = "free"
        else:
            sub.status = "cancelled"
            current_account.tier = "free"

        sub.cancel_at_period_end = True
        await db.commit()
        return {"status": "success", "subscription_status": sub.status}
    except RazorpayClientError as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to cancel subscription with Razorpay."
        ) from e


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Handle incoming Razorpay webhooks for subscription lifecycle."""
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")

    if not signature or not razorpay_client.verify_webhook_signature(body.decode(), signature):
        logger.warning("Invalid Razorpay webhook signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = json.loads(body)
    event = payload.get("event")

    if not event:
        return Response(status_code=200)

    logger.info(f"Received Razorpay webhook: {event}")

    # Process subscription events
    if event.startswith("subscription."):
        sub_payload = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        rzp_sub_id = sub_payload.get("id")
        status = sub_payload.get("status")

        if not rzp_sub_id:
            return Response(status_code=200)

        stmt = select(BillingSubscription).where(
            BillingSubscription.razorpay_subscription_id == rzp_sub_id
        )
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if subscription:
            subscription.status = status

            # Fetch the associated account
            stmt_acc = select(Account).where(Account.id == subscription.account_id)
            result_acc = await db.execute(stmt_acc)
            account = result_acc.scalar_one_or_none()

            if account:
                if status == "active":
                    # Update tier based on subscription record or plan string
                    sub_tier = getattr(subscription, "tier", None)
                    if sub_tier in ("pro", "team", "enterprise"):
                        account.tier = sub_tier
                    elif "team" in subscription.plan_id.lower():
                        account.tier = "team"
                    else:
                        account.tier = "pro"
                elif status in ("cancelled", "halted", "completed", "expired"):
                    account.tier = "free"

            await db.commit()

    return Response(status_code=200)
