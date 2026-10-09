from typing import List

from pydantic import BaseModel, Field


class PaymentIntent(BaseModel):
    category: str
    purpose: str | None = None
    max_total: float
    currency: str
    quantity: int = Field(default=1, ge=1)
    shipping_included: bool = False
    recurring_payment: bool = False


class ProposedTransaction(BaseModel):
    category: str
    quantity: int = Field(default=1, ge=1)
    item_total: float = Field(ge=0)
    shipping: float = Field(default=0, ge=0)
    currency: str
    recurring_payment: bool = False


class PolicyDecision(BaseModel):
    allowed: bool
    reason: str
    checks: List[str]


def normalize_text(value: str) -> str:
    return " ".join(value.lower().strip().split())


def evaluate_payment(
    intent: PaymentIntent,
    transaction: ProposedTransaction,
) -> PolicyDecision:

    checks = []

    # ---------------------------------------------------------
    # 1. Currency check
    # ---------------------------------------------------------
    if normalize_text(intent.currency) != normalize_text(
        transaction.currency
    ):
        return PolicyDecision(
            allowed=False,
            reason=(
                f"Currency mismatch: user authorized "
                f"{intent.currency}, but transaction uses "
                f"{transaction.currency}."
            ),
            checks=[
                "Currency check: FAIL",
            ],
        )

    checks.append("Currency check: PASS")

    # ---------------------------------------------------------
    # 2. Category check
    # ---------------------------------------------------------
    authorized_category = normalize_text(intent.category)
    transaction_category = normalize_text(transaction.category)

    if authorized_category != transaction_category:
        return PolicyDecision(
            allowed=False,
            reason=(
                f"Category mismatch: user authorized "
                f"'{intent.category}', but transaction is "
                f"'{transaction.category}'."
            ),
            checks=checks + [
                "Category check: FAIL",
            ],
        )

    checks.append("Category check: PASS")

    # ---------------------------------------------------------
    # 3. Quantity check
    # ---------------------------------------------------------
    if transaction.quantity > intent.quantity:
        return PolicyDecision(
            allowed=False,
            reason=(
                f"Quantity exceeds authorization: "
                f"user allowed {intent.quantity}, "
                f"transaction requests {transaction.quantity}."
            ),
            checks=checks + [
                "Quantity check: FAIL",
            ],
        )

    checks.append("Quantity check: PASS")

    # ---------------------------------------------------------
    # 4. Recurring payment check
    # ---------------------------------------------------------
    if (
        transaction.recurring_payment
        and not intent.recurring_payment
    ):
        return PolicyDecision(
            allowed=False,
            reason=(
                "Recurring payment is not authorized by the user."
            ),
            checks=checks + [
                "Recurring-payment check: FAIL",
            ],
        )

    checks.append("Recurring-payment check: PASS")

    # ---------------------------------------------------------
    # 5. Calculate transaction total
    # ---------------------------------------------------------
    total = transaction.item_total + transaction.shipping

    if intent.shipping_included:
        checks.append(
            f"Shipping included in authorization: ${transaction.shipping:.2f}"
        )
    else:
        checks.append(
            "Shipping is allowed outside the user's maximum."
        )

    # ---------------------------------------------------------
    # 6. Budget check
    # ---------------------------------------------------------
    if intent.shipping_included:
        amount_to_check = total
    else:
        amount_to_check = transaction.item_total

    if amount_to_check > intent.max_total:
        return PolicyDecision(
            allowed=False,
            reason=(
                f"Transaction exceeds authorized maximum: "
                f"${amount_to_check:.2f} > "
                f"${intent.max_total:.2f}."
            ),
            checks=checks + [
                f"Budget check: FAIL "
                f"(${amount_to_check:.2f} > ${intent.max_total:.2f})"
            ],
        )

    checks.append(
        f"Budget check: PASS "
        f"(${amount_to_check:.2f} <= ${intent.max_total:.2f})"
    )

    # ---------------------------------------------------------
    # Everything passed
    # ---------------------------------------------------------
    return PolicyDecision(
        allowed=True,
        reason=(
            f"Transaction is within the user's authorization. "
            f"Checked amount: ${amount_to_check:.2f}."
        ),
        checks=checks,
    )


if __name__ == "__main__":

    print("=" * 60)
    print("PAYGUARD AI - POLICY ENGINE TEST")
    print("=" * 60)

    intent = PaymentIntent(
        category="headphones",
        purpose="college",
        max_total=25,
        currency="USD",
        quantity=1,
        shipping_included=True,
        recurring_payment=False,
    )

    print("\nUSER AUTHORIZATION")
    print(intent.model_dump_json(indent=2))

    # ---------------------------------------------------------
    # TEST 1: Should ALLOW
    # ---------------------------------------------------------
    transaction_1 = ProposedTransaction(
        category="headphones",
        quantity=1,
        item_total=19,
        shipping=4,
        currency="USD",
        recurring_payment=False,
    )

    result_1 = evaluate_payment(
        intent,
        transaction_1,
    )

    print("\n" + "-" * 60)
    print("TEST 1 — VALID TRANSACTION")
    print("-" * 60)
    print(result_1.model_dump_json(indent=2))

    # ---------------------------------------------------------
    # TEST 2: Should BLOCK because budget is exceeded
    # ---------------------------------------------------------
    transaction_2 = ProposedTransaction(
        category="headphones",
        quantity=1,
        item_total=23,
        shipping=5,
        currency="USD",
        recurring_payment=False,
    )

    result_2 = evaluate_payment(
        intent,
        transaction_2,
    )

    print("\n" + "-" * 60)
    print("TEST 2 — BUDGET EXCEEDED")
    print("-" * 60)
    print(result_2.model_dump_json(indent=2))

    # ---------------------------------------------------------
    # TEST 3: Should BLOCK because quantity is exceeded
    # ---------------------------------------------------------
    transaction_3 = ProposedTransaction(
        category="headphones",
        quantity=2,
        item_total=20,
        shipping=3,
        currency="USD",
        recurring_payment=False,
    )

    result_3 = evaluate_payment(
        intent,
        transaction_3,
    )

    print("\n" + "-" * 60)
    print("TEST 3 — QUANTITY EXCEEDED")
    print("-" * 60)
    print(result_3.model_dump_json(indent=2))
