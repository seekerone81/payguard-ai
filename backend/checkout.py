import os
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .ai import extract_payment_intent
from .audit import record_attempt
from .policy import ProposedTransaction, evaluate_payment
from .products import get_product


load_dotenv()

CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")

BASE_URL = os.getenv(
    "PAYPAL_BASE_URL",
    "https://api-m.sandbox.paypal.com",
)

APP_BASE_URL = os.getenv(
    "APP_BASE_URL",
    "http://localhost:8000",
)

router = APIRouter(prefix="/api", tags=["Checkout"])


class CheckoutRequest(BaseModel):
    user_request: str
    product_id: str
    quantity: int = Field(default=1, ge=1, le=100)


def get_access_token() -> str:
    if not CLIENT_ID or not CLIENT_SECRET:
        raise RuntimeError("PayPal credentials are missing from .env")

    response = requests.post(
        f"{BASE_URL}/v1/oauth2/token",
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={
            "Accept": "application/json",
            "Accept-Language": "en_US",
        },
        data={"grant_type": "client_credentials"},
        timeout=30,
    )

    response.raise_for_status()
    return response.json()["access_token"]


def create_paypal_order(
    access_token: str,
    product_name: str,
    total: float,
    currency: str,
) -> dict[str, Any]:

    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "description": product_name,
                "amount": {
                    "currency_code": currency,
                    "value": f"{total:.2f}",
                },
            }
        ],
        "application_context": {
            "return_url": f"{APP_BASE_URL}/paypal/return",
            "cancel_url": f"{APP_BASE_URL}/paypal/cancel",
        },
    }

    response = requests.post(
        f"{BASE_URL}/v2/checkout/orders",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )

    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "PayPal order creation failed",
                "paypal_response": response.text,
            },
        )

    return response.json()


@router.post("/checkout")
def checkout(request: CheckoutRequest):

    try:
        # 1. Extract the user's requested authorization.
        intent = extract_payment_intent(request.user_request)

        # 2. Retrieve the selected catalog product.
        product = get_product(request.product_id)

        if product is None:
            raise HTTPException(
                status_code=404,
                detail="Product not found",
            )

        quantity = request.quantity
        item_total = product.price * quantity
        shipping = product.shipping
        total = item_total + shipping

        # 3. Reject unavailable quantities.
        if quantity > product.stock:
            reason = (
                f"Requested quantity {quantity} exceeds "
                f"available stock {product.stock}."
            )

            audit_id = record_attempt(
                user_request=request.user_request,
                product_id=product.id,
                product_name=product.name,
                currency=product.currency,
                quantity=quantity,
                item_total=item_total,
                shipping=shipping,
                total=total,
                decision="BLOCKED",
                reason=reason,
            )

            return {
                "success": True,
                "payment_created": False,
                "message": reason,
                "audit_id": audit_id,
                "intent": intent.model_dump(),
                "decision": {
                    "allowed": False,
                    "reason": reason,
                    "checks": ["Stock check: FAIL"],
                },
            }

        # 4. Construct the proposed transaction.
        transaction = ProposedTransaction(
            category=product.category,
            quantity=quantity,
            item_total=item_total,
            shipping=shipping,
            currency=product.currency,
            recurring_payment=product.recurring_payment,
        )

        # 5. Deterministic authorization.
        decision = evaluate_payment(intent, transaction)

        # 6. Never create a PayPal order for a rejected transaction.
        if not decision.allowed:
            audit_id = record_attempt(
                user_request=request.user_request,
                product_id=product.id,
                product_name=product.name,
                currency=product.currency,
                quantity=quantity,
                item_total=item_total,
                shipping=shipping,
                total=total,
                decision="BLOCKED",
                reason=decision.reason,
            )

            return {
                "success": True,
                "payment_created": False,
                "message": "Payment blocked by PayGuard policy.",
                "audit_id": audit_id,
                "intent": intent.model_dump(),
                "product": product.model_dump(),
                "transaction": transaction.model_dump(),
                "decision": decision.model_dump(),
            }

        # This prototype does not implement recurring billing.
        # Do not turn a subscription into a misleading one-time payment.
        if product.recurring_payment:
            reason = (
                "Recurring billing is not implemented in this prototype."
            )

            audit_id = record_attempt(
                user_request=request.user_request,
                product_id=product.id,
                product_name=product.name,
                currency=product.currency,
                quantity=quantity,
                item_total=item_total,
                shipping=shipping,
                total=total,
                decision="BLOCKED",
                reason=reason,
            )

            return {
                "success": True,
                "payment_created": False,
                "message": reason,
                "audit_id": audit_id,
                "intent": intent.model_dump(),
                "product": product.model_dump(),
                "decision": {
                    "allowed": False,
                    "reason": reason,
                    "checks": [
                        *decision.checks,
                        "Recurring checkout support: FAIL",
                    ],
                },
            }

        # 7. Only an allowed, supported transaction reaches PayPal.
        access_token = get_access_token()

        order = create_paypal_order(
            access_token=access_token,
            product_name=product.name,
            total=total,
            currency=product.currency,
        )

        approve_url = next(
            (
                link.get("href")
                for link in order.get("links", [])
                if link.get("rel") == "approve"
            ),
            None,
        )

        # 8. Persist the authorization and returned PayPal order.
        audit_id = record_attempt(
            user_request=request.user_request,
            product_id=product.id,
            product_name=product.name,
            currency=product.currency,
            quantity=quantity,
            item_total=item_total,
            shipping=shipping,
            total=total,
            decision="AUTHORIZED",
            reason=decision.reason,
            paypal_order_id=order.get("id"),
            paypal_status=order.get("status", "CREATED"),
        )

        return {
            "success": True,
            "payment_created": True,
            "message": "Transaction authorized. PayPal order created.",
            "audit_id": audit_id,
            "intent": intent.model_dump(),
            "product": product.model_dump(),
            "transaction": transaction.model_dump(),
            "decision": decision.model_dump(),
            "paypal": {
                "order_id": order.get("id"),
                "status": order.get("status"),
                "approve_url": approve_url,
            },
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Checkout pipeline failed: {exc}",
        )
