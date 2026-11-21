"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { threatIntelApi } from "@/lib/api";
import type {
  TaxiiStatus,
  TaxiiCollection,
  ThreatFeed,
  StixBundle,
} from "@/lib/types";
import {
  Radio,
  Shield,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileCode,
  ExternalLink,
  Search,
  Server,
  Activity,
  X,
  Play,
  Share2,
} from "lucide-react";

export default function ThreatIntelPage() {
  const { toast } = useToast();

  const [status, setStatus] = useState<TaxiiStatus | null>(null);
  const [feeds, setFeeds] = useState<ThreatFeed[]>([]);
  const [collections, setCollections] = useState<TaxiiCollection[]>([]);
  const [discoveryInfo, setDiscoveryInfo] = useState<Record<string, any> | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"feeds" | "objects" | "exports" | "server">("feeds");

  // Feeds state
  const [pollingFeedId, setPollingFeedId] = useState<string | null>(null);
  const [isAddFeedModalOpen, setIsAddFeedModalOpen] = useState(false);
  const [addingFeed, setAddingFeed] = useState(false);
  const [newFeed, setNewFeed] = useState({
    name: "",
    taxii_url: "https://otx.alienvault.com/taxii",
    api_root: "taxii2",
    collection_id: "user_community",
    auth_type: "none",
    auth_credentials: "",
    poll_interval_minutes: 60,
    enabled: true,
  });

  // STIX Object Explorer state
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [selectedStixType, setSelectedStixType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stixObjects, setStixObjects] = useState<any[]>([]);
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [inspectedObject, setInspectedObject] = useState<any | null>(null);

  // Export state
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [lastExportedBundle, setLastExportedBundle] = useState<StixBundle | null>(null);
  const [copied, setCopied] = useState(false);

  // Initial load
  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, feedsRes, collsRes, discRes] = await Promise.all([
        threatIntelApi.getStatus().catch(() => null),
        threatIntelApi.getFeeds().catch(() => []),
        threatIntelApi.getCollections().catch(() => ({ collections: [] })),
        threatIntelApi.getDiscovery().catch(() => null),
      ]);
      setStatus(statusRes);
      setFeeds(feedsRes);
      setCollections(collsRes.collections);
      setDiscoveryInfo(discRes);

      if (collsRes.collections.length > 0 && !selectedCollectionId) {
        setSelectedCollectionId(collsRes.collections[0].id);
      }
    } catch (err) {
      console.error("Failed to load Threat Intel overview", err);
      toast({ title: "Failed to load threat intel status", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [selectedCollectionId, toast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Load objects when collection or type changes
  const loadStixObjects = useCallback(async () => {
    if (!selectedCollectionId) return;
    try {
      setObjectsLoading(true);
      const typeParam = selectedStixType === "all" ? undefined : selectedStixType;
      const res = await threatIntelApi.getObjects(selectedCollectionId, 100, typeParam);
      setStixObjects(res.objects || []);
    } catch (err) {
      console.error("Failed to fetch STIX objects", err);
      toast({ title: "Failed to query collection objects", variant: "error" });
    } finally {
      setObjectsLoading(false);
    }
  }, [selectedCollectionId, selectedStixType, toast]);

  useEffect(() => {
    if (activeTab === "objects") {
      loadStixObjects();
    }
  }, [activeTab, loadStixObjects]);

  // Actions
  async function handlePollFeed(feedId: string) {
    setPollingFeedId(feedId);
    try {
      const res = await threatIntelApi.pollFeed(feedId);
      toast({
        title: "Threat feed polled successfully",
        description: `Ingested ${res.objects_received} STIX objects, created ${res.signatures_created} active IPS rules.`,
        variant: "success",
      });
      await loadOverview();
    } catch (err) {
      toast({
        title: "Feed poll failed",
        description: err instanceof Error ? err.message : "Network error contacting TAXII server",
        variant: "error",
      });
    } finally {
      setPollingFeedId(null);
    }
  }

  async function handleToggleFeed(feed: ThreatFeed) {
    try {
      await threatIntelApi.updateFeed(feed.id, { enabled: !feed.enabled });
      toast({
        title: `Feed ${feed.enabled ? "disabled" : "enabled"}`,
        variant: "info",
      });
      setFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, enabled: !feed.enabled } : f))
      );
    } catch (err) {
      toast({ title: "Failed to update feed status", variant: "error" });
    }
  }

  async function handleDeleteFeed(feedId: string) {
    if (!confirm("Are you sure you want to remove this threat feed configuration?")) return;
    try {
      await threatIntelApi.deleteFeed(feedId);
      toast({ title: "Threat feed removed", variant: "success" });
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    } catch (err) {
      toast({ title: "Failed to delete threat feed", variant: "error" });
    }
  }

  async function handleCreateFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!newFeed.name || !newFeed.taxii_url || !newFeed.collection_id) {
      toast({ title: "Please fill all required fields", variant: "warning" });
      return;
    }
    setAddingFeed(true);
    try {
      const created = await threatIntelApi.createFeed(newFeed);
      toast({ title: "Threat feed registered", description: `Feed ${created.name} is ready for sync.`, variant: "success" });
      setFeeds((prev) => [created, ...prev]);
      setIsAddFeedModalOpen(false);
      setNewFeed({
        name: "",
        taxii_url: "https://otx.alienvault.com/taxii",
        api_root: "taxii2",
        collection_id: "user_community",
        auth_type: "none",
        auth_credentials: "",
        poll_interval_minutes: 60,
        enabled: true,
      });
    } catch (err) {
      toast({ title: "Failed to register feed", description: err instanceof Error ? err.message : "Error", variant: "error" });
    } finally {
      setAddingFeed(false);
    }
  }

  // Export handlers
  async function handleExport(type: "violations" | "ips" | "soc") {
    setExportingType(type);
    try {
      let bundle: StixBundle;
      if (type === "violations") {
        bundle = await threatIntelApi.exportViolations(100);
      } else if (type === "ips") {
        bundle = await threatIntelApi.exportIpsSignatures();
      } else {
        bundle = await threatIntelApi.exportSocAlerts(100);
      }
      setLastExportedBundle(bundle);
      toast({
        title: "STIX 2.1 Bundle Generated",
        description: `Exported ${bundle.objects.length} STIX 2.1 objects ready for download.`,
        variant: "success",
      });
    } catch (err) {
      toast({ title: "Export failed", variant: "error" });
    } finally {
      setExportingType(null);
    }
  }

  function downloadBundle(bundle: StixBundle, filename: string) {
    const jsonStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Download started", description: filename, variant: "info" });
  }

  function copyBundle(bundle: StixBundle) {
    navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied STIX 2.1 Bundle to clipboard", variant: "success" });
  }

  const filteredObjects = stixObjects.filter((obj) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const id = (obj.id || "").toLowerCase();
    const type = (obj.type || "").toLowerCase();
    const name = (obj.name || "").toLowerCase();
    const pattern = (obj.pattern || "").toLowerCase();
    const desc = (obj.description || "").toLowerCase();
    return id.includes(q) || type.includes(q) || name.includes(q) || pattern.includes(q) || desc.includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent Security Fabric"
        title="Threat Intelligence & TAXII 2.1"
        description="Bi-directional STIX 2.1 cyber threat mesh: ingest remote threat intelligence feeds into the real-time IPS engine and export standardized agent violations to enterprise SIEM/TIP platforms."
        trailing={
          <Badge variant="info" className="gap-1 font-mono text-[10px]">
            <Radio size={12} className="text-accent animate-pulse" />
            STIX 2.1 / TAXII 2.1
          </Badge>
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("violations")}
              disabled={exportingType !== null}
              className="gap-1.5 text-[12px]"
            >
              <Download size={13} />
              Export Violations
            </Button>
            <Button
              size="sm"
              onClick={() => setIsAddFeedModalOpen(true)}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} />
              Add Threat Feed
            </Button>
          </div>
        }
      />

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="material-soft border-hairline">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase text-ink-muted">STIX 2.1 Objects</p>
              <p className="text-[24px] font-bold text-ink-primary mt-1">
                {status?.total_stix_objects ?? 0}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">Persisted in mesh</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Layers size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="material-soft border-hairline">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase text-ink-muted">TAXII Collections</p>
              <p className="text-[24px] font-bold text-ink-primary mt-1">
                {collections.length}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">Workspace channels</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-allow/10 border border-allow/20 flex items-center justify-center text-allow">
              <Server size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="material-soft border-hairline">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase text-ink-muted">Threat Feeds</p>
              <p className="text-[24px] font-bold text-ink-primary mt-1">
                {feeds.filter((f) => f.enabled).length} / {feeds.length}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">Active remote pollers</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
              <Radio size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="material-soft border-hairline">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase text-ink-muted">IPS External Signatures</p>
              <p className="text-[24px] font-bold text-ink-primary mt-1">
                {status?.ips_integration.external_signatures ?? 0}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                of {status?.ips_integration.total_signatures ?? 0} total active
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger">
              <Shield size={20} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hairline gap-2">
        <button
          onClick={() => setActiveTab("feeds")}
          className={`pb-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "feeds"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          <Radio size={14} />
          Threat Feeds ({feeds.length})
        </button>
        <button
          onClick={() => setActiveTab("objects")}
          className={`pb-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "objects"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          <Layers size={14} />
          STIX 2.1 Explorer
        </button>
        <button
          onClick={() => setActiveTab("exports")}
          className={`pb-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "exports"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          <Share2 size={14} />
          SIEM & TIP Exports
        </button>
        <button
          onClick={() => setActiveTab("server")}
          className={`pb-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "server"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          <Server size={14} />
          TAXII 2.1 Discovery
        </button>
      </div>

      {/* Tab 1: Threat Feeds */}
      {activeTab === "feeds" && (
        <div className="space-y-4">
          <Card className="material-soft border-hairline">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                  <Radio size={16} className="text-accent" />
                  Configured Remote TAXII 2.1 Feeds
                </CardTitle>
                <p className="text-[12px] text-ink-muted mt-1">
                  Automatically queries remote TAXII channels, translates STIX indicators into live IPS signatures, and drops suspicious agent task payloads.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={loadOverview}
                className="gap-1.5 text-[12px]"
              >
                <RefreshCw size={13} />
                Refresh Feeds
              </Button>
            </CardHeader>
            <CardContent>
              {feeds.length === 0 ? (
                <div className="py-12 text-center">
                  <Radio size={36} className="mx-auto text-ink-muted/40 mb-3" />
                  <p className="text-[14px] font-medium text-ink-primary">No threat intelligence feeds registered</p>
                  <p className="text-[12px] text-ink-muted max-w-sm mx-auto mt-1 mb-4">
                    Connect an external TAXII 2.1 provider (AlienVault OTX, CISA AIS, MITRE, or internal TIP) to ingest live indicators into the firewall.
                  </p>
                  <Button size="sm" onClick={() => setIsAddFeedModalOpen(true)} className="gap-1.5">
                    <Plus size={14} />
                    Add Your First Feed
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-hairline text-ink-muted font-mono uppercase text-[10px]">
                        <th className="pb-2.5 font-medium">Feed Name</th>
                        <th className="pb-2.5 font-medium">Endpoint & Collection</th>
                        <th className="pb-2.5 font-medium">Interval</th>
                        <th className="pb-2.5 font-medium">Objects Ingested</th>
                        <th className="pb-2.5 font-medium">Last Status</th>
                        <th className="pb-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {feeds.map((feed) => (
                        <tr key={feed.id} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="py-3 font-medium text-ink-primary">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  feed.enabled ? "bg-allow" : "bg-ink-muted/40"
                                }`}
                              />
                              {feed.name}
                            </div>
                          </td>
                          <td className="py-3 font-mono text-[11px] text-ink-muted">
                            <div className="truncate max-w-[280px]" title={`${feed.taxii_url}/${feed.api_root}/collections/${feed.collection_id}`}>
                              {feed.taxii_url}
                            </div>
                            <div className="text-[10px] text-accent">
                              col: {feed.collection_id}
                            </div>
                          </td>
                          <td className="py-3 text-ink-muted">
                            Every {feed.poll_interval_minutes}m
                          </td>
                          <td className="py-3 font-mono font-medium text-ink-primary">
                            {feed.objects_received || 0}
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={
                                feed.last_poll_status === "success"
                                  ? "success"
                                  : feed.last_poll_status === "empty"
                                  ? "default"
                                  : "warning"
                              }
                            >
                              {feed.last_poll_status || "never polled"}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePollFeed(feed.id)}
                                disabled={pollingFeedId === feed.id}
                                className="h-7 text-[11px] gap-1 px-2"
                              >
                                {pollingFeedId === feed.id ? (
                                  <RefreshCw size={12} className="animate-spin text-accent" />
                                ) : (
                                  <Play size={12} className="text-allow" />
                                )}
                                Poll Now
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleFeed(feed)}
                                className="h-7 text-[11px] px-2 text-ink-muted hover:text-ink-primary"
                              >
                                {feed.enabled ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteFeed(feed.id)}
                                className="h-7 text-[11px] px-2 text-danger hover:bg-danger/10"
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: STIX Object Explorer */}
      {activeTab === "objects" && (
        <div className="space-y-4">
          <Card className="material-soft border-hairline">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                    <Layers size={16} className="text-accent" />
                    STIX 2.1 Threat Objects Explorer
                  </CardTitle>
                  <p className="text-[12px] text-ink-muted mt-1">
                    Query normalized Indicators, Attack Patterns, Malware signatures, and Vulnerabilities across workspace collections.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCollectionId}
                    onChange={(e) => setSelectedCollectionId(e.target.value)}
                    className="h-8 rounded-lg bg-surface-elevated border border-hairline px-2 text-[12px] text-ink-primary"
                  >
                    {collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.title} ({col.id})
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedStixType}
                    onChange={(e) => setSelectedStixType(e.target.value)}
                    className="h-8 rounded-lg bg-surface-elevated border border-hairline px-2 text-[12px] text-ink-primary"
                  >
                    <option value="all">All Object Types</option>
                    <option value="indicator">Indicators</option>
                    <option value="attack-pattern">Attack Patterns</option>
                    <option value="vulnerability">Vulnerabilities</option>
                    <option value="malware">Malware</option>
                    <option value="sighting">Sightings</option>
                    <option value="report">Reports</option>
                  </select>

                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-ink-muted" />
                    <Input
                      placeholder="Search objects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-[12px] w-48"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {objectsLoading ? (
                <div className="py-12 text-center text-ink-muted">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-accent" />
                  Loading STIX 2.1 objects from collection...
                </div>
              ) : filteredObjects.length === 0 ? (
                <div className="py-12 text-center text-ink-muted">
                  <FileCode size={32} className="mx-auto text-ink-muted/40 mb-2" />
                  <p className="text-[14px] font-medium text-ink-primary">No STIX objects in this query</p>
                  <p className="text-[12px] mt-1">
                    Objects will populate automatically when security violations trigger or when external threat feeds are polled.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-hairline text-ink-muted font-mono uppercase text-[10px]">
                        <th className="pb-2.5 font-medium">Type</th>
                        <th className="pb-2.5 font-medium">Name / ID</th>
                        <th className="pb-2.5 font-medium">Pattern / Description</th>
                        <th className="pb-2.5 font-medium">Created</th>
                        <th className="pb-2.5 font-medium text-right">Raw STIX</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {filteredObjects.map((obj, i) => (
                        <tr key={obj.id || i} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="py-3">
                            <Badge
                              variant={
                                obj.type === "indicator"
                                  ? "danger"
                                  : obj.type === "attack-pattern"
                                  ? "warning"
                                  : obj.type === "vulnerability"
                                  ? "info"
                                  : "default"
                              }
                              className="font-mono text-[10px]"
                            >
                              {obj.type}
                            </Badge>
                          </td>
                          <td className="py-3 font-medium text-ink-primary max-w-[200px] truncate">
                            {obj.name || obj.id}
                            {obj.name && <div className="text-[10px] font-mono text-ink-muted truncate">{obj.id}</div>}
                          </td>
                          <td className="py-3 text-ink-muted max-w-[360px] truncate font-mono text-[11px]">
                            {obj.pattern || obj.description || "—"}
                          </td>
                          <td className="py-3 text-ink-muted font-mono text-[11px]">
                            {obj.created ? new Date(obj.created).toLocaleString() : "—"}
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setInspectedObject(obj)}
                              className="h-7 text-[11px] gap-1 px-2"
                            >
                              <FileCode size={12} />
                              View JSON
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: SIEM & TIP Exports */}
      {activeTab === "exports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="material-soft border-hairline flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Shield size={16} className="text-danger" />
                  <CardTitle className="text-[14px] font-semibold">Firewall Violations</CardTitle>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Export security violations, prompt injections, and DLP triggers as STIX 2.1 Indicators and Sightings.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  onClick={() => handleExport("violations")}
                  disabled={exportingType !== null}
                  className="w-full gap-2 text-[12px]"
                >
                  <Download size={14} />
                  Generate STIX Bundle
                </Button>
              </CardContent>
            </Card>

            <Card className="material-soft border-hairline flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Activity size={16} className="text-accent" />
                  <CardTitle className="text-[14px] font-semibold">Active IPS Rules</CardTitle>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Export all active intrusion prevention rules and regex patterns as STIX 2.1 Patterned Indicators.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  onClick={() => handleExport("ips")}
                  disabled={exportingType !== null}
                  variant="outline"
                  className="w-full gap-2 text-[12px]"
                >
                  <Download size={14} />
                  Export IPS Bundle
                </Button>
              </CardContent>
            </Card>

            <Card className="material-soft border-hairline flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Radio size={16} className="text-warning" />
                  <CardTitle className="text-[14px] font-semibold">SOC Incident Alerts</CardTitle>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Export correlated high-severity SOC alerts formatted as comprehensive STIX 2.1 Threat Reports.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  onClick={() => handleExport("soc")}
                  disabled={exportingType !== null}
                  variant="outline"
                  className="w-full gap-2 text-[12px]"
                >
                  <Download size={14} />
                  Export SOC Reports
                </Button>
              </CardContent>
            </Card>
          </div>

          {lastExportedBundle && (
            <Card className="material-soft border-hairline">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-allow" />
                  <CardTitle className="text-[14px] font-semibold">
                    Generated STIX 2.1 Bundle ({lastExportedBundle.objects?.length || 0} Objects)
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyBundle(lastExportedBundle)}
                    className="gap-1.5 text-[11px] h-7"
                  >
                    {copied ? <Check size={12} className="text-allow" /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy JSON"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadBundle(lastExportedBundle, `a2a-stix-bundle-${Date.now()}.json`)
                    }
                    className="gap-1.5 text-[11px] h-7"
                  >
                    <Download size={12} />
                    Download File
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="p-3 rounded-lg bg-surface-sunken border border-hairline text-[11px] font-mono text-ink-primary overflow-x-auto max-h-80">
                  {JSON.stringify(lastExportedBundle, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab 4: TAXII 2.1 Server Details */}
      {activeTab === "server" && (
        <div className="space-y-4">
          <Card className="material-soft border-hairline">
            <CardHeader>
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <Server size={16} className="text-accent" />
                TAXII 2.1 Server Discovery & Endpoints
              </CardTitle>
              <p className="text-[12px] text-ink-muted">
                Enterprise SIEM/TIP clients can connect directly to this server using standard TAXII 2.1 authentication.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-surface-elevated border border-hairline">
                  <p className="text-[11px] font-mono text-ink-muted uppercase">Discovery Endpoint</p>
                  <p className="text-[13px] font-mono text-accent mt-1">/v1/taxii/discovery</p>
                  <p className="text-[11px] text-ink-muted mt-2">
                    Accept header: <code>application/taxii+json;version=2.1</code>
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-surface-elevated border border-hairline">
                  <p className="text-[11px] font-mono text-ink-muted uppercase">Default API Root</p>
                  <p className="text-[13px] font-mono text-accent mt-1">/v1/taxii/api-root</p>
                  <p className="text-[11px] text-ink-muted mt-2">
                    Max content length: 10,485,760 bytes (10MB)
                  </p>
                </div>
              </div>

              {discoveryInfo && (
                <div className="mt-4">
                  <p className="text-[12px] font-medium text-ink-primary mb-1">Server Discovery Response:</p>
                  <pre className="p-3 rounded-lg bg-surface-sunken border border-hairline text-[11px] font-mono text-ink-primary overflow-x-auto">
                    {JSON.stringify(discoveryInfo, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Feed Modal */}
      {isAddFeedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-hairline-strong bg-surface p-6 shadow-popover space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-accent" />
                <h3 className="text-[15px] font-semibold text-ink-primary">Register Remote Threat Feed</h3>
              </div>
              <button
                onClick={() => setIsAddFeedModalOpen(false)}
                className="text-ink-muted hover:text-ink-primary"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateFeed} className="space-y-3 text-[12px]">
              <div>
                <label className="block text-ink-muted mb-1 font-medium">Feed Friendly Name</label>
                <Input
                  required
                  placeholder="e.g. AlienVault OTX Community"
                  value={newFeed.name}
                  onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-ink-muted mb-1 font-medium">TAXII Server URL</label>
                <Input
                  required
                  placeholder="https://otx.alienvault.com/taxii"
                  value={newFeed.taxii_url}
                  onChange={(e) => setNewFeed({ ...newFeed, taxii_url: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-ink-muted mb-1 font-medium">API Root</label>
                  <Input
                    required
                    placeholder="taxii2"
                    value={newFeed.api_root}
                    onChange={(e) => setNewFeed({ ...newFeed, api_root: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-ink-muted mb-1 font-medium">Collection ID</label>
                  <Input
                    required
                    placeholder="user_community"
                    value={newFeed.collection_id}
                    onChange={(e) => setNewFeed({ ...newFeed, collection_id: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-ink-muted mb-1 font-medium">Authentication</label>
                  <select
                    value={newFeed.auth_type}
                    onChange={(e) => setNewFeed({ ...newFeed, auth_type: e.target.value })}
                    className="w-full h-9 rounded-lg bg-surface-elevated border border-hairline px-2 text-[12px]"
                  >
                    <option value="none">None (Public)</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth (user:pass)</option>
                    <option value="api_key">API Key Header</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink-muted mb-1 font-medium">Poll Interval (min)</label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={newFeed.poll_interval_minutes}
                    onChange={(e) =>
                      setNewFeed({ ...newFeed, poll_interval_minutes: parseInt(e.target.value) || 60 })
                    }
                  />
                </div>
              </div>

              {newFeed.auth_type !== "none" && (
                <div>
                  <label className="block text-ink-muted mb-1 font-medium">Credentials / Token</label>
                  <Input
                    type="password"
                    placeholder="Auth secret or API key"
                    value={newFeed.auth_credentials}
                    onChange={(e) => setNewFeed({ ...newFeed, auth_credentials: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsAddFeedModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addingFeed} className="gap-1.5">
                  {addingFeed ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                  Register Feed
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Object Modal */}
      {inspectedObject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-hairline-strong bg-surface p-6 shadow-popover space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="info" className="font-mono text-[10px]">
                  {inspectedObject.type}
                </Badge>
                <h3 className="text-[14px] font-semibold text-ink-primary font-mono truncate max-w-xs">
                  {inspectedObject.name || inspectedObject.id}
                </h3>
              </div>
              <button
                onClick={() => setInspectedObject(null)}
                className="text-ink-muted hover:text-ink-primary"
              >
                <X size={16} />
              </button>
            </div>

            <pre className="p-3 rounded-lg bg-surface-sunken border border-hairline text-[11px] font-mono text-ink-primary overflow-x-auto max-h-96">
              {JSON.stringify(inspectedObject, null, 2)}
            </pre>

            <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(inspectedObject, null, 2));
                  toast({ title: "Object JSON copied to clipboard", variant: "success" });
                }}
                className="gap-1.5 text-[11px]"
              >
                <Copy size={12} />
                Copy JSON
              </Button>
              <Button
                size="sm"
                onClick={() => setInspectedObject(null)}
                className="text-[11px]"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
