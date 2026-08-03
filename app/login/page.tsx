import { redirect } from "next/navigation";
import { isAuthenticated } from "../../lib/auth/session";
import { LoginForm } from "../../components/LoginForm";

export default async function LoginPage() {
  if (await isAuthenticated()) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-4xl font-bold text-cream">Adam&apos;s Ascent</h1>
        <p className="max-w-xs text-sm text-cream/70">
          Your mountain, at your pace.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
