import os
import sys

import requests
from dotenv import load_dotenv


load_dotenv()

client_id = os.getenv("PAYPAL_CLIENT_ID")
client_secret = os.getenv("PAYPAL_CLIENT_SECRET")
base_url = os.getenv(
    "PAYPAL_BASE_URL",
    "https://api-m.sandbox.paypal.com",
)

if not client_id or not client_secret:
    print("ERROR: PayPal credentials are missing from .env")
    sys.exit(1)


token_url = f"{base_url}/v1/oauth2/token"

response = requests.post(
    token_url,
    auth=(client_id, client_secret),
    headers={
        "Accept": "application/json",
        "Accept-Language": "en_US",
    },
    data={
        "grant_type": "client_credentials",
    },
    timeout=30,
)

print("HTTP STATUS:", response.status_code)

if response.ok:
    data = response.json()

    print("✅ PayPal authentication successful!")
    print("App ID:", data.get("app_id"))
    print("Token type:", data.get("token_type"))
    print("Expires in:", data.get("expires_in"), "seconds")

    # We deliberately do NOT print the access token.
else:
    print("❌ PayPal authentication failed.")
    print(response.text)
