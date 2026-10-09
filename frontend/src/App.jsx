import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Headphones,
  Mouse,
  Notebook,
  Palette,
  Search,
  ShieldAlert,
  WalletCards,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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


function PolicyChecks({ checks }) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return null
  }

  return (
    <motion.div
      className="policy-check-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="policy-check-heading">
        <span className="policy-check-heading-icon">
          <Activity size={19} aria-hidden="true" />
        </span>
        <div>
          <h3>Policy evaluation</h3>
          <p>Deterministic authorization checks</p>
        </div>
      </div>

      <ul className="policy-check-list">
        {checks.map((check, index) => {
          const upper = String(check).toUpperCase()
          const failed = upper.includes("FAIL")
          const passed = upper.includes("PASS")
          const state = failed ? "fail" : passed ? "pass" : "info"

          return (
            <motion.li
              key={`${index}-${check}`}
              className={`policy-check-row ${state}`}
              initial={{ opacity: 0, x: -7 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: index * 0.035 }}
            >
              <span className="policy-check-row-icon">
                {failed ? (
                  <ShieldAlert size={17} aria-hidden="true" />
                ) : passed ? (
                  <CheckCircle2 size={17} aria-hidden="true" />
                ) : (
                  <Activity size={17} aria-hidden="true" />
                )}
              </span>

              <span className="policy-check-text">{check}</span>

              <strong className="policy-check-state">
                {failed ? "FAIL" : passed ? "PASS" : "INFO"}
              </strong>
            </motion.li>
          )
        })}
      </ul>
    </motion.div>
  )
}

export default function App() {
  const [request, setRequest] = useState(DEFAULT_REQUEST)
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem('payguard-ai-theme')
      return ['minimalist', 'fintech', 'aurora'].includes(saved)
        ? saved
        : 'fintech'
    } catch {
      return 'fintech'
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('payguard-ai-theme', theme)
    } catch {
      // Continue working if browser storage is unavailable.
    }
  }, [theme])
  const [proposal, setProposal] = useState(null)
  const [checkout, setCheckout] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [workingId, setWorkingId] = useState(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [historyFilter, setHistoryFilter] = useState('all')
  const [historyQuery, setHistoryQuery] = useState('')

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/history')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Could not load history')
      }

      setHistoryError('')
      setHistory(data.entries || [])
    } catch (err) {
      setHistoryError(err.message)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadHistory()
    }, 0)

    return () => window.clearTimeout(timerId)
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

  const completedCount = history.filter(
    (entry) =>
      entry.decision === 'PAYMENT_COMPLETED' ||
      entry.paypal_status === 'COMPLETED',
  ).length

  const blockedCount = history.filter(
    (entry) => entry.decision === 'BLOCKED',
  ).length

  const filteredHistory = history.filter((entry) => {
    const isBlocked = entry.decision === 'BLOCKED'
    const isCompleted =
      entry.decision === 'PAYMENT_COMPLETED' ||
      entry.paypal_status === 'COMPLETED'

    const matchesFilter =
      historyFilter === 'all' ||
      (historyFilter === 'blocked' && isBlocked) ||
      (historyFilter === 'completed' && isCompleted) ||
      (historyFilter === 'pending' && !isBlocked && !isCompleted)

    const searchText = [
      entry.product_name,
      entry.product_id,
      entry.paypal_order_id,
      entry.decision,
      entry.reason,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return matchesFilter && searchText.includes(historyQuery.toLowerCase())
  })

  return (
    <div className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">P</span>
          <span>PayGuard<span className="brand-light"> AI</span></span>
        </a>

        <nav className="primary-nav" aria-label="Main navigation">
          <a href="#overview">Overview</a>
          <a href="#purchase">Purchase</a>
          <a href="#history">Activity</a>
        </nav>

        <div className="header-actions">
          <div className="header-status">
            <span className="status-dot" />
            Sandbox environment
          </div>

          <label className="theme-control">
            <Palette size={17} aria-hidden="true" />
            <span className="theme-control-caption">Appearance</span>
            <select
              aria-label="Choose appearance theme"
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            >
              <option value="minimalist">Minimalist</option>
              <option value="fintech">Premium Fintech</option>
              <option value="aurora">Aurora Glass</option>
            </select>
          </label>
        </div>
      </header>

      <main className="main-content">
        <motion.section
          className="hero"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
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
        </motion.section>

        <motion.section
          className="overview-section"
          id="overview"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <div className="overview-heading">
            <div>
              <span className="step-label">YOUR WORKSPACE</span>
              <h2>Authorization overview</h2>
              <p>Transaction activity from your local audit history.</p>
            </div>

            <a className="overview-link" href="#history">
              View activity <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>

          <div className="overview-grid">
            <motion.article
              className="overview-stat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.10 }}
            >
              <div className="overview-stat-top">
                <span className="overview-stat-icon">
                  <WalletCards size={19} aria-hidden="true" />
                </span>
                <span className="overview-stat-label">Recorded attempts</span>
              </div>
              <strong className="overview-stat-value">{history.length}</strong>
              <p className="overview-stat-note">Checkout attempts in local history</p>
            </motion.article>

            <motion.article
              className="overview-stat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.16 }}
            >
              <div className="overview-stat-top">
                <span className="overview-stat-icon success">
                  <CheckCircle2 size={19} aria-hidden="true" />
                </span>
                <span className="overview-stat-label">Completed</span>
              </div>
              <strong className="overview-stat-value">{completedCount}</strong>
              <p className="overview-stat-note">Sandbox payments marked completed</p>
            </motion.article>

            <motion.article
              className="overview-stat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.22 }}
            >
              <div className="overview-stat-top">
                <span className="overview-stat-icon danger">
                  <ShieldAlert size={19} aria-hidden="true" />
                </span>
                <span className="overview-stat-label">Blocked</span>
              </div>
              <strong className="overview-stat-value">{blockedCount}</strong>
              <p className="overview-stat-note">Attempts rejected by policy</p>
            </motion.article>

            <motion.article
              className="overview-stat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.28 }}
            >
              <div className="overview-stat-top">
                <span className="overview-stat-icon value">
                  <CircleDollarSign size={19} aria-hidden="true" />
                </span>
                <span className="overview-stat-label">Completed value · USD</span>
              </div>
              <strong className="overview-stat-value">
                {money(
                  history
                    .filter(
                      (entry) =>
                        entry.currency === 'USD' &&
                        (entry.decision === 'PAYMENT_COMPLETED' ||
                          entry.paypal_status === 'COMPLETED'),
                    )
                    .reduce((total, entry) => total + Number(entry.total || 0), 0),
                  'USD',
                )}
              </strong>
              <p className="overview-stat-note">Recorded completed Sandbox orders</p>
            </motion.article>
          </div>
        </motion.section>

        <motion.nav
          className="purchase-stepper"
          aria-label="Purchase progress"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <div className={`purchase-step ${proposal ? 'is-complete' : 'is-current'}`}>
            <span className="purchase-step-number">
              {proposal ? '✓' : '01'}
            </span>
            <span className="purchase-step-copy">
              <strong>Describe</strong>
              <small>Purchase request</small>
            </span>
          </div>

          <div className={`purchase-step ${proposal ? 'is-complete' : ''}`}>
            <span className="purchase-step-number">
              {proposal ? '✓' : '02'}
            </span>
            <span className="purchase-step-copy">
              <strong>Authorization</strong>
              <small>Review your limits</small>
            </span>
          </div>

          <div className={`purchase-step ${
            checkout
              ? 'is-complete'
              : proposal
                ? 'is-current'
                : ''
          }`}>
            <span className="purchase-step-number">
              {checkout ? '✓' : '03'}
            </span>
            <span className="purchase-step-copy">
              <strong>Product</strong>
              <small>Compare options</small>
            </span>
          </div>

          <div className={`purchase-step ${
            checkout
              ? checkout.payment_created
                ? 'is-current'
                : 'is-blocked'
              : ''
          }`}>
            <span className="purchase-step-number">04</span>
            <span className="purchase-step-copy">
              <strong>
                {checkout && !checkout.payment_created
                  ? 'Blocked'
                  : 'PayPal approval'}
              </strong>
              <small>
                {checkout && !checkout.payment_created
                  ? 'Policy rejected the request'
                  : 'Review before approving'}
              </small>
            </span>
          </div>
        </motion.nav>

        <section className="request-card" id="purchase">
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
                      <motion.article
                        className="product-card"
                        key={product.id}
                        layout
                        initial={{ opacity: 0, y: 18, scale: 0.985 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        viewport={{ once: true, amount: 0.18 }}
                        whileHover={{ y: -5 }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                      >
                        <div className="product-visual">
                          <div className="product-artwork">
                            <div className="product-artwork-icon">
                              {product.category === 'headphones' ? (
                                <Headphones
                                  size={34}
                                  strokeWidth={1.6}
                                  aria-hidden="true"
                                />
                              ) : product.category === 'notebooks' ? (
                                <Notebook
                                  size={34}
                                  strokeWidth={1.6}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Mouse
                                  size={34}
                                  strokeWidth={1.6}
                                  aria-hidden="true"
                                />
                              )}
                            </div>

                            <div className="product-artwork-copy">
                              <span className="product-artwork-kicker">
                                CURATED FOR YOUR REQUEST
                              </span>
                              <strong>
                                {product.category === 'headphones'
                                  ? 'Study essentials'
                                  : product.category === 'notebooks'
                                    ? 'Everyday stationery'
                                    : 'Desk setup'}
                              </strong>
                              <small>Sample catalog · Sandbox demo</small>
                            </div>
                          </div>

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
                      </motion.article>
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
                <div className="result-icon pending-icon"><Clock size={25} aria-hidden="true" /></div>
                <span className="step-label">
                  ORDER CREATED · APPROVAL REQUIRED
                </span>

                <h2>Order created — approval required</h2>

                <p>
                  Your purchase passed PayGuard's policy checks, and a
                  PayPal Sandbox order has been created. The payment is
                  not complete yet. Continue to PayPal to review and
                  approve the order.
                </p>

                <div className="order-details">
                  <span>Order ID</span>
                  <strong>{checkout.paypal?.order_id}</strong>
                  <span>PayPal status</span>
                  <strong>{checkout.paypal?.status}</strong>
                  <span>Audit record</span>
                  <strong>{checkout.audit_id ?? 'Not returned'}</strong>
                </div>

                <PolicyChecks checks={checkout.decision?.checks} />

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
                <PolicyChecks checks={checkout.decision?.checks} />
              </>
            )}
          </section>
        )}

        <section className="history-section" id="history">
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
            Search recorded attempts and filter by the authorization outcome.
          </p>

          <div className="history-toolbar">
            <label className="history-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search transaction history</span>
              <input
                type="search"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Search products, decisions, or order IDs"
              />
            </label>

            <div className="history-filters" aria-label="Filter transaction history">
              {[
                ['all', 'All'],
                ['completed', 'Completed'],
                ['blocked', 'Blocked'],
                ['pending', 'Other'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`history-filter ${historyFilter === value ? 'active' : ''}`}
                  aria-pressed={historyFilter === value}
                  onClick={() => setHistoryFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

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

          {history.length > 0 && filteredHistory.length > 0 && (
            <div className="history-list">
              <AnimatePresence initial={false}>
              {filteredHistory.map((entry) => {
                const blocked = entry.decision === 'BLOCKED'

                const completed =
                  entry.decision === 'PAYMENT_COMPLETED' ||
                  entry.paypal_status === 'COMPLETED'

                const awaitingApproval =
                  !blocked &&
                  !completed &&
                  entry.paypal_status === 'CREATED' &&
                  Boolean(entry.paypal_order_id)

                return (
                  <motion.article
                    className="history-item"
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  >
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
                            : awaitingApproval
                              ? 'history-badge history-awaiting-approval'
                              : 'history-badge history-pending'
                        }
                      >
                        {blocked
                          ? 'BLOCKED'
                          : completed
                            ? 'COMPLETED'
                            : awaitingApproval
                              ? 'AWAITING APPROVAL'
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
                  </motion.article>
                )
              })}
              </AnimatePresence>
            </div>
          )}

          {history.length > 0 && filteredHistory.length === 0 && (
            <div className="filtered-empty">
              <Activity size={22} aria-hidden="true" />
              <h3>No matching transactions</h3>
              <p>Try another search or clear the current filters.</p>
              <button
                type="button"
                onClick={() => {
                  setHistoryQuery('')
                  setHistoryFilter('all')
                }}
              >
                Clear filters
              </button>
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
