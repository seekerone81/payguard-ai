import { useCallback, useEffect, useState } from 'react'
import './App.css'

const DEFAULT_REQUEST =
  'Buy me headphones for college. Maximum $25 including delivery. Only one.'

function money(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(Number(value))
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`
  }
}

function dateText(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString()
}

export default function App() {
  const [request, setRequest] = useState(DEFAULT_REQUEST)
  const [proposal, setProposal] = useState(null)
  const [checkout, setCheckout] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [workingId, setWorkingId] = useState(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')

  const loadHistory = useCallback(async () => {
    try {
      setHistoryError('')

      const response = await fetch('/api/history')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Could not load history')
      }

      setHistory(data.entries || [])
    } catch (err) {
      setHistoryError(err.message)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  async function analyze(event) {
    event.preventDefault()

    if (!request.trim()) {
      setError('Describe the purchase you want to make.')
      return
    }

    setLoading(true)
    setError('')
    setProposal(null)
    setCheckout(null)

    try {
      const response = await fetch('/api/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_request: request }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Analysis failed')
      }

      setProposal(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function authorize(productId) {
    setWorkingId(productId)
    setError('')
    setCheckout(null)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_request: request,
          product_id: productId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Checkout failed')
      }

      setCheckout(data)
      await loadHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setWorkingId(null)
    }
  }

  const intent = proposal?.intent

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">P</span>
          <span>PayGuard<span className="brand-light"> AI</span></span>
        </a>

        <div className="header-status">
          <span className="status-dot" />
          Sandbox environment
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div className="eyebrow">
            AI-POWERED PAYMENT PROTECTION
          </div>

          <h1>
            Give your AI
            <br />
            <span className="gradient-text">spending limits.</span>
          </h1>

          <p className="hero-description">
            Describe your purchase. PayGuard interprets your
            instructions, evaluates products, and checks spending
            limits before creating a PayPal order.
          </p>

          <div className="trust-points">
            <span>Spending limits</span>
            <span>Independent policy checks</span>
            <span>PayPal Sandbox checkout</span>
          </div>
        </section>

        <section className="request-card">
          <div className="section-heading">
            <div>
              <span className="step-label">STEP 01</span>
              <h2>Describe your purchase</h2>
            </div>
            <span className="ai-badge">Llama 3.2</span>
          </div>

          <form onSubmit={analyze}>
            <label htmlFor="purchase-request">
              What would you like to purchase?
            </label>

            <textarea
              id="purchase-request"
              value={request}
              onChange={(event) => {
                setRequest(event.target.value)
                setProposal(null)
                setCheckout(null)
                setError('')
              }}
              rows={4}
              required
            />

            <div className="form-footer">
              <span className="helper-text">
                Include your maximum budget and restrictions.
              </span>

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Analyzing...' : 'Analyze request'}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <div className="message error-message" role="alert">
            <strong>Something went wrong</strong>
            <p>{error}</p>
          </div>
        )}

        {proposal && (
          <>
            <section className="authorization-card">
              <div className="section-heading">
                <div>
                  <span className="step-label">STEP 02</span>
                  <h2>Your authorization</h2>
                </div>
                <span className="ai-badge">AI extracted</span>
              </div>

              <div className="intent-grid">
                <div className="intent-item">
                  <span>Category</span>
                  <strong>{intent.category}</strong>
                </div>

                <div className="intent-item">
                  <span>Maximum amount</span>
                  <strong className="amount">
                    {money(intent.max_total, intent.currency)}
                  </strong>
                </div>

                <div className="intent-item">
                  <span>Quantity</span>
                  <strong>{intent.quantity}</strong>
                </div>

                <div className="intent-item">
                  <span>Shipping</span>
                  <strong>
                    {intent.shipping_included
                      ? 'Included in limit'
                      : 'May be extra'}
                  </strong>
                </div>

                <div className="intent-item">
                  <span>Recurring payments</span>
                  <strong>
                    {intent.recurring_payment
                      ? 'Requested'
                      : 'Not authorized'}
                  </strong>
                </div>
              </div>

              <p className="demo-note">
                Product names and prices in this prototype are sample
                data, not live retailer offers.
              </p>
            </section>

            <section className="products-section">
              <div className="section-heading">
                <div>
                  <span className="step-label">STEP 03</span>
                  <h2>Product options</h2>
                </div>
                <span className="result-count">
                  {proposal.candidates.length} found
                </span>
              </div>

              {proposal.candidates.length === 0 ? (
                <div className="empty-state">
                  <h3>No matching products</h3>
                  <p>
                    Try headphones, wireless mouse, or notebooks
                    using a USD budget.
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {proposal.candidates.map((item) => {
                    const product = item.product

                    const inStock =
                      product.stock >= item.quantity

                    const subscriptionSupported =
                      !product.recurring_payment

                    const eligible =
                      item.within_budget &&
                      inStock &&
                      subscriptionSupported

                    return (
                      <article
                        className="product-card"
                        key={product.id}
                      >
                        <div className="product-visual">
                          <span className="product-symbol">
                            {product.category === 'headphones'
                              ? '♫'
                              : product.category === 'notebooks'
                                ? '▤'
                                : '⌁'}
                          </span>

                          <span
                            className={
                              eligible
                                ? 'decision-badge allowed'
                                : 'decision-badge blocked'
                            }
                          >
                            {eligible ? 'Within limits' : 'Blocked'}
                          </span>
                        </div>

                        <div className="product-information">
                          <p className="product-category">
                            {product.category}
                          </p>

                          <h3>{product.name}</h3>

                          <p className="product-description">
                            {product.description}
                          </p>

                          <div className="price-lines">
                            <div>
                              <span>Item price</span>
                              <strong>
                                {money(
                                  product.price * item.quantity,
                                  product.currency,
                                )}
                              </strong>
                            </div>

                            <div>
                              <span>Shipping</span>
                              <strong>
                                {money(
                                  product.shipping,
                                  product.currency,
                                )}
                              </strong>
                            </div>

                            <div className="total-line">
                              <span>Total</span>
                              <strong>
                                {money(
                                  item.total,
                                  product.currency,
                                )}
                              </strong>
                            </div>
                          </div>

                          <div
                            className={
                              eligible
                                ? 'budget-result good'
                                : 'budget-result bad'
                            }
                          >
                            {eligible
                              ? `Within your ${money(intent.max_total, intent.currency)} limit`
                              : !inStock
                                ? 'Insufficient stock'
                                : !subscriptionSupported
                                  ? 'Recurring checkout is not supported'
                                  : `Exceeds limit by ${money(
                                      Math.max(
                                        0,
                                        item.amount_checked -
                                          intent.max_total,
                                      ),
                                      intent.currency,
                                    )}`}
                          </div>

                          <button
                            className={
                              eligible
                                ? 'primary-button full-width'
                                : 'blocked-button full-width'
                            }
                            disabled={
                              !eligible || workingId !== null
                            }
                            onClick={() => authorize(product.id)}
                          >
                            {workingId === product.id
                              ? 'Checking authorization...'
                              : eligible
                                ? 'Authorize and continue'
                                : 'Not authorized'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {checkout && (
          <section className="checkout-result">
            {checkout.payment_created ? (
              <>
                <div className="result-icon success-icon">OK</div>
                <span className="step-label">
                  POLICY CHECK PASSED
                </span>

                <h2>PayPal order is ready</h2>

                <p>
                  PayGuard authorized this purchase and created a
                  Sandbox order. Review it before approving.
                </p>

                <div className="order-details">
                  <span>Order ID</span>
                  <strong>{checkout.paypal?.order_id}</strong>
                  <span>PayPal status</span>
                  <strong>{checkout.paypal?.status}</strong>
                  <span>Audit record</span>
                  <strong>{checkout.audit_id ?? 'Not returned'}</strong>
                </div>

                {checkout.paypal?.approve_url && (
                  <a
                    className="primary-button checkout-link"
                    href={checkout.paypal.approve_url}
                  >
                    Continue to PayPal Sandbox
                  </a>
                )}
              </>
            ) : (
              <>
                <div className="result-icon blocked-icon">!</div>
                <span className="step-label">
                  POLICY CHECK FAILED
                </span>

                <h2>Transaction blocked</h2>

                <p>
                  {checkout.decision?.reason || checkout.message}
                </p>

                <div className="blocked-summary">
                  No PayPal order was created for this attempt.
                  Audit record: {checkout.audit_id ?? 'Not returned'}.
                </div>
              </>
            )}
          </section>
        )}

        <section className="history-section">
          <div className="section-heading">
            <div>
              <span className="step-label">AUDIT TRAIL</span>
              <h2>Transaction history</h2>
            </div>

            <button
              className="secondary-button"
              onClick={loadHistory}
            >
              Refresh history
            </button>
          </div>

          <p className="history-description">
            Review recent recorded checkout attempts and their
            authorization decisions.
          </p>

          {historyError && (
            <div className="message error-message">
              <strong>Could not load history</strong>
              <p>{historyError}</p>
            </div>
          )}

          {!historyError && history.length === 0 && (
            <div className="empty-state">
              <h3>No audit records yet</h3>
              <p>
                Recorded checkout attempts will appear here.
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="history-list">
              {history.map((entry) => {
                const blocked = entry.decision === 'BLOCKED'

                const completed =
                  entry.decision === 'PAYMENT_COMPLETED' ||
                  entry.paypal_status === 'COMPLETED'

                return (
                  <article className="history-item" key={entry.id}>
                    <div className="history-main">
                      <div>
                        <h3>{entry.product_name}</h3>
                        <p className="history-date">
                          {dateText(entry.created_at)}
                        </p>
                      </div>

                      <span
                        className={
                          blocked
                            ? 'history-badge history-blocked'
                            : completed
                              ? 'history-badge history-completed'
                              : 'history-badge history-pending'
                        }
                      >
                        {blocked
                          ? 'BLOCKED'
                          : completed
                            ? 'COMPLETED'
                            : entry.decision}
                      </span>
                    </div>

                    <div className="history-metrics">
                      <div>
                        <span>Total</span>
                        <strong>
                          {money(entry.total, entry.currency)}
                        </strong>
                      </div>

                      <div>
                        <span>Quantity</span>
                        <strong>{entry.quantity}</strong>
                      </div>

                      <div>
                        <span>PayPal status</span>
                        <strong>{entry.paypal_status}</strong>
                      </div>
                    </div>

                    <p className="history-reason">
                      <strong>Reason:</strong> {entry.reason}
                    </p>

                    {entry.paypal_order_id && (
                      <p className="history-order-id">
                        <strong>Order:</strong>{' '}
                        {entry.paypal_order_id}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          <p className="demo-note">
            This is a local prototype audit log, not a tamper-resistant
            production ledger.
          </p>
        </section>

        <section className="how-it-works">
          <span className="step-label">THE SECURITY MODEL</span>

          <div className="flow-grid">
            <div className="flow-item">
              <span className="flow-number">01</span>
              <strong>AI interprets</strong>
              <p>Extracts the user's spending instructions.</p>
            </div>

            <div className="flow-item">
              <span className="flow-number">02</span>
              <strong>Python enforces</strong>
              <p>Checks the purchase against the user's limits.</p>
            </div>

            <div className="flow-item">
              <span className="flow-number">03</span>
              <strong>PayPal executes</strong>
              <p>Creates a Sandbox order only after authorization.</p>
            </div>
          </div>
        </section>

        <footer className="footer">
          <span>PAYGUARD AI</span>
          <span>Hackathon prototype - PayPal Sandbox</span>
        </footer>
      </main>
    </div>
  )
}
