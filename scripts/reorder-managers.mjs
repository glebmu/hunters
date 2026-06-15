import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const EXCEL_ORDER = [
  "Айт Марина",
  "Шарафиева Евгения",
  "Ефремова Ирина",
  "Банников Никита",
  "Титов Борис",
  "Лутошкина Анна",
  "Ильичева Анастасия",
  "Клёпов Илья",
  "Галимова Екатерина",
  "Соколов Ростислав",
  "Родников Дмитрий",
  "Норина Надежда",
  "Король Александра",
  "Дудина Татьяна",
  "Злобина Елена",
  "Котов Александр",
  "Зыкин Иван",
  "Иоос Екатерина",
  "Вокуева Анастасия",
  "Бронская Юлия",
  "Санникова Татьяна",
  "Казаковцев Иван",
  "Пономарёв Денис",
  "Шулаков Егор",
  "Хлебникова Марина",
];

function normalize(s) {
  return s.trim().toLowerCase().replace(/ё/g, "е");
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const managers = await prisma.manager.findMany();
console.log("Managers in DB:", managers.map((m) => m.name));

const matched = [];
const unmatched = [];

for (const [i, excelName] of EXCEL_ORDER.entries()) {
  const norm = normalize(excelName);
  const found = managers.find((m) => normalize(m.name) === norm);
  if (found) {
    matched.push({ id: found.id, name: found.name, position: i + 1 });
  } else {
    console.warn(`NOT FOUND in DB: "${excelName}"`);
  }
}

const matchedIds = new Set(matched.map((m) => m.id));
let nextPos = EXCEL_ORDER.length + 1;
for (const m of managers) {
  if (!matchedIds.has(m.id)) {
    unmatched.push({ id: m.id, name: m.name, position: nextPos++ });
  }
}

console.log("\nNew positions:");
for (const m of [...matched, ...unmatched]) {
  console.log(`  ${m.position}. ${m.name}`);
}

// First set temporary negative positions to avoid unique constraint conflicts
for (let i = 0; i < managers.length; i++) {
  await prisma.manager.update({ where: { id: managers[i].id }, data: { position: -(i + 1) } });
}

// Then apply correct positions
for (const m of [...matched, ...unmatched]) {
  await prisma.manager.update({ where: { id: m.id }, data: { position: m.position } });
}

console.log("\nDone.");
await prisma.$disconnect();
