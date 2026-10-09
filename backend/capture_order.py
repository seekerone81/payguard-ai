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


def get_access_token():
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


def capture_order(order_id, access_token):
    response = requests.post(
        f"{BASE_URL}/v2/checkout/orders/{order_id}/capture",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
        timeout=30,
    )

    print("Capture HTTP status:", response.status_code)

    try:
        data = response.json()
    except ValueError:
        print(response.text)
        sys.exit(1)

    if not response.ok:
        print("❌ Capture failed")
        print(data)
        sys.exit(1)

    return data


def main():
    if len(sys.argv) != 2:
        print("Usage:")
        print("python backend/capture_order.py ORDER_ID")
        sys.exit(1)

    order_id = sys.argv[1]

    print("🔐 Getting PayPal access token...")
    token = get_access_token()

    print("✅ Authentication successful")
    print(f"💳 Capturing order: {order_id}")

    result = capture_order(order_id, token)

    print("\n✅ CAPTURE SUCCESSFUL")
    print("Order ID:", result.get("id"))
    print("Status:", result.get("status"))


if __name__ == "__main__":
    main()
