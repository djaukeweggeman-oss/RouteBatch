# 🚗 Vrachtwagen B.V. Route Planner - Vercel Setup

## Snel Fix voor "RouteXL credentials ontbreken"

Je ziet de fout **"Server RouteXL credentials ontbreken"** omdat de environment variabelen niet in Vercel zijn ingesteld.

### ⚡ Stap-voor-stap Fix (2 minuten)

#### 1. Ga naar Vercel Dashboard
Open: **https://vercel.com/dashboard**

#### 2. Selecteer je project
- Klik op je "Vrachtwagenbv" of "route-planner" project

#### 3. Naar Environment Variables
1. Klik op **Settings** (bovenaan)
2. Klik op **Environment Variables** (links in menu)

#### 4. Voeg de variabelen toe

Klik "Add New" en maak deze twee aan:

**Variabele 1:**
- Name: `ROUTEXL_USERNAME`
- Value: `Vrachtwagenbv`
- Select: Production, Preview, Development (alle drie aanvinken!)
- Klik **Save**

**Variabele 2:**
- Name: `ROUTEXL_PASSWORD`
- Value: `muhpev-0nawmu-Gaqkis`
- Select: Production, Preview, Development (alle drie aanvinken!)
- Klik **Save**

#### 5. Redeploy
1. Ga naar **Deployments** tab
2. Klik op de 3 puntjes (...) van de huidige deployment
3. Klik **Redeploy**

#### ✅ Klaar!
Vernieuwen je website - de fout moet weg zijn!

---

### 🛠️ Als je CLI wilt gebruiken (optioneel)

```bash
# Open terminal in project map
cd /Users/aukeweggeman/route-planner

# Login met Vercel
npx vercel login

# Run setup script
chmod +x scripts/setup-vercel-env.sh
./scripts/setup-vercel-env.sh
```

---

### ❓ Problemen?

**Fout blijft bestaan?**
- Wacht 60 seconden na redeploy
- Hard refresh browser (Cmd+Shift+R op Mac)
- Check je environment variables zijn geconfigureerd

**Weet niet waar je project is?**
- Check je GitHub URL: https://github.com/djaukeweggeman-oss/Vrachtwagenbv
- Je Vercel project zou linked moeten zijn aan deze repo
- Ga naar: https://vercel.com/djaukeweggeman-oss/route-planner (of vergelijkbare naam)

---

### 📚 Meer Info
- [Vercel Environment Variables Docs](https://vercel.com/docs/environment-variables)
- RouteXL docs: https://www.routexl.com/api/
