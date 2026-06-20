// Generates a sample, pre-filled Products import workbook that matches the
// in-app template (Product Name, Location, Category, Brand, Selling Price, Measure Unit).
import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIMARY = path.resolve(__dirname, "../../samples/StockMate-Sample-Products.xlsx");
const FALLBACK = path.resolve(__dirname, "../../samples/StockMate-Sample-Products-new.xlsx");

const UNIT_LABELS = ["Pieces (pcs)", "Grams (g)", "Kilograms (kg)", "Liters (L)", "Milliliters (mL)"];
const UNIT_LABEL = { pcs: "Pieces (pcs)", g: "Grams (g)", kg: "Kilograms (kg)", L: "Liters (L)", mL: "Milliliters (mL)" };
const BRANCH = "Main Branch";

const COLS = [
  { key: "name", header: "Product Name", required: true, width: 28 },
  { key: "branch", header: "Location", required: true, width: 20 },
  { key: "category", header: "Category", required: true, width: 20 },
  { key: "brand", header: "Brand", width: 18 },
  { key: "sellingPrice", header: "Selling Price", required: true, width: 14, numFmt: "0.00" },
  { key: "unit", header: "Measure Unit", required: true, width: 14 },
];

// [name, category, brand, sellingPrice, unit]
const PRODUCTS = [
  ["Amoxicillin 500mg", "Antibiotics", "RiteMed", 12.5, "pcs"],
  ["Cloxacillin 500mg", "Antibiotics", "Generics", 11.0, "pcs"],
  ["Paracetamol 500mg", "Pain Relief", "Biogesic", 5.0, "pcs"],
  ["Ibuprofen 200mg", "Pain Relief", "Advil", 8.5, "pcs"],
  ["Mefenamic Acid 500mg", "Pain Relief", "Dolfenal", 9.0, "pcs"],
  ["Cough Syrup 120ml", "Cold & Cough", "Robitussin", 95.5, "mL"],
  ["Cetirizine 10mg", "Allergy", "Virlix", 9.0, "pcs"],
  ["Vitamin C 500mg", "Vitamins", "Cecon", 7.0, "pcs"],
  ["Multivitamins", "Vitamins", "Centrum", 15.0, "pcs"],
  ["Alcohol 70% 500ml", "Personal Care", "Green Cross", 75.0, "mL"],
  ["Toothpaste 150g", "Personal Care", "Colgate", 89.0, "g"],
  ["Shampoo Sachet 12ml", "Personal Care", "Sunsilk", 8.0, "mL"],
  ["Bottled Water 500ml", "Beverages", "Nature's Spring", 15.0, "mL"],
  ["Soft Drink 1.5L", "Beverages", "Coke", 75.0, "L"],
  ["Instant Coffee 3-in-1", "Beverages", "Nescafe", 8.0, "pcs"],
  ["Energy Drink 240ml", "Beverages", "Cobra", 30.0, "mL"],
  ["Potato Chips 50g", "Snacks", "Piattos", 20.0, "g"],
  ["Crackers 100g", "Snacks", "SkyFlakes", 12.0, "g"],
];

const HEADER_REQUIRED = "FF059669";
const HEADER_OPTIONAL = "FF334155";
const HEADER_TEXT = "FFFFFFFF";
const FILL_REQUIRED = "FFFEF3C7";
const FILL_OPTIONAL = "FFEFF6FF";
const LAST_ROW = 500;
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const wb = new ExcelJS.Workbook();
wb.creator = "StockMate POS";
wb.created = new Date();
const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
ws.columns = COLS.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));

const headerRow = ws.getRow(1);
headerRow.height = 24;
COLS.forEach((c, i) => {
  const cell = headerRow.getCell(i + 1);
  cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  cell.fill = solid(c.required ? HEADER_REQUIRED : HEADER_OPTIONAL);
});

const colLetter = (key) => ws.getColumn(key).letter;
for (let r = 2; r <= LAST_ROW; r++) {
  const row = ws.getRow(r);
  COLS.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    if (c.numFmt) cell.numFmt = c.numFmt;
    cell.fill = solid(c.required ? FILL_REQUIRED : FILL_OPTIONAL);
  });
}

PRODUCTS.forEach((p, idx) => {
  const row = ws.getRow(idx + 2);
  row.getCell(colLetter("name")).value = p[0];
  row.getCell(colLetter("branch")).value = BRANCH;
  row.getCell(colLetter("category")).value = p[1];
  row.getCell(colLetter("brand")).value = p[2];
  row.getCell(colLetter("sellingPrice")).value = p[3];
  row.getCell(colLetter("unit")).value = UNIT_LABEL[p[4]] ?? p[4];
});

// Reference sheet feeds dropdowns.
const categories = [...new Set(PRODUCTS.map((p) => p[1]))];
const brands = [...new Set(PRODUCTS.map((p) => p[2]))].sort((a, b) => a.localeCompare(b));
const branches = [BRANCH];
const refWs = wb.addWorksheet("Reference");
refWs.columns = [
  { header: "Locations", key: "loc", width: 26 },
  { header: "Categories", key: "cat", width: 26 },
  { header: "Brands", key: "brand", width: 26 },
];
refWs.getRow(1).font = { bold: true };
const maxRef = Math.max(branches.length, categories.length, brands.length, 1);
for (let i = 0; i < maxRef; i++) {
  refWs.addRow({ loc: branches[i] ?? "", cat: categories[i] ?? "", brand: brands[i] ?? "" });
}

const dv = ws.dataValidations;
const addList = (key, source, allowBlank, strict, title, error) => {
  const L = colLetter(key);
  dv.add(`${L}2:${L}${LAST_ROW}`, { type: "list", allowBlank, formulae: [source], showErrorMessage: strict, errorStyle: "error", errorTitle: title, error });
};
addList("branch", `Reference!$A$2:$A$${maxRef + 1}`, false, true, "Unknown location", "Pick an existing branch/location.");
addList("category", `Reference!$B$2:$B$${maxRef + 1}`, false, false, "Category", "Pick an existing category.");
addList("brand", `Reference!$C$2:$C$${maxRef + 1}`, true, false, "Brand", "Pick a brand or type a new one.");
addList("unit", `"${UNIT_LABELS.join(",")}"`, false, true, "Invalid unit", "Pick a measure unit from the dropdown.");
const priceL = colLetter("sellingPrice");
dv.add(`${priceL}2:${priceL}${LAST_ROW}`, { type: "decimal", operator: "greaterThanOrEqual", allowBlank: false, formulae: [0], showErrorMessage: true, errorStyle: "error", errorTitle: "Invalid price", error: "Selling price must be ≥ 0 (up to two decimals)." });

fs.mkdirSync(path.dirname(PRIMARY), { recursive: true });
let out = PRIMARY;
try {
  await wb.xlsx.writeFile(PRIMARY);
} catch (err) {
  if (err && err.code === "EBUSY") {
    out = FALLBACK;
    await wb.xlsx.writeFile(FALLBACK);
  } else {
    throw err;
  }
}
console.log(`Wrote ${PRODUCTS.length} sample products to ${out}`);
