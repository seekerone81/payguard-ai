import os
import sys

import requests
from dotenv import load_dotenv


load_dotenv()

CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")
BASE_URL = os.getenv(
    "PAYPAL_BASE_URL",
    "https://api-m.sandbox.paypal.com",
)

if not CLIENT_ID or not CLIENT_SECRET:
    print("❌ Missing PayPal credentials in .env")
    sys.exit(1)


def get_access_token() -> str:
    response = requests.post(
        f"{BASE_URL}/v1/oauth2/token",
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={
            "Accept": "application/json",
            "Accept-Language": "en_US",
        },
        data={
            "grant_type": "client_credentials",
        },
        timeout=30,
    )

    response.raise_for_status()
    return response.json()["access_token"]


def create_order(access_token: str) -> dict:
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "amount": {
                    "currency_code": "USD",
                    "value": "1.00",
                }
            }
        ],
        "application_context": {
            "return_url": "http://localhost:8000/paypal/return",
            "cancel_url": "http://localhost:8000/paypal/cancel",
        },
    }

    response = requests.post(
        f"{BASE_URL}/v2/checkout/orders",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
        json=payload,
        timeout=30,
    )

    print("Create order HTTP status:", response.status_code)

    if not response.ok:
        print("❌ PayPal returned an error:")
        print(response.text)
        sys.exit(1)

    return response.json()


def main() -> None:
    print("🔐 Getting PayPal access token...")
    token = get_access_token()

    print("✅ Authentication successful")
    print("🛒 Creating $1.00 Sandbox order...")

    order = create_order(token)

    print("\n✅ ORDER CREATED")
    print("Order ID:", order.get("id"))
    print("Status:", order.get("status"))

    print("\nLinks returned by PayPal:")
    for link in order.get("links", []):
        print(f"- {link.get('rel')}: {link.get('href')}")


if __name__ == "__main__":
    main()
