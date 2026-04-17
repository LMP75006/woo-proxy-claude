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
const WOO_KEY = (process.env.WOO_KEY || "").trim();
const WOO_SECRET = (process.env.WOO_SECRET || "").trim();
const CLAUDE_SECRET = (process.env.CLAUDE_SECRET || "lmp2026secret").trim();

function auth(req, res, next) {
  const token = req.headers["x-claude-secret"];
  if (token !== CLAUDE_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  next();
}

function woo(path, method, data) {
  method = method || "GET";
  data = data || null;
  var url = WOO_URL + "/wp-json/wc/v3" + path;
  return axios({
    method: method,
    url: url,
    auth: { username: WOO_KEY, password: WOO_SECRET },
    data: method !== "GET" ? data : undefined,
    params: method === "GET" && data ? data : undefined,
  });
}

app.get("/", function(req, res) {
  res.json({ status: "WooCommerce Proxy operationnel" });
});

app.get("/api/dashboard", auth, function(req, res) {
  Promise.all([
    woo("/orders?per_page=5&orderby=date&order=desc"),
    woo("/products?per_page=1"),
    woo("/customers?per_page=1"),
    woo("/reports/sales?period=month"),
    woo("/reports/sales?period=year"),
  ]).then(function(results) {
    res.json({
      dernieres_commandes: results[0].data,
      total_produits: results[1].headers["x-wp-total"],
      total_clients: results[2].headers["x-wp-total"],
      ventes_mois: results[3].data[0] || {},
      ventes_annee: results[4].data[0] || {},
    });
  }).catch(function(e) {
    res.status(500).json({ error: e.message });
  });
});

app.get("/api/orders", auth, function(req, res) {
  var status = req.query.status || "any";
  var per_page = req.query.per_page || 20;
  var page = req.query.page || 1;
  woo("/orders?status=" + status + "&per_page=" + per_page + "&page=" + page)
    .then(function(r) {
      res.json({ total: r.headers["x-wp-total"], commandes: r.data });
    }).catch(function(e) {
      res.status(500).json({ error: e.message });
    });
});

app.get("/api/products", auth, function(req, res) {
  var per_page = req.query.per_page || 20;
  var page = req.query.page || 1;
  var search = req.query.search || "";
  woo("/products?per_page=" + per_page + "&page=" + page + "&search=" + encodeURIComponent(search))
    .then(function(r) {
      res.json({ total: r.headers["x-wp-total"], produits: r.data });
    }).catch(function(e) {
      res.status(500).json({ error: e.message });
    });
});

app.get("/api/products/:id", auth, function(req, res) {
  woo("/products/" + req.params.id)
    .then(function(r) { res.json(r.data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.put("/api/products/:id", auth, function(req, res) {
  woo("/products/" + req.params.id, "PUT", req.body)
    .then(function(r) { res.json({ success: true, produit: r.data }); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get("/api/customers", auth, function(req, res) {
  var per_page = req.query.per_page || 20;
  var page = req.query.page || 1;
  woo("/customers?per_page=" + per_page + "&page=" + page)
    .then(function(r) {
      res.json({ total: r.headers["x-wp-total"], clients: r.data });
    }).catch(function(e) {
      res.status(500).json({ error: e.message });
    });
});

app.get("/api/reports/sales", auth, function(req, res) {
  var period = req.query.period || "month";
  woo("/reports/sales?period=" + period)
    .then(function(r) { res.json(r.data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get("/api/reports/top-sellers", auth, function(req, res) {
  var period = req.query.period || "month";
  woo("/reports/top_sellers?period=" + period)
    .then(function(r) { res.json(r.data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get("/api/coupons", auth, function(req, res) {
  woo("/coupons?per_page=50")
    .then(function(r) { res.json({ coupons: r.data }); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Proxy WooCommerce demarre sur le port " + PORT);
});
