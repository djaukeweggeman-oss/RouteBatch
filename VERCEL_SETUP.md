# Vercel Environment Setup

To deploy this application successfully, you need to set the following environment variables in Vercel:

## Required Environment Variables

1. **ROUTEXL_USERNAME** - Your RouteXL API username
2. **ROUTEXL_PASSWORD** - Your RouteXL API password

## How to Set Environment Variables in Vercel

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to your project on [vercel.com](https://vercel.com)
2. Click on "Settings" → "Environment Variables"
3. Add the following variables:
   - Name: `ROUTEXL_USERNAME` | Value: `Vrachtwagenbv`
   - Name: `ROUTEXL_PASSWORD` | Value: `muhpev-0nawmu-Gaqkis`
4. Select which environments apply (Production, Preview, Development)
5. Click "Save"
6. Redeploy your application

### Option 2: Via Vercel CLI

```bash
vercel env add ROUTEXL_USERNAME Vrachtwagenbv
vercel env add ROUTEXL_PASSWORD muhpev-0nawmu-Gaqkis
```

## Getting RouteXL Credentials

1. Sign up at [routexl.com](https://www.routexl.com/)
2. Go to your account settings
3. Find your API credentials
4. Use these in the environment variables above

## Testing Locally

Before deploying, test with:
```bash
npm run dev
```

Make sure you have `.env.local` configured with the credentials (see `.env.example`).
