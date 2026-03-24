#!/bin/bash
# Quick Vercel Environment Setup Script
# Run this after you've authenticated with: npx vercel login

echo "🔧 Setting up Vercel environment variables..."
echo ""

# Check if user is logged in
npx vercel --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Vercel CLI is not available."
    echo "Please install it with: npm install -g vercel"
    exit 1
fi

# Set environment variables
echo "Adding ROUTEXL_USERNAME..."
echo "Vrachtwagenbv" | npx vercel env add ROUTEXL_USERNAME production

echo ""
echo "Adding ROUTEXL_PASSWORD..."
echo "muhpev-0nawmu-Gaqkis" | npx vercel env add ROUTEXL_PASSWORD production

echo ""
echo "✅ Environment variables have been set!"
echo ""
echo "Next steps:"
echo "1. Go to https://vercel.com/dashboard"
echo "2. Select your 'Vrachtwagenbv' project"
echo "3. Go to Settings → Environment Variables to verify"
echo "4. Redeploy your application"
