import * as admin from "firebase-admin";

admin.initializeApp();

export { createProduct, updateProduct, changeProductPrice, updateProductBarcode, generateInternalBarcodeFn as generateInternalBarcode } from "./products";
export {
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  createPurchaseRequest,
  updatePurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  fulfillPurchaseRequest,
} from "./purchaseOrders";
export { receiveDelivery } from "./deliveries";
export { applyPromo } from "./promos";
export { createSale } from "./sales";
export { voidSale, approveSaleVoid, rejectSaleVoid } from "./sales/voidRequests";
export { createSaleReturn } from "./sales/returns";
export { parkSale, deleteParkedSale } from "./sales/parked";
export { createDisposal } from "./disposals";
export {
  createStockAdjustment,
  approveStockAdjustment,
  rejectStockAdjustment,
  updateCriticalStock,
  updateDashboardStats,
} from "./stock";
export { sendReceiptEmail, sendReceiptSms } from "./notifications";
export {
  sendMessage,
  markThreadRead,
  unsendMessage,
  markNotificationRead,
  markAllNotificationsRead,
} from "./messaging";
export { registerUserEmail, updateUserRole, setUserPermissions, claimAccount, deactivateRegisteredEmail, repairPlatformOwnerSession } from "./users";
export { createPermissionRequest, approvePermissionRequest, rejectPermissionRequest } from "./permissions";
export {
  createStockTransfer,
  approveStockTransfer,
  rejectStockTransfer,
  receiveStockTransfer,
  cancelStockTransfer,
} from "./transfers";
export { createStockCount, submitStockCount, cancelStockCount } from "./stockCounts";
export { generateReorderDraft } from "./reorder";
export { createStore, createBranch, deactivateBranch } from "./stores";
