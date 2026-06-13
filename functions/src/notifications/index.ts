import { onCall } from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";
import { Sale } from "@stockmate/types";
import { resolveAuth } from "../utils/auth";
import { collection } from "../utils/firestore";
import { invalidArgument, notFound } from "../utils/errors";

function getMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port: 587, secure: false, auth: { user, pass } });
}

function formatReceipt(sale: Sale): string {
  const lines = [
    "─── StockMate POS Receipt ───",
    `Sale #${sale.id.slice(-8).toUpperCase()}`,
    `Date: ${new Date(sale.createdAt).toLocaleString()}`,
    `Cashier: ${sale.cashierName}`,
    "",
    ...sale.items.map(
      (i) =>
        `${i.productName} x${i.quantity}  ${i.lineTotal.toFixed(2)}` +
        (i.discount > 0 ? ` (-${i.discount.toFixed(2)})` : "")
    ),
    "",
    `Subtotal: ${sale.subtotal.toFixed(2)}`,
    `Discount: -${sale.discount.toFixed(2)}`,
    `Tax: ${sale.tax.toFixed(2)}`,
    `TOTAL: ${sale.total.toFixed(2)}`,
    `Payment: ${sale.paymentMethod}`,
    "",
    "Thank you for your purchase!",
  ];
  return lines.join("\n");
}

export const sendReceiptEmail = onCall(async (request) => {
  const { storeId } = await resolveAuth(request);
  const { saleId, email } = request.data as { saleId: string; email: string };

  if (!saleId || !email) throw invalidArgument("saleId and email are required");

  const saleSnap = await collection(storeId, "sales").doc(saleId).get();
  if (!saleSnap.exists) throw notFound("Sale not found");

  const sale = { id: saleSnap.id, ...saleSnap.data() } as Sale;
  const body = formatReceipt(sale);

  const transporter = getMailer();
  if (!transporter) {
    return { success: true, simulated: true, message: "SMTP not configured; receipt logged only" };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "noreply@stockmate.app",
    to: email,
    subject: `Receipt #${sale.id.slice(-8).toUpperCase()} - StockMate POS`,
    text: body,
  });

  return { success: true };
});

export const sendReceiptSms = onCall(async (request) => {
  const { storeId } = await resolveAuth(request);
  const { saleId, phone } = request.data as { saleId: string; phone: string };

  if (!saleId || !phone) throw invalidArgument("saleId and phone are required");

  const saleSnap = await collection(storeId, "sales").doc(saleId).get();
  if (!saleSnap.exists) throw notFound("Sale not found");

  const sale = { id: saleSnap.id, ...saleSnap.data() } as Sale;
  const message = `StockMate Receipt #${sale.id.slice(-8)}: Total ${sale.total.toFixed(2)}. Thank you!`;

  const apiKey = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!apiKey || !authToken || !fromNumber) {
    return { success: true, simulated: true, message, note: "Twilio not configured" };
  }

  const auth = Buffer.from(`${apiKey}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ To: phone, From: fromNumber, Body: message });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${apiKey}/Messages.json`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`SMS failed: ${response.statusText}`);
  }

  return { success: true };
});
