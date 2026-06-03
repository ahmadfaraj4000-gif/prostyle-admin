import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const storePath = join(root, "data", "store.json");
const port = Number(process.env.PORT || 8787);

async function readStore() {
  return JSON.parse(await readFile(storePath, "utf8"));
}

async function writeStore(store) {
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function send(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function upsertCustomer(store, record, type) {
  const phone = String(record.phone || "").replace(/\D/g, "");
  const existing = store.customers.find((customer) => String(customer.phone || "").replace(/\D/g, "") === phone);
  if (existing) Object.assign(existing, { name: record.name, phone: record.phone, email: record.email || existing.email, notes: record.notes || existing.notes, lastVisitType: type });
  else store.customers.push({ id: `c-${Date.now()}`, name: record.name, phone: record.phone, email: record.email || "", notes: record.notes || "", lastVisitType: type, createdAt: Date.now() });
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 200, {});

  const url = new URL(request.url, `http://${request.headers.host}`);
  if (!url.pathname.startsWith("/api")) return send(response, 404, { error: "Not found" });

  try {
    const store = await readStore();

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/state") return send(response, 200, request.method === "HEAD" ? {} : store);

    if (request.method === "GET" && url.pathname === "/api/appointments/search") {
      const phone = String(url.searchParams.get("phone") || "").replace(/\D/g, "");
      return send(response, 200, store.appointments.filter((item) => String(item.phone || "").replace(/\D/g, "") === phone));
    }

    if (request.method === "POST" && url.pathname === "/api/walkins") {
      const record = await body(request);
      store.walkins.push(record);
      upsertCustomer(store, record, "Walk-in");
      await writeStore(store);
      return send(response, 201, record);
    }

    if (request.method === "POST" && url.pathname === "/api/appointments") {
      const record = await body(request);
      store.appointments.push(record);
      upsertCustomer(store, record, "Appointment");
      await writeStore(store);
      return send(response, 201, record);
    }

    const checkInMatch = url.pathname.match(/^\/api\/appointments\/([^/]+)\/checkin$/);
    if (request.method === "PATCH" && checkInMatch) {
      const appointment = store.appointments.find((item) => item.id === checkInMatch[1]);
      if (appointment) {
        appointment.status = "Checked in";
        appointment.checkedInAt = Date.now();
      }
      await writeStore(store);
      return send(response, 200, appointment || {});
    }

    if (request.method === "PATCH" && url.pathname === "/api/state") {
      const next = await body(request);
      await writeStore(next);
      return send(response, 200, next);
    }

    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ProStyle API listening at http://127.0.0.1:${port}`);
});
