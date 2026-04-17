const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-claude-secret, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const WOO_URL = (process.env.WOO_URL || "").trim();
const WOO_KEY    = process.env.WOO_KEY;
const WOO_SECRET = process.env.WOO_SECRET;
const CLAUDE_SECRET = process.env.CLAUDE_SECRET || "lmp2026secret";
console.log("WOO_URL:", JSON.stringify(WOO_URL));

function auth(req, res, next) {
  const token = req.headers["x-claude-secret"];
  if (!CLAUDE_SECRET || token !== CLAUDE_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  next();
}

function woo(path, method = "GET", data = null) {
  const url = `${WOO_URL}/wp-json/wc/v3${path}`;
  console.log("Calling:", url);
  return axios({
    method,
    url,
    auth: { username: WOO_KEY, password: WOO_SECRET },
    data: method !== "GET" ? data : undefined,
    params: method === "GET" && data ? data : undefined,
  });
}

app.get("/", (req, res) => res.json({ status: "WooCommerce Proxy opérationnel" }));

app.get("/api/dashboard", auth, async (req, res) => {
  try {
    const [orders, products, customers, salesMonth, salesYear] = await Promise.all([
      woo("/orders?per_page=5&orderby=date&order=desc"),
      woo("/products?per_page=1"),
      woo("/customers?per_page=1"),
      woo("/reports/sales?period=month"),
      woo("/reports/sales?period=year"),
    ]);
    res.json({
      dernières_commandes: orders.data,
      total_produits: products.headers["x-wp-total"],
      total_clients: customers.headers["x-wp-total"],
      ventes_mois: salesMonth.data[0] || {},
      ventes_année: salesYear.data[0] || {},
    });
  } catch (e) {
    res.status(500).json({ error: e.message, detail: e.response?.data });
  }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const { status = "any", per_page = 20, page = 1 } = req.query;
    const r = await woo(`/orders?status=${status}&per_page=${per_page}&page=${page}`);
    res.json({ total: r.headers["x-wp-total"], commandes: r.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/products", auth, async (req, res) => {
  try {
    const { per_page = 20, page = 1, search = "", category = "" } = req.query;
    const r = await woo(`/products?per_page=${per_page}&page=${page}&search=${encodeURIComponent(search)}&category=${category}`);
    res.json({ total: r.headers["x-wp-total"], produits: r.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/products/:id", auth, async (req, res) => {
  try {
    const r = await woo(`/products/${req.params.id}`);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/products/:id", auth, async (req, res) => {
  try {
    const r = await woo(`/products/${req.params.id}`, "PUT", req.body);
    res.json({ success: true, produit: r.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/categories", auth, async (req, res) => {
  try {
    const r = await woo("/products/categories?per_page=100");
    res.json({ catégories: r.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/customers", auth, async (req, res) => {
  try {
    const { per_page = 20, page = 1 } = req.query;
    const r = await woo(`/customers?per_page=${per_page}&page=${page}`);
    res.json({ total: r.headers["x-wp-total"], clients: r.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/reports/sales", auth, async (req, res) => {
  try {
    const { period = "month", date_min, date_max } = req.query;
    const params = date_min ? `?date_min=${date_min}&date_max=${date_max}` : `?period=${period}`;
    const r = await woo(`/reports/sales${params}`);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/reports/top-sellers", auth, async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const r = await woo(`/reports/top_sellers?period=${period}`);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/coupons", auth, async (req, res) => {
  try {
    const r = await woo("/coupons?per_page=50");
    res.json({ coupons: r.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy WooCommerce démarré sur le port ${PORT}`));
