from typing import Optional

from ollama import chat
from pydantic import BaseModel, Field


MODEL = "llama3.2:3b"


class PaymentIntent(BaseModel):
    category: str = Field(
        description=(
            "The product or service being purchased. "
            "Use only the item name, never the reason or purpose. "
            "Example: 'headphones', not 'headphones for college'."
        )
    )

    purpose: Optional[str] = Field(
        default=None,
        description=(
            "The explicit reason or intended use for the purchase. "
            "Example: 'college' for 'headphones for college'. "
            "Use null when no purpose is stated."
        )
    )

    max_total: float = Field(
        description="Maximum total amount the user authorizes"
    )

    currency: str = Field(
        description="Currency of the authorized amount"
    )

    quantity: int = Field(
        default=1,
        ge=1,
        description="Maximum quantity the user authorizes"
    )

    shipping_included: bool = Field(
        default=False,
        description=(
            "True only when shipping/delivery must be included "
            "inside the maximum authorized amount"
        )
    )

    recurring_payment: bool = Field(
        default=False,
        description=(
            "True only when the user explicitly authorizes "
            "a recurring or subscription payment"
        )
    )


def extract_payment_intent(user_request: str) -> PaymentIntent:
    schema = PaymentIntent.model_json_schema()

    prompt = f"""
You are the payment-intent extraction component of PayGuard AI.

Extract the user's authorization requirements into the provided schema.

This output will be used by a payment security system.
Accuracy is more important than creativity.

STRICT RULES:

1. category:
   - Only the product or service being purchased.
   - Keep it short.
   - NEVER include the reason/purpose.
   - "headphones for college" -> category = "headphones"
   - "wireless mouse for office work" -> category = "wireless mouse"
   - "laptop for programming" -> category = "laptop"

2. purpose:
   - Extract the explicit reason/intended use.
   - "for college" -> "college"
   - "for office work" -> "office work"
   - "for programming" -> "programming"
   - If no reason is stated, use null.

3. max_total:
   - The maximum amount the user authorizes.
   - "under $30" -> 30
   - "no more than $15 total" -> 15
   - Do not invent a value.

4. quantity:
   - Extract explicitly stated quantity.
   - "three notebooks" -> 3
   - "only one" -> 1
   - Otherwise default to 1.

5. shipping_included:
   - True when the user explicitly says shipping/delivery is included
     in the maximum.
   - False when shipping is allowed to be extra.
   - Example:
       "under $25 including delivery" -> true
       "delivery can be extra" -> false

6. recurring_payment:
   - True ONLY for explicit recurring/subscription authorization.
   - "pay $10 per month" -> true
   - "subscribe" -> true
   - ordinary one-time purchases -> false

7. currency:
   - Use the explicitly stated currency.
   - If no currency is stated, use USD for this prototype.

Examples:

USER:
Buy me headphones for college. Maximum $25 including delivery. Only one.

OUTPUT:
{{
  "category": "headphones",
  "purpose": "college",
  "max_total": 25,
  "currency": "USD",
  "quantity": 1,
  "shipping_included": true,
  "recurring_payment": false
}}

USER:
Buy me one wireless mouse for office work. Maximum $30 including delivery.

OUTPUT:
{{
  "category": "wireless mouse",
  "purpose": "office work",
  "max_total": 30,
  "currency": "USD",
  "quantity": 1,
  "shipping_included": true,
  "recurring_payment": false
}}

USER:
Buy 3 notebooks. Spend no more than $15 total. Delivery can be extra.

OUTPUT:
{{
  "category": "notebooks",
  "purpose": null,
  "max_total": 15,
  "currency": "USD",
  "quantity": 3,
  "shipping_included": false,
  "recurring_payment": false
}}

USER:
Subscribe me to a productivity app for $10 per month.

OUTPUT:
{{
  "category": "productivity app",
  "purpose": null,
  "max_total": 10,
  "currency": "USD",
  "quantity": 1,
  "shipping_included": false,
  "recurring_payment": true
}}

Return ONLY data matching this schema:

{schema}

USER REQUEST:
{user_request}
"""

    response = chat(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        format=schema,
        options={
            "temperature": 0,
        },
    )

    return PaymentIntent.model_validate_json(
        response.message.content
    )


if __name__ == "__main__":
    request = input("Enter a payment request: ").strip()

    if not request:
        print("❌ Please enter a payment request.")
        raise SystemExit(1)

    try:
        intent = extract_payment_intent(request)

        print("\n✅ Extracted Payment Authorization:\n")
        print(intent.model_dump_json(indent=2))

    except Exception as exc:
        print("\n❌ AI intent extraction failed:")
        print(exc)
        raise SystemExit(1)
