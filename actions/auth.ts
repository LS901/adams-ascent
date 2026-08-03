"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "../lib/auth/session";

export type LoginState = {
  error?: string;
};

function getAdminUsername(): string {
  const username = process.env.ADMIN_USERNAME;
  if (!username) {
    throw new Error("ADMIN_USERNAME is not set");
  }
  return username;
}

function getAdminPasswordHash(): string {
  // Stored base64-encoded: bcrypt hashes are full of `$` characters, and
  // Next.js's env loader (dotenv-expand) treats $word sequences as variable
  // references and silently blanks them out — in any process.env value it
  // sees, not just ones sourced from a .env file. Base64 has no `$`, so it
  // passes through untouched regardless of how the env var was set.
  const encoded = process.env.ADMIN_PASSWORD_HASH_BASE64;
  if (!encoded) {
    throw new Error("ADMIN_PASSWORD_HASH_BASE64 is not set");
  }
  return Buffer.from(encoded, "base64").toString("utf-8");
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get("username");
  const password = formData.get("password");

  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return { error: "Enter a username and password." };
  }

  const usernameMatches = username === getAdminUsername();
  const passwordMatches = await bcrypt.compare(password, getAdminPasswordHash());

  if (!usernameMatches || !passwordMatches) {
    return { error: "That username or password isn't right." };
  }

  await createSession();
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
