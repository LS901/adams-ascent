import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

bcrypt
  .hash(password, 12)
  .then((hash) => {
    const base64 = Buffer.from(hash, "utf-8").toString("base64");
    console.log(`ADMIN_PASSWORD_HASH_BASE64=${base64}`);
    console.log(`\n(raw hash, for reference only — don't put this in .env: ${hash})`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
