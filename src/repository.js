const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { hashPassword } = require("./security");

const root = path.resolve(__dirname, "..");
const storePath = path.join(root, "data", "store.json");
let storeCache = null;
let prismaClient = null;

function makeReference() {
  return `BP-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function normalizeRole(role) {
  return String(role || "").toLowerCase();
}

function dbRole(role) {
  return String(role || "").toUpperCase();
}

function dbBookingStatus(status) {
  return String(status || "requested").toUpperCase();
}

function dbPaymentStatus(status) {
  return String(status || "pending").toUpperCase();
}

function apiStatus(status) {
  return String(status || "").toLowerCase();
}

async function readStore() {
  if (storeCache) return storeCache;
  storeCache = JSON.parse(await fs.readFile(storePath, "utf8"));
  return storeCache;
}

async function writeStore(store) {
  storeCache = store;
  try {
    await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
  } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    role: normalizeRole(user.role),
    name: user.name,
    email: user.email,
    phone: user.phone || ""
  };
}

function mapPrismaProfessional(pro) {
  return {
    id: pro.id,
    userId: pro.userId,
    name: pro.user?.name || pro.name,
    initials: (pro.user?.name || "BP").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    service: pro.service,
    title: pro.title,
    rating: pro.rating,
    reviews: pro.reviewCount,
    location: pro.location,
    distance: pro.distance,
    eta: pro.eta,
    price: pro.price,
    jobs: pro.completedJobsLabel,
    skills: pro.skills,
    colors: pro.colors,
    slots: pro.slots,
    availability: pro.availability,
    verificationStatus: apiStatus(pro.verificationStatus),
    uploads: pro.uploads || [],
    bank: {
      bankName: pro.bankName,
      accountName: pro.accountName,
      accountNumber: pro.accountNumber
    },
    earnings: { week: 286000, completed: 18, payoutDate: "Friday" }
  };
}

function mapPrismaBooking(booking) {
  return {
    id: booking.id,
    customerId: booking.customerId,
    professionalId: booking.professionalId,
    service: booking.service,
    location: booking.location,
    slot: booking.slot,
    amount: booking.amount,
    status: apiStatus(booking.status),
    paymentStatus: apiStatus(booking.paymentStatus),
    reference: booking.reference,
    professionalName: booking.professional?.user?.name || booking.professionalName
  };
}

async function loadPrisma() {
  if (prismaClient) return prismaClient;
  if (!process.env.DATABASE_URL) return null;
  try {
    const { PrismaClient } = require("@prisma/client");
    prismaClient = new PrismaClient();
    await prismaClient.$connect();
    return prismaClient;
  } catch {
    return null;
  }
}

async function createRepository() {
  const prisma = await loadPrisma();
  if (prisma) return createPrismaRepository(prisma);
  return createJsonRepository();
}

function createJsonRepository() {
  return {
    mode: "json",
    async bootstrap() {
      return {
        services: ["Plumbing", "Electrical", "Cleaning", "Beauty", "Auto", "Handyman"],
        locations: ["Ikeja", "Lekki", "Yaba", "Surulere"],
        paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "pk_test_bookpro_demo"
      };
    },
    async findUserByLogin(login) {
      const store = await readStore();
      return store.users.find((item) => item.email === login || item.phone === login) || null;
    },
    async createUser(body) {
      const store = await readStore();
      const exists = store.users.some((item) => item.email === body.email);
      if (exists) {
        const error = new Error("An account with that email already exists.");
        error.status = 409;
        throw error;
      }
      const user = {
        id: `usr_${Date.now()}`,
        role: normalizeRole(body.role),
        name: body.name,
        email: body.email,
        phone: body.phone || "",
        passwordHash: hashPassword(body.password)
      };
      store.users.push(user);
      await writeStore(store);
      return user;
    },
    async searchProfessionals(query) {
      const store = await readStore();
      const service = query.get("service") || "All";
      const location = query.get("location") || "All";
      return store.professionals.filter((pro) => {
        const serviceMatch = service === "All" || pro.service === service;
        const locationMatch = location === "All" || pro.location === location;
        return serviceMatch && locationMatch && pro.verificationStatus === "verified";
      });
    },
    async customerHistory(customerId) {
      const store = await readStore();
      return store.bookings
        .filter((booking) => !customerId || booking.customerId === customerId)
        .map((booking) => {
          const pro = store.professionals.find((item) => item.id === booking.professionalId);
          return { ...booking, professionalName: pro?.name || "Assigned professional" };
        });
    },
    async createBooking(body, actor) {
      const store = await readStore();
      const pro = store.professionals.find((item) => item.id === body.professionalId);
      if (!pro) {
        const error = new Error("Professional not found.");
        error.status = 404;
        throw error;
      }
      const booking = {
        id: `book_${Date.now()}`,
        customerId: actor?.id || body.customerId || "usr_customer_1",
        professionalId: pro.id,
        service: pro.service,
        location: body.location || pro.location,
        slot: body.slot || pro.slots[0],
        amount: pro.price,
        status: "requested",
        paymentStatus: "pending",
        reference: makeReference()
      };
      store.bookings.unshift(booking);
      await writeStore(store);
      return booking;
    },
    async initializePayment(body) {
      const store = await readStore();
      const booking = store.bookings.find((item) => item.id === body.bookingId);
      if (!booking) {
        const error = new Error("Booking not found.");
        error.status = 404;
        throw error;
      }
      booking.paymentStatus = "authorized";
      const payment = {
        id: `pay_${Date.now()}`,
        bookingId: booking.id,
        provider: "paystack",
        reference: booking.reference,
        amount: booking.amount,
        status: "authorized",
        channel: body.channel || "card"
      };
      store.payments.unshift(payment);
      await writeStore(store);
      return { booking, payment };
    },
    async markPaymentFromPaystack(reference, status, providerRaw) {
      const store = await readStore();
      const payment = store.payments.find((item) => item.reference === reference);
      const booking = store.bookings.find((item) => item.reference === reference);
      if (payment) payment.status = status;
      if (booking) booking.paymentStatus = status;
      if (payment) payment.providerRaw = providerRaw;
      await writeStore(store);
      return { payment, booking };
    },
    async updateJob(bookingId, action) {
      const store = await readStore();
      const booking = store.bookings.find((item) => item.id === bookingId);
      if (!booking) {
        const error = new Error("Booking not found.");
        error.status = 404;
        throw error;
      }
      booking.status = action === "accept" ? "confirmed" : "rejected";
      await writeStore(store);
      return booking;
    },
    async professionalDashboard(actor) {
      const store = await readStore();
      const professional = store.professionals.find((item) => item.userId === actor?.id) || store.professionals[0];
      const jobs = store.bookings.filter((item) => item.professionalId === professional.id);
      return { professional, jobs, reviews: store.reviews };
    },
    async adminDashboard() {
      const store = await readStore();
      const gmv = store.payments.reduce((sum, payment) => sum + payment.amount, 0);
      return {
        metrics: {
          gmv,
          bookings: store.bookings.length,
          fillRate: 91,
          openDisputes: store.disputes.length,
          repeatCustomers: 64,
          averageResponseMinutes: 4
        },
        verificationQueue: store.verificationQueue,
        disputes: store.disputes,
        payments: store.payments
      };
    },
    async verifyWorker(verificationId, actor) {
      const store = await readStore();
      const item = store.verificationQueue.find((entry) => entry.id === verificationId);
      if (!item) {
        const error = new Error("Verification request not found.");
        error.status = 404;
        throw error;
      }
      item.status = "approved";
      store.auditLogs = store.auditLogs || [];
      store.auditLogs.push({ actorId: actor?.id, action: "verify_worker", target: verificationId, createdAt: new Date().toISOString() });
      await writeStore(store);
      return item;
    }
  };
}

function createPrismaRepository(prisma) {
  return {
    mode: "prisma",
    async bootstrap() {
      const services = await prisma.professional.findMany({ distinct: ["service"], select: { service: true } });
      const locations = await prisma.professional.findMany({ distinct: ["location"], select: { location: true } });
      return {
        services: services.map((item) => item.service),
        locations: locations.map((item) => item.location),
        paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "pk_test_bookpro_demo"
      };
    },
    async findUserByLogin(login) {
      return prisma.user.findFirst({ where: { OR: [{ email: login }, { phone: login }] } });
    },
    async createUser(body) {
      return prisma.user.create({
        data: {
          role: dbRole(body.role),
          name: body.name,
          email: body.email,
          phone: body.phone || null,
          passwordHash: hashPassword(body.password)
        }
      });
    },
    async searchProfessionals(query) {
      const service = query.get("service") || "All";
      const location = query.get("location") || "All";
      const professionals = await prisma.professional.findMany({
        where: {
          verificationStatus: "VERIFIED",
          ...(service === "All" ? {} : { service }),
          ...(location === "All" ? {} : { location })
        },
        include: { user: true, uploads: true },
        orderBy: [{ rating: "desc" }, { distance: "asc" }]
      });
      return professionals.map(mapPrismaProfessional);
    },
    async customerHistory(customerId) {
      const bookings = await prisma.booking.findMany({
        where: customerId ? { customerId } : {},
        include: { professional: { include: { user: true } } },
        orderBy: { createdAt: "desc" }
      });
      return bookings.map(mapPrismaBooking);
    },
    async createBooking(body, actor) {
      const pro = await prisma.professional.findUnique({ where: { id: body.professionalId } });
      if (!pro) {
        const error = new Error("Professional not found.");
        error.status = 404;
        throw error;
      }
      const booking = await prisma.booking.create({
        data: {
          customerId: actor?.id || body.customerId,
          professionalId: pro.id,
          service: pro.service,
          location: body.location || pro.location,
          slot: body.slot || pro.slots[0],
          amount: pro.price,
          reference: makeReference()
        }
      });
      return mapPrismaBooking(booking);
    },
    async initializePayment(body) {
      const booking = await prisma.booking.findUnique({ where: { id: body.bookingId } });
      if (!booking) {
        const error = new Error("Booking not found.");
        error.status = 404;
        throw error;
      }
      const payment = await prisma.payment.upsert({
        where: { reference: booking.reference },
        update: { status: "AUTHORIZED", channel: body.channel || "card" },
        create: {
          bookingId: booking.id,
          reference: booking.reference,
          amount: booking.amount,
          status: "AUTHORIZED",
          channel: body.channel || "card"
        }
      });
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: "AUTHORIZED" }
      });
      return { booking: mapPrismaBooking(updatedBooking), payment: { ...payment, status: apiStatus(payment.status) } };
    },
    async markPaymentFromPaystack(reference, status, providerRaw) {
      const dbStatus = dbPaymentStatus(status);
      const payment = await prisma.payment.update({
        where: { reference },
        data: { status: dbStatus, providerRaw }
      });
      const booking = await prisma.booking.update({
        where: { reference },
        data: { paymentStatus: dbStatus }
      });
      return { payment: { ...payment, status: apiStatus(payment.status) }, booking: mapPrismaBooking(booking) };
    },
    async updateJob(bookingId, action) {
      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: action === "accept" ? "CONFIRMED" : "REJECTED" }
      });
      return mapPrismaBooking(booking);
    },
    async professionalDashboard(actor) {
      const professional = await prisma.professional.findFirst({
        where: actor?.role === "professional" ? { userId: actor.id } : undefined,
        include: { user: true, uploads: true }
      });
      const jobs = await prisma.booking.findMany({
        where: { professionalId: professional.id },
        orderBy: { createdAt: "desc" }
      });
      const reviews = await prisma.review.findMany({ where: { professionalId: professional.id }, include: { customer: true } });
      return { professional: mapPrismaProfessional(professional), jobs: jobs.map(mapPrismaBooking), reviews };
    },
    async adminDashboard() {
      const [payments, bookings, disputes, verificationQueue] = await Promise.all([
        prisma.payment.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.booking.findMany(),
        prisma.dispute.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.verificationItem.findMany({ orderBy: { createdAt: "desc" } })
      ]);
      const gmv = payments.reduce((sum, payment) => sum + payment.amount, 0);
      return {
        metrics: {
          gmv,
          bookings: bookings.length,
          fillRate: 91,
          openDisputes: disputes.length,
          repeatCustomers: 64,
          averageResponseMinutes: 4
        },
        verificationQueue: verificationQueue.map((item) => ({ ...item, status: apiStatus(item.status) })),
        disputes: disputes.map((item) => ({ ...item, status: apiStatus(item.status), amountHeld: item.amountHeld })),
        payments: payments.map((item) => ({ ...item, status: apiStatus(item.status) }))
      };
    },
    async verifyWorker(verificationId, actor) {
      const item = await prisma.verificationItem.update({
        where: { id: verificationId },
        data: { status: "VERIFIED" }
      });
      await prisma.auditLog.create({
        data: {
          actorId: actor?.id,
          action: "verify_worker",
          target: verificationId,
          metadata: { verificationId }
        }
      });
      return { ...item, status: apiStatus(item.status) };
    }
  };
}

module.exports = {
  createRepository,
  publicUser,
  mapPrismaBooking
};
