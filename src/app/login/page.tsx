import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Coastal IT Dashboard" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface-1 p-8">
        <h1 className="text-xl font-semibold text-ink-1">Coastal IT Dashboard</h1>
        <p className="mb-6 mt-1 text-sm text-ink-2">Enter the team password to continue.</p>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
