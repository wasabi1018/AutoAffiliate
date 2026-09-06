"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Account = { id: string; display_name: string; handle: string; status: string };
type PostSet = { id: string; account_id: string; status: string; approval_status: "pending" | "approved" | "rejected"; created_at: string };

export function PublishingPanel({ accounts, initialSets }: { accounts: Account[]; initialSets: PostSet[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [parentText, setParentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [strategy, setStrategy] = useState("");
  const [hook, setHook] = useState("");
  const [sets, setSets] = useState(initialSets);
  const [selectedId, setSelectedId] = useState(initialSets[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createPostSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("post-set-create", { body: { account_id: accountId, parent_text: parentText, reply_text: replyText || undefined, strategy: strategy || undefined, hook: hook || undefined } });
    if (error || !data?.ok) {
      setMessage(data?.message || "投稿を作成できませんでした。入力内容を確認してください。");
    } else {
      const created = { id: data.post_set_id, account_id: accountId, status: "queued", approval_status: "pending", created_at: new Date().toISOString() } as PostSet;
      setSets([created, ...sets]);
      setSelectedId(created.id);
      setParentText("");
      setReplyText("");
      setStrategy("");
      setHook("");
      setMessage("投稿を作成しました。内容を確認して承認してください。");
    }
    setBusy(false);
  }

  async function updateSet(action: "approve" | "publish") {
    if (!selectedId) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const functionName = action === "approve" ? "post-set-approve" : "threads-publish";
    const { data, error } = await supabase.functions.invoke(functionName, { body: { post_set_id: selectedId } });
    if (error || !data?.ok) {
      setMessage(data?.message || (action === "approve" ? "投稿を承認できませんでした。" : "投稿を公開できませんでした。運用設定を確認してください。"));
    } else {
      setSets(sets.map((postSet) => postSet.id === selectedId ? { ...postSet, approval_status: action === "approve" ? "approved" : postSet.approval_status, status: data.status || postSet.status } : postSet));
      setMessage(action === "approve" ? "投稿を承認しました。公開前にもう一度内容を確認してください。" : "投稿を公開しました。");
    }
    setBusy(false);
  }

  return (
    <div className="publishing-stack">
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">新規作成</div><h2>投稿文を作る</h2></div></div>
        <form className="settings-form" onSubmit={createPostSet}>
          <div className="field"><label htmlFor="publishing-account">投稿先アカウント</label><select id="publishing-account" required value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">アカウントを選択</option>{accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.display_name} (@{account.handle})</option>)}</select></div>
          <div className="field"><label htmlFor="parent-text">投稿本文</label><textarea id="parent-text" maxLength={500} required rows={5} value={parentText} onChange={(event) => setParentText(event.target.value)} placeholder="投稿する内容を入力してください" /><span className="field-help">{parentText.length} / 500文字</span></div>
          <div className="form-grid two"><div className="field"><label htmlFor="publishing-strategy">選定戦略（任意）</label><select id="publishing-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)}><option value="">指定なし</option><option value="RANKING">ランキング</option><option value="SALE">セール</option><option value="TRENDING">トレンド</option></select></div><div className="field"><label htmlFor="publishing-hook">訴求ラベル（任意）</label><input id="publishing-hook" maxLength={160} value={hook} onChange={(event) => setHook(event.target.value)} placeholder="例：今週のおすすめ" /></div></div><div className="field"><label htmlFor="reply-text">返信文（任意）</label><textarea id="reply-text" maxLength={500} rows={3} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="商品URLなど、続けて投稿する内容を入力してください" /></div>
          <button className="button" disabled={busy || !accountId} type="submit">{busy ? "作成中…" : "確認待ちとして保存"}</button>
        </form>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">確認と公開</div><h2>作成済みの投稿</h2></div><span className="muted">内容を承認してから公開します</span></div>
        {sets.length === 0 ? <div className="empty-state"><strong>作成済みの投稿はありません</strong><p>上のフォームから最初の投稿を作成してください。</p></div> : <div className="stack">{sets.map((postSet) => <div className={selectedId === postSet.id ? "post-set-row selected" : "post-set-row"} key={postSet.id}><button className="post-set-select" onClick={() => setSelectedId(postSet.id)} type="button"><span>{new Date(postSet.created_at).toLocaleString("ja-JP")}</span><span className="status-badge neutral">{postStatus(postSet.status)}</span><span className={`status-badge ${postSet.approval_status === "approved" ? "success" : postSet.approval_status === "rejected" ? "danger" : "warning"}`}>{approvalStatus(postSet.approval_status)}</span></button>{selectedId === postSet.id ? <div className="form-row"><button className="button secondary" disabled={busy || postSet.approval_status !== "pending"} onClick={() => updateSet("approve")} type="button">内容を承認</button><button className="button" disabled={busy || postSet.approval_status !== "approved"} onClick={() => updateSet("publish")} type="button">承認済み投稿を公開</button></div> : null}</div>)}</div>}
      </section>
    </div>
  );
}

function approvalStatus(status: PostSet["approval_status"]) { return { pending: "承認待ち", approved: "承認済み", rejected: "却下" }[status]; }
function postStatus(status: string) { return { queued: "作成済み", published: "公開済み", failed: "失敗", blocked: "停止中" }[status] || status; }
