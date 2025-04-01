import { describe, it, expect, beforeEach } from "vitest"

// Mock the Clarity contract environment
const mockContractEnv = () => {
  const state = {
    contractOwner: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
    txSender: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
    invoices: {},
    blockHeight: 100,
  }
  
  return {
    state,
    // Mock contract functions
    isContractOwner: () => state.txSender === state.contractOwner,
    createInvoice: (invoiceId, supplier, buyer, amount, dueDate) => {
      if (state.txSender !== supplier && state.txSender !== state.contractOwner) {
        return { type: "err", value: 1 } // ERR_UNAUTHORIZED
      }
      if (state.invoices[invoiceId] !== undefined) {
        return { type: "err", value: 2 } // ERR_ALREADY_EXISTS
      }
      
      state.invoices[invoiceId] = {
        supplier,
        buyer,
        amount,
        dueDate,
        status: "pending",
        timestamp: state.blockHeight,
      }
      
      return { type: "ok", value: true }
    },
    certifyInvoice: (invoiceId) => {
      const invoice = state.invoices[invoiceId]
      if (!invoice) {
        return { type: "err", value: 3 } // ERR_NOT_FOUND
      }
      if (state.txSender !== invoice.buyer && state.txSender !== state.contractOwner) {
        return { type: "err", value: 1 } // ERR_UNAUTHORIZED
      }
      if (invoice.status !== "pending") {
        return { type: "err", value: 4 } // ERR_INVALID_STATUS
      }
      
      state.invoices[invoiceId].status = "certified"
      return { type: "ok", value: true }
    },
    getInvoice: (invoiceId) => {
      return state.invoices[invoiceId]
    },
    isCertified: (invoiceId) => {
      const invoice = state.invoices[invoiceId]
      return invoice ? invoice.status === "certified" : false
    },
    transferOwnership: (newOwner) => {
      if (state.txSender !== state.contractOwner) {
        return { type: "err", value: 1 } // ERR_UNAUTHORIZED
      }
      
      state.contractOwner = newOwner
      return { type: "ok", value: true }
    },
    // Helper to change the tx-sender for testing
    setTxSender: (sender) => {
      state.txSender = sender
    },
    // Helper to advance block height
    advanceBlockHeight: (blocks) => {
      state.blockHeight += blocks
    },
  }
}

describe("Invoice Certification Contract", () => {
  let contract
  
  beforeEach(() => {
    contract = mockContractEnv()
  })
  
  it("should create a new invoice", () => {
    const invoiceId = "INV-001"
    const supplier = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const buyer = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5NH7MFNY"
    const amount = 1000
    const dueDate = 200
    
    contract.setTxSender(supplier)
    const result = contract.createInvoice(invoiceId, supplier, buyer, amount, dueDate)
    
    expect(result).toEqual({ type: "ok", value: true })
    
    const invoice = contract.getInvoice(invoiceId)
    expect(invoice).toBeDefined()
    expect(invoice.supplier).toBe(supplier)
    expect(invoice.buyer).toBe(buyer)
    expect(invoice.amount).toBe(amount)
    expect(invoice.dueDate).toBe(dueDate)
    expect(invoice.status).toBe("pending")
  })
  
  it("should not create duplicate invoices", () => {
    const invoiceId = "INV-001"
    const supplier = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const buyer = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5NH7MFNY"
    
    contract.setTxSender(supplier)
    contract.createInvoice(invoiceId, supplier, buyer, 1000, 200)
    const result = contract.createInvoice(invoiceId, supplier, buyer, 2000, 300)
    
    expect(result).toEqual({ type: "err", value: 2 }) // ERR_ALREADY_EXISTS
  })
  
  it("should allow buyers to certify invoices", () => {
    const invoiceId = "INV-001"
    const supplier = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const buyer = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5NH7MFNY"
    
    contract.setTxSender(supplier)
    contract.createInvoice(invoiceId, supplier, buyer, 1000, 200)
    
    contract.setTxSender(buyer)
    const result = contract.certifyInvoice(invoiceId)
    
    expect(result).toEqual({ type: "ok", value: true })
    expect(contract.isCertified(invoiceId)).toBe(true)
  })
  
  it("should not allow non-buyers to certify invoices", () => {
    const invoiceId = "INV-001"
    const supplier = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const buyer = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5NH7MFNY"
    const thirdParty = "ST1J4G6RR643BCG8G8SR6M2D9Z9KXT2NJDRK3FBTK"
    
    contract.setTxSender(supplier)
    contract.createInvoice(invoiceId, supplier, buyer, 1000, 200)
    
    contract.setTxSender(thirdParty)
    const result = contract.certifyInvoice(invoiceId)
    
    expect(result).toEqual({ type: "err", value: 1 }) // ERR_UNAUTHORIZED
    expect(contract.isCertified(invoiceId)).toBe(false)
  })
  
  it("should not certify non-existent invoices", () => {
    const invoiceId = "INV-001"
    const buyer = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5NH7MFNY"
    
    contract.setTxSender(buyer)
    const result = contract.certifyInvoice(invoiceId)
    
    expect(result).toEqual({ type: "err", value: 3 }) // ERR_NOT_FOUND
  })
  
  it("should not certify already certified invoices", () => {
    const invoiceId = "INV-001"
    const supplier = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const buyer = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5NH7MFNY"
    
    contract.setTxSender(supplier)
    contract.createInvoice(invoiceId, supplier, buyer, 1000, 200)
    
    contract.setTxSender(buyer)
    contract.certifyInvoice(invoiceId)
    
    const result = contract.certifyInvoice(invoiceId)
    expect(result).toEqual({ type: "err", value: 4 }) // ERR_INVALID_STATUS
  })
})

console.log("Running Invoice Certification Contract tests...")

