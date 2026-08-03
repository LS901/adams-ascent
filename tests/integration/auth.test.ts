import { describe, expect, it } from "vitest";
import { login, logout } from "../../actions/auth";
import { isAuthenticated } from "../../lib/auth/session";
import { RedirectSignal } from "../mocks/nextNavigation";

const VALID_USERNAME = "testadmin";
const VALID_PASSWORD = "test-password-123";

function credentials(username: string, password: string): FormData {
  const data = new FormData();
  data.set("username", username);
  data.set("password", password);
  return data;
}

describe("login", () => {
  it("creates a session and redirects home on correct credentials", async () => {
    await expect(login({}, credentials(VALID_USERNAME, VALID_PASSWORD))).rejects.toThrow(
      RedirectSignal,
    );

    expect(await isAuthenticated()).toBe(true);
  });

  it("rejects an incorrect password without creating a session", async () => {
    const result = await login({}, credentials(VALID_USERNAME, "wrong-password"));

    expect(result.error).toBeTruthy();
    expect(await isAuthenticated()).toBe(false);
  });

  it("rejects an incorrect username without creating a session", async () => {
    const result = await login({}, credentials("someone-else", VALID_PASSWORD));

    expect(result.error).toBeTruthy();
    expect(await isAuthenticated()).toBe(false);
  });

  it("rejects an empty submission", async () => {
    const result = await login({}, credentials("", ""));

    expect(result.error).toBeTruthy();
    expect(await isAuthenticated()).toBe(false);
  });
});

describe("logout", () => {
  it("clears an existing session", async () => {
    await expect(login({}, credentials(VALID_USERNAME, VALID_PASSWORD))).rejects.toThrow(
      RedirectSignal,
    );
    expect(await isAuthenticated()).toBe(true);

    await expect(logout()).rejects.toThrow(RedirectSignal);
    expect(await isAuthenticated()).toBe(false);
  });
});
