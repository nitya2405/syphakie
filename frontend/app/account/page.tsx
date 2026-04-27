"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import {
  fetchMe, updateProfile, UserProfile,
  fetchMyOrgs, fetchOrgDetail, switchActiveOrg, createOrg, updateOrg, deleteOrg,
  addCreditsToOrg, leaveOrg, transferOwnership, updateMemberRole, removeMember,
  inviteMember, allotOrgCredits,
  OrgListItem, OrgMember, OrgDetail,
  getTelegramStatus, getTelegramToken, disconnectTelegram, TelegramStatus,
  ApiError,
} from "@/lib/api";

// ── Org helpers ───────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:  "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  admin:  "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  member: "bg-[#222] text-[#aaa] border border-[#333]",
  viewer: "bg-[#1a1a1a] text-[#555] border border-[#2a2a2a]",
};

const ROLE_ORDER = ["owner", "admin", "member", "viewer"];
const CAN_MANAGE = ["owner", "admin"];

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[role] ?? "bg-[#222] text-[#888]"}`}>
      {role}
    </span>
  );
}

function Avatar({ name, email, size = "md" }: { name: string | null; email: string; size?: "sm" | "md" }) {
  const initial = (name ?? email)[0].toUpperCase();
  const sz = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center font-semibold text-white shrink-0`}>
      {initial}
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function OrgSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-[#555]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel, danger = true }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <p className="text-sm text-muted">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-border-2 text-muted rounded-lg hover:border-border hover:text-primary transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg text-white transition-colors ${danger ? "bg-red-500 hover:bg-red-600" : "bg-violet-600 hover:bg-violet-500"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersPanel({ members, myRole, orgId, onRefresh }: {
  members: OrgMember[]; myRole: string; orgId: string; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  const roleCounts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1; return acc;
  }, {});

  const filtered = members
    .filter(m => roleFilter === "all" || m.role === roleFilter)
    .filter(m => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    });

  const isOwner = myRole === "owner";
  const canManage = CAN_MANAGE.includes(myRole);

  async function handleRoleChange(userId: string, newRole: string) {
    try { await updateMemberRole(userId, newRole, orgId); setEditingRole(null); onRefresh(); } catch {}
  }
  async function handleRemove(userId: string) {
    try { await removeMember(userId, orgId); setRemoveConfirm(null); onRefresh(); } catch {}
  }

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <p className="text-sm font-semibold text-primary flex-1">Members <span className="font-normal text-muted ml-1">{members.length}</span></p>
        <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="text-xs bg-surface-2 border border-border-2 text-primary rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:border-violet-500 placeholder-faint" />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="text-xs bg-surface-2 border border-border-2 text-muted rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="all">All roles</option>
          {ROLE_ORDER.map(r => <option key={r} value={r}>{r} {roleCounts[r] ? `(${roleCounts[r]})` : ""}</option>)}
        </select>
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-muted hover:text-primary border border-border-2 rounded-lg px-2.5 py-1.5 transition-colors">
          {expanded ? "Collapse ↑" : "Expand ↓"}
        </button>
      </div>

      {!expanded && (
        <div className="px-5 py-4 flex flex-wrap gap-2">
          {filtered.slice(0, 10).map(m => (
            <div key={m.user_id} className="flex items-center gap-1.5 bg-surface-2 border border-border-2 rounded-full px-3 py-1.5">
              <Avatar name={m.name} email={m.email} size="sm" />
              <span className="text-xs text-secondary font-medium">{m.name ?? m.email.split("@")[0]}</span>
              <RoleBadge role={m.role} />
            </div>
          ))}
          {filtered.length > 10 && <button onClick={() => setExpanded(true)} className="text-xs text-violet-400 hover:text-violet-300 px-2">+{filtered.length - 10} more</button>}
          {filtered.length === 0 && <p className="text-sm text-muted">No members match.</p>}
        </div>
      )}

      {expanded && (
        <div className="divide-y divide-border-2 max-h-72 overflow-y-auto">
          {filtered.map(m => (
            <div key={m.user_id} className="flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors">
              <Avatar name={m.name} email={m.email} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary truncate">{m.name ?? m.email}</p>
                <p className="text-xs text-muted truncate">{m.email}</p>
              </div>
              <span className="text-xs text-muted tabular-nums shrink-0">{m.credits_balance.toLocaleString()} cr</span>
              {isOwner && m.role !== "owner" ? (
                editingRole === m.user_id ? (
                  <select defaultValue={m.role} autoFocus onBlur={e => handleRoleChange(m.user_id, e.target.value)} onChange={e => handleRoleChange(m.user_id, e.target.value)} className="text-xs bg-surface-2 border border-violet-500 text-primary rounded px-1.5 py-0.5 focus:outline-none">
                    {["admin", "member", "viewer"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <button onClick={() => setEditingRole(m.user_id)} title="Click to change role"><RoleBadge role={m.role} /></button>
                )
              ) : <RoleBadge role={m.role} />}
              {canManage && m.role !== "owner" && (
                <button onClick={() => setRemoveConfirm(m.user_id)} className="text-faint hover:text-red-400 transition-colors ml-1 shrink-0" title="Remove member">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted px-5 py-4">No members match.</p>}
        </div>
      )}

      {removeConfirm && (
        <ConfirmDialog title="Remove member" message="Remove this member from the org? They will lose access." onConfirm={() => handleRemove(removeConfirm)} onCancel={() => setRemoveConfirm(null)} />
      )}
    </div>
  );
}

function AllotCreditsPanel({ members, myRole, orgId, onRefresh }: { members: OrgMember[]; myRole: string; orgId: string; onRefresh: () => void }) {
  const [allotUserId, setAllotUserId] = useState("");
  const [allotAmount, setAllotAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = CAN_MANAGE.includes(myRole);

  async function handle() {
    const n = parseInt(allotAmount, 10);
    if (!allotUserId || isNaN(n) || n <= 0) return;
    setBusy(true); setMsg("");
    try {
      const res = await allotOrgCredits(allotUserId, n, orgId);
      setMsg(`Done — org: ${res.org_balance.toLocaleString()} cr, member: ${res.member_balance.toLocaleString()} cr`);
      setAllotAmount(""); onRefresh();
    } catch (err) { setMsg(err instanceof ApiError ? err.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">Allot Credits to Member</p>
        {!isAdmin && <div className="flex items-center gap-1.5 text-muted text-xs"><LockIcon />Admin only</div>}
      </div>
      {isAdmin ? (
        <div className="p-5 space-y-3">
          <div className="flex gap-2">
            <select value={allotUserId} onChange={e => setAllotUserId(e.target.value)} className="flex-1 bg-surface-2 border border-border-2 text-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
              <option value="">Select member…</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name ?? m.email} ({m.role}) — {m.credits_balance.toLocaleString()} cr</option>)}
            </select>
            <input type="number" min="1" placeholder="Amount" value={allotAmount} onChange={e => setAllotAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} className="w-28 bg-surface-2 border border-border-2 text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-faint" />
            <button onClick={handle} disabled={busy || !allotUserId || !allotAmount} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap">
              {busy ? "…" : "Allot"}
            </button>
          </div>
          {msg && <p className={`text-xs ${msg.startsWith("Done") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
        </div>
      ) : (
        <div className="px-5 py-6 flex flex-col items-center gap-2 text-faint">
          <LockIcon />
          <p className="text-sm text-muted text-center">Only admins and owners can allot credits from the org pool.</p>
        </div>
      )}
    </div>
  );
}

function InvitePanel({ orgId, onRefresh, myRole }: { orgId: string; onRefresh: () => void; myRole: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!CAN_MANAGE.includes(myRole)) return null;

  async function handle() {
    if (!email.trim()) return;
    setBusy(true); setMsg("");
    try { await inviteMember(email.trim(), role, orgId); setEmail(""); setMsg("Invited successfully."); onRefresh(); }
    catch (err) { setMsg(err instanceof ApiError ? err.message : "Failed to invite."); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-border rounded-xl bg-surface p-5 space-y-3">
      <p className="text-sm font-semibold text-primary">Invite Member</p>
      <div className="flex gap-2">
        <input type="email" placeholder="teammate@company.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} className="flex-1 bg-surface-2 border border-border-2 text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-faint" />
        <select value={role} onChange={e => setRole(e.target.value)} className="bg-surface-2 border border-border-2 text-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <button onClick={handle} disabled={busy || !email.trim()} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap">
          {busy ? "…" : "Invite"}
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.includes("success") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
    </div>
  );
}

function AddCreditsPanel({ org, myRole, onRefresh }: { org: OrgListItem; myRole: string; onRefresh: () => void }) {
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!CAN_MANAGE.includes(myRole)) return null;

  async function handle() {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n <= 0) return;
    setBusy(true); setMsg("");
    try {
      const res = await addCreditsToOrg(org.id, n);
      setMsg(`Added. Org: ${res.org_balance.toLocaleString()} cr, your balance: ${res.personal_balance.toLocaleString()} cr`);
      setAmount(""); onRefresh();
    } catch (err) { setMsg(err instanceof ApiError ? err.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-border rounded-xl bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">Add Credits to Org Pool</p>
        <span className="text-xs text-muted">Transfers from your personal balance</span>
      </div>
      <div className="flex gap-2">
        <input type="number" min="1" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} className="flex-1 bg-surface-2 border border-border-2 text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-faint" />
        <button onClick={handle} disabled={busy || !amount} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-40 transition-colors">
          {busy ? "…" : "Add"}
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.startsWith("Added") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
    </div>
  );
}

// ── Team Tab ──────────────────────────────────────────────────────────────────

function TeamTab() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerMsg, setDangerMsg] = useState("");

  const loadOrgs = useCallback(async () => {
    try {
      const data = await fetchMyOrgs();
      setOrgs(data.orgs);
      if (!selectedOrgId && data.orgs.length > 0) {
        const active = data.orgs.find(o => o.is_active) ?? data.orgs[0];
        setSelectedOrgId(active.id);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
    } finally { setLoadingOrgs(false); }
  }, [selectedOrgId, router]);

  const loadDetail = useCallback(async (orgId: string) => {
    setLoadingDetail(true);
    try { setDetail(await fetchOrgDetail(orgId)); }
    catch { setDetail(null); }
    finally { setLoadingDetail(false); }
  }, []);

  useEffect(() => { loadOrgs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedOrgId) loadDetail(selectedOrgId); }, [selectedOrgId, loadDetail]);

  async function selectOrg(orgId: string) {
    setSelectedOrgId(orgId);
    try { const res = await switchActiveOrg(orgId); setOrgs(prev => prev.map(o => ({ ...o, is_active: o.id === orgId }))); void res; }
    catch {}
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const res = await createOrg(newOrgName.trim(), newOrgDesc.trim() || undefined);
      setShowCreate(false); setNewOrgName(""); setNewOrgDesc("");
      await loadOrgs(); setSelectedOrgId(res.org.id);
    } catch {} finally { setCreating(false); }
  }

  async function handleSaveEdit() {
    if (!selectedOrgId) return;
    setSavingEdit(true);
    try { await updateOrg(selectedOrgId, { name: editName, description: editDesc }); setEditingName(false); await loadOrgs(); await loadDetail(selectedOrgId); }
    catch {} finally { setSavingEdit(false); }
  }

  async function handleDeleteOrg() {
    if (!selectedOrgId) return;
    setDangerBusy(true);
    try { await deleteOrg(selectedOrgId); setShowDeleteConfirm(false); setSelectedOrgId(null); setDetail(null); await loadOrgs(); }
    catch (err) { setDangerMsg(err instanceof ApiError ? err.message : "Failed."); }
    finally { setDangerBusy(false); }
  }

  async function handleLeave() {
    if (!selectedOrgId) return;
    setDangerBusy(true);
    try { await leaveOrg(selectedOrgId); setShowLeaveConfirm(false); setSelectedOrgId(null); setDetail(null); await loadOrgs(); }
    catch (err) { setDangerMsg(err instanceof ApiError ? err.message : "Failed."); }
    finally { setDangerBusy(false); }
  }

  async function handleTransfer() {
    if (!selectedOrgId || !transferUserId) return;
    setDangerBusy(true);
    try { await transferOwnership(selectedOrgId, transferUserId); setShowTransferModal(false); await loadDetail(selectedOrgId); await loadOrgs(); }
    catch (err) { setDangerMsg(err instanceof ApiError ? err.message : "Failed."); }
    finally { setDangerBusy(false); }
  }

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) ?? detail?.org ?? null;
  const myRole = selectedOrg?.my_role ?? "";
  const isOwner = myRole === "owner";
  const isAdmin = CAN_MANAGE.includes(myRole);

  if (loadingOrgs) return <div className="flex items-center justify-center py-12 gap-2 text-sm text-[#888]"><OrgSpinner /> Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Organizations</h2>
        <button onClick={() => setShowCreate(s => !s)} className="text-sm px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center gap-1">
          <span className="text-base leading-none">+</span> New Org
        </button>
      </div>

      {showCreate && (
        <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] p-5 space-y-3">
          <p className="text-sm font-semibold text-white">Create Organization</p>
          <input type="text" placeholder="Organization name" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} autoFocus className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-[#444]" />
          <input type="text" placeholder="Description (optional)" value={newOrgDesc} onChange={e => setNewOrgDesc(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-[#444]" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-[#888] hover:text-white">Cancel</button>
            <button onClick={handleCreateOrg} disabled={creating || !newOrgName.trim()} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-40 transition-colors">
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {orgs.length === 0 ? (
        <div className="border border-dashed border-[#2a2a2a] rounded-xl p-12 text-center">
          <p className="text-[#555] text-sm">No organizations yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-violet-400 hover:underline underline-offset-2">Create your first org</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {orgs.map(org => (
              <button
                key={org.id}
                onClick={() => selectOrg(org.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                  selectedOrgId === org.id ? "bg-violet-600 text-white border-violet-600" : "bg-[#1a1a1a] text-[#aaa] border-[#2a2a2a] hover:border-[#444] hover:text-white"
                }`}
              >
                <span>{org.name}</span>
                <RoleBadge role={org.my_role} />
                {org.is_active && selectedOrgId !== org.id && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Active org" />}
              </button>
            ))}
          </div>

          {selectedOrgId && (
            loadingDetail ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-[#888]"><OrgSpinner /> Loading org…</div>
            ) : detail ? (
              <div className="space-y-4">
                <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] p-5">
                  {editingName ? (
                    <div className="space-y-3">
                      <input autoFocus type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-violet-500" />
                      <input type="text" value={editDesc} placeholder="Description (optional)" onChange={e => setEditDesc(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-[#444]" />
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} disabled={savingEdit} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg disabled:opacity-40 transition-colors">{savingEdit ? "Saving…" : "Save"}</button>
                        <button onClick={() => setEditingName(false)} className="px-3 py-1.5 text-xs text-[#555] hover:text-white">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-white">{detail.org.name}</h2>
                          {detail.org.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Active</span>}
                        </div>
                        <p className="text-xs text-[#555] mt-0.5">/{detail.org.slug}</p>
                        {detail.org.description && <p className="text-sm text-[#888] mt-1">{detail.org.description}</p>}
                        <p className="text-xs text-[#555] mt-2">{detail.members.length} member{detail.members.length !== 1 ? "s" : ""} · Your role: <span className="font-medium text-[#aaa]">{myRole}</span></p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">{detail.org.credits_balance.toLocaleString()}</p>
                          <p className="text-xs text-[#555]">shared credits</p>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-2">
                            <button onClick={() => { setEditName(detail.org.name); setEditDesc(detail.org.description ?? ""); setEditingName(true); }} className="text-xs px-2.5 py-1.5 border border-[#2a2a2a] rounded-lg hover:border-[#444] hover:text-white transition-colors text-[#888]">Edit</button>
                            {isOwner && <button onClick={() => setShowDeleteConfirm(true)} className="text-xs px-2.5 py-1.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors text-red-400">Delete</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <MembersPanel members={detail.members} myRole={myRole} orgId={selectedOrgId} onRefresh={() => loadDetail(selectedOrgId)} />
                <AddCreditsPanel org={detail.org} myRole={myRole} onRefresh={() => { loadDetail(selectedOrgId); loadOrgs(); }} />
                <AllotCreditsPanel members={detail.members} myRole={myRole} orgId={selectedOrgId} onRefresh={() => loadDetail(selectedOrgId)} />
                <InvitePanel orgId={selectedOrgId} myRole={myRole} onRefresh={() => loadDetail(selectedOrgId)} />

                <div className="border border-red-500/20 rounded-xl bg-[#141414] overflow-hidden">
                  <div className="px-5 py-3 border-b border-red-500/20"><p className="text-sm font-semibold text-red-400">Danger Zone</p></div>
                  <div className="p-5 space-y-3">
                    {dangerMsg && <p className="text-xs text-red-400">{dangerMsg}</p>}
                    {isOwner ? (
                      <div className="flex items-center justify-between">
                        <div><p className="text-sm font-medium text-white">Transfer Ownership</p><p className="text-xs text-[#555]">Assign a new owner. You become admin.</p></div>
                        <button onClick={() => setShowTransferModal(true)} className="text-xs px-3 py-1.5 border border-orange-500/30 rounded-lg text-orange-400 hover:bg-orange-500/10 transition-colors">Transfer</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div><p className="text-sm font-medium text-white">Leave Organization</p><p className="text-xs text-[#555]">You will lose access to this org's resources.</p></div>
                        <button onClick={() => setShowLeaveConfirm(true)} className="text-xs px-3 py-1.5 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">Leave</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : <div className="text-sm text-[#555] text-center py-8">Could not load org details.</div>
          )}
        </>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog title="Delete organization" message={`Permanently delete "${selectedOrg?.name}"? All members will be removed.`} onConfirm={handleDeleteOrg} onCancel={() => setShowDeleteConfirm(false)} />
      )}
      {showLeaveConfirm && (
        <ConfirmDialog title="Leave organization" message={`Leave "${selectedOrg?.name}"? You'll lose access to shared resources.`} onConfirm={handleLeave} onCancel={() => setShowLeaveConfirm(false)} />
      )}
      {showTransferModal && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Transfer Ownership</h3>
            <p className="text-sm text-[#888]">Select a member to become the new owner. You will become an admin.</p>
            <select value={transferUserId} onChange={e => setTransferUserId(e.target.value)} className="w-full bg-[#111] border border-[#2a2a2a] text-[#aaa] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
              <option value="">Select member…</option>
              {detail.members.filter(m => m.role !== "owner").map(m => <option key={m.user_id} value={m.user_id}>{m.name ?? m.email} ({m.role})</option>)}
            </select>
            {dangerMsg && <p className="text-xs text-red-400">{dangerMsg}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-sm border border-[#2a2a2a] text-[#aaa] rounded-lg hover:border-[#444] hover:text-white transition-colors">Cancel</button>
              <button onClick={handleTransfer} disabled={dangerBusy || !transferUserId} className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-40">
                {dangerBusy ? "…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Telegram Section ──────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <button onClick={handleCopy} className="text-xs px-2.5 py-1 border border-border-2 text-muted rounded-md hover:border-violet-500/50 hover:text-violet-400 transition-colors shrink-0 whitespace-nowrap">
      {copied ? "Copied!" : label}
    </button>
  );
}

function TelegramSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<{ token: string; bot_url: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getTelegramStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setGenerating(true); setError("");
    try {
      const res = await getTelegramToken();
      setTokenData({ token: res.token, bot_url: res.bot_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate token.");
    } finally { setGenerating(false); }
  }

  async function handleDisconnect() {
    setDisconnecting(true); setError("");
    try {
      await disconnectTelegram();
      setStatus({ connected: false });
      setTokenData(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to disconnect.");
    } finally { setDisconnecting(false); }
  }

  const fullCommand = tokenData ? `/start auth_${tokenData.token}` : "";

  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <div className="bg-surface-2 px-4 py-2.5 border-b border-border flex items-center gap-2">
        <svg className="w-4 h-4 text-muted shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
        </svg>
        <div>
          <h2 className="text-sm font-medium text-muted">Telegram</h2>
          <p className="text-xs text-faint mt-0.5">Receive generation notifications and trigger jobs from the bot.</p>
        </div>
      </div>

      <div className="px-4 py-4 bg-surface space-y-4">
        {loading ? (
          <p className="text-sm text-muted">Checking connection…</p>
        ) : status?.connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div>
                <p className="text-sm text-primary font-medium">Connected</p>
                {status.username && <p className="text-xs text-muted">@{status.username}</p>}
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-xs px-3 py-1.5 border border-border-2 text-muted rounded-lg hover:border-red-500/50 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : tokenData ? (
          <div className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">
              Token valid for <span className="text-primary font-medium">5 minutes</span>.
              Copy the command below, open the bot chat, and send it.
            </p>

            <div className="space-y-2">
              <p className="text-xs text-faint font-medium uppercase tracking-wide">Command to send</p>
              <div className="flex items-center gap-2 bg-surface-2 border border-border-2 rounded-lg px-3 py-2">
                <code className="flex-1 text-sm font-mono text-primary overflow-x-auto whitespace-nowrap">{fullCommand}</code>
                <CopyButton text={fullCommand} label="Copy" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-faint font-medium uppercase tracking-wide">Token only</p>
              <div className="flex items-center gap-2 bg-surface-2 border border-border-2 rounded-lg px-3 py-2">
                <code className="flex-1 text-xs font-mono text-muted overflow-x-auto whitespace-nowrap">auth_{tokenData.token}</code>
                <CopyButton text={`auth_${tokenData.token}`} label="Copy" />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <a
                href={tokenData.bot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2481cc] hover:bg-[#1a6db5] text-white text-sm rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                </svg>
                Open Bot Chat
              </a>
              <button onClick={() => setTokenData(null)} className="text-xs text-faint hover:text-muted transition-colors">
                Cancel
              </button>
            </div>

            <p className="text-xs text-faint">
              In the bot chat: paste the command above and tap Send.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-40 transition-colors"
            >
              {generating ? "Generating…" : "Connect Telegram"}
            </button>
            <p className="text-xs text-faint">Generates a one-time auth token.</p>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ profile, setProfile }: { profile: UserProfile; setProfile: (p: UserProfile) => void }) {
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(profile.phone_number ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveMsg("");
    try {
      const updated = await updateProfile({ name: name || undefined, phone_number: phone || undefined });
      setProfile({ ...profile, ...updated });
      setSaveMsg("Saved.");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch { setSaveMsg("Failed to save. Try again."); }
    finally { setSaving(false); }
  }

  async function handleCopyKey() {
    if (!profile?.api_key) return;
    try { await navigator.clipboard.writeText(profile.api_key); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  function maskedKey(key: string) {
    return key.slice(0, 8) + "•".repeat(Math.max(0, key.length - 12)) + key.slice(-4);
  }

  return (
    <div className="space-y-8 max-w-lg">
      <section className="border border-border rounded-xl overflow-hidden">
        <div className="bg-surface-2 px-4 py-2.5 border-b border-border">
          <h2 className="text-sm font-medium text-muted">Profile</h2>
        </div>
        <form onSubmit={handleSave} className="px-4 py-4 space-y-4 bg-surface">
          <div>
            <label className="block text-xs font-medium text-faint mb-1">Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full bg-surface-2 border border-border-2 text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-faint" />
          </div>
          <div>
            <label className="block text-xs font-medium text-faint mb-1">Email</label>
            <input type="email" value={profile.email} disabled className="w-full bg-surface-3 border border-border text-muted rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-faint mb-1">Phone number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" className="w-full bg-surface-2 border border-border-2 text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-faint" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-40 transition-colors">
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saveMsg && <span className={`text-sm ${saveMsg === "Saved." ? "text-emerald-400" : "text-red-400"}`}>{saveMsg}</span>}
          </div>
        </form>
      </section>

      <section className="border border-border rounded-xl overflow-hidden">
        <div className="bg-surface-2 px-4 py-2.5 border-b border-border">
          <h2 className="text-sm font-medium text-muted">API Token</h2>
          <p className="text-xs text-faint mt-0.5">
            Use this token as the <code className="font-mono bg-surface-3 px-1 rounded text-muted">X-API-Key</code> header in API requests.
          </p>
        </div>
        <div className="px-4 py-4 space-y-3 bg-surface">
          {profile.api_key ? (
            <>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm bg-surface-2 border border-border-2 rounded-lg px-3 py-2 text-muted overflow-x-auto">
                  {keyVisible ? profile.api_key : maskedKey(profile.api_key)}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setKeyVisible((v) => !v)} className="text-xs px-3 py-1.5 border border-border-2 text-muted rounded-lg hover:border-border hover:text-primary transition-colors">
                  {keyVisible ? "Hide" : "Reveal"}
                </button>
                <button onClick={handleCopyKey} className="text-xs px-3 py-1.5 border border-border-2 text-muted rounded-lg hover:border-border hover:text-primary transition-colors">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No API key found. This account was created before key storage was enabled.</p>
          )}
        </div>
      </section>

      <TelegramSection />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type AccountTab = "profile" | "team";

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: AccountTab = tabParam === "team" ? "team" : "profile";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    fetchMe()
      .then((p) => { setProfile(p); setLoading(false); })
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/login"); setLoading(false); });
  }, [router]);

  function setTab(t: AccountTab) {
    router.replace(`/account?tab=${t}`);
  }

  if (loading) {
    return (
      <SidebarLayout>
        <div className="flex-1 flex items-center justify-center text-sm text-[#888]">Loading…</div>
      </SidebarLayout>
    );
  }

  if (!profile) return null;

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-3xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-primary mb-6">Account</h1>

        <div className="flex gap-1 mb-6 border-b border-border">
          {([
            { id: "profile", label: "Profile & API Key" },
            { id: "team",    label: "Team & Organizations" },
          ] as { id: AccountTab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id ? "border-violet-500 text-primary" : "border-transparent text-muted hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "profile" && <ProfileTab profile={profile} setProfile={setProfile} />}
        {tab === "team"    && <TeamTab />}
      </div>
    </SidebarLayout>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center text-muted">Loading...</div>}>
      <AccountContent />
    </Suspense>
  );
}
