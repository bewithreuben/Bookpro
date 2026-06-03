const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/security");

const prisma = new PrismaClient();
const demoPasswordHash = hashPassword("demo-password");

async function main() {
  const customer = await prisma.user.upsert({
    where: { email: "customer@bookpro.ng" },
    update: {},
    create: {
      role: "CUSTOMER",
      name: "Rob Customer",
      email: "customer@bookpro.ng",
      phone: "+2348010000001",
      passwordHash: demoPasswordHash
    }
  });

  const proUser = await prisma.user.upsert({
    where: { email: "maya@bookpro.ng" },
    update: {},
    create: {
      role: "PROFESSIONAL",
      name: "Maya Johnson",
      email: "maya@bookpro.ng",
      phone: "+2348020000001",
      passwordHash: demoPasswordHash
    }
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@bookpro.ng" },
    update: {},
    create: {
      role: "ADMIN",
      name: "BookPro Admin",
      email: "admin@bookpro.ng",
      phone: "+2348030000001",
      passwordHash: demoPasswordHash
    }
  });

  const maya = await prisma.professional.upsert({
    where: { userId: proUser.id },
    update: {},
    create: {
      userId: proUser.id,
      service: "Plumbing",
      title: "Leak repair specialist",
      location: "Ikeja",
      latitude: 6.6018,
      longitude: 3.3515,
      distance: 2.1,
      eta: "18 min",
      price: 45000,
      rating: 4.98,
      reviewCount: 218,
      completedJobsLabel: "1,200+",
      skills: ["Licensed", "Insured", "Same-day"],
      colors: ["#0f766e", "#457b9d"],
      slots: ["Now", "2:30 PM", "4:00 PM"],
      availability: ["Mon 9-5", "Tue 9-5", "Thu 12-8", "Fri 9-5"],
      verificationStatus: "VERIFIED",
      bankName: "GTBank",
      accountName: "Maya Johnson",
      accountNumber: "0123456789",
      uploads: {
        create: [
          { name: "Lagos plumbing permit.pdf", status: "verified" },
          { name: "Insurance certificate.jpg", status: "verified" },
          { name: "Sink repair.png", status: "live" }
        ]
      }
    }
  });

  const booking = await prisma.booking.upsert({
    where: { reference: "BP-DEMO-1001" },
    update: {},
    create: {
      customerId: customer.id,
      professionalId: maya.id,
      service: "Plumbing",
      location: "Ikeja",
      slot: "Today 2:30 PM",
      amount: 45000,
      status: "CONFIRMED",
      paymentStatus: "AUTHORIZED",
      reference: "BP-DEMO-1001",
      payments: {
        create: {
          provider: "paystack",
          reference: "BP-DEMO-1001",
          amount: 45000,
          status: "AUTHORIZED",
          channel: "card"
        }
      }
    }
  });

  await prisma.message.create({
    data: {
      bookingId: booking.id,
      senderId: proUser.id,
      body: "I can arrive in 18 minutes. Please confirm parking access."
    }
  });

  await prisma.verificationItem.createMany({
    data: [
      { name: "Aisha Bello", trade: "Cleaning", docs: "NIN, address, insurance", status: "PENDING" },
      { name: "David Okafor", trade: "Electrical", docs: "Lagos State trade permit", status: "PENDING" }
    ],
    skipDuplicates: true
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "seed_database",
      target: "bookpro_services",
      metadata: { market: "Nigeria", provider: "Paystack" }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
