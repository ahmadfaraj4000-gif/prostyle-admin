import "./admin.css";

const API_BASE = window.PROSTYLE_API_BASE || "https://laudable-bass-943.convex.site/api";
let state = { barbers: [], services: [], addons: [], hours: [], walkins: [], appointments: [], customers: [], notifications: [] };
let tab = "dashboard";
let authToken = localStorage.getItem("prostyleAdminToken") || "";
let rescheduleOpenId = "";

async function api(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    ...options
  });
  if (response.status === 401) {
    authToken = "";
    localStorage.removeItem("prostyleAdminToken");
    throw new Error("AUTH");
  }
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
    .filter((item) => ["Waiting", "In chair"].includes(item.status))
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
      <div class="topbar-actions"><button class="btn secondary" data-refresh>Refresh</button><button class="btn secondary" data-logout>Log out</button></div>
    </header>
    <main class="shell">
      <aside class="menu">${tabs.map((item) => `<button class="${tab === item ? "active" : ""}" data-tab="${item}">${title(item)}</button>`).join("")}</aside>
      <section class="content">${panel()}</section>
    </main>`;
}

function loginScreen(message = "") {
  return `
    <main class="login-shell">
      <form class="login-box" id="login-form">
        <img src="/assets/logo.png" alt="ProStyle logo" />
        <h1>Admin Login</h1>
        <p>Enter the owner/admin credentials to manage appointments, barbers, and shop data.</p>
        <label for="admin-username">Username</label>
        <input id="admin-username" name="username" autocomplete="username" required />
        <label for="admin-password">Password</label>
        <input id="admin-password" name="password" type="password" autocomplete="current-password" required />
        <button class="btn" type="submit">Log in</button>
        ${message ? `<p class="notice">${message}</p>` : `<p class="hint">Use the owner/admin username and password.</p>`}
      </form>
    </main>`;
}

function title(value) {
  return value.replace(/^\w/, (letter) => letter.toUpperCase());
}

function todayAppointmentLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function appointmentDateText(item) {
  if (item.dateLabel) return item.dateLabel;
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(new Date(`${item.date}T12:00:00`));
  }
  return item.date || "";
}

function dateLabelFromKey(dateKey) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${dateKey}T12:00:00`));
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
  const today = todayAppointmentLabel();
  const unread = (state.notifications || []).filter((item) => !item.read).length;
  return `
    <div class="grid four">
      <div class="stat"><span>In-store queue</span><strong>${waiting}</strong></div>
      <div class="stat"><span>Appointments</span><strong>${state.appointments.length}</strong></div>
      <div class="stat"><span>Customers</span><strong>${state.customers.length}</strong></div>
      <div class="stat"><span>Owner alerts</span><strong>${unread}</strong></div>
    </div>
    <div class="grid dashboard-panels">
      <section class="panel"><h2>Owner notifications</h2>${notifications()}</section>
      <section class="panel"><h2>Queue</h2>${queuePanel()}</section>
      <section class="panel"><h2>Today</h2>${appointments(false, state.appointments.filter((item) => item.date === today || item.date === todayDateKey() || item.dateLabel === today))}</section>
    </div>`;
}

function notifications() {
  const items = (state.notifications || []).filter((item) => !item.read);
  if (!items.length) return `<p>No unread notifications.</p>`;
  return `<div class="notification-list">${items.slice(0, 8).map((item) => `
    <div class="notification">
      <span class="type-badge">${item.kind || "info"}</span>
      <p>${item.message}</p>
      <button class="btn secondary" data-notification-read="${item.id}">Mark read</button>
    </div>`).join("")}</div>`;
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
      <td>${appointmentDateText(item)}<br />${item.time}</td>
      <td>${serviceById(item.serviceId).name}</td>
      <td>${barberById(item.barberId).name}</td>
      <td>${item.status}</td>
      ${editable ? `<td><div class="actions"><button class="btn" data-check="${item.id}">Check in</button><button class="btn secondary" data-reschedule="${item.id}">Reschedule</button><button class="btn danger" data-remove="appointments:${item.id}">Cancel</button></div></td>` : ""}
    </tr>
    ${editable && rescheduleOpenId === item.id ? reschedulePanel(item) : ""}`).join("")}</tbody></table></div>`;
}

function reschedulePanel(item) {
  const currentDate = /^\d{4}-\d{2}-\d{2}$/.test(item.date || "") ? item.date : new Date().toISOString().slice(0, 10);
  const dates = upcomingOpenDates(currentDate);
  return `
    <tr class="reschedule-row">
      <td colspan="7">
        <form class="reschedule-panel" data-reschedule-form="${item.id}">
          <div>
            <span class="type-badge">Reschedule</span>
            <h3>${item.name}</h3>
            <p>${item.phone} · ${serviceById(item.serviceId).name}</p>
          </div>
          <div class="reschedule-calendar">
            ${dates.map((date) => `<button type="button" class="${date.key === currentDate ? "active" : ""}" data-calendar-date="${date.key}">${date.weekday}<small>${date.label}</small></button>`).join("")}
          </div>
          <div class="grid three">
            <div class="field"><label>Date</label><input name="date" type="date" value="${currentDate}" required /></div>
            <div class="field"><label>Time</label><input name="time" value="${item.time || "10:00 AM"}" required /></div>
            <div class="field"><label>Barber</label><select name="barberId" required>${barberOptionsForDate(currentDate, item.barberId)}</select></div>
          </div>
          <div class="actions">
            <button class="btn" type="submit">Save reschedule</button>
            <button class="btn secondary" type="button" data-reschedule-cancel>Cancel</button>
          </div>
        </form>
      </td>
    </tr>`;
}

function upcomingOpenDates(selectedDate) {
  const dates = [];
  const start = new Date(`${selectedDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) start.setTime(Date.now());

  for (let offset = 0; dates.length < 14; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    if ([0, 1].includes(date.getDay())) continue;
    dates.push({
      key: date.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
    });
  }

  if (!dates.some((date) => date.key === selectedDate)) {
    dates.unshift({
      key: selectedDate,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(start),
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start)
    });
  }

  return dates;
}

function barberOptionsForDate(dateKey, selectedBarberId = "") {
  const available = state.barbers.filter((barber) => isBarberAvailableForDate(barber, dateKey));
  if (!available.length) return `<option value="">No barbers available</option>`;
  return available.map((barber) => `<option value="${barber.id}" ${barber.id === selectedBarberId ? "selected" : ""}>${barber.name}</option>`).join("");
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
    <p class="notice">Set a barber to N/A indefinitely or for selected dates. The public booking lists will hide that barber, walk-ins will be removed from the active waitlist, and appointments in that range will be flagged for reschedule.</p>
    <div class="table-wrap"><table><thead><tr><th>Barber name</th><th>Status</th><th>Dates</th><th>Reason</th><th></th></tr></thead><tbody>${state.barbers.map((item) => barberRow(item)).join("")}</tbody></table></div>`;
}

function barberRow(item) {
  const mode = item.unavailableMode || (item.active ? "active" : "indefinite");
  return `
    <tr>
      <td><input value="${item.name}" data-field="barbers:${item.id}:name" aria-label="Barber name" /></td>
      <td>
        <select data-barber-mode="${item.id}">
          <option value="active" ${mode === "active" ? "selected" : ""}>Active</option>
          <option value="range" ${mode === "range" ? "selected" : ""}>N/A for dates</option>
          <option value="indefinite" ${mode === "indefinite" ? "selected" : ""}>N/A indefinitely</option>
        </select>
      </td>
      <td class="date-range">
        <input type="date" value="${item.unavailableFrom || ""}" data-field="barbers:${item.id}:unavailableFrom" aria-label="Unavailable start date" />
        <input type="date" value="${item.unavailableTo || ""}" data-field="barbers:${item.id}:unavailableTo" aria-label="Unavailable end date" />
      </td>
      <td><input value="${item.unavailableReason || ""}" data-field="barbers:${item.id}:unavailableReason" placeholder="Vacation, sick, personal..." /></td>
      <td><button class="btn" data-toggle="${item.id}">${mode === "active" ? "Set N/A" : "Set active"}</button></td>
    </tr>`;
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
  if (!authToken) {
    document.querySelector("#app").innerHTML = loginScreen();
    bindLogin();
    return;
  }
  try {
    await load();
    document.querySelector("#app").innerHTML = app();
    bind();
  } catch (error) {
    if (error.message === "AUTH") {
      document.querySelector("#app").innerHTML = loginScreen("Please log in again.");
      bindLogin();
      return;
    }
    document.querySelector("#app").innerHTML = `<main class="content"><h1>Booking system unavailable</h1><p>Could not reach the Convex booking API. Check the deployment URL and try again.</p></main>`;
  }
}

function bind() {
  document.querySelector("[data-refresh]")?.addEventListener("click", render);
  document.querySelector("[data-logout]")?.addEventListener("click", logout);
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { tab = button.dataset.tab; render(); }));
  document.querySelector("#service-form")?.addEventListener("submit", addService);
  document.querySelector("#addon-form")?.addEventListener("submit", addAddon);
  document.querySelector("#barber-form")?.addEventListener("submit", addBarber);
  document.querySelectorAll("[data-seat]").forEach((button) => button.addEventListener("click", () => seatWalkin(button.dataset.seat)));
  document.querySelectorAll("[data-queue-seat]").forEach((button) => button.addEventListener("click", () => updateQueueStatus(button.dataset.queueSeat)));
  document.querySelectorAll("[data-check]").forEach((button) => button.addEventListener("click", () => checkAppointment(button.dataset.check)));
  document.querySelectorAll("[data-reschedule]").forEach((button) => button.addEventListener("click", () => openReschedule(button.dataset.reschedule)));
  document.querySelectorAll("[data-reschedule-form]").forEach((form) => {
    form.addEventListener("submit", submitReschedule);
    form.querySelector("[name='date']")?.addEventListener("change", () => updateRescheduleBarbers(form));
  });
  document.querySelectorAll("[data-calendar-date]").forEach((button) => button.addEventListener("click", () => chooseRescheduleDate(button)));
  document.querySelectorAll("[data-reschedule-cancel]").forEach((button) => button.addEventListener("click", () => { rescheduleOpenId = ""; render(); }));
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => removeItem(button.dataset.remove)));
  document.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => toggleBarber(button.dataset.toggle)));
  document.querySelectorAll("[data-barber-mode]").forEach((select) => select.addEventListener("change", () => setBarberMode(select.dataset.barberMode, select.value)));
  document.querySelectorAll("[data-notification-read]").forEach((button) => button.addEventListener("click", () => markNotificationRead(button.dataset.notificationRead)));
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", () => editField(input.dataset.field, input.value)));
}

function bindLogin() {
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = values(event.currentTarget);
    try {
      const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: form.username, password: form.password }) });
      authToken = result.token;
      localStorage.setItem("prostyleAdminToken", authToken);
      render();
    } catch {
      document.querySelector("#app").innerHTML = loginScreen("That username or password did not work.");
      bindLogin();
    }
  });
}

async function logout() {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  authToken = "";
  localStorage.removeItem("prostyleAdminToken");
  render();
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
  state.barbers.push({ id: id("b"), name: form.name, active: true, unavailableMode: "active", unavailableFrom: "", unavailableTo: "", unavailableReason: "" });
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

function openReschedule(itemId) {
  rescheduleOpenId = rescheduleOpenId === itemId ? "" : itemId;
  render();
}

function chooseRescheduleDate(button) {
  const form = button.closest("[data-reschedule-form]");
  if (!form) return;
  form.querySelectorAll("[data-calendar-date]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  form.elements.date.value = button.dataset.calendarDate;
  updateRescheduleBarbers(form);
}

function updateRescheduleBarbers(form) {
  const selected = form.elements.barberId.value;
  form.elements.barberId.innerHTML = barberOptionsForDate(form.elements.date.value, selected);
}

async function submitReschedule(event) {
  event.preventDefault();
  const itemId = event.currentTarget.dataset.rescheduleForm;
  const item = state.appointments.find((appointment) => appointment.id === itemId);
  if (!item) return;

  const form = values(event.currentTarget);
  if (!state.barbers.some((barber) => barber.id === form.barberId && isBarberAvailableForDate(barber, form.date))) {
    alert("That barber is not available for the selected date.");
    return;
  }

  item.date = form.date;
  item.dateLabel = dateLabelFromKey(form.date);
  item.time = form.time;
  item.barberId = form.barberId;
  item.status = "Booked";
  item.checkedInAt = undefined;

  state.notifications ||= [];
  state.notifications.unshift({
    id: id("n"),
    kind: "reschedule",
    message: `${item.name} was rescheduled to ${item.dateLabel} at ${item.time} with ${barberById(item.barberId).name}.`,
    relatedId: item.id,
    read: false,
    createdAt: Date.now()
  });

  rescheduleOpenId = "";
  await save();
  render();
}

function isBarberAvailableForDate(barber, dateKey) {
  if (!barber || barber.active === false || barber.unavailableMode === "indefinite") return false;
  if (barber.unavailableMode !== "range") return true;
  const from = barber.unavailableFrom || "0000-01-01";
  const to = barber.unavailableTo || "9999-12-31";
  return !(dateKey >= from && dateKey <= to);
}

async function removeItem(descriptor) {
  const [collection, itemId] = descriptor.split(":");
  state[collection] = state[collection].filter((item) => item.id !== itemId);
  await save();
  render();
}

async function toggleBarber(itemId) {
  const item = state.barbers.find((barber) => barber.id === itemId);
  setBarberAvailability(item, item.active ? "indefinite" : "active");
  await save();
  render();
}

async function setBarberMode(itemId, mode) {
  const item = state.barbers.find((barber) => barber.id === itemId);
  if (!item) return;
  setBarberAvailability(item, mode);
  await save();
  render();
}

function setBarberAvailability(item, mode) {
  item.unavailableMode = mode;
  item.active = mode === "active";
  if (mode === "active") {
    item.unavailableFrom = "";
    item.unavailableTo = "";
  }
  if (mode === "range") {
    item.active = true;
    item.unavailableFrom ||= new Date().toISOString().slice(0, 10);
    item.unavailableTo ||= item.unavailableFrom;
  }
}

async function markNotificationRead(itemId) {
  const item = (state.notifications || []).find((notification) => notification.id === itemId);
  if (!item) return;
  item.read = true;
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
