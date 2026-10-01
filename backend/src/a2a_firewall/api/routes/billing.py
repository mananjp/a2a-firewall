import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_account
from a2a_firewall.core.razorpay_client import RazorpayClientError, razorpay_client
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Account, BillingSubscription

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/subscribe")
async def create_subscription(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Create a new Razorpay subscription for the user."""
    # Check if the user already has an active subscription
    stmt = select(BillingSubscription).where(
        BillingSubscription.account_id == current_account.id, BillingSubscription.status == "active"
    )
    result = await db.execute(stmt)
    existing_sub = result.scalar_one_or_none()

    if existing_sub:
        raise HTTPException(status_code=400, detail="User already has an active subscription.")

    try:
        # 1. Create or get Razorpay customer
        # We need to query if they already have a customer ID in any subscription row (even canceled)
        stmt_cust = select(BillingSubscription.razorpay_customer_id).where(
            BillingSubscription.account_id == current_account.id,
            BillingSubscription.razorpay_customer_id.isnot(None),
        )
        result_cust = await db.execute(stmt_cust)
        customer_id = result_cust.scalar_one_or_none()

        if not customer_id:
            customer_resp = await razorpay_client.create_customer(
                name=current_account.full_name or current_account.email, email=current_account.email
            )
            customer_id = customer_resp["id"]

        # 2. Create subscription
        sub_resp = await razorpay_client.create_subscription(
            plan_id=plan_id, customer_id=customer_id
        )

        # 3. Store in DB (status is usually 'created' initially, will be activated via webhook)
        new_sub = BillingSubscription(
            account_id=current_account.id,
            razorpay_customer_id=customer_id,
            razorpay_subscription_id=sub_resp["id"],
            plan_id=plan_id,
            status=sub_resp["status"],
        )
        db.add(new_sub)
        await db.commit()

        return {
            "subscription_id": sub_resp["id"],
            "short_url": sub_resp.get("short_url"),
            "status": sub_resp["status"],
        }
    except RazorpayClientError as e:
        logger.error(f"Failed to create subscription: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to create Razorpay subscription."
        ) from e


@router.get("/subscription")
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Get the current billing subscription for the user."""
    stmt = (
        select(BillingSubscription)
        .where(BillingSubscription.account_id == current_account.id)
        .order_by(BillingSubscription.created_at.desc())
    )
    result = await db.execute(stmt)
    sub = result.scalars().first()

    if not sub:
        return {"subscription": None}

    # Optionally sync status from Razorpay if it's created or active
    if sub.status in ("created", "authenticated") and sub.razorpay_subscription_id:
        try:
            rzp_sub = await razorpay_client.get_subscription(sub.razorpay_subscription_id)
            if rzp_sub["status"] != sub.status:
                sub.status = rzp_sub["status"]
                await db.commit()
        except RazorpayClientError:
            pass

    return {
        "subscription": {
            "id": str(sub.id),
            "razorpay_subscription_id": sub.razorpay_subscription_id,
            "plan_id": sub.plan_id,
            "status": sub.status,
            "cancel_at_period_end": sub.cancel_at_period_end,
        }
    }


@router.post("/cancel")
async def cancel_subscription(
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> Any:
    """Cancel the active subscription at the end of the billing cycle."""
    stmt = select(BillingSubscription).where(
        BillingSubscription.account_id == current_account.id, BillingSubscription.status == "active"
    )
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()

    if not sub or not sub.razorpay_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found.")

    try:
        resp = await razorpay_client.cancel_subscription(
            sub.razorpay_subscription_id, cancel_at_cycle_end=True
        )
        sub.cancel_at_period_end = True
        # If canceled immediately by Razorpay, update status
        if resp.get("status") == "cancelled":
            sub.status = "cancelled"
            # Downgrade user account immediately
            current_account.tier = "free"

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
                    # Update tier based on plan (basic logic, can be expanded)
                    if "pro" in subscription.plan_id.lower():
                        account.tier = "pro"
                    elif "team" in subscription.plan_id.lower():
                        account.tier = "team"
                elif status in ("cancelled", "halted", "completed", "expired"):
                    account.tier = "free"

            await db.commit()

    return Response(status_code=200)
