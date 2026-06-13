import * as admin from "firebase-admin";

admin.initializeApp();

export { createProduct, updateProduct, changeProductPrice, updateProductBarcode, generateInternalBarcodeFn as generateInternalBarcode } from "./products";
export { createPurchaseOrder, updatePurchaseOrderStatus, createPurchaseRequest } from "./purchaseOrders";
export { receiveDelivery } from "./deliveries";
export { applyPromo } from "./promos";
export { createSale } from "./sales";
export { voidSale, approveSaleVoid, rejectSaleVoid } from "./sales/voidRequests";
export { createDisposal } from "./disposals";
export {
  createStockAdjustment,
  approveStockAdjustment,
  updateCriticalStock,
  updateDashboardStats,
} from "./stock";
export { sendReceiptEmail, sendReceiptSms } from "./notifications";
export { registerUserEmail, claimAccount, deactivateRegisteredEmail, repairPlatformOwnerSession } from "./users";
export { createStore, createBranch, deactivateBranch } from "./stores";
