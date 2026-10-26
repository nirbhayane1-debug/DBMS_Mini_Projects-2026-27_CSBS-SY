const STATUSES = ["Placed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];
const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n).toFixed(2);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(url, options = {}) {
  if (options.body) options.headers = { "Content-Type": "application/json" };
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show" + (isError ? " error" : "");
  setTimeout(() => (t.className = ""), 3000);
}

// ---------- TABS ----------
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
    loaders[btn.dataset.tab]();
  }));

// ---------- ORDER FOOD ----------
async function loadOrderPage() {
  const [customers, restaurants] = await Promise.all([api("/api/customers"), api("/api/restaurants")]);
  $("customerSelect").innerHTML = customers.length
    ? customers.map((c) => `<option value="${c.customer_id}">${esc(c.name)} (${esc(c.mobile_no)})</option>`).join("")
    : `<option value="">-- add a customer first --</option>`;
  $("restaurantSelect").innerHTML = restaurants
    .map((r) => `<option value="${r.restaurant_id}">${esc(r.restaurant_name)} (⭐ ${r.rating})</option>`).join("");
  loadMenu();
}

async function loadMenu() {
  const rid = $("restaurantSelect").value;
  if (!rid) return;
  const items = await api(`/api/restaurants/${rid}/menu`);
  $("menuBody").innerHTML = items.map((m) => `
    <tr><td>${esc(m.food_name)}</td><td>${money(m.price)}</td>
    <td><input type="number" min="0" value="0" data-id="${m.menu_id}" data-price="${m.price}"></td></tr>`).join("");
  updateTotal();
}

function updateTotal() {
  let total = 0;
  document.querySelectorAll("#menuBody input").forEach((i) => (total += Number(i.value || 0) * Number(i.dataset.price)));
  $("orderTotal").textContent = money(total);
}

$("restaurantSelect").addEventListener("change", loadMenu);
$("menuBody").addEventListener("input", updateTotal);

$("placeOrderBtn").addEventListener("click", async () => {
  const items = [...document.querySelectorAll("#menuBody input")]
    .map((i) => ({ menu_id: Number(i.dataset.id), quantity: Number(i.value || 0) }))
    .filter((i) => i.quantity > 0);
  try {
    const r = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customer_id: Number($("customerSelect").value),
        restaurant_id: Number($("restaurantSelect").value),
        payment_mode: $("paymentMode").value,
        items,
      }),
    });
    toast(`Order #${r.order_id} placed (${money(r.total)}). Delivery partner: ${r.delivery_partner || "TBD"}`);
    loadMenu();
  } catch (e) { toast(e.message, true); }
});

// ---------- ORDERS ----------
async function loadOrders() {
  const rows = await api("/api/orders");
  $("ordersBody").innerHTML = rows.map((o) => `
    <tr>
      <td>${o.order_id}</td><td>${esc(o.order_date)}</td><td>${esc(o.customer)}</td>
      <td>${esc(o.restaurant_name)}</td><td>${esc(o.delivery_partner || "-")}</td>
      <td>${money(o.order_amount)}</td>
      <td>${esc(o.payment_mode)} <span class="badge ${esc(o.payment_status)}">${esc(o.payment_status)}</span></td>
      <td><select data-status="${o.order_id}">
        ${STATUSES.map((s) => `<option ${s === o.order_status ? "selected" : ""}>${s}</option>`).join("")}
      </select></td>
      <td><button class="small" data-bill="${o.order_id}">View</button></td>
    </tr>`).join("");
}

$("ordersBody").addEventListener("change", async (e) => {
  if (!e.target.dataset.status) return;
  try {
    await api(`/api/orders/${e.target.dataset.status}/status`, {
      method: "PUT", body: JSON.stringify({ status: e.target.value }),
    });
    toast("Status updated");
    loadOrders();
  } catch (err) { toast(err.message, true); }
});

$("ordersBody").addEventListener("click", async (e) => {
  const id = e.target.dataset.bill;
  if (!id) return;
  const items = await api(`/api/orders/${id}/items`);
  $("billTitle").textContent = `Bill for Order #${id}`;
  $("billBody").innerHTML = items.map((i) => `
    <tr><td>${esc(i.food_name)}</td><td>${i.quantity}</td><td>${money(i.price)}</td><td>${money(i.total)}</td></tr>`).join("") +
    `<tr><th colspan="3">Grand Total</th><th>${money(items.reduce((s, i) => s + i.total, 0))}</th></tr>`;
  $("billCard").hidden = false;
});

// ---------- CUSTOMERS ----------
async function loadCustomers() {
  const rows = await api("/api/customers");
  $("customersBody").innerHTML = rows.map((c) => `
    <tr><td>${c.customer_id}</td><td>${esc(c.name)}</td><td>${esc(c.mobile_no)}</td>
    <td>${esc(c.email || "-")}</td><td>${esc(c.address)}</td></tr>`).join("");
}

$("addCustomerBtn").addEventListener("click", async () => {
  try {
    await api("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        name: $("cName").value, mobile_no: $("cMobile").value,
        email: $("cEmail").value, address: $("cAddress").value,
      }),
    });
    ["cName", "cMobile", "cEmail", "cAddress"].forEach((id) => ($(id).value = ""));
    toast("Customer added");
    loadCustomers();
  } catch (e) { toast(e.message, true); }
});

// ---------- DASHBOARD ----------
async function loadDashboard() {
  const d = await api("/api/stats");
  const t = d.totals;
  $("statCards").innerHTML = `
    <div class="stat">Total Orders<span>${t.total_orders}</span></div>
    <div class="stat">Customers<span>${t.total_customers}</span></div>
    <div class="stat">Restaurants<span>${t.total_restaurants}</span></div>
    <div class="stat">Revenue<span>${money(t.total_revenue)}</span></div>`;
  $("revenueBody").innerHTML = d.revenue.map((r) =>
    `<tr><td>${esc(r.restaurant_name)}</td><td>${r.orders}</td><td>${money(r.revenue)}</td></tr>`).join("");
  $("partnersBody").innerHTML = d.partners.map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.vehicle_no)}</td><td>⭐ ${p.rating}</td><td>${p.deliveries}</td></tr>`).join("");
}

const loaders = { order: loadOrderPage, orders: loadOrders, customers: loadCustomers, dashboard: loadDashboard };
loadOrderPage().catch((e) => toast(e.message, true));
