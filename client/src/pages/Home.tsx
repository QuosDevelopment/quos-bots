import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowUpRight, BookOpen, Bot, Check, ChevronRight, Circle, Compass, Database, ExternalLink, Loader2, Radio, RefreshCw, Search, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

type Severity = "info" | "watch" | "high" | "critical";

const sections = [
  ["/", "Overview"],
  ["#personas", "Persona roster"],
  ["#knowledge", "Knowledge hub"],
  ["#reports", "QB-000 reports"],
] as const;

const statusClass: Record<string, string> = {
  ready: "status-ready",
  learning: "status-learning",
  attention: "status-attention",
  offline: "status-offline",
  connected: "status-ready",
  degraded: "status-attention",
  not_configured: "status-offline",
  pending: "status-offline",
  creating: "status-learning",
  failed: "status-attention",
};

function Status({ value }: { value: string }) {
  return <span className={`status-dot ${statusClass[value] ?? "status-offline"}`}><Circle aria-hidden="true" />{value.replaceAll("_", " ")}</span>;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function AuthGate() {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) return <div className="gate"><Loader2 className="spin" /><span>Initializing secured control plane</span></div>;
  if (!isAuthenticated) {
    return (
      <main className="gate">
        <div className="red-square" />
        <p className="eyebrow">QUOS BOTS / CONTROL PLANE</p>
        <h1>Operational intelligence,<br />held to account.</h1>
        <p className="gate-copy">The QUOS control plane is restricted to authorized operators. Sign in to configure QB-000, review source-grounded research, and manage Discord activation.</p>
        <Button className="primary-action" onClick={() => startLogin()}>Sign in to control plane <ArrowUpRight /></Button>
      </main>
    );
  }
  if (user?.role !== "admin") {
    return <main className="gate"><ShieldCheck /><h1>Access is limited.</h1><p className="gate-copy">Your account is authenticated but has not been granted QUOS Bots operator access.</p></main>;
  }
  return <ControlPlane />;
}

function ControlPlane() {
  const utils = trpc.useUtils();
  const [researchPersona, setResearchPersona] = useState("QB-001");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [activeSection, setActiveSection] = useState("Overview");
  const snapshotQuery = trpc.dashboard.snapshot.useQuery(undefined, { refetchInterval: 20_000 });
  const sourcesQuery = trpc.dashboard.sources.useQuery(undefined, { refetchInterval: 30_000 });
  const research = trpc.operations.research.useMutation({
    onSuccess: () => {
      setResearchQuestion("");
      void utils.dashboard.snapshot.invalidate();
      void utils.dashboard.sources.invalidate();
    },
  });
  const bootstrap = trpc.operations.bootstrapChannels.useMutation({ onSuccess: () => void utils.dashboard.snapshot.invalidate() });
  const syncCommands = trpc.operations.syncCommands.useMutation({ onSuccess: () => void utils.dashboard.snapshot.invalidate() });
  const vetSource = trpc.operations.vetSource.useMutation({ onSuccess: () => { void utils.dashboard.sources.invalidate(); void utils.dashboard.snapshot.invalidate(); } });
  const publishKnowledge = trpc.operations.publishKnowledge.useMutation({ onSuccess: () => void utils.dashboard.snapshot.invalidate() });

  const snapshot = snapshotQuery.data;
  const groupSummary = useMemo(() => {
    const groups = new Map<string, number>();
    for (const persona of snapshot?.personas ?? []) groups.set(persona.group, (groups.get(persona.group) ?? 0) + 1);
    return Array.from(groups.entries());
  }, [snapshot?.personas]);
  const provisionedCount = snapshot?.channels.filter(channel => channel.status === "ready").length ?? 0;
  const publishedCount = snapshot?.knowledge.filter(item => item.status === "published").length ?? 0;
  const pendingSources = sourcesQuery.data?.filter(source => source.vettingStatus === "pending") ?? [];

  if (snapshotQuery.isLoading) return <div className="loading-plane"><Loader2 className="spin" /> Loading control plane</div>;
  if (snapshotQuery.error) return <div className="loading-plane error-plane"><AlertTriangle /> {snapshotQuery.error.message}</div>;

  return (
    <div className="control-shell">
      <aside className="control-rail" aria-label="Control plane navigation">
        <div className="brand-lockup"><span className="brand-square" /><div><b>QUOS</b><span>BOTS</span></div></div>
        <div className="rail-rule" />
        <p className="rail-label">QB-000<br />COORDINATION</p>
        <nav>
          {sections.map(([href, label], index) => <a key={label} href={href} onClick={() => setActiveSection(label)} className={activeSection === label ? "rail-active" : ""}><span>0{index + 1}</span>{label}</a>)}
        </nav>
        <div className="rail-bottom"><span className="status-dot status-ready"><Circle />control plane online</span><p>One application<br />101 internal personas<br />One reporting line</p></div>
      </aside>

      <main className="control-main">
        <header className="topline">
          <p>OPERATOR CONSOLE <span>/</span> QUOS BOTS</p>
          <div><span className="top-status"><Radio /> {snapshot?.runtime.connected ? "GATEWAY LIVE" : "GATEWAY STANDBY"}</span><span>UTC {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
        </header>

        <section className="hero-grid">
          <div className="hero-title"><p className="eyebrow">QB-000 / OPERATIONS OVERVIEW</p><h1>Every specialist.<br /><em>One</em> coordination line.</h1><p>Configure, observe, and govern the full QUOS Bots persona network from one protected operational surface.</p></div>
          <div className="hero-panel"><div className="hero-panel-square" /><p>DISCORD INTEGRATION</p><h3>{snapshot?.runtime.configured ? "Credential set detected" : "Credential setup required"}</h3><span>{snapshot?.runtime.connected ? "The one Gateway connection is active." : "Add application, guild, and token secrets to activate the live bot."}</span></div>
        </section>

        <section className="metrics-grid" aria-label="System metrics">
          <article><span className="metric-index">01</span><Bot /><strong>{snapshot?.personas.length ?? 0}</strong><p>configured personas</p></article>
          <article><span className="metric-index">02</span><Radio /><strong>{provisionedCount}<small> / {snapshot?.channels.length ?? 0}</small></strong><p>channels provisioned</p></article>
          <article><span className="metric-index">03</span><BookOpen /><strong>{publishedCount}</strong><p>published knowledge items</p></article>
          <article><span className="metric-index">04</span><AlertTriangle /><strong>{snapshot?.reports.filter(report => report.severity === "high" || report.severity === "critical").length ?? 0}</strong><p>priority reports</p></article>
        </section>

        <section className="operations-strip" id="operations">
          <div><p className="eyebrow">DISCORD OPERATIONS</p><h2>Bootstrap with deliberate control.</h2><p>Channel creation is idempotent: the service creates or repairs the QB-000 and persona channels without duplicating completed work.</p></div>
          <div className="operation-status"><Status value={snapshot?.configuration?.gatewayStatus ?? "not_configured"} /><span>Gateway</span><Status value={snapshot?.configuration?.channelBootstrapStatus ?? "not_started"} /><span>Channel bootstrap</span></div>
          <div className="operation-actions"><Button disabled={!snapshot?.runtime.connected || bootstrap.isPending} onClick={() => bootstrap.mutate()}><Bot />{bootstrap.isPending ? "Provisioning" : "Provision channels"}</Button><Button variant="outline" disabled={!snapshot?.runtime.connected || syncCommands.isPending} onClick={() => syncCommands.mutate()}><RefreshCw />Sync commands</Button></div>
        </section>

        <section className="two-column" id="personas">
          <div className="section-block roster-block"><div className="section-heading"><div><p className="eyebrow">01 / ROSTER</p><h2>101 distinct operating roles.</h2></div><span>{groupSummary.length} disciplines</span></div>
            <div className="group-grid">{groupSummary.map(([group, count], index) => <div key={group} className="group-row"><span>0{index + 1}</span><b>{group}</b><em>{count}</em></div>)}</div>
            <div className="persona-table-wrap"><table><thead><tr><th>Persona</th><th>Role</th><th>System state</th><th>Channel</th></tr></thead><tbody>{snapshot?.personas.map(persona => <tr key={persona.id}><td><b>{persona.id}</b></td><td>{persona.role}</td><td><Status value={persona.status} /></td><td>{persona.channelId ? <span className="channel-linked">#{persona.channelSlug}</span> : <span className="channel-pending">pending</span>}</td></tr>)}</tbody></table></div>
          </div>

          <div className="section-block research-block"><div className="section-heading"><div><p className="eyebrow">02 / RESEARCH INTAKE</p><h2>Internet-grounded, reviewable.</h2></div><Compass /></div>
            <p className="section-copy">A persona searches for evidence, writes a traceable draft, and sends a structured report to QB-000. Research remains unpublished until its sources are reviewed.</p>
            <div className="research-form"><label>Persona<select value={researchPersona} onChange={event => setResearchPersona(event.target.value)}>{snapshot?.personas.map(persona => <option key={persona.id} value={persona.id}>{persona.id} — {persona.role}</option>)}</select></label><label>Research question<textarea value={researchQuestion} onChange={event => setResearchQuestion(event.target.value)} placeholder="For example: What are the current evidence-backed methods for evaluating model behavior?" /></label><Button disabled={research.isPending || researchQuestion.trim().length < 8} onClick={() => research.mutate({ personaId: researchPersona, question: researchQuestion })}><Search />{research.isPending ? "Researching" : "Create research draft"}</Button>{research.error && <p className="inline-error">{research.error.message}</p>}{research.data && <div className="research-result"><b>Draft recorded</b><p>{research.data.summary}</p><span>{research.data.sources.length} source(s) queued for QB-000 review.</span></div>}</div>
            <div className="recent-research"><p className="micro-label">RECENT RESEARCH RUNS</p>{snapshot?.research.length ? snapshot.research.map(run => <div key={run.id}><Status value={run.status === "completed" ? "ready" : run.status} /><span>{run.personaId}</span><p>{run.query}</p><time>{formatDate(run.createdAt)}</time></div>) : <p className="empty-text">No research runs have been recorded.</p>}</div>
          </div>
        </section>

        <section className="knowledge-section" id="knowledge"><div className="section-heading"><div><p className="eyebrow">03 / SHARED KNOWLEDGE HUB</p><h2>Evidence travels with its attribution.</h2></div><div className="knowledge-count"><Database /> {snapshot?.knowledge.length ?? 0} recent items</div></div>
          <div className="knowledge-grid">{snapshot?.knowledge.length ? snapshot.knowledge.map(item => <article key={item.id} className="knowledge-card"><div><span>{item.personaId}</span><Status value={item.status === "published" ? "ready" : "learning"} /></div><h3>{item.title}</h3><p>{item.summary}</p><footer><span>{formatDate(item.createdAt)}</span>{item.status === "draft" && <Button variant="link" disabled={publishKnowledge.isPending} onClick={() => publishKnowledge.mutate({ knowledgeId: item.id })}>Publish <ChevronRight /></Button>}</footer></article>) : <div className="knowledge-empty"><BookOpen /><p>Published and draft knowledge will appear here after research or persona activity is recorded.</p></div>}</div>
        </section>

        <section className="two-column lower-grid"><div className="section-block source-block"><div className="section-heading"><div><p className="eyebrow">SOURCE REVIEW QUEUE</p><h2>Vetting status is explicit.</h2></div><span>{pendingSources.length} pending</span></div>{sourcesQuery.isLoading ? <Loader2 className="spin" /> : <div className="source-list">{sourcesQuery.data?.length ? sourcesQuery.data.map(source => <article key={source.id}><div><Status value={source.vettingStatus === "vetted" ? "ready" : source.vettingStatus === "rejected" ? "attention" : "learning"} /><b>{source.title}</b><span>{source.publisher || "Unattributed publisher"}</span></div><a href={source.url} target="_blank" rel="noreferrer">Open <ExternalLink /></a>{source.vettingStatus === "pending" && <div className="review-actions"><button onClick={() => vetSource.mutate({ sourceId: source.id, approved: true, qualityScore: 80 })}><Check />Vet</button><button className="reject" onClick={() => vetSource.mutate({ sourceId: source.id, approved: false, qualityScore: 0 })}>Reject</button></div>}</article>) : <p className="empty-text">No sources are awaiting review.</p>}</div>}</div>
          <div className="section-block report-block" id="reports"><div className="section-heading"><div><p className="eyebrow">04 / QB-000 REPORTING</p><h2>One shared escalation path.</h2></div><Send /></div><div className="report-list">{snapshot?.reports.length ? snapshot.reports.map(report => <article key={report.id}><div><Status value={report.severity === "info" ? "ready" : report.severity === "watch" ? "learning" : "attention"} /><span>{report.personaId}</span><time>{formatDate(report.createdAt)}</time></div><h3>{report.title}</h3><p>{report.summary}</p></article>) : <p className="empty-text">QB-000 will receive research, activity, and escalation reports here.</p>}</div></div>
        </section>
      </main>
    </div>
  );
}

export default function Home() {
  return <AuthGate />;
}
