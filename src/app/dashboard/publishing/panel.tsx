"use client";

import { FormEvent, useRef, useState } from "react";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

type Account = { id: string; display_name: string; handle: string; status: string };
type PostItem = {
  id: string;
  kind: "parent" | "reply";
  text: string;
  status: string;
  products: { name: string; item_url: string | null; affiliate_url: string | null; price: number } | null;
};
type PostSet = {
  id: string;
  account_id: string;
  status: string;
  approval_status: "pending" | "approved" | "rejected";
  content_payload: Record<string, unknown>;
  created_at: string;
  post_set_posts: PostItem[];
};

export function PublishingPanel({ accounts, initialSets }: { accounts: Account[]; initialSets: PostSet[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [parentText, setParentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [strategy, setStrategy] = useState("");
  const [hook, setHook] = useState("");
  const [sets, setSets] = useState(initialSets);
  const [selectedId, setSelectedId] = useState(initialSets[0]?.id || "");
  const [editingId, setEditingId] = useState("");
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const publishInFlight = useRef(false);
  const [message, setMessage] = useState("");

  async function createPostSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("post-set-create", {
      body: {
        account_id: accountId,
        parent_text: parentText,
        reply_text: replyText || undefined,
        strategy: strategy || undefined,
        hook: hook || undefined,
      },
    });
    if (error || !data?.ok) {
      setMessage(data?.message || await functionErrorMessage(error, "投稿を作成できませんでした。入力内容を確認してください。"));
    } else {
      const responsePosts = Array.isArray(data.posts) ? data.posts as Array<{ id: string; kind: "parent" | "reply"; text: string; status: string }> : [];
      const created = {
        id: data.post_set_id,
        account_id: accountId,
        status: "queued",
        approval_status: "pending",
        content_payload: { source: "manual_dashboard" },
        created_at: new Date().toISOString(),
        post_set_posts: responsePosts.map((post) => ({ ...post, products: null })),
      } as PostSet;
      setSets((current) => [created, ...current]);
      setSelectedId(created.id);
      setParentText("");
      setReplyText("");
      setStrategy("");
      setHook("");
      setMessage("投稿を作成しました。内容を確認して承認してください。");
    }
    setBusy(false);
  }

  async function updateSet(action: "approve_and_publish" | "publish" | "repost") {
    if (!selectedId || publishInFlight.current) return;
    if (action === "repost" && !window.confirm("この操作はThreads上の既存投稿を削除しません。同じ内容の親投稿と返信がもう1組追加されます。新規として全件再投稿しますか？")) return;

    publishInFlight.current = true;
    setBusy(true);
    setMessage("");
    const supabase = createClient();

    try {
      if (action === "approve_and_publish") {
        const approval = await supabase.functions.invoke("post-set-approve", { body: { post_set_id: selectedId } });
        if (approval.error || !approval.data?.ok) {
          setMessage(approval.data?.message || await functionErrorMessage(approval.error, "投稿を承認できませんでした。"));
          return;
        }
        setSets((current) => current.map((postSet) => postSet.id === selectedId ? { ...postSet, approval_status: "approved" } : postSet));
      }

      const published = await supabase.functions.invoke("threads-publish", {
        body: { post_set_id: selectedId, force_repost: action === "repost" },
      });
      const itemStatuses = responseItemStatuses(published.data);
      if (itemStatuses.size > 0) {
        setSets((current) => current.map((postSet) => postSet.id === selectedId
          ? {
            ...postSet,
            status: typeof published.data?.status === "string" ? published.data.status : postSet.status,
            post_set_posts: postSet.post_set_posts.map((post) => ({
              ...post,
              status: itemStatuses.get(post.id) || post.status,
            })),
          }
          : postSet));
      }

      if (published.error || !published.data?.ok) {
        setMessage(published.data?.message || await functionErrorMessage(published.error, "承認しましたが投稿できませんでした。本番投稿の安全設定を確認してください。"));
      } else {
        setSets((current) => current.map((postSet) => postSet.id === selectedId
          ? {
            ...postSet,
            approval_status: "approved",
            status: published.data.status || postSet.status,
            post_set_posts: postSet.post_set_posts.map((post) => ({ ...post, status: "published" })),
          }
          : postSet));
        setMessage(action === "repost" ? "承認済みの内容をThreadsへ新規投稿しました。" : "承認した内容をThreadsへ投稿しました。");
      }
    } catch (error) {
      setMessage(await functionErrorMessage(error, "投稿処理中にエラーが発生しました。画面を再読み込みして状態を確認してください。"));
    } finally {
      publishInFlight.current = false;
      setBusy(false);
    }
  }

  function selectPostSet(postSetId: string) {
    setSelectedId(postSetId);
    setEditingId("");
    setDraftTexts({});
  }

  function startEditing(postSet: PostSet) {
    setEditingId(postSet.id);
    setDraftTexts(Object.fromEntries(postSet.post_set_posts.map((post) => [post.id, post.text])));
    setMessage("");
  }

  function cancelEditing() {
    setEditingId("");
    setDraftTexts({});
  }

  async function saveEdits(postSet: PostSet) {
    const posts = orderedPosts(postSet);
    const edits = posts.map((post) => ({ id: post.id, text: (draftTexts[post.id] || "").trim() }));
    if (edits.some((post) => !post.text)) {
      setMessage("投稿本文と返信は空欄にできません。");
      return;
    }

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const result = await supabase.functions.invoke("post-set-review", {
      body: { action: "edit", post_set_id: postSet.id, posts: edits },
    });
    if (result.error || !result.data?.ok) {
      setMessage(result.data?.message || await functionErrorMessage(result.error, "投稿を編集できませんでした。"));
    } else {
      const textById = new Map(edits.map((post) => [post.id, post.text]));
      setSets((current) => current.map((currentSet) => currentSet.id === postSet.id ? {
        ...currentSet,
        status: "queued",
        approval_status: "pending",
        post_set_posts: currentSet.post_set_posts.map((post) => ({
          ...post,
          text: textById.get(post.id) || post.text,
          status: "pending",
        })),
      } : currentSet));
      cancelEditing();
      setMessage("投稿内容を保存し、承認待ちへ戻しました。");
    }
    setBusy(false);
  }

  async function rejectPostSet(postSet: PostSet) {
    if (!window.confirm("この投稿を却下しますか？ 後から編集して承認待ちへ戻せます。")) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const result = await supabase.functions.invoke("post-set-review", {
      body: { action: "reject", post_set_id: postSet.id },
    });
    if (result.error || !result.data?.ok) {
      setMessage(result.data?.message || await functionErrorMessage(result.error, "投稿を却下できませんでした。"));
    } else {
      setSets((current) => current.map((currentSet) => currentSet.id === postSet.id
        ? { ...currentSet, approval_status: "rejected" }
        : currentSet));
      cancelEditing();
      setMessage("投稿を却下しました。");
    }
    setBusy(false);
  }

  return (
    <div className="publishing-stack">
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">新規作成</div><h2>投稿文を作る</h2></div></div>
        <form className="settings-form" onSubmit={createPostSet}>
          <div className="field">
            <label htmlFor="publishing-account">投稿先アカウント</label>
            <select id="publishing-account" required value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">アカウントを選択</option>
              {accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.display_name} (@{account.handle})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="parent-text">投稿本文</label>
            <textarea id="parent-text" maxLength={500} required rows={5} value={parentText} onChange={(event) => setParentText(event.target.value)} placeholder="投稿する内容を入力してください" />
            <span className="field-help">{parentText.length} / 500文字</span>
          </div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="publishing-strategy">選定戦略（任意）</label>
              <select id="publishing-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
                <option value="">指定なし</option><option value="RANKING">ランキング</option><option value="SALE">セール</option><option value="TRENDING">トレンド</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="publishing-hook">訴求ラベル（任意）</label>
              <input id="publishing-hook" maxLength={160} value={hook} onChange={(event) => setHook(event.target.value)} placeholder="例：今週のおすすめ" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="reply-text">返信文（任意）</label>
            <textarea id="reply-text" maxLength={500} rows={3} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="商品URLなど、続けて投稿する内容を入力してください" />
          </div>
          <button className="button" disabled={busy || !accountId} type="submit">{busy ? "作成中…" : "確認待ちとして保存"}</button>
        </form>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>

      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">確認と公開</div><h2>作成済みの投稿</h2></div><span className="muted">内容を編集・確認してから公開します</span></div>
        {sets.length === 0 ? (
          <div className="empty-state"><strong>作成済みの投稿はありません</strong><p>予約時刻になると半自動の投稿候補がここへ追加されます。</p></div>
        ) : (
          <div className="stack">
            {sets.map((postSet) => {
              const selected = selectedId === postSet.id;
              const editing = editingId === postSet.id;
              const reviewable = canReview(postSet);
              const approved = postSet.approval_status === "approved";
              const hasPublished = postSet.post_set_posts.some((post) => post.status === "published");
              const hasIncomplete = postSet.post_set_posts.some((post) => post.status !== "published");
              return (
                <div className={selected ? "post-set-row selected" : "post-set-row"} key={postSet.id}>
                  <button className="post-set-select" onClick={() => selectPostSet(postSet.id)} type="button">
                    <span>{new Date(postSet.created_at).toLocaleString("ja-JP")}</span>
                    <span className="status-badge neutral">{postStatus(postSet.status)}</span>
                    <span className={`status-badge ${postSet.approval_status === "approved" ? "success" : postSet.approval_status === "rejected" ? "danger" : "warning"}`}>{approvalStatus(postSet.approval_status)}</span>
                  </button>

                  {selected ? (
                    <div className="post-review">
                      <div className="muted">{postSet.content_payload?.source === "account_genre_automation" ? "ジャンルから自動作成" : "手動作成"}</div>
                      {postSet.post_set_posts.length === 0 ? (
                        <p className="muted">投稿内容を読み込めませんでした。再読み込みしてください。</p>
                      ) : editing ? (
                        <div className="settings-form">
                          {orderedPosts(postSet).map((item) => (
                            <div className="field" key={item.id}>
                              <label htmlFor={`edit-post-${item.id}`}>{item.kind === "parent" ? "投稿本文" : "返信"}</label>
                              <textarea
                                id={`edit-post-${item.id}`}
                                maxLength={500}
                                required
                                rows={item.kind === "parent" ? 7 : 6}
                                value={draftTexts[item.id] || ""}
                                onChange={(event) => setDraftTexts((current) => ({ ...current, [item.id]: event.target.value }))}
                              />
                              <span className="field-help">{(draftTexts[item.id] || "").length} / 500文字</span>
                            </div>
                          ))}
                          <div className="review-actions">
                            <button className="button secondary" disabled={busy} onClick={cancelEditing} type="button">キャンセル</button>
                            <button className="button" disabled={busy} onClick={() => saveEdits(postSet)} type="button">{busy ? "保存中…" : "編集内容を保存"}</button>
                          </div>
                        </div>
                      ) : (
                        orderedPosts(postSet).map((item) => (
                          <div className="post-preview" key={item.id}>
                            <strong>{item.kind === "parent" ? "投稿本文" : "返信"}</strong>
                            <p>{item.text}</p>
                            {item.products ? <small className="muted">商品：{item.products.name}（{Math.round(item.products.price).toLocaleString("ja-JP")}円）</small> : null}
                          </div>
                        ))
                      )}

                      {!editing && (reviewable || approved) ? (
                        <div className="review-actions">
                          {reviewable ? <button className="button secondary" disabled={busy} onClick={() => startEditing(postSet)} type="button">{postSet.approval_status === "rejected" ? "編集して再確認" : "編集"}</button> : null}
                          {reviewable && postSet.approval_status !== "rejected" ? <button className="button secondary" disabled={busy} onClick={() => rejectPostSet(postSet)} type="button">却下</button> : null}
                          {postSet.approval_status === "pending" ? <button className="button" disabled={busy} onClick={() => updateSet("approve_and_publish")} type="button">承認して投稿</button> : null}
                          {approved && hasIncomplete ? <button className="button" disabled={busy} onClick={() => updateSet("publish")} type="button">{hasPublished ? "失敗分を再試行" : "投稿・再試行"}</button> : null}
                          {approved && hasPublished ? <button className="button secondary" disabled={busy} onClick={() => updateSet("repost")} type="button">新規として全件再投稿</button> : null}
                        </div>
                      ) : null}
                      {!editing && !reviewable && !approved ? <p className="muted">公開処理を開始した投稿は編集・却下できません。</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function responseItemStatuses(data: unknown) {
  const statuses = new Map<string, string>();
  if (!data || typeof data !== "object" || !Array.isArray((data as { items?: unknown }).items)) return statuses;

  for (const item of (data as { items: unknown[] }).items) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const status = (item as { status?: unknown }).status;
    if (typeof id === "string" && typeof status === "string") statuses.set(id, status);
  }
  return statuses;
}

function orderedPosts(postSet: PostSet) {
  return [...postSet.post_set_posts].sort((left, right) => left.kind === "parent" ? -1 : right.kind === "parent" ? 1 : 0);
}

function canReview(postSet: PostSet) {
  return postSet.status !== "succeeded"
    && postSet.post_set_posts.length > 0
    && postSet.post_set_posts.every((post) => post.status !== "published" && post.status !== "container_created");
}

function approvalStatus(status: PostSet["approval_status"]) {
  return { pending: "承認待ち", approved: "承認済み", rejected: "却下済み" }[status];
}

function postStatus(status: string) {
  return { queued: "承認待ち", dry_run: "テスト生成済み", succeeded: "公開済み", published: "公開済み", partial_failure: "一部失敗", failed: "失敗", blocked: "停止中", dead_letter: "要確認" }[status] || status;
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json() as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim()) return body.message;
    } catch {
      return fallback;
    }
  }
  if (error instanceof FunctionsRelayError) return "投稿処理サービスでエラーが発生しました。しばらくしてから再試行してください。";
  if (error instanceof FunctionsFetchError) return "投稿処理サービスに接続できませんでした。通信状態を確認して再試行してください。";
  return fallback;
}
