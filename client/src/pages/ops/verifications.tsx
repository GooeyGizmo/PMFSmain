import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield, ShieldCheck, ShieldX, Clock, Eye, CheckCircle, XCircle,
  FileText, User, Calendar, Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface VerificationRequest {
  id: string;
  name: string;
  email: string;
  heroesGroup: string | null;
  heroesVerificationStatus: string | null;
  heroesDocUrl: string | null;
  heroesVerifiedAt: string | null;
  createdAt: string;
}

interface OpsVerificationsProps {
  embedded?: boolean;
}

const GROUP_LABELS: Record<string, { label: string; color: string }> = {
  military: { label: "Military", color: "bg-green-500/10 text-green-600 border-green-500/30" },
  responder: { label: "First Responder", color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  senior: { label: "Senior (65+)", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  approved: { label: "Approved", icon: ShieldCheck, color: "bg-green-500/10 text-green-600 border-green-500/30" },
  denied: { label: "Denied", icon: ShieldX, color: "bg-red-500/10 text-red-600 border-red-500/30" },
};

export default function OpsVerifications({ embedded = false }: OpsVerificationsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [viewingDoc, setViewingDoc] = useState<VerificationRequest | null>(null);
  const [denyNote, setDenyNote] = useState("");
  const [decisionType, setDecisionType] = useState<"approved" | "denied" | null>(null);

  const { data: verifications = [], isLoading } = useQuery<VerificationRequest[]>({
    queryKey: ["/api/ops/verifications"],
    queryFn: async () => {
      const res = await fetch("/api/ops/verifications", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch verifications");
      return res.json();
    },
  });

  const decideMutation = useMutation({
    mutationFn: async ({ userId, decision, note }: { userId: string; decision: string; note?: string }) => {
      const res = await apiRequest("POST", `/api/ops/verifications/${userId}/decide`, { decision, note });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/verifications"] });
      toast({
        title: variables.decision === "approved" ? "Verification Approved" : "Verification Denied",
        description: variables.decision === "approved"
          ? "Customer can now subscribe to the Heroes tier."
          : "Customer has been notified of the denial.",
      });
      setSelectedRequest(null);
      setDecisionType(null);
      setDenyNote("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to process verification decision.", variant: "destructive" });
    },
  });

  const pendingCount = verifications.filter(v => v.heroesVerificationStatus === "pending").length;
  const approvedCount = verifications.filter(v => v.heroesVerificationStatus === "approved").length;
  const deniedCount = verifications.filter(v => v.heroesVerificationStatus === "denied").length;

  const content = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="stat-pending">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-approved">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <ShieldCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{approvedCount}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-denied">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <ShieldX className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{deniedCount}</p>
              <p className="text-xs text-muted-foreground">Denied</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : verifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No verification requests yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              When customers apply for the Heroes tier, their requests will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Verification Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="verifications-table">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Customer</th>
                    <th className="text-left p-3 font-medium">Group</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Submitted</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.map((v) => {
                    const status = STATUS_CONFIG[v.heroesVerificationStatus || "pending"];
                    const group = GROUP_LABELS[v.heroesGroup || ""] || { label: v.heroesGroup || "Unknown", color: "bg-muted" };
                    const StatusIcon = status?.icon || Clock;

                    return (
                      <tr key={v.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors" data-testid={`verification-row-${v.id}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{v.name}</p>
                              <p className="text-xs text-muted-foreground">{v.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={group.color}>
                            {group.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={`gap-1 ${status?.color || ""}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status?.label || v.heroesVerificationStatus}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span className="text-xs">{format(new Date(v.createdAt), "MMM d, yyyy")}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            {v.heroesDocUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => setViewingDoc(v)}
                                data-testid={`view-doc-${v.id}`}
                              >
                                <Eye className="w-3 h-3" />
                                View ID
                              </Button>
                            )}
                            {v.heroesVerificationStatus === "pending" && (
                              <>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="gap-1 bg-green-600 hover:bg-green-700"
                                  onClick={() => {
                                    setSelectedRequest(v);
                                    setDecisionType("approved");
                                  }}
                                  data-testid={`approve-${v.id}`}
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => {
                                    setSelectedRequest(v);
                                    setDecisionType("denied");
                                    setDenyNote("");
                                  }}
                                  data-testid={`deny-${v.id}`}
                                >
                                  <XCircle className="w-3 h-3" />
                                  Deny
                                </Button>
                              </>
                            )}
                            {v.heroesVerificationStatus === "approved" && v.heroesVerifiedAt && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(v.heroesVerifiedAt), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedRequest && decisionType === "approved"} onOpenChange={(open) => { if (!open) { setSelectedRequest(null); setDecisionType(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Approve Verification
            </DialogTitle>
            <DialogDescription>
              Approve <strong>{selectedRequest?.name}</strong>'s Heroes tier verification as a{" "}
              <strong>{GROUP_LABELS[selectedRequest?.heroesGroup || ""]?.label || selectedRequest?.heroesGroup}</strong>?
              They will be able to subscribe to the Heroes tier at $34.99/mo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedRequest(null); setDecisionType(null); }}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={decideMutation.isPending}
              onClick={() => {
                if (selectedRequest) {
                  decideMutation.mutate({ userId: selectedRequest.id, decision: "approved" });
                }
              }}
              data-testid="confirm-approve"
            >
              {decideMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedRequest && decisionType === "denied"} onOpenChange={(open) => { if (!open) { setSelectedRequest(null); setDecisionType(null); setDenyNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              Deny Verification
            </DialogTitle>
            <DialogDescription>
              Deny <strong>{selectedRequest?.name}</strong>'s Heroes tier verification? They will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              placeholder="e.g. Document was unreadable, please resubmit a clearer photo..."
              value={denyNote}
              onChange={(e) => setDenyNote(e.target.value)}
              data-testid="deny-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedRequest(null); setDecisionType(null); setDenyNote(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={decideMutation.isPending}
              onClick={() => {
                if (selectedRequest) {
                  decideMutation.mutate({ userId: selectedRequest.id, decision: "denied", note: denyNote || undefined });
                }
              }}
              data-testid="confirm-deny"
            >
              {decideMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Deny Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingDoc} onOpenChange={(open) => { if (!open) setViewingDoc(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Verification Document — {viewingDoc?.name}
            </DialogTitle>
            <DialogDescription>
              {GROUP_LABELS[viewingDoc?.heroesGroup || ""]?.label || viewingDoc?.heroesGroup} verification document
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-muted/30 min-h-[300px] flex items-center justify-center">
            {viewingDoc && (
              (() => {
                const ext = viewingDoc.heroesDocUrl?.split(".").pop()?.toLowerCase() || "";
                const docUrl = `/api/ops/verifications/${viewingDoc.id}/document`;
                if (ext === "pdf") {
                  return <iframe src={docUrl} className="w-full h-[500px]" title="Verification Document" />;
                }
                return (
                  <img
                    src={docUrl}
                    alt="Verification Document"
                    className="max-w-full max-h-[500px] object-contain"
                    data-testid="doc-preview-image"
                  />
                );
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Heroes Tier Verifications</h1>
        <p className="text-muted-foreground">Review and manage verification requests for the Service Members & Seniors tier</p>
      </div>
      {content}
    </div>
  );
}
