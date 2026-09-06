"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Account = { id: string; display_name: string; handle: string; status: string };
type PostItem = { id: string; kind: 'parent' | 'reply'; text: string; status: string; products: { name: string; item_url: string | null; affiliate_url: string | null; price: number } | null };
type PostSet = { id: string; account_id: string; status: string; approval_status: 'pending' | 'approved' | 'rejected'; content_payload: Record<string, unknown>; created_at: string; post_set_posts: PostItem[] };

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
      const created = { id: data.post_set_id, account_id: accountId, status: 'queued', approval_status: 'pending', content_payload: { source: 'manual_dashboard' }, created_at: new Date().toISOString(), post_set_posts: [] } as PostSet;
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

  async function updateSet(action: 'approve_and_publish' | 'publish') {
    if (!selectedId) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    if (action === 'approve_and_publish') {
      const approval = await supabase.functions.invoke('post-set-approve', { body: { post_set_id: selectedId } });
      if (approval.error || !approval.data?.ok) {
        setMessage(approval.data?.message || '投稿を承認できませんでした。');
        setBusy(false);
        return;
      }
      setSets((current) => current.map((postSet) => postSet.id === selectedId ? { ...postSet, approval_status: 'approved' } : postSet));
    }
    const published = await supabase.functions.invoke('threads-publish', { body: { post_set_id: selectedId } });
    if (published.error || !published.data?.ok) {
      setMessage(published.data?.message || '承認しましたが投稿できませんでした。本番投稿の安全設定を確認してください。');
    } else {
      setSets((current) => current.map((postSet) => postSet.id === selectedId ? { ...postSet, approval_status: 'approved', status: published.data.status || postSet.status } : postSet));
      setMessage('承認した内容をThreadsへ投稿しました。');
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
        {sets.length === 0 ? <div className='empty-state'><strong>作成済みの投稿はありません</strong><p>予約時刻になると半自動の投稿候補がここへ追加されます。</p></div> : <div className='stack'>{sets.map((postSet) => <div className={selectedId === postSet.id ? 'post-set-row selected' : 'post-set-row'} key={postSet.id}><button className='post-set-select' onClick={() => setSelectedId(postSet.id)} type='button'><span>{new Date(postSet.created_at).toLocaleString('ja-JP')}</span><span className='status-badge neutral'>{postStatus(postSet.status)}</span><span className={`status-badge ${postSet.approval_status === 'approved' ? 'success' : postSet.approval_status === 'rejected' ? 'danger' : 'warning'}`}>{approvalStatus(postSet.approval_status)}</span></button>{selectedId === postSet.id ? <div className='post-review'><div className='muted'>{postSet.content_payload?.source === 'account_genre_automation' ? 'ジャンルから自動作成' : '手動作成'}</div>{postSet.post_set_posts.length > 0 ? postSet.post_set_posts.sort((a, b) => a.kind === 'parent' ? -1 : b.kind === 'parent' ? 1 : 0).map((item) => <div className='post-preview' key={item.id}><strong>{item.kind === 'parent' ? '投稿本文' : '返信'}</strong><p>{item.text}</p>{item.products ? <small className='muted'>商品：{item.products.name}（{Math.round(item.products.price).toLocaleString('ja-JP')}円）</small> : null}</div>) : <p className='muted'>作成直後の手動投稿です。再読み込みすると本文を確認できます。</p>}<div className='form-row'><span />{postSet.approval_status === 'pending' ? <button className='button' disabled={busy} onClick={() => updateSet('approve_and_publish')} type='button'>承認して投稿</button> : <button className='button' disabled={busy || postSet.status === 'succeeded'} onClick={() => updateSet('publish')} type='button'>投稿・再試行</button>}</div></div> : null}</div>)}</div>}
      </section>
    </div>
  );
}

function approvalStatus(status: PostSet["approval_status"]) { return { pending: "承認待ち", approved: "承認済み", rejected: "却下" }[status]; }
function postStatus(status: string) { return { queued: '承認待ち', dry_run: 'テスト生成済み', succeeded: '公開済み', published: '公開済み', partial_failure: '一部失敗', failed: '失敗', blocked: '停止中', dead_letter: '要確認' }[status] || status; }
