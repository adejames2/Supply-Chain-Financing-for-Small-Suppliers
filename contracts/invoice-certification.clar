;; invoice-certification.clar
;; This contract confirms the delivery of goods or services

(define-map invoices
  { invoice-id: (string-ascii 32) }
  {
    supplier: principal,
    buyer: principal,
    amount: uint,
    due-date: uint,
    status: (string-ascii 20),
    timestamp: uint
  }
)

;; Error codes
(define-constant ERR_UNAUTHORIZED u1)
(define-constant ERR_ALREADY_EXISTS u2)
(define-constant ERR_NOT_FOUND u3)
(define-constant ERR_INVALID_STATUS u4)

;; Define the contract owner
(define-data-var contract-owner principal tx-sender)

;; Check if caller is contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner)))

;; Create a new invoice
(define-public (create-invoice
    (invoice-id (string-ascii 32))
    (supplier principal)
    (buyer principal)
    (amount uint)
    (due-date uint)
  )
  (begin
    (asserts! (or (is-eq tx-sender supplier) (is-contract-owner)) (err ERR_UNAUTHORIZED))
    (asserts! (is-none (map-get? invoices { invoice-id: invoice-id })) (err ERR_ALREADY_EXISTS))

    (map-set invoices
      { invoice-id: invoice-id }
      {
        supplier: supplier,
        buyer: buyer,
        amount: amount,
        due-date: due-date,
        status: "pending",
        timestamp: block-height
      }
    )
    (ok true)))

;; Certify an invoice (confirm delivery)
(define-public (certify-invoice (invoice-id (string-ascii 32)))
  (let ((invoice (unwrap! (map-get? invoices { invoice-id: invoice-id }) (err ERR_NOT_FOUND))))
    (begin
      (asserts! (or (is-eq tx-sender (get buyer invoice)) (is-contract-owner)) (err ERR_UNAUTHORIZED))
      (asserts! (is-eq (get status invoice) "pending") (err ERR_INVALID_STATUS))

      (map-set invoices
        { invoice-id: invoice-id }
        (merge invoice { status: "certified" })
      )
      (ok true))))

;; Get invoice details
(define-read-only (get-invoice (invoice-id (string-ascii 32)))
  (map-get? invoices { invoice-id: invoice-id }))

;; Check if an invoice is certified
(define-read-only (is-certified (invoice-id (string-ascii 32)))
  (match (map-get? invoices { invoice-id: invoice-id })
    invoice (is-eq (get status invoice) "certified")
    false))

;; Transfer contract ownership
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-contract-owner) (err ERR_UNAUTHORIZED))
    (var-set contract-owner new-owner)
    (ok true)))

