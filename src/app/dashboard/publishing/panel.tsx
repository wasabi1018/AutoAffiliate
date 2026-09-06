"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Account = { id: string; display_name: string; handle: string; status: string };
type PostSet = { id: string; account_id: string; status: string; approval_status: "pending" | "approved" | "rejected"; created_at: string };

export function PublishingPanel({ accounts, initialSets }: { accounts: Account[]; initialSets: PostSet[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [parentText, setParentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sets, setSets] = useState(initialSets);
  const [selectedId, setSelectedId] = useState(initialSets[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createPostSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("post-set-create", { body: { account_id: accountId, parent_text: parentText, reply_text: replyText || undefined } });
    if (error || !data?.ok) {
      setMessage(data?.message || "Could not create the post set.");
    } else {
      const created = { id: data.post_set_id, account_id: accountId, status: "queued", approval_status: "pending", created_at: new Date().toISOString() } as PostSet;
      setSets([created, ...sets]);
      setSelectedId(created.id);
      setParentText("");
      setReplyText("");
      setMessage("Post set created and is waiting for approval.");
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
      setMessage(data?.message || (action === "approve" ? "Approval failed." : "Publishing was blocked or failed."));
    } else {
      setSets(sets.map((postSet) => postSet.id === selectedId ? { ...postSet, approval_status: action === "approve" ? "approved" : postSet.approval_status, status: data.status || postSet.status } : postSet));
      setMessage(action === "approve" ? "Post set approved. Live publishing still requires all safety gates." : "Post set published.");
    }
    setBusy(false);
  }

  return (
    <div className="publishing-stack">
      <section className="card">
        <form className="settings-form" onSubmit={createPostSet}>
          <div className="field"><label htmlFor="publishing-account">Threads account</label><select id="publishing-account" required value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Select an account</option>{accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.display_name} (@{account.handle})</option>)}</select></div>
          <div className="field"><label htmlFor="parent-text">Parent post</label><textarea id="parent-text" maxLength={500} required rows={4} value={parentText} onChange={(event) => setParentText(event.target.value)} placeholder="Write the parent post..." /></div>
          <div className="field"><label htmlFor="reply-text">Reply (optional)</label><textarea id="reply-text" maxLength={500} rows={3} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Write a reply that will reference the published parent..." /></div>
          <button className="button" disabled={busy || !accountId} type="submit">{busy ? "Working..." : "Create pending post set"}</button>
        </form>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">Review gate</div><h2>Post set approval</h2></div><span className="muted">Live posting is off by default.</span></div>
        {sets.length === 0 ? <p className="muted">No post sets yet.</p> : <div className="stack">{sets.map((postSet) => <div className={selectedId === postSet.id ? "post-set-row selected" : "post-set-row"} key={postSet.id}><button className="post-set-select" onClick={() => setSelectedId(postSet.id)} type="button"><code>{postSet.id.slice(0, 8)}...</code><span>{postSet.status}</span><span>{postSet.approval_status}</span></button>{selectedId === postSet.id ? <div className="form-row"><button className="button secondary" disabled={busy || postSet.approval_status !== "pending"} onClick={() => updateSet("approve")} type="button">Approve</button><button className="button" disabled={busy || postSet.approval_status !== "approved"} onClick={() => updateSet("publish")} type="button">Publish approved set</button></div> : null}</div>)}</div>}
      </section>
    </div>
  );
}
