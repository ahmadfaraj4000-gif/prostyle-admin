import "./admin.css";

const API_BASE = "http://127.0.0.1:8787/api";
let state = { barbers: [], services: [], addons: [], hours: [], walkins: [], appointments: [], customers: [] };
let tab = "dashboard";

async function api(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function load() {
  state = await api("/state");
}

async function save() {
  await api("/state", { method: "PATCH", body: JSON.stringify(state) });
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  return `$${Number(value).toFixed(0)}`;
}

function serviceById(serviceId) {
  return state.services.find((service) => service.id === serviceId) || { name: "Unknown service" };
}

function barberById(barberId) {
  if (barberId === "any") return { name: "First available" };
  return state.barbers.find((barber) => barber.id === barberId) || { name: "Any barber" };
}

function combinedQueue() {
  const walkins = state.walkins
    .filter((item) => item.status !== "Done")
    .map((item) => ({ ...item, collection: "walkins", type: "Walk-in", enteredAt: item.createdAt || 0 }));
  const appointments = state.appointments
    .filter((item) => ["Checked in", "In chair"].includes(item.status))
    .map((item) => ({ ...item, collection: "appointments", type: "Appointment", enteredAt: item.checkedInAt || item.createdAt || 0 }));
  return [...walkins, ...appointments].sort((a, b) => (a.enteredAt || 0) - (b.enteredAt || 0));
}

function app() {
  const tabs = ["dashboard", "queue", "walkins", "appointments", "customers", "services", "barbers", "hours"];
  return `
    <header class="topbar">
      <div class="brand"><img src="/assets/logo.png" alt="ProStyle logo" />ProStyle Admin</div>
      <button class="btn secondary" data-refresh>Refresh</button>
    </header>
    <main class="shell">
      <aside class="menu">${tabs.map((item) => `<button class="${tab === item ? "active" : ""}" data-tab="${item}">${title(item)}</button>`).join("")}</aside>
      <section class="content">${panel()}</section>
    </main>`;
}

function title(value) {
  return value.replace(/^\w/, (letter) => letter.toUpperCase());
}

function panel() {
  if (tab === "dashboard") return dashboard();
  if (tab === "queue") return `<h1>Queue</h1>${queuePanel()}`;
  if (tab === "walkins") return `<h1>Walk-ins</h1>${walkins()}`;
  if (tab === "appointments") return `<h1>Appointments</h1>${appointments(true)}`;
  if (tab === "customers") return `<h1>Customers</h1>${customers()}`;
  if (tab === "services") return `<h1>Services and add-ons</h1>${services()}`;
  if (tab === "barbers") return `<h1>Barbers</h1>${barbers()}`;
  return `<h1>Hours</h1>${hours()}`;
}

function dashboard() {
  const waiting = combinedQueue().length;
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="grid four">
      <div class="stat"><span>In-store queue</span><strong>${waiting}</strong></div>
      <div class="stat"><span>Appointments</span><strong>${state.appointments.length}</strong></div>
      <div class="stat"><span>Customers</span><strong>${state.customers.length}</strong></div>
      <div class="stat"><span>Services</span><strong>${state.services.length}</strong></div>
    </div>
    <div class="grid two">
      <section class="panel"><h2>Queue</h2>${queuePanel()}</section>
      <section class="panel"><h2>Today</h2>${appointments(false, state.appointments.filter((item) => item.date === today))}</section>
    </div>`;
}

function queuePanel() {
  const items = combinedQueue();
  if (!items.length) return `<p>No one is currently waiting in the shop.</p>`;
  return `<div class="queue-list">${items.map((item, index) => `
    <div class="queue-card">
      <strong class="queue-number">${index + 1}</strong>
      <div>
        <span class="type-badge">${item.type}</span>
        <h3>${item.name}</h3>
        <p>${item.phone || ""}</p>
      </div>
      <div>
        <strong>${serviceById(item.serviceId).name}</strong>
        <p>${barberById(item.barberId).name}</p>
      </div>
      <div>
        <span class="status">${item.status}</span>
        <div class="actions">
          <button class="btn" data-queue-seat="${item.collection}:${item.id}">${item.status === "Waiting" || item.status === "Checked in" ? "Seat" : "Finish"}</button>
          <button class="btn danger" data-remove="${item.collection}:${item.id}">Remove</button>
        </div>
      </div>
    </div>`).join("")}</div>`;
}

function walkins() {
  if (!state.walkins.length) return `<p>No walk-ins yet.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Service</th><th>Barber</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.walkins.map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.phone}</td>
      <td>${serviceById(item.serviceId).name}</td>
      <td>${barberById(item.barberId).name}</td>
      <td>${item.status}</td>
      <td><div class="actions"><button class="btn" data-seat="${item.id}">${item.status === "Waiting" ? "Seat" : "Finish"}</button><button class="btn danger" data-remove="walkins:${item.id}">Remove</button></div></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function appointments(editable, items = state.appointments) {
  if (!items.length) return `<p>No appointments found.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>When</th><th>Service</th><th>Barber</th><th>Status</th>${editable ? "<th>Actions</th>" : ""}</tr></thead><tbody>${items.map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.phone}</td>
      <td>${item.date}<br />${item.time}</td>
      <td>${serviceById(item.serviceId).name}</td>
      <td>${barberById(item.barberId).name}</td>
      <td>${item.status}</td>
      ${editable ? `<td><div class="actions"><button class="btn" data-check="${item.id}">Check in</button><button class="btn danger" data-remove="appointments:${item.id}">Cancel</button></div></td>` : ""}
    </tr>`).join("")}</tbody></table></div>`;
}

function customers() {
  if (!state.customers.length) return `<p>No customers yet. Booking and walk-in submissions create records here.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Last type</th><th>Notes</th></tr></thead><tbody>${state.customers.map((item) => `
    <tr><td>${item.name}</td><td>${item.phone}</td><td>${item.email || ""}</td><td>${item.lastVisitType || ""}</td><td>${item.notes || ""}</td></tr>`).join("")}</tbody></table></div>`;
}

function services() {
  return `
    <form id="service-form" class="form-box grid two">
      <div class="field"><label>Name</label><input name="name" required /></div>
      <div class="field"><label>Group</label><input name="group" required /></div>
      <div class="field"><label>Price</label><input name="price" type="number" required /></div>
      <div class="field"><label>Duration minutes</label><input name="duration" type="number" required /></div>
      <div class="field"><label>Description</label><textarea name="description" required></textarea></div>
      <button class="btn" type="submit">Add service</button>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Group</th><th>Price</th><th>Duration</th><th>Description</th><th></th></tr></thead><tbody>${state.services.map((item) => `
      <tr>
        <td><input value="${item.name}" data-field="services:${item.id}:name" /></td>
        <td><input value="${item.group}" data-field="services:${item.id}:group" /></td>
        <td><input type="number" value="${item.price}" data-field="services:${item.id}:price" /></td>
        <td><input type="number" value="${item.duration}" data-field="services:${item.id}:duration" /></td>
        <td><textarea data-field="services:${item.id}:description">${item.description}</textarea></td>
        <td><button class="btn danger" data-remove="services:${item.id}">Delete</button></td>
      </tr>`).join("")}</tbody></table></div>
    <h2>Add-ons</h2>
    <form id="addon-form" class="form-box grid two">
      <div class="field"><label>Name</label><input name="name" required /></div>
      <div class="field"><label>Price</label><input name="price" type="number" required /></div>
      <div class="field"><label>Duration minutes</label><input name="duration" type="number" required /></div>
      <button class="btn" type="submit">Add add-on</button>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Price</th><th>Duration</th><th></th></tr></thead><tbody>${state.addons.map((item) => `
      <tr><td><input value="${item.name}" data-field="addons:${item.id}:name" /></td><td><input type="number" value="${item.price}" data-field="addons:${item.id}:price" /></td><td><input type="number" value="${item.duration}" data-field="addons:${item.id}:duration" /></td><td><button class="btn danger" data-remove="addons:${item.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
}

function barbers() {
  return `
    <form id="barber-form" class="form-box grid two"><div class="field"><label>Name</label><input name="name" required /></div><button class="btn" type="submit">Add barber</button></form>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Rename</th><th></th></tr></thead><tbody>${state.barbers.map((item) => `
      <tr><td>${item.name}</td><td>${item.active ? "Active" : "Hidden"}</td><td><input value="${item.name}" data-field="barbers:${item.id}:name" /></td><td><button class="btn" data-toggle="${item.id}">${item.active ? "Hide" : "Show"}</button></td></tr>`).join("")}</tbody></table></div>`;
}

function hours() {
  return `
    <p class="notice">Suggested hours lean into the appointment shift: stronger Tuesday/Saturday coverage and shorter weekday nights to keep the shop staffed well.</p>
    <div class="table-wrap"><table><thead><tr><th>Day</th><th>Current</th><th>Suggested</th></tr></thead><tbody>${state.hours.map((item) => `
      <tr><td>${item.day}</td><td><input value="${item.current}" data-field="hours:${item.day}:current" /></td><td><input value="${item.suggested}" data-field="hours:${item.day}:suggested" /></td></tr>`).join("")}</tbody></table></div>`;
}

function values(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function render() {
  try {
    await load();
    document.querySelector("#app").innerHTML = app();
    bind();
  } catch (error) {
    document.querySelector("#app").innerHTML = `<main class="content"><h1>Backend is not running</h1><p>Start it with <code>npm run server</code> inside <code>prostyle-admin</code>.</p></main>`;
  }
}

function bind() {
  document.querySelector("[data-refresh]")?.addEventListener("click", render);
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { tab = button.dataset.tab; render(); }));
  document.querySelector("#service-form")?.addEventListener("submit", addService);
  document.querySelector("#addon-form")?.addEventListener("submit", addAddon);
  document.querySelector("#barber-form")?.addEventListener("submit", addBarber);
  document.querySelectorAll("[data-seat]").forEach((button) => button.addEventListener("click", () => seatWalkin(button.dataset.seat)));
  document.querySelectorAll("[data-queue-seat]").forEach((button) => button.addEventListener("click", () => updateQueueStatus(button.dataset.queueSeat)));
  document.querySelectorAll("[data-check]").forEach((button) => button.addEventListener("click", () => checkAppointment(button.dataset.check)));
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => removeItem(button.dataset.remove)));
  document.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => toggleBarber(button.dataset.toggle)));
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", () => editField(input.dataset.field, input.value)));
}

async function addService(event) {
  event.preventDefault();
  const form = values(event.currentTarget);
  state.services.push({ id: id("s"), ...form, price: Number(form.price), duration: Number(form.duration) });
  await save();
  render();
}

async function addAddon(event) {
  event.preventDefault();
  const form = values(event.currentTarget);
  state.addons.push({ id: id("ad"), ...form, price: Number(form.price), duration: Number(form.duration) });
  await save();
  render();
}

async function addBarber(event) {
  event.preventDefault();
  const form = values(event.currentTarget);
  state.barbers.push({ id: id("b"), name: form.name, active: true });
  await save();
  render();
}

async function seatWalkin(itemId) {
  const item = state.walkins.find((walkin) => walkin.id === itemId);
  item.status = item.status === "Waiting" ? "In chair" : "Done";
  await save();
  render();
}

async function updateQueueStatus(descriptor) {
  const [collection, itemId] = descriptor.split(":");
  const item = state[collection].find((entry) => entry.id === itemId);
  if (!item) return;
  item.status = item.status === "Waiting" || item.status === "Checked in" ? "In chair" : "Done";
  await save();
  render();
}

async function checkAppointment(itemId) {
  const item = state.appointments.find((appointment) => appointment.id === itemId);
  item.status = "Checked in";
  item.checkedInAt = Date.now();
  await save();
  render();
}

async function removeItem(descriptor) {
  const [collection, itemId] = descriptor.split(":");
  state[collection] = state[collection].filter((item) => item.id !== itemId);
  await save();
  render();
}

async function toggleBarber(itemId) {
  const item = state.barbers.find((barber) => barber.id === itemId);
  item.active = !item.active;
  await save();
  render();
}

async function editField(descriptor, value) {
  const [collection, itemId, field] = descriptor.split(":");
  const item = collection === "hours" ? state.hours.find((hour) => hour.day === itemId) : state[collection].find((entry) => entry.id === itemId);
  item[field] = ["price", "duration"].includes(field) ? Number(value) : value;
  await save();
}

render();
