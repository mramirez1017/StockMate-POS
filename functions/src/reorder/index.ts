import { onCall } from "firebase-functions/v2/https";
import {
  BranchInventory,
  Branch,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@stockmate/types";
import { resolveAuth, requireAdmin } from "../utils/auth";
import { collection, generatePoNumber, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument } from "../utils/errors";
import { createNotifications } from "../utils/notify";
import { logProcurementEvent } from "../utils/procurement";

type SupplierGroupKey = string; // `${branchId}__${supplierId}`

interface ReorderLine {
  productId: string;
  productName: string;
  branchId: string;
  supplierId: string;
  currentStock: number;
  reorderLevel: number;
  criticalLevel: number;
  suggestedQty: number;
  supplierCost?: number;
  sellingPrice: number;
  severity: "CRITICAL" | "LOW";
}

function defaultExpectedDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/**
 * Scan branch inventory for items at/below their reorder level and build draft
 * purchase orders grouped by supplier (one DRAFT PO per supplier per branch).
 * Pass dryRun to preview without writing. Admin only.
 */
export const generateReorderDraft = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const {
    branchId,
    includeLowStock = true,
    expectedDeliveryDate,
    leadTimeDays = 7,
    dryRun = false,
  } = request.data as {
    branchId?: string;
    includeLowStock?: boolean;
    expectedDeliveryDate?: string;
    leadTimeDays?: number;
    dryRun?: boolean;
  };

  const [invSnap, productsSnap, branchesSnap] = await Promise.all([
    collection(storeId, "branchInventory").get(),
    collection(storeId, "products").where("status", "==", "ACTIVE").get(),
    collection(storeId, "branches").get(),
  ]);

  const products = new Map<string, Product>();
  productsSnap.docs.forEach((d) => products.set(d.id, { id: d.id, ...d.data() } as Product));
  const branchNames = new Map<string, string>();
  branchesSnap.docs.forEach((d) => branchNames.set(d.id, (d.data() as Branch).name ?? d.id));

  const lines: ReorderLine[] = [];
  let skippedNoSupplier = 0;

  invSnap.docs.forEach((d) => {
    const inv = d.data() as BranchInventory;
    if (branchId && inv.branchId !== branchId) return;
    const product = products.get(inv.productId);
    if (!product) return;

    const isCritical = inv.currentStock <= inv.criticalLevel;
    const isLow = inv.currentStock <= inv.reorderLevel && inv.currentStock > inv.criticalLevel;
    if (!isCritical && !(includeLowStock && isLow)) return;

    const suggestedQty = Math.max(1, inv.reorderLevel - inv.currentStock);
    if (!product.supplierId) {
      skippedNoSupplier++;
      return;
    }

    lines.push({
      productId: inv.productId,
      productName: product.name,
      branchId: inv.branchId,
      supplierId: product.supplierId,
      currentStock: inv.currentStock,
      reorderLevel: inv.reorderLevel,
      criticalLevel: inv.criticalLevel,
      suggestedQty,
      supplierCost: product.supplierCost,
      sellingPrice: product.sellingPrice,
      severity: isCritical ? "CRITICAL" : "LOW",
    });
  });

  // Group lines by branch + supplier.
  const groups = new Map<SupplierGroupKey, ReorderLine[]>();
  for (const line of lines) {
    const key = `${line.branchId}__${line.supplierId}`;
    const arr = groups.get(key) ?? [];
    arr.push(line);
    groups.set(key, arr);
  }

  const expected = expectedDeliveryDate?.trim() || defaultExpectedDate(Number(leadTimeDays) || 7);

  const previews = Array.from(groups.entries()).map(([key, groupLines]) => {
    const [gBranchId, supplierId] = key.split("__");
    const estimatedCost = groupLines.reduce(
      (s, l) => s + (l.supplierCost != null ? l.supplierCost * l.suggestedQty : 0),
      0,
    );
    return {
      branchId: gBranchId,
      branchName: branchNames.get(gBranchId) ?? gBranchId,
      supplierId,
      itemCount: groupLines.length,
      totalUnits: groupLines.reduce((s, l) => s + l.suggestedQty, 0),
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      items: groupLines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        suggestedQty: l.suggestedQty,
        currentStock: l.currentStock,
        reorderLevel: l.reorderLevel,
        severity: l.severity,
      })),
    };
  });

  if (dryRun) {
    return {
      dryRun: true as const,
      groupCount: previews.length,
      lineCount: lines.length,
      skippedNoSupplier,
      previews,
    };
  }

  if (groups.size === 0) {
    throw invalidArgument("No products are below their reorder level right now.");
  }

  const created: { purchaseOrderId: string; poNumber: string; supplierId: string; branchId: string; itemCount: number }[] = [];

  for (const [key, groupLines] of groups.entries()) {
    const [gBranchId, supplierId] = key.split("__");
    const items: PurchaseOrderItem[] = groupLines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      expectedQty: l.suggestedQty,
      sellingPrice: l.sellingPrice,
      expectedCost: l.supplierCost != null ? Math.round(l.supplierCost * l.suggestedQty * 100) / 100 : undefined,
    }));
    const expectedCost = items.reduce((s, i) => s + (i.expectedCost ?? 0), 0);

    const ref = collection(storeId, "purchaseOrders").doc();
    const po: Omit<PurchaseOrder, "id"> = {
      storeId,
      branchId: gBranchId,
      supplierId,
      poNumber: generatePoNumber(),
      expectedDeliveryDate: expected,
      expectedCost: expectedCost > 0 ? Math.round(expectedCost * 100) / 100 : undefined,
      notes: "Auto-generated from reorder suggestions",
      status: "DRAFT",
      items,
      createdBy: uid,
      createdByName: user.fullName,
      createdAt: now(),
      updatedAt: now(),
    };
    await ref.set(stripUndefinedDeep(po));
    created.push({ purchaseOrderId: ref.id, poNumber: po.poNumber, supplierId, branchId: gBranchId, itemCount: items.length });

    try {
      await logProcurementEvent({
        storeId,
        branchId: gBranchId,
        type: "PO_CREATED",
        message: `${user.fullName} auto-generated draft ${po.poNumber} with ${items.length} reorder item(s).`,
        poId: ref.id,
        poNumber: po.poNumber,
        actor: user,
      });
    } catch (err) {
      console.error("logProcurementEvent failed after generateReorderDraft", err);
    }
  }

  try {
    await createNotifications({
      storeId,
      kind: "PO_CREATED",
      title: `${created.length} draft PO(s) generated`,
      body: `${user.fullName} auto-generated ${created.length} draft purchase order(s) from low/critical stock.`,
      link: "/purchase-orders",
      refType: "PURCHASE_ORDER",
      refId: created[0]?.purchaseOrderId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after generateReorderDraft", err);
  }

  return {
    dryRun: false as const,
    createdCount: created.length,
    skippedNoSupplier,
    created,
  };
});
