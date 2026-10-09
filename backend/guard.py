from typing import Any

from .ai import PaymentIntent, extract_payment_intent
from .policy import ProposedTransaction, PolicyDecision, evaluate_payment


class GuardResult:
    """
    Combined result of the PayGuard authorization pipeline.

    Llama:
        Understands the user's natural-language request.

    Policy Engine:
        Deterministically decides whether the proposed transaction
        follows the user's authorization.
    """

    def __init__(
        self,
        intent: PaymentIntent,
        transaction: ProposedTransaction,
        decision: PolicyDecision,
    ):
        self.intent = intent
        self.transaction = transaction
        self.decision = decision

    def to_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent.model_dump(),
            "transaction": self.transaction.model_dump(),
            "decision": self.decision.model_dump(),
        }


def authorize_transaction(
    user_request: str,
    transaction_data: dict[str, Any],
) -> GuardResult:

    # 1. AI interprets the user's authorization
    intent = extract_payment_intent(user_request)

    # 2. Validate the proposed transaction
    transaction = ProposedTransaction(**transaction_data)

    # 3. Deterministic authorization decision
    decision = evaluate_payment(
        intent,
        transaction,
    )

    return GuardResult(
        intent=intent,
        transaction=transaction,
        decision=decision,
    )


if __name__ == "__main__":
    # Run as:
    # python -m backend.guard

    user_request = (
        "Buy me headphones for college. "
        "Maximum $25 including delivery. Only one."
    )

    transaction = {
        "category": "headphones",
        "quantity": 1,
        "item_total": 19,
        "shipping": 4,
        "currency": "USD",
        "recurring_payment": False,
    }

    result = authorize_transaction(
        user_request,
        transaction,
    )

    print(result.to_dict())
