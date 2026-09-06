"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const nextPath = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "ログインに失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="container main">
      <section className="card auth-card">
        <div className="eyebrow">Administrator access</div>
        <h2>管理者ログイン</h2>
        <p className="muted">公開サインアップは無効です。管理者アカウントはSupabase側で作成します。</p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="email">メールアドレス</label><input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label htmlFor="password">パスワード</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? "確認中…" : "ログイン"}</button>
        </form>
      </section>
    </main>
  );
}
