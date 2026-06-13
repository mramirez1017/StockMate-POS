/**
 * Seed the first platform owner email.
 *
 * Usage (PowerShell):
 *   node scripts/seed-platform-owner.js mark.p.ramirez1017@gmail.com "Mark Lexter Ramirez"
 *
 * Or with env vars (PowerShell):
 *   $env:SEED_EMAIL="you@gmail.com"; $env:SEED_NAME="Your Name"; node scripts/seed-platform-owner.js
 *
 * Auth: set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service account JSON file, or run:
 *   gcloud auth application-default login
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function emailDocId(email) {
  return email.trim().toLowerCase().replace(/[.@+]/g, "_");
}

function initAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "stockmate-pos";
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    path.join(__dirname, "service-account.json");

  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = require(credPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId });
  }
}

initAdmin();
const db = admin.firestore();

async function seed() {
  const email = process.argv[2] || process.env.SEED_EMAIL;
  const fullName = process.argv[3] || process.env.SEED_NAME || "Platform Owner";

  if (!email) {
    console.error("Usage: node scripts/seed-platform-owner.js <email> [fullName]");
    console.error('Example: node scripts/seed-platform-owner.js you@gmail.com "Your Name"');
    process.exit(1);
  }

  const normalized = email.trim().toLowerCase();
  const emailKey = emailDocId(normalized);
  const ts = Date.now();

  await db.collection("registeredEmails").doc(emailKey).set({
    email: normalized,
    fullName,
    role: "PLATFORM_OWNER",
    status: "ACTIVE",
    claimed: false,
    createdBy: "seed-script",
    createdAt: ts,
    updatedAt: ts,
  });

  console.log(`Registered platform owner email: ${normalized}`);
  console.log("Sign in with Google using this email to activate the account.");
}

seed().catch((err) => {
  if (String(err.message || err).includes("default credentials")) {
    console.error("\nNo Firebase credentials found. Do one of the following:\n");
    console.error("1. Firebase Console → Project settings → Service accounts → Generate new private key");
    console.error("   Save as scripts/service-account.json (gitignored) and run this script again.\n");
    console.error("2. Or add the document manually in Firebase Console:");
    console.error("   Collection: registeredEmails");
    console.error(`   Document ID: ${emailDocId(process.argv[2] || process.env.SEED_EMAIL || "your_email")}`);
    console.error("   Fields: email, fullName, role=PLATFORM_OWNER, status=ACTIVE, claimed=false, createdAt, updatedAt");
  }
  console.error(err);
  process.exit(1);
});
