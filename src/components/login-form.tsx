"use client";

import { FormEvent, useState } from "react";
import { Globe } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Не удалось войти");
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
      setPending(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-[var(--accent)] text-white shadow-[0_8px_24px_rgba(0,113,227,0.28)]">
            <Globe size={22} />
          </span>
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text)]">Vitrina Monitor</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">Войдите, чтобы открыть панель</p>
        </div>

        <form onSubmit={(event) => void onSubmit(event)} className="ui-card ui-card-pad space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Логин">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Пароль">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" className="mt-2 w-full" disabled={pending}>
            {pending ? "Входим…" : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  );
}
