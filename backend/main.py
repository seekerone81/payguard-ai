import os
from html import escape

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .ai import extract_payment_intent
from .audit import list_history, update_order_status
from .checkout import router as checkout_router
from .guard import authorize_transaction
from .policy import ProposedTransaction
from .products import get_product, search_products, total_price


load_dotenv()

CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")

BASE_URL = os.getenv(
    "PAYPAL_BASE_URL",
    "https://api-m.sandbox.paypal.com",
)

app = FastAPI(
    title="PayGuard AI",
    description=(
        "AI-powered payment authorization and PayPal Sandbox integration."
    ),
    version="0.3.0",
)


class AuthorizationRequest(BaseModel):
    user_request: str
    transaction: ProposedTransaction


class ProductProposalRequest(BaseModel):
    user_request: str


def get_access_token() -> str:
    if not CLIENT_ID or not CLIENT_SECRET:
        raise RuntimeError(
            "PayPal credentials are missing from .env"
        )

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


def get_order(order_id: str, access_token: str) -> dict:
    response = requests.get(
        f"{BASE_URL}/v2/checkout/orders/{order_id}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )

    response.raise_for_status()
    return response.json()


def capture_order(order_id: str, access_token: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/v2/checkout/orders/{order_id}/capture",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )

    response.raise_for_status()
    return response.json()


@app.get("/")
def home():
    return {
        "application": "PayGuard AI",
        "status": "running",
        "paypal": "sandbox",
        "ai": "llama3.2:3b",
        "version": "0.3.0",
    }


# ============================================================
# PRODUCT CATALOG
# ============================================================

@app.get("/api/products")
def products(
    category: str | None = None,
    currency: str | None = None,
):
    results = search_products(
        category=category,
        currency=currency,
    )

    return {
        "count": len(results),
        "products": [
            product.model_dump()
            for product in results
        ],
    }


@app.get("/api/products/{product_id}")
def product_details(product_id: str):
    product = get_product(product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found",
        )

    return product.model_dump()


# ============================================================
# AI PRODUCT PROPOSALS
# ============================================================

@app.post("/api/propose")
def propose_product(request: ProductProposalRequest):
    try:
        intent = extract_payment_intent(
            request.user_request
        )

        candidates = search_products(
            category=intent.category,
            currency=intent.currency,
        )

        proposals = []

        for product in candidates:
            total = total_price(
                product,
                quantity=intent.quantity,
            )

            amount_to_check = (
                total
                if intent.shipping_included
                else product.price * intent.quantity
            )

            proposals.append({
                "product": product.model_dump(),
                "quantity": intent.quantity,
                "total": total,
                "amount_checked": amount_to_check,
                "within_budget": (
                    amount_to_check <= intent.max_total
                ),
            })

        return {
            "success": True,
            "intent": intent.model_dump(),
            "candidates": proposals,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Product proposal failed: {exc}",
        )


# ============================================================
# AI + POLICY AUTHORIZATION
# ============================================================

@app.post("/api/authorize")
def authorize(request: AuthorizationRequest):
    try:
        result = authorize_transaction(
            user_request=request.user_request,
            transaction_data=request.transaction.model_dump(),
        )

        return {
            "success": True,
            **result.to_dict(),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Authorization pipeline failed: {exc}",
        )


# ============================================================
# TRANSACTION HISTORY / AUDIT TRAIL
# ============================================================

@app.get("/api/history")
def transaction_history(
    limit: int = Query(default=20, ge=1, le=100),
):
    entries = list_history(limit=limit)

    return {
        "success": True,
        "count": len(entries),
        "entries": entries,
    }


# ============================================================
# PAYPAL RETURN
# ============================================================

@app.get("/paypal/return", response_class=HTMLResponse)
def paypal_return(token: str):
    try:
        access_token = get_access_token()
        order = get_order(token, access_token)
        order_status = order.get("status", "UNKNOWN")

        if order_status == "COMPLETED":
            result = order
            message = (
                "This PayPal order was already captured successfully."
            )

        elif order_status == "APPROVED":
            result = capture_order(token, access_token)
            message = "PayPal payment was captured successfully."

        else:
            update_order_status(token, order_status)

            status_html = escape(str(order_status))
            token_html = escape(token)

            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>PayGuard AI - Payment Status</title>
                </head>
                <body>
                    <h1>Payment not completed</h1>
                    <p>PayPal status: <strong>{status_html}</strong></p>
                    <p>Order ID: {token_html}</p>
                </body>
                </html>
                """,
                status_code=200,
            )

        final_status = result.get("status", order_status)

        # Keep the audit record in sync with PayPal.
        update_order_status(token, final_status)

        status_html = escape(str(final_status))
        token_html = escape(token)
        message_html = escape(message)

        if final_status == "COMPLETED":
            heading = "✓ Payment Completed"
        else:
            heading = "Payment status updated"

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>PayGuard AI - Payment Result</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background: #f5f7fb;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                }}
                .card {{
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                    max-width: 600px;
                }}
                .success {{
                    color: #15803d;
                    font-size: 28px;
                    font-weight: bold;
                }}
                .status {{
                    margin-top: 20px;
                    padding: 12px;
                    background: #f0fdf4;
                    border-radius: 8px;
                }}
            </style>
        </head>
        <body>
            <div class="card">
                <div class="success">{heading}</div>
                <p>{message_html}</p>
                <div class="status">
                    <strong>PayPal Status:</strong> {status_html}
                </div>
                <p>
                    <strong>Order ID:</strong><br>
                    {token_html}
                </p>
                <p>
                    PayGuard AI checked the PayPal order status.
                </p>
            </div>
        </body>
        </html>
        """

    except requests.HTTPError:
        return HTMLResponse(
            content="""
            <h1>Payment processing error</h1>
            <p>PayPal could not confirm or complete this order.
            Check the backend terminal for details.</p>
            """,
            status_code=502,
        )


@app.get("/paypal/cancel", response_class=HTMLResponse)
def paypal_cancel():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>PayGuard AI - Payment Cancelled</title>
    </head>
    <body>
        <h1>Payment Cancelled</h1>
        <p>No new payment was captured by this action.</p>
    </body>
    </html>
    """


# Register checkout endpoints.
app.include_router(checkout_router)
