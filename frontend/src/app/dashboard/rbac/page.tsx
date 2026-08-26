"use client";

import { useState, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { rbac } from "@/lib/api";
import type { WorkspaceMemberItem, CustomRoleItem } from "@/lib/types";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Shield,
  UserPlus,
  KeyRound,
  Check,
  X,
  Lock,
  Edit2,
  Trash2,
  Sliders,
  CheckCircle2,
} from "lucide-react";

export default function RbacPage() {
  const [isInviting, setIsInviting] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMemberItem | null>(null);

  // Form inputs
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("developer");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    data: members,
    loading: membersLoading,
    refresh: refreshMembers,
  } = usePolling<WorkspaceMemberItem[]>(
    useCallback((_signal) => rbac.members(), []),
    5000
  );

  const {
    data: rolesData,
    loading: rolesLoading,
    refresh: refreshRoles,
  } = usePolling<{
    standard_roles: Record<string, { name: string; description: string; permissions: string[] }>;
    custom_roles: CustomRoleItem[];
  }>(
    useCallback((_signal) => rbac.roles(), []),
    10000
  );

  const { data: permData } = usePolling<{
    permissions: Record<string, string>;
    standard_roles: Record<string, { name: string; description: string; permissions: string[] }>;
  }>(
    useCallback((_signal) => rbac.permissions(), []),
    15000
  );

  async function handleInviteMember() {
    if (!inviteEmail || !inviteName) return;
    setSaving(true);
    try {
      await rbac.inviteMember({
        email: inviteEmail,
        name: inviteName,
        role: inviteRole,
        permissions: selectedPermissions,
      });
      setIsInviting(false);
      setInviteEmail("");
      setInviteName("");
      setSelectedPermissions([]);
      refreshMembers();
    } catch (err: any) {
      alert(err.message || "Failed to invite member");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateMember() {
    if (!editingMember) return;
    setSaving(true);
    try {
      await rbac.updateMember(editingMember.id, {
        role: editingMember.role,
        permissions: editingMember.permissions,
        is_active: editingMember.is_active,
      });
      setEditingMember(null);
      refreshMembers();
    } catch (err: any) {
      alert(err.message || "Failed to update member");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(id: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      await rbac.removeMember(id);
      refreshMembers();
    } catch (err: any) {
      alert(err.message || "Failed to remove member");
    }
  }

  async function handleCreateRole() {
    if (!newRoleName) return;
    setSaving(true);
    try {
      await rbac.createRole({
        name: newRoleName,
        description: newRoleDesc,
        permissions: selectedPermissions,
      });
      setIsCreatingRole(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setSelectedPermissions([]);
      refreshRoles();
    } catch (err: any) {
      alert(err.message || "Failed to create custom role");
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(p: string) {
    setSelectedPermissions((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  }

  const allPermKeys = Object.keys(permData?.permissions || {});

  return (
    <div className="space-y-6">
      <Header
        title="Access & Role-Based Access Control (RBAC)"
        description="Manage workspace team members, role assignments, and fine-grained capability security boundaries."
        action={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedPermissions([]);
                setIsCreatingRole(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Sliders size={14} /> New Custom Role
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setSelectedPermissions([]);
                setIsInviting(true);
              }}
              className="flex items-center gap-1.5"
            >
              <UserPlus size={14} /> Invite Member
            </Button>
          </div>
        }
      />

      {/* Team Members List */}
      <Card className="material-base">
        <CardHeader className="border-b border-hairline pb-4">
          <CardTitle className="text-base font-semibold text-ink-primary flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-accent" />
              <span>Workspace Members &amp; Role Assignments</span>
            </div>
            <span className="text-xs font-normal text-ink-muted">
              {members?.length || 0} members registered
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Effective Permissions</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {membersLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-ink-muted">
                      <Skeleton className="h-6 w-3/4 mx-auto" />
                    </td>
                  </tr>
                ) : members && members.length > 0 ? (
                  members.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-ink-primary flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-accent/15 text-accent border border-accent/25 flex items-center justify-center font-bold text-xs uppercase">
                          {m.name.slice(0, 2)}
                        </div>
                        {m.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-ink-muted">{m.email}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            m.role === "admin"
                              ? "default"
                              : m.role === "security_admin"
                              ? "destructive"
                              : m.role === "auditor"
                              ? "secondary"
                              : "outline"
                          }
                          className="capitalize font-mono text-[10px]"
                        >
                          {m.role.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] font-mono text-ink-primary font-medium">
                          {m.effective_permissions?.length || 0} permissions granted
                        </span>
                        {m.permissions && m.permissions.length > 0 && (
                          <Badge variant="outline" className="ml-2 text-[9px] text-accent border-accent/30">
                            +{m.permissions.length} custom
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={m.is_active ? "success" : "destructive"} className="text-[10px]">
                          {m.is_active ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setEditingMember(m)}
                            className="text-ink-muted hover:text-ink-primary"
                          >
                            <Edit2 size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-ink-muted hover:text-rose-400"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-ink-muted">
                      No members configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Role Permission Matrix Card */}
      <Card className="material-base">
        <CardHeader className="border-b border-hairline pb-4">
          <CardTitle className="text-base font-semibold text-ink-primary flex items-center gap-2">
            <Shield size={18} className="text-indigo-400" />
            <span>Fine-Grained Role Capability Matrix</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rolesData?.standard_roles &&
              Object.entries(rolesData.standard_roles).map(([key, r]) => (
                <div
                  key={key}
                  className="material-elevated border border-hairline rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink-primary text-sm">{r.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {key}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">{r.description}</p>
                  <div className="pt-2 border-t border-hairline">
                    <div className="text-[11px] font-medium text-ink-muted mb-1.5">Capabilities:</div>
                    <div className="flex flex-wrap gap-1">
                      {r.permissions.map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 rounded bg-surface border border-hairline text-[10px] font-mono text-ink-primary"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      {isInviting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-ink-primary">Invite Workspace Member</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Maya Chen"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Work Email</label>
                <input
                  type="email"
                  placeholder="maya@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Base Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                >
                  <option value="developer">Developer</option>
                  <option value="security_admin">Security Administrator</option>
                  <option value="soc_analyst">SOC Analyst</option>
                  <option value="auditor">Auditor (Read-Only)</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Full Administrator</option>
                </select>
              </div>

              <div>
                <label className="block text-ink-muted font-medium mb-1.5">
                  Optional Fine-Grained Capability Overrides:
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 border border-hairline rounded-lg p-2 bg-surface/50">
                  {allPermKeys.map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-surface-elevated cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono font-medium text-ink-primary">{perm}</span>
                        <span className="text-[10px] text-ink-muted">{permData?.permissions[perm]}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                        className="rounded border-hairline bg-surface-elevated accent-accent"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsInviting(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleInviteMember}>
                {saving ? "Inviting..." : "Send Invitation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink-primary">
              Edit Member: <span className="text-accent">{editingMember.name}</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Role</label>
                <select
                  value={editingMember.role}
                  onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                >
                  <option value="developer">Developer</option>
                  <option value="security_admin">Security Administrator</option>
                  <option value="soc_analyst">SOC Analyst</option>
                  <option value="auditor">Auditor (Read-Only)</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Full Administrator</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface border border-hairline">
                <span className="font-medium text-ink-primary">Account Active</span>
                <input
                  type="checkbox"
                  checked={editingMember.is_active}
                  onChange={(e) =>
                    setEditingMember({ ...editingMember, is_active: e.target.checked })
                  }
                  className="rounded border-hairline accent-accent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMember(null)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleUpdateMember}>
                {saving ? "Saving..." : "Update Member"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Custom Role Modal */}
      {isCreatingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-ink-primary">Define Custom Security Role</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Role Name</label>
                <input
                  type="text"
                  placeholder="e.g. Risk Officer"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Compliance auditor with spend and risk report export permissions"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>

              <div>
                <label className="block text-ink-muted font-medium mb-1.5">Select Capabilities:</label>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 border border-hairline rounded-lg p-2 bg-surface/50">
                  {allPermKeys.map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-surface-elevated cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono font-medium text-ink-primary">{perm}</span>
                        <span className="text-[10px] text-ink-muted">{permData?.permissions[perm]}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                        className="rounded border-hairline bg-surface-elevated accent-accent"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsCreatingRole(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleCreateRole}>
                {saving ? "Creating..." : "Save Custom Role"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
