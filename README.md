# StockMate POS

Cloud-based inventory and point-of-sale system for stores and branches.

## Stack

| Layer | Technology |
|-------|------------|
| Web | React + TypeScript + Vite + Tailwind CSS |
| Android | Kotlin + Jetpack Compose |
| Backend | Firebase Cloud Functions (TypeScript) |
| Auth | Firebase Auth (Google Sign-In) |

## Project Structure

```
StockMate-POS/
├── web/                 # Admin web app (React)
├── android/             # Store operations app (Kotlin)
├── functions/           # Cloud Functions backend
├── shared/types/        # Shared TypeScript types
├── docs/                # Full product specification
├── scripts/             # Seed & setup scripts
└── firebase.json        # Firebase config
```

## Quick Start

### 1. Firebase Project

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Authentication** → Google Sign-In
3. Enable **Storage**
5. Download config files:
   - Web config → `web/.env` (copy from `web/.env.example`)
   - `google-services.json` → `android/app/`

### 2. Install Dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

### 4. Seed Demo Store

After your first Google sign-in, note your Firebase Auth UID, then:

```bash
set SEED_USER_ID=your-firebase-uid
node scripts/seed-store.js
```

Or use Firebase emulators:

```bash
npm run dev:emulators
```

### 5. Run Web App

```bash
npm run dev:web
```

Open http://localhost:5173

### 6. Deploy

```bash
firebase deploy
```

### 7. Android App

1. Open `android/` in Android Studio
2. Uncomment `google-services` plugin in `build.gradle.kts` files
3. Set `default_web_client_id` in `res/values/strings.xml`
4. Build and run on device/emulator

## Features (Full / Enhanced)

### Web App (15 pages)
- Dashboard with profit & inventory value (admin)
- Products, categories, suppliers
- Purchase orders & delivery receiving
- Inventory & stock movements
- Stock disposal
- Promos (percentage, fixed, promo price, buy X get Y)
- Sales with void/refund
- Reports (sales, profit, critical stock, disposal, inventory value)
- User management with custom permissions
- Store settings (tax, receipt, payment methods)

### Android App (10 screens)
- POS with cart & checkout
- Barcode scan placeholder
- Product search
- Delivery receiving checklist
- Scan product (price/stock only)
- Stock disposal
- Critical stocks + purchase requests
- Receipt view/print
- Bluetooth printer setup

### Cloud Functions
All sensitive operations: `createSale`, `receiveDelivery`, `createDisposal`, `changeProductPrice`, `approveStockAdjustment`, promos, void sale, email/SMS receipts, purchase requests.

### Multi-Branch Inventory
Per-branch stock tracking — products are store-wide catalog.

## Documentation

See [`docs/README.md`](docs/README.md) for the complete specification.

## Environment Variables

### Web (`web/.env`)
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USE_EMULATORS=false
```

### Functions (Firebase secrets / `.env`)
```
SMTP_HOST= SMTP_USER= SMTP_PASS= SMTP_FROM=
TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_FROM_NUMBER=
```
