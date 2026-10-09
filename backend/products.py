from typing import List, Optional

from pydantic import BaseModel, Field


class Product(BaseModel):
    id: str
    name: str
    category: str
    description: str
    price: float = Field(ge=0)
    shipping: float = Field(default=0, ge=0)
    currency: str
    stock: int = Field(default=1, ge=0)
    recurring_payment: bool = False


PRODUCTS: List[Product] = [
    Product(
        id="hp-001",
        name="Campus Wireless Headphones",
        category="headphones",
        description="Wireless over-ear headphones for study and everyday use.",
        price=19.00,
        shipping=4.00,
        currency="USD",
        stock=12,
    ),
    Product(
        id="hp-002",
        name="StudyBeat Headphones",
        category="headphones",
        description="Budget wireless headphones designed for students.",
        price=23.00,
        shipping=5.00,
        currency="USD",
        stock=8,
    ),
    Product(
        id="mouse-001",
        name="Office Wireless Mouse",
        category="wireless mouse",
        description="Compact wireless mouse for office and college work.",
        price=24.00,
        shipping=4.00,
        currency="USD",
        stock=15,
    ),
    Product(
        id="mouse-002",
        name="Silent Productivity Mouse",
        category="wireless mouse",
        description="Quiet wireless mouse for focused work.",
        price=27.00,
        shipping=3.00,
        currency="USD",
        stock=6,
    ),
    Product(
        id="note-001",
        name="Student Notebook Pack",
        category="notebooks",
        description="Three notebooks for classes and everyday notes.",
        price=12.00,
        shipping=2.00,
        currency="USD",
        stock=30,
    ),
    Product(
        id="note-002",
        name="Premium Notebook Pack",
        category="notebooks",
        description="Three premium notebooks with hardcover binding.",
        price=15.00,
        shipping=3.00,
        currency="USD",
        stock=10,
    ),
    Product(
        id="app-001",
        name="Productivity Pro",
        category="productivity app",
        description="Productivity application subscription.",
        price=10.00,
        shipping=0.00,
        currency="USD",
        stock=999,
        recurring_payment=True,
    ),
]


def search_products(
    category: Optional[str] = None,
    currency: Optional[str] = None,
) -> List[Product]:

    results = PRODUCTS

    if category:
        category_normalized = category.strip().lower()

        results = [
            product
            for product in results
            if product.category.lower() == category_normalized
        ]

    if currency:
        currency_normalized = currency.strip().upper()

        results = [
            product
            for product in results
            if product.currency.upper() == currency_normalized
        ]

    return results


def get_product(product_id: str) -> Optional[Product]:

    for product in PRODUCTS:
        if product.id == product_id:
            return product

    return None


def total_price(
    product: Product,
    quantity: int = 1,
) -> float:

    return (
        product.price * quantity
        + product.shipping
    )


if __name__ == "__main__":

    print("PAYGUARD AI PRODUCT CATALOG")
    print("=" * 60)

    for product in PRODUCTS:

        total = total_price(product)

        print(
            f"{product.id:10} | "
            f"{product.name:30} | "
            f"${product.price:.2f} + "
            f"${product.shipping:.2f} shipping "
            f"= ${total:.2f}"
        )
