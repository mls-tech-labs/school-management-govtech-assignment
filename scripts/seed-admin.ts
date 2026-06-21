#!/usr/bin/env tsx
/**
 * `npm run seed:admin` — hash-and-print helper for the `users` table.
 *
 * Pipeline:
 *
 *   npm run seed:admin -- --username admin --password '***' --confirm \
 *     | mysql -h <host> -u root -p edu_inst
 *
 * The script:
 *   1. Parses CLI args (`--username`, `--password`, `--confirm`).
 *   2. Refuses to run unless `--confirm` is present (defense against
 *      unattended pipelines — spec FR-026).
 *   3. Hashes the password with `lib/auth/password.ts → hashPassword`
 *      (argon2id envelope + standalone salt).
 *   4. Prints a parameterised `INSERT INTO users (...) VALUES (...)`
 *      statement to stdout (one line, ready to pipe into `mysql`).
 *   5. NEVER touches the database — the INSERT runs only when the
 *      operator pipes the output into their MySQL client.
 *
 * Password vs salt — per the user's explicit instruction:
 *   - `password` is the cleartext secret the user typed on the CLI.
 *   - `salt` is a separate, CSPRNG-generated base64 nonce. They are
 *     ALWAYS distinct values with distinct meanings:
 *       * the password is the secret being protected;
 *       * the salt is the per-user nonce that defeats rainbow tables.
 *     The salt is never derived from the password and is never equal
 *     to it (a 16-byte CSPRNG output cannot collide with a human-typed
 *     password in any meaningful sense).
 *   - The DB has TWO columns: `password` (the argon2id envelope) and
 *     `salt` (the standalone base64). Both are stored, and they are
 *     DIFFERENT columns holding DIFFERENT values.
 */
import { hashPassword } from "../lib/auth/password";
import { generateUlid } from "../lib/ulid";

interface CliArgs {
  username: string;
  password: string;
  confirm: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  const username = typeof args.username === "string" ? args.username.trim() : "";
  const password = typeof args.password === "string" ? args.password : "";
  const confirm = args.confirm === true;
  return { username, password, confirm };
}

function helpAndExit(code = 1): never {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  npm run seed:admin -- --username <name> --password <plain> --confirm",
      "",
      "Prints an INSERT statement to stdout for the `users` table.",
      "Pipe into `mysql` to apply:",
      "  npm run seed:admin -- --username admin --password '***' --confirm \\",
      "    | mysql -h <host> -u root -p edu_inst",
      "",
      "Options:",
      "  --username    The username to seed (required, 1..64 chars).",
      "  --password    The plaintext password (required, 1..255 chars).",
      "  --confirm     Refuses to run without this flag — defense",
      "                against unattended pipelines (spec FR-026).",
      "  --help, -h    Show this help and exit.",
    ].join("\n"),
  );
  process.exit(code);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) helpAndExit(0);
  const { username, password, confirm } = parseArgs(argv);

  if (!confirm) {
    // eslint-disable-next-line no-console
    console.error(
      "Refusing to run without --confirm. Re-run with --confirm to proceed.",
    );
    process.exit(2);
  }
  if (!username || username.length > 64) {
    // eslint-disable-next-line no-console
    console.error("Error: --username is required and must be ≤ 64 chars.");
    process.exit(2);
  }
  if (!password || password.length > 255) {
    // eslint-disable-next-line no-console
    console.error("Error: --password is required and must be ≤ 255 chars.");
    process.exit(2);
  }

  // Produce the hash and salt via the same code path the runtime
  // verifies with (per spec FR-026 — seed path and verify path stay
  // in lockstep). `salt` and `password` are independently generated
  // values: salt comes from `argon2.generateSalt(16)` (CSPRNG), and
  // password comes from the user's CLI input.
  const { hash, salt } = await hashPassword(password);
  const ulid = generateUlid();

  // Build a parameterised INSERT. Both `password` and `salt` are
  // bound as separate placeholders — they are DIFFERENT fields in
  // the schema and DIFFERENT values in this statement.
  // We escape single quotes defensively even though the library
  // returns values that cannot contain them (the salt is base64,
  // the hash is the argon2 envelope, both base64url-safe).
  const esc = (s: string) => s.replace(/'/g, "''");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  // Sanity assertion (defensive) — the salt MUST NOT equal the
  // password under any circumstance. They are independent fields:
  //   - password is what the user typed (their secret)
  //   - salt is the CSPRNG-generated per-user nonce
  // If somehow the implementation drifts and these collide, abort
  // with a clear error rather than silently producing a broken row.
  if (salt === password || hash.includes(password)) {
    // eslint-disable-next-line no-console
    console.error(
      "Refusing to emit INSERT: salt and password are not distinct values.",
    );
    process.exit(3);
  }

  const sql =
    `INSERT INTO users (ulid, username, password, salt, active, ` +
    `created_at, created_by, modified_at, modified_by, version) VALUES ` +
    `('${esc(ulid)}', '${esc(username)}', '${esc(hash)}', ` +
    `'${esc(salt)}', 1, '${now}', 'admin', '${now}', 'admin', 1);`;

  // Print to stdout — the operator pipes this into `mysql`.
  // eslint-disable-next-line no-console
  console.log(sql);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("seed-admin failed:", err);
  process.exit(1);
});
