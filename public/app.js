const socket = io();

// DOM refs
const zonesEl = {
  north: document.getElementById("zone-north"),
  south: document.getElementById("zone-south"),
  east:  document.getElementById("zone-east"),
  west:  document.getElementById("zone-west"),
  vip:   document.getElementById("zone-vip"),
  media: document.getElementById("zone-media"),
};
const gatesEl          = document.getElementById("gates");
const auxZonesEl       = document.getElementById("auxZones");
const alertsEl         = document.getElementById("alerts");
const tracesEl         = document.getElementById("traces");
const weatherEl        = document.getElementById("weather");
const pendingEl        = document.getElementById("pending");
const pendingContainer = document.getElementById("pendingContainer");
const approveAllBtn    = document.getElementById("approveAllBtn");
const reviewToggle     = document.getElementById("reviewToggle");
const crowdDensityBar  = document.getElementById("crowdDensityBar");
const crowdDensityPct  = document.getElementById("crowdDensityPct");
const crowdLiveView     = document.getElementById("crowdLiveView");
const crowdViewLabel    = document.getElementById("crowdViewLabel");
const happyPathBtn     = document.getElementById("happyPathBtn");
const resetBtn         = document.getElementById("resetBtn");
const fillBtn          = document.getElementById("fillBtn");
const kpiFans          = document.getElementById("kpi-fans");
const kpiCritical      = document.getElementById("kpi-critical");
const kpiTickets       = document.getElementById("kpi-tickets");
const agentBadgesEl    = document.getElementById("agentBadges");
const actionBanner     = document.getElementById("actionBanner");
const actionBannerText = document.getElementById("actionBannerText");
const matchPhasesEl    = document.getElementById("matchPhases");
const reasoningSpotlightEl = document.getElementById("reasoningSpotlight");
const openReasoningModalBtn = document.getElementById("openReasoningModalBtn");
const openReasoningModalBtn2 = document.getElementById("openReasoningModalBtn2");
const reasoningModal = document.getElementById("reasoningModal");
const closeReasoningModalBtn = document.getElementById("closeReasoningModal");
const reasoningModalListEl = document.getElementById("reasoningModalList");
const clearFilterBtn   = document.getElementById("clearFilterBtn");
const camTotalEl       = document.getElementById("cam-total");
const camStaffEl       = document.getElementById("cam-staff");
const camFansCountEl   = document.getElementById("cam-fans-count");
const camFansBarEl     = document.getElementById("cam-fans-bar");
const camFansPctEl     = document.getElementById("cam-fans-pct");
const camConfidenceEl  = document.getElementById("cameraConfidence");
const cameraFocusBannerEl = document.getElementById("cameraFocusBanner");
const agentModal      = document.getElementById("agentModal");
const modalAgentName  = document.getElementById("modalAgentName");
const modalAgentRole  = document.getElementById("modalAgentRole");
const modalAgentBio   = document.getElementById("modalAgentBio");
const modalAgentIcon  = document.getElementById("modalAgentIcon");
const modalAgentStatus = document.getElementById("modalAgentStatus");
const suggestedQuestionsEl = document.getElementById("suggestedQuestions");
const chatHistory     = document.getElementById("chatHistory");
const chatInput       = document.getElementById("chatInput");
const sendQueryBtn    = document.getElementById("sendQuery");
const closeModalBtn   = document.getElementById("closeModal");
const zoneQuickPickEl = document.getElementById("zoneQuickPick");
const zoneInspectorNameEl = document.getElementById("zoneInspectorName");
const zoneInspectorOccupancyEl = document.getElementById("zoneInspectorOccupancy");
const zoneInspectorRiskEl = document.getElementById("zoneInspectorRisk");
const zoneInspectorEventsCountEl = document.getElementById("zoneInspectorEventsCount");
const zoneInspectorBarEl = document.getElementById("zoneInspectorBar");
const zoneRecentEventsEl = document.getElementById("zoneRecentEvents");
const zoneSurgeBtn = document.getElementById("zoneSurgeBtn");
const zoneMedicalBtn = document.getElementById("zoneMedicalBtn");
const zoneFireBtn = document.getElementById("zoneFireBtn");
const zoneParkingEmergencyBtn = document.getElementById("zoneParkingEmergencyBtn");
const parkingModeBadgeEl = document.getElementById("parkingModeBadge");
const parkingOccupiedEl = document.getElementById("parkingOccupied");
const parkingEmergencyLaneEl = document.getElementById("parkingEmergencyLane");
const parkingPctEl = document.getElementById("parkingPct");
const parkingBarEl = document.getElementById("parkingBar");
const parkingOverflowEl = document.getElementById("parkingOverflow");
const incidentModal = document.getElementById("incidentModal");
const closeIncidentModalBtn = document.getElementById("closeIncidentModal");
const incidentModalTitleEl = document.getElementById("incidentModalTitle");
const incidentModalZoneEl = document.getElementById("incidentModalZone");
const incidentModalSeverityEl = document.getElementById("incidentModalSeverity");
const incidentModalStepsEl = document.getElementById("incidentModalSteps");
const incidentAcceptBtn = document.getElementById("incidentAcceptBtn");
const incidentRejectBtn = document.getElementById("incidentRejectBtn");

let token         = "";
let ticketCount   = 38000;
let bannerTimeout = null;
let isAuthenticated = false;
let selectedAgentFilter = null;
let latestState = null;
let selectedZoneId = "north";
let activeIncidentModalId = null;
let initialIncidentsSeeded = false;
const seenIncidentIds = new Set();
const scheduledIncidentTimers = new Map();
const INCIDENT_NOTIFICATION_DELAY_MS = 60 * 1000;

// ─── Auth ────────────────────────────────────────────────────────────────────
const api = async (url, options = {}) => {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return res.json().catch(() => ({}));
};

const login = async () => {
  const result = await api("/api/auth/login", {
    method: "POST",
    body:   JSON.stringify({ username: "security", password: "admin123" })
  });
  token = result.token;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getStatusColors = (pct) => {
  if (pct >= 85) return { bg: "bg-red-500/20",    border: "border-red-500/50",    text: "text-red-400",    pulse: "pulse-red" };
  if (pct >= 65) return { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400", pulse: "" };
  return              { bg: "bg-green-500/20",   border: "border-green-500/50",   text: "text-green-400",  pulse: "" };
};

const alertBorderColor = (msg) => {
  const m = msg.toLowerCase();
  if (m.includes("fire") || m.includes("critical") || m.includes("evacuate")) return "border-red-500";
  if (m.includes("surge") || m.includes("capacity") || m.includes("reroute")) return "border-orange-400";
  if (m.includes("rain")  || m.includes("weather"))                            return "border-yellow-400";
  if (m.includes("approved") || m.includes("resolved") || m.includes("online")) return "border-green-500";
  return "border-blue-500";
};

const showBanner = (text) => {
  actionBannerText.textContent = text;
  actionBanner.classList.remove("hidden");
  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => actionBanner.classList.add("hidden"), 5000);
};

const setControlsEnabled = (enabled) => {
  const ids = ["reviewToggle", "resetBtn", "fillBtn", "happyPathBtn", "approveAllBtn", "zoneSurgeBtn", "zoneMedicalBtn", "zoneFireBtn", "zoneParkingEmergencyBtn"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  document.querySelectorAll("button[data-type]").forEach((btn) => {
    btn.disabled = !enabled;
  });
};

const getRiskMeta = (pct) => {
  if (pct >= 85) return { label: "Critical", className: "text-red-400", bar: "bg-red-500" };
  if (pct >= 65) return { label: "Busy", className: "text-yellow-400", bar: "bg-yellow-500" };
  return { label: "Safe", className: "text-green-400", bar: "bg-green-500" };
};

const getParkingSnapshot = (state) => {
  if (state?.parkingManagement) return state.parkingManagement;
  const parkingZone = state?.zones?.find((z) => z.id === "parking");
  const gateAZone = state?.zones?.find((z) => z.id === "gate_a");
  const gateBZone = state?.zones?.find((z) => z.id === "gate_b");
  const totalSpots = 6000;
  const occupiedEstimate = Math.max(
    800,
    Math.min(
      totalSpots,
      (parkingZone?.currentCount || 0) * 6 + Math.floor(((gateAZone?.currentCount || 0) + (gateBZone?.currentCount || 0)) * 0.4)
    )
  );
  return {
    totalSpots,
    occupiedSpots: occupiedEstimate,
    emergencyLaneOpen: true,
    overflowActive: Math.round((occupiedEstimate / totalSpots) * 100) >= 88,
    incidentMode: false,
    updatedAt: new Date().toISOString()
  };
};

const setSelectedZone = (zoneId) => {
  selectedZoneId = zoneId;
};

const triggerZoneIncident = async (type) => {
  if (!isAuthenticated) {
    showBanner("Waiting for secure login token...");
    return;
  }
  const effectiveZoneId = type === "parking_emergency" ? "parking" : selectedZoneId;
  const selectedZone = latestState?.zones?.find((z) => z.id === effectiveZoneId);
  const zoneLabel = selectedZone?.name || effectiveZoneId;
  const label = {
    crowd_surge: "Crowd Surge",
    medical: "Medical Emergency",
    fire: "Fire Alert",
    parking_emergency: "Parking Emergency"
  }[type] || type;
  try {
    await api("/api/incident", {
      method: "POST",
      body: JSON.stringify({
        type,
        zoneId: effectiveZoneId,
        severity: type === "fire" || type === "parking_emergency" ? "high" : "medium",
        message: `Interactive Console: ${label} in ${zoneLabel}.`
      })
    });
    showBanner(`[ZONE ACTION] ${label} triggered for ${zoneLabel}.`);
  } catch (err) {
    showBanner(err.message || "Failed to trigger incident.");
  }
};

const renderZoneQuickPick = (zones) => {
  if (!zoneQuickPickEl) return;
  zoneQuickPickEl.innerHTML = zones.map((z) => {
    const selected = z.id === selectedZoneId;
    const pct = Math.round((z.currentCount / z.capacity) * 100);
    return `
      <button
        class="zone-chip text-left rounded-lg border px-2 py-1.5 transition-all ${
          selected
            ? "bg-blue-500/20 border-blue-400 text-blue-200 ring-1 ring-blue-300"
            : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800"
        }"
        data-zone-id="${z.id}"
      >
        <div class="text-[10px] font-bold">${z.name}</div>
        <div class="text-[9px] mono opacity-70">${pct}%</div>
      </button>
    `;
  }).join("");
};

const buildIncidentAutomationSteps = (incident) => {
  const map = {
    medical: [
      "Security notified to clear and sanitize surrounding area.",
      "Medical unit dispatched with fastest route access.",
      "Public guidance issued to keep emergency lane open."
    ],
    fire: [
      "Emergency message sent to fire-response security teams.",
      "Evacuation instruction issued for nearby spectators.",
      "Camera AI focus shifted to impacted gate/concourse zone."
    ],
    crowd_surge: [
      "Steward teams rerouting flow from congested zone.",
      "Overflow gates prepared to reduce pressure points.",
      "Live density tracking raised to high-frequency mode."
    ],
    weather: [
      "Weather advisory broadcast to all screens.",
      "Ground and shelter teams activated for safety protocol.",
      "Camera AI focus shifted to exposed concourse areas."
    ],
    parking_emergency: [
      "Emergency parking lane opened for priority vehicle movement.",
      "Security redirected incoming vehicles to overflow lot.",
      "Camera AI focus shifted to parking ingress and emergency corridor."
    ]
  };
  return map[incident.type] || ["Automated response initiated by command center AI."];
};

const openIncidentModal = (incident, state) => {
  if (!incidentModal || !incidentModalTitleEl || !incidentModalZoneEl || !incidentModalSeverityEl || !incidentModalStepsEl) return;
  const zone = state.zones.find((z) => z.id === incident.zoneId);
  incidentModalTitleEl.textContent = `${incident.type.replace("_", " ").toUpperCase()} Automation`;
  incidentModalZoneEl.textContent = zone ? zone.name : incident.zoneId;
  incidentModalSeverityEl.textContent = incident.severity.toUpperCase();
  activeIncidentModalId = incident.id;
  const steps = buildIncidentAutomationSteps(incident);
  incidentModalStepsEl.innerHTML = steps
    .map((step) => `<div class="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-slate-300">• ${step}</div>`)
    .join("");
  incidentModal.classList.remove("hidden");
};

const scheduleIncidentNotification = (incident) => {
  if (!incident || incident.status !== "open") return;
  if (seenIncidentIds.has(incident.id) || scheduledIncidentTimers.has(incident.id)) return;

  seenIncidentIds.add(incident.id);
  const createdAtMs = new Date(incident.createdAt).getTime();
  const elapsedMs = Date.now() - createdAtMs;
  const delayMs = Math.max(INCIDENT_NOTIFICATION_DELAY_MS - elapsedMs, 0);

  const timerId = setTimeout(() => {
    scheduledIncidentTimers.delete(incident.id);
    const latestIncident = latestState?.incidents?.find((item) => item.id === incident.id);
    if (!latestIncident || latestIncident.status !== "open" || !latestState) return;
    setSelectedZone(latestIncident.zoneId);
    openIncidentModal(latestIncident, latestState);
  }, delayMs);

  scheduledIncidentTimers.set(incident.id, timerId);
};

const reviewActiveIncident = async (decision) => {
  if (!activeIncidentModalId) return;
  try {
    await api(`/api/incidents/${activeIncidentModalId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision })
    });
    showBanner(
      decision === "accept"
        ? "[CONTROL ROOM] Incident authorized as handled."
        : "[CONTROL ROOM] Incident rejected and escalated."
    );
    if (incidentModal) incidentModal.classList.add("hidden");
    activeIncidentModalId = null;
  } catch (err) {
    showBanner(err.message || "Failed to review incident.");
  }
};

const getPriorityRankMap = (incidentType) => {
  const order = getIncidentPriorityAgents(incidentType);
  return order.reduce((acc, name, idx) => {
    acc[name] = idx;
    return acc;
  }, {});
};

const getPrioritizedTraces = (state, traces) => {
  const openIncident = state.incidents.find((incident) => incident.status === "open");
  if (!openIncident) return traces;
  const rankMap = getPriorityRankMap(openIncident.type);
  return [...traces].sort((a, b) => {
    const rankA = rankMap[a.agent] ?? 99;
    const rankB = rankMap[b.agent] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return 0;
  });
};

const renderReasoningModal = (state) => {
  if (!reasoningModalListEl) return;
  const spotlight = getSpotlightTrace(state);
  const baseTraces = selectedAgentFilter
    ? state.agentTraces.filter((t) => t.agent === selectedAgentFilter)
    : state.agentTraces;
  const modalTraces = getPrioritizedTraces(state, baseTraces).slice(0, 60);
  const focusHeader = spotlight
    ? `<div class="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-300">
         Current focus: <span class="font-bold">[${spotlight.agent}]</span> ${spotlight.thought}
       </div>`
    : "";

  reasoningModalListEl.innerHTML = `${focusHeader}${modalTraces.map((t) => `
    <div class="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
      <div class="flex justify-between items-center">
        <span class="text-blue-400 font-bold uppercase tracking-tighter text-[10px]">[${t.agent}]</span>
        <span class="text-slate-600 text-[9px]">${t.at}</span>
      </div>
      <div class="text-slate-400 italic text-[12px]">" ${t.thought} "</div>
      <div class="text-blue-300 font-bold text-[12px]">➔ ${t.action}</div>
    </div>
  `).join("")}`;
};

const getIncidentPriorityAgents = (incidentType) => {
  if (incidentType === "weather") {
    return ["Meteorologist", "Incident Commander", "Comms Officer", "Supervisor", "Sentinel"];
  }
  if (incidentType === "fire" || incidentType === "crowd_surge" || incidentType === "parking_emergency") {
    return ["Incident Commander", "Comms Officer", "Supervisor", "Sentinel", "Meteorologist"];
  }
  if (incidentType === "medical") {
    return ["Incident Commander", "Comms Officer", "Supervisor", "Sentinel", "Meteorologist"];
  }
  return ["Sentinel", "Meteorologist", "Incident Commander", "Comms Officer", "Supervisor"];
};

const getSpotlightTrace = (state) => {
  if (selectedAgentFilter) {
    return state.agentTraces.find((t) => t.agent === selectedAgentFilter) || null;
  }

  const openIncident = state.incidents.find((incident) => incident.status === "open");
  if (openIncident) {
    const priority = getIncidentPriorityAgents(openIncident.type);
    for (const agentName of priority) {
      const trace = state.agentTraces.find((t) => t.agent === agentName);
      if (trace) return trace;
    }
  }

  return state.agentTraces[0] || null;
};

// ─── Match Phase Ticker ───────────────────────────────────────────────────────
const PHASES = ["Pre-Match", "Innings 1", "Drinks Break", "Innings 2", "Post-Match"];
let currentPhase = 0;
const renderPhases = () => {
  matchPhasesEl.innerHTML = PHASES.map((p, i) => {
    let cls = "px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider mono ";
    if (i === currentPhase)  cls += "phase-active";
    else if (i < currentPhase) cls += "phase-done";
    else                       cls += "text-slate-600 border-slate-800";
    return `<span class="${cls}">${p}</span>`;
  }).join('<span class="text-slate-700 text-xs">›</span>');
};
renderPhases();
setInterval(() => {
  currentPhase = (currentPhase + 1) % PHASES.length;
  renderPhases();
}, 45000);

// ─── Agent Badges ─────────────────────────────────────────────────────────────
const AGENTS = [
  { 
    name: "Sentinel",           
    desc: "Crowd Density",   
    color: "blue",
    icon: "S",
    bio: "Specializes in real-time computer vision analysis and crowd flow optimization. Monitors zone capacities and initiates dynamic rerouting to prevent bottlenecks."
  },
  { 
    name: "Meteorologist",      
    desc: "Weather Risk",    
    color: "yellow",
    icon: "M",
    bio: "Analyzes atmospheric data and local weather patterns. Predicts rain impact on match play and initiates safety protocols for extreme heat or lightning."
  },
  { 
    name: "Incident Commander", 
    desc: "Emergency Mgmt",  
    color: "red",
    icon: "IC",
    bio: "The primary responder for critical alerts. Coordinates medical teams, fire response, and security personnel during high-severity incidents."
  },
  { 
    name: "Comms Officer",      
    desc: "Public Announcements",  
    color: "green",
    icon: "CO",
    bio: "Manages public information channels. Generates calm, clear safety announcements for stadium screens and coordinates with external emergency services."
  },
  { 
    name: "Supervisor",         
    desc: "Oversight",       
    color: "purple",
    icon: "V",
    bio: "Monitors the overall health of the multi-agent system. Tracks operator response times for high-risk approvals and ensures system-wide synchronization."
  },
];

let currentModalAgent = null;

const getSuggestedQuestions = (agentName) => {
  const q = {
    Sentinel: [
      "Which zones are most at risk right now?",
      "Suggest immediate rerouting actions.",
      "What is overall stadium density?"
    ],
    Meteorologist: [
      "Do we need rain protocol in the next 30 minutes?",
      "Any heat risk for spectators?",
      "What is the current weather trend?"
    ],
    "Incident Commander": [
      "What is the immediate response plan?",
      "Which teams should be deployed first?",
      "Any high-risk approvals pending?"
    ],
    "Comms Officer": [
      "Draft a calm public announcement.",
      "What should we show on stadium screens?",
      "How should we message this to fans?"
    ],
    Supervisor: [
      "Give me overall system health.",
      "Any blocked decisions right now?",
      "What should operator prioritize now?"
    ]
  };
  return q[agentName] || ["Give me your current status."];
};

const buildAgentStatusCards = (agentName) => {
  if (!latestState || !modalAgentStatus) return;
  const totalFans = latestState.zones.reduce((s, z) => s + z.currentCount, 0);
  const criticalZones = latestState.zones.filter((z) => (z.currentCount / z.capacity) >= 0.85).length;
  const pendingApprovals = latestState.pendingActions.filter((a) => a.status === "pending").length;
  const latestAlert = latestState.alerts[0] || "No active alerts";
  const aiBudget = latestState.aiBudget || null;

  const cardMap = {
    Sentinel: [
      ["Critical Zones", `${criticalZones}`],
      ["Total Fans", totalFans.toLocaleString()],
      ["North Stand", `${Math.round((latestState.zones.find(z => z.id === "north")?.currentCount || 0) / 10000 * 100)}%`],
      ["Gate B Flow", `${latestState.gates.find(g => g.id === "B")?.flowPerMin || 0}/min`]
    ],
    Meteorologist: [
      ["Temperature", `${Math.round(latestState.weather.temperature)}C`],
      ["Rain Probability", `${Math.round(latestState.weather.rainProbability)}%`],
      ["Wind", `${Math.round(latestState.weather.windKmph)} km/h`],
      ["Protocol", latestState.weather.rainProbability > 60 ? "Rain Standby" : "Normal"]
    ],
    "Incident Commander": [
      ["Open Incidents", `${latestState.incidents.length}`],
      ["Pending Approvals", `${pendingApprovals}`],
      ["Latest Incident", latestState.incidents[0]?.type || "None"],
      ["Severity", latestState.incidents[0]?.severity || "N/A"]
    ],
    "Comms Officer": [
      ["Latest Alert", latestAlert.slice(0, 24) + (latestAlert.length > 24 ? "..." : "")],
      ["PA Queue", `${latestState.alerts.length}`],
      ["Broadcast Mode", "Live"],
      ["Audience", `${totalFans.toLocaleString()} fans`]
    ],
    Supervisor: [
      ["System Health", "Nominal"],
      ["Pending Approvals", `${pendingApprovals}`],
      ["Trace Entries", `${latestState.agentTraces.length}`],
      ["AI Budget", aiBudget ? `${aiBudget.callsRemaining} left` : "N/A"]
    ]
  };

  const cards = cardMap[agentName] || [];
  modalAgentStatus.innerHTML = cards.map(([label, value]) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
      <div class="text-[9px] uppercase tracking-widest text-slate-500">${label}</div>
      <div class="text-[12px] font-bold text-slate-200">${value}</div>
    </div>
  `).join("");
};

const renderSuggestedQuestions = (agentName) => {
  if (!suggestedQuestionsEl) return;
  const questions = getSuggestedQuestions(agentName);
  suggestedQuestionsEl.innerHTML = questions.map((q) => `
    <button class="suggestion-chip px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-[10px] text-slate-300 transition-all" data-question="${q.replace(/"/g, "&quot;")}">
      ${q}
    </button>
  `).join("");
};

const openAgentModal = (agentName) => {
  const agent = AGENTS.find(a => a.name === agentName);
  if (!agent) return;

  currentModalAgent = agent;
  modalAgentName.textContent = agent.name;
  modalAgentRole.textContent = agent.desc;
  modalAgentBio.textContent = agent.bio;
  
  const colorMap = {
    blue:   "bg-blue-600 text-white",
    yellow: "bg-yellow-500 text-black",
    red:    "bg-red-600 text-white",
    green:  "bg-green-600 text-white",
    purple: "bg-purple-600 text-white",
  };
  modalAgentIcon.className = `w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg ${colorMap[agent.color]}`;
  modalAgentIcon.textContent = agent.icon;
  buildAgentStatusCards(agent.name);
  renderSuggestedQuestions(agent.name);

  chatHistory.innerHTML = `<div class="text-slate-500 italic">System: Secure link established with ${agent.name}. How can I assist you?</div>`;
  agentModal.classList.remove("hidden");
  
  // Also set the filter in the background
  setAgentFilter(agentName);
};

const renderAgentBadges = (lastTrace) => {
  const activeAgent = lastTrace ? lastTrace.agent : null;
  agentBadgesEl.innerHTML = AGENTS.map(a => {
    const isActive = a.name === activeAgent;
    const isFiltered = a.name === selectedAgentFilter;
    const colorMap = {
      blue:   { dot: "bg-blue-500",   badge: "bg-blue-500/10   border-blue-500/30   text-blue-300"   },
      yellow: { dot: "bg-yellow-400", badge: "bg-yellow-400/10 border-yellow-400/30 text-yellow-300" },
      red:    { dot: "bg-red-500",    badge: "bg-red-500/10    border-red-500/30    text-red-300"    },
      green:  { dot: "bg-green-500",  badge: "bg-green-500/10  border-green-500/30  text-green-300"  },
      purple: { dot: "bg-purple-500", badge: "bg-purple-500/10 border-purple-500/30 text-purple-300" },
    };
    const c = colorMap[a.color];
    return `
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:bg-white/5 transition-all ${c.badge} ${isActive ? 'ring-1 ring-current' : ''} ${isFiltered ? 'ring-2 ring-white bg-white/10' : ''}" 
           onclick="openAgentModal('${a.name}')">
        <span class="w-2 h-2 rounded-full flex-shrink-0 ${c.dot} ${isActive ? 'animate-pulse' : 'opacity-60'}"></span>
        <div>
          <div class="text-[10px] font-bold">${a.name}</div>
          <div class="text-[9px] opacity-60">${a.desc}</div>
        </div>
      </div>
    `;
  }).join("");
};

const setAgentFilter = (agentName) => {
  selectedAgentFilter = agentName;
  if (clearFilterBtn) clearFilterBtn.classList.remove("hidden");
  
  // Scroll to traces
  const tracesContainer = document.getElementById("traces");
  if (tracesContainer) tracesContainer.scrollTop = 0;
};
window.setAgentFilter = setAgentFilter;
window.openAgentModal = openAgentModal;

if (clearFilterBtn) {
  clearFilterBtn.addEventListener("click", () => {
    selectedAgentFilter = null;
    clearFilterBtn.classList.add("hidden");
    showBanner("Showing reasoning for all agents.");
  });
}

const handleAgentQuery = async () => {
  const query = chatInput.value.trim();
  if (!query || !currentModalAgent) return;

  // Add user message to chat
  const userMsg = document.createElement("div");
  userMsg.className = "text-blue-300 mb-2";
  userMsg.innerHTML = `<span class="font-bold">Operator:</span> ${query}`;
  chatHistory.appendChild(userMsg);
  chatInput.value = "";
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Show thinking
  const thinkingMsg = document.createElement("div");
  thinkingMsg.className = "text-slate-500 italic mb-2 animate-pulse";
  thinkingMsg.textContent = `${currentModalAgent.name} is analyzing...`;
  chatHistory.appendChild(thinkingMsg);

  try {
    const result = await api(`/api/agents/${encodeURIComponent(currentModalAgent.name)}/query`, {
      method: "POST",
      body: JSON.stringify({ query })
    });
    
    thinkingMsg.remove();
    const agentMsg = document.createElement("div");
    agentMsg.className = "text-white mb-2";
    agentMsg.innerHTML = `<span class="font-bold text-blue-400">${currentModalAgent.name}:</span> ${result.response}`;
    chatHistory.appendChild(agentMsg);
  } catch (err) {
    thinkingMsg.textContent = `Error: ${err.message}`;
    thinkingMsg.classList.remove("animate-pulse");
    thinkingMsg.classList.add("text-red-400");
  }
  
  chatHistory.scrollTop = chatHistory.scrollHeight;
};

if (sendQueryBtn) {
  sendQueryBtn.addEventListener("click", handleAgentQuery);
}
if (chatInput) {
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAgentQuery();
  });
}
if (suggestedQuestionsEl) {
  suggestedQuestionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".suggestion-chip");
    if (!btn || !chatInput) return;
    chatInput.value = btn.dataset.question || "";
    handleAgentQuery();
  });
}
if (zoneQuickPickEl) {
  zoneQuickPickEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".zone-chip");
    if (!btn) return;
    const zoneId = btn.dataset.zoneId;
    if (!zoneId) return;
    setSelectedZone(zoneId);
  });
}
if (auxZonesEl) {
  auxZonesEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-zone-card]");
    if (!btn) return;
    const zoneId = btn.dataset.zoneCard;
    if (!zoneId) return;
    setSelectedZone(zoneId);
  });
}
if (zoneSurgeBtn) {
  zoneSurgeBtn.addEventListener("click", () => triggerZoneIncident("crowd_surge"));
}
if (zoneMedicalBtn) {
  zoneMedicalBtn.addEventListener("click", () => triggerZoneIncident("medical"));
}
if (zoneFireBtn) {
  zoneFireBtn.addEventListener("click", () => triggerZoneIncident("fire"));
}
if (zoneParkingEmergencyBtn) {
  zoneParkingEmergencyBtn.addEventListener("click", () => {
    setSelectedZone("parking");
    triggerZoneIncident("parking_emergency");
  });
}
if (closeModalBtn && agentModal) {
  closeModalBtn.addEventListener("click", () => {
    agentModal.classList.add("hidden");
    currentModalAgent = null;
  });
}
if (closeIncidentModalBtn && incidentModal) {
  closeIncidentModalBtn.addEventListener("click", () => {
    incidentModal.classList.add("hidden");
    activeIncidentModalId = null;
    showBanner("Incident review dismissed. Control room can review it later from alerts.");
  });
}
if (incidentModal) {
  incidentModal.addEventListener("click", (e) => {
    if (e.target === incidentModal) {
      incidentModal.classList.add("hidden");
      activeIncidentModalId = null;
    }
  });
}
if (openReasoningModalBtn) {
  openReasoningModalBtn.addEventListener("click", () => {
    if (!reasoningModal || !latestState) return;
    renderReasoningModal(latestState);
    reasoningModal.classList.remove("hidden");
  });
}
if (openReasoningModalBtn2) {
  openReasoningModalBtn2.addEventListener("click", () => {
    if (!reasoningModal || !latestState) return;
    renderReasoningModal(latestState);
    reasoningModal.classList.remove("hidden");
  });
}
if (closeReasoningModalBtn && reasoningModal) {
  closeReasoningModalBtn.addEventListener("click", () => {
    reasoningModal.classList.add("hidden");
  });
}
if (reasoningModal) {
  reasoningModal.addEventListener("click", (e) => {
    if (e.target === reasoningModal) {
      reasoningModal.classList.add("hidden");
    }
  });
}
if (incidentAcceptBtn) {
  incidentAcceptBtn.addEventListener("click", () => reviewActiveIncident("accept"));
}
if (incidentRejectBtn) {
  incidentRejectBtn.addEventListener("click", () => reviewActiveIncident("reject"));
}

// Close on background click
if (agentModal) {
  agentModal.addEventListener("click", (e) => {
    if (e.target === agentModal) {
      agentModal.classList.add("hidden");
      currentModalAgent = null;
    }
  });
}

// ─── Main Render ──────────────────────────────────────────────────────────────
const render = (state) => {
  latestState = state;
  // Weather
  const temp = Math.round(state.weather.temperature);
  const rain = Math.round(state.weather.rainProbability);
  weatherEl.innerHTML = `<span class="text-blue-400">T:</span>${temp}°C &nbsp;
    <span class="text-blue-400">R:</span>${rain}% &nbsp;
    <span class="text-blue-400">W:</span>${Math.round(state.weather.windKmph)}km/h`;

  reviewToggle.checked = state.humanReviewEnabled;

  // One-page zone picker (all zones visible)
  renderZoneQuickPick(state.zones);
  const selectedZone = state.zones.find((z) => z.id === selectedZoneId) || state.zones[0];
  if (selectedZone) {
    selectedZoneId = selectedZone.id;
    const selectedPct = Math.round((selectedZone.currentCount / selectedZone.capacity) * 100);
    const risk = getRiskMeta(selectedPct);
    if (zoneInspectorNameEl) zoneInspectorNameEl.textContent = selectedZone.name;
    if (zoneInspectorOccupancyEl) {
      zoneInspectorOccupancyEl.textContent = `${selectedZone.currentCount.toLocaleString()} / ${selectedZone.capacity.toLocaleString()} (${selectedPct}%)`;
    }
    if (zoneInspectorRiskEl) {
      zoneInspectorRiskEl.textContent = risk.label;
      zoneInspectorRiskEl.className = `font-bold mt-1 ${risk.className}`;
    }
    if (zoneInspectorBarEl) {
      zoneInspectorBarEl.style.width = `${selectedPct}%`;
      zoneInspectorBarEl.className = `h-full transition-all duration-500 ${risk.bar}`;
    }
    const relatedEvents = [
      ...state.incidents
        .filter((i) => i.zoneId === selectedZone.id)
        .slice(0, 4)
        .map((i) => `${new Date(i.createdAt).toLocaleTimeString()} [INCIDENT] ${i.type} (${i.severity})`),
      ...state.agentTraces
        .filter((t) => t.thought.includes(selectedZone.name) || t.action.includes(selectedZone.name))
        .slice(0, 4)
        .map((t) => `${t.at} [${t.agent}] ${t.action}`)
    ].slice(0, 6);
    if (zoneInspectorEventsCountEl) {
      zoneInspectorEventsCountEl.textContent = `${relatedEvents.length}`;
    }
    if (zoneRecentEventsEl) {
      zoneRecentEventsEl.innerHTML = relatedEvents.length
        ? relatedEvents.map((e) => `<div class="text-slate-400 border-l-2 border-slate-700 pl-2 py-1">${e}</div>`).join("")
        : `<div class="text-slate-500 italic">No recent events for this zone.</div>`;
    }
  }

  // Camera AI focus context (incident-aware)
  if (cameraFocusBannerEl) {
    const focus = state.cameraFocus;
    if (focus && focus.zoneId) {
      cameraFocusBannerEl.textContent = `Focus: ${focus.message}`;
      cameraFocusBannerEl.className = `mb-3 rounded-lg border px-3 py-2 text-[10px] mono ${
        focus.priority === "high"
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-blue-500/30 bg-blue-500/10 text-blue-300"
      }`;
    } else {
      cameraFocusBannerEl.textContent = "Focus: General monitoring across stadium zones.";
      cameraFocusBannerEl.className = "mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[10px] mono text-blue-300";
    }
  }

  // Delayed incident authorization notifications (shows after 1 minute, never on initial load)
  if (!initialIncidentsSeeded) {
    state.incidents.forEach((incident) => seenIncidentIds.add(incident.id));
    initialIncidentsSeeded = true;
  } else {
    state.incidents.forEach((incident) => {
      scheduleIncidentNotification(incident);
    });
  }

  // Clear timers for incidents that are no longer open
  for (const [incidentId, timerId] of scheduledIncidentTimers.entries()) {
    const incident = state.incidents.find((item) => item.id === incidentId);
    if (!incident || incident.status !== "open") {
      clearTimeout(timerId);
      scheduledIncidentTimers.delete(incidentId);
    }
  }

  // KPI: fans total
  const totalFans  = state.zones.reduce((s, z) => s + z.currentCount, 0);
  const totalCap   = state.zones.reduce((s, z) => s + z.capacity, 0);
  const overallPct = Math.round((totalFans / totalCap) * 100);
  kpiFans.textContent = totalFans.toLocaleString();

  // Crowd density bar & image
  if (crowdDensityBar) {
    crowdDensityBar.style.width = `${overallPct}%`;
    crowdDensityBar.className = `h-full rounded-full transition-all duration-1000 ${
      overallPct >= 85 ? "bg-red-400" : overallPct >= 65 ? "bg-yellow-400" : "bg-green-400"
    }`;
  }
  if (crowdDensityPct) crowdDensityPct.textContent = `${overallPct}%`;

  if (crowdLiveView) {
    let newSrc = "/assets/low.jpg";
    let label  = "Sparse / Baseline";
    
    if (overallPct >= 85) {
      newSrc = "/assets/high.jpg";
      label  = "Critical Capacity - North Stand";
    } else if (overallPct >= 45) {
      newSrc = "/assets/med.jpg";
      label  = "Moderate Flow - Gate B";
    }
    
    if (crowdLiveView.getAttribute("src") !== newSrc) {
      crowdLiveView.style.opacity = "0.4";
      setTimeout(() => {
        crowdLiveView.src = newSrc;
        crowdLiveView.style.opacity = "1";
      }, 300);
    }
    if (crowdViewLabel) crowdViewLabel.textContent = label;
  }

  // KPI: critical zones
  const critCount = state.zones.filter(z => (z.currentCount / z.capacity) >= 0.85).length;
  kpiCritical.textContent = `${critCount} / ${state.zones.length}`;
  kpiCritical.className = `text-2xl font-bold mono ${critCount > 0 ? "text-red-400" : "text-green-400"}`;

  // Camera AI Stats
  if (state.cameraStats) {
    if (camTotalEl) camTotalEl.textContent = state.cameraStats.totalDetected.toLocaleString();
    if (camStaffEl) camStaffEl.textContent = state.cameraStats.staffCount.toLocaleString();
    if (camFansCountEl) camFansCountEl.textContent = `${state.cameraStats.seatedFans.toLocaleString()} fans detected`;
    if (camConfidenceEl) camConfidenceEl.textContent = `${state.cameraStats.confidence}% CONF`;
    
    const fansPct = Math.round((state.cameraStats.seatedFans / 50000) * 100);
    if (camFansPctEl) camFansPctEl.textContent = `${fansPct}%`;
    if (camFansBarEl) camFansBarEl.style.width = `${fansPct}%`;
  }

  // KPI: tickets (bumped up by each tick)
  ticketCount += Math.floor(Math.random() * 15 + 3);
  kpiTickets.textContent = ticketCount.toLocaleString();

  // Zones
  const primaryZones = new Set(["north", "south", "east", "west"]);
  state.zones.forEach(zone => {
    const key = zone.id.replace("gate_", "").toLowerCase();
    const el  = zonesEl[key];
    const pct = Math.round((zone.currentCount / zone.capacity) * 100);
    const colors = getStatusColors(pct);
    const fillClass = pct >= 85 ? "fill-critical" : pct >= 65 ? "fill-busy" : "fill-safe";
    const isSelectedZone = zone.id === selectedZoneId;

    if (el && primaryZones.has(key)) {
      const areaClass = { north: "zone-north", south: "zone-south", east: "zone-east", west: "zone-west" }[key] || "";
      el.className = `${areaClass} glass rounded-xl p-2 flex flex-col justify-center items-center transition-all duration-500 cursor-pointer ${colors.border} ${colors.pulse} ${isSelectedZone ? "ring-2 ring-blue-400 shadow-lg shadow-blue-900/30" : ""}`;
      el.innerHTML = `
        <div class="zone-3d-card">
          <div class="zone-3d-fill ${fillClass}" style="height:${pct}%"></div>
          <div class="zone-3d-grid"></div>
          <div class="zone-3d-content h-full flex flex-col justify-center items-center px-3 py-4">
            <span class="text-[10px] uppercase tracking-widest font-bold text-slate-200 mb-1">${zone.name}</span>
            <span class="text-2xl font-bold ${colors.text}">${pct}%</span>
            <span class="text-[10px] mono text-slate-200/85">${zone.currentCount.toLocaleString()} / ${zone.capacity.toLocaleString()}</span>
          </div>
        </div>
      `;
      el.onclick = () => setSelectedZone(zone.id);
    } else if (el && (key === "vip" || key === "media")) {
      el.className = `absolute ${key === "vip" ? "top-4" : "bottom-4"} glass px-2 py-1 rounded text-[8px] border transition-all duration-500 cursor-pointer ${colors.text} ${colors.border} ${colors.bg} ${isSelectedZone ? "ring-2 ring-blue-400" : ""}`;
      el.innerHTML = `${key.toUpperCase()}: ${pct}%`;
      el.onclick = () => setSelectedZone(zone.id);
    }
  });

  // Auxiliary zones (gates, parking, VIP, media, food)
  if (auxZonesEl) {
    const auxZoneCards = state.zones
      .filter((zone) => !primaryZones.has(zone.id.replace("gate_", "").toLowerCase()))
      .map((zone) => {
        const pct = Math.round((zone.currentCount / zone.capacity) * 100);
        const colors = getStatusColors(pct);
        const selected = zone.id === selectedZoneId;
        const barTone = pct >= 85 ? "bg-red-500" : pct >= 65 ? "bg-orange-400" : "bg-emerald-400";
        return `
          <button
            data-zone-card="${zone.id}"
            class="glass rounded-xl p-3 text-left transition-all duration-500 border ${colors.border} ${selected ? "ring-2 ring-blue-400 shadow-lg shadow-blue-900/30" : ""}">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase tracking-widest font-bold text-slate-300">${zone.name}</span>
                <span class="text-sm font-bold ${colors.text} mono">${pct}%</span>
              </div>
              <div class="w-full h-2 bg-slate-900/70 rounded-full overflow-hidden">
                <div class="h-full ${barTone} transition-all duration-700" style="width:${pct}%"></div>
              </div>
              <div class="text-[10px] mono text-slate-400">
                ${zone.currentCount.toLocaleString()} / ${zone.capacity.toLocaleString()}
              </div>
            </div>
          </button>
        `;
      })
      .join("");
    auxZonesEl.innerHTML = auxZoneCards;
  }

  const parkingState = getParkingSnapshot(state);
  if (parkingState) {
    const parkingPct = Math.round((parkingState.occupiedSpots / parkingState.totalSpots) * 100);
    if (parkingOccupiedEl) parkingOccupiedEl.textContent = `${parkingState.occupiedSpots.toLocaleString()} / ${parkingState.totalSpots.toLocaleString()}`;
    if (parkingEmergencyLaneEl) parkingEmergencyLaneEl.textContent = parkingState.emergencyLaneOpen ? "Open" : "Closed";
    if (parkingPctEl) parkingPctEl.textContent = `${parkingPct}%`;
    if (parkingBarEl) {
      parkingBarEl.style.width = `${parkingPct}%`;
      parkingBarEl.className = `h-full transition-all duration-1000 ${parkingPct >= 88 ? "bg-red-500" : parkingPct >= 70 ? "bg-orange-400" : "bg-purple-500"}`;
    }
    if (parkingOverflowEl) {
      parkingOverflowEl.textContent = parkingState.overflowActive
        ? "Overflow lot active"
        : "Overflow lot on standby";
      parkingOverflowEl.className = `text-[10px] mono text-right ${parkingState.overflowActive ? "text-orange-400" : "text-slate-500"}`;
    }
    if (parkingModeBadgeEl) {
      parkingModeBadgeEl.textContent = parkingState.incidentMode ? "Emergency" : "Normal";
      parkingModeBadgeEl.className = `text-[9px] px-2 py-0.5 rounded uppercase mono tracking-widest ${
        parkingState.incidentMode ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-400"
      }`;
    }
  }

  // Gates
  gatesEl.innerHTML = state.gates.map(gate => {
    const rerouted = gate.status === "rerouted";
    const closed   = gate.status === "closed";
    const focusedGate = state.cameraFocus?.gateId === gate.id;
    const dotColor = closed ? "bg-red-500" : rerouted ? "bg-orange-500 animate-pulse" : "bg-green-500";
    const boxColor = closed ? "border-red-500/40 bg-red-500/10" : rerouted ? "border-orange-500/40 bg-orange-500/10" : "border-slate-700 bg-slate-800/50";
    const flowPct = Math.min(100, Math.round((gate.flowPerMin / 260) * 100));
    const flowTone = flowPct >= 85 ? "bg-red-500" : flowPct >= 65 ? "bg-orange-400" : "bg-emerald-400";
    return `
      <div class="p-3 rounded-lg border ${boxColor} ${focusedGate ? "ring-2 ring-red-400 shadow-lg shadow-red-900/30" : ""}">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs font-bold text-slate-400">GATE ${gate.id}</span>
          <span class="w-2 h-2 rounded-full ${focusedGate ? "bg-red-400 animate-ping" : dotColor}"></span>
        </div>
        <div class="text-lg font-bold mono">${gate.flowPerMin}</div>
        <div class="text-[10px] text-slate-500 uppercase tracking-tighter">${focusedGate ? `${gate.status} • focus` : gate.status}</div>
        <div class="mt-2 w-full h-1.5 bg-slate-900/70 rounded-full overflow-hidden">
          <div class="h-full ${flowTone} transition-all duration-700" style="width:${flowPct}%"></div>
        </div>
      </div>
    `;
  }).join("");

  // Alerts (color-coded)
  alertsEl.innerHTML = state.alerts.slice(0, 20).map(item => {
    const border = alertBorderColor(item);
    return `<div class="px-2 py-1.5 rounded bg-slate-800/30 border-l-2 ${border} text-xs leading-snug">${item}</div>`;
  }).join("");

  // Agent trace + badges
  const latestTrace = state.agentTraces[0] || null;
  const spotlightTrace = getSpotlightTrace(state);
  renderAgentBadges(spotlightTrace || latestTrace);

  // Spotlight: always visible latest reasoning (no right-side scrolling needed)
  if (reasoningSpotlightEl) {
    if (spotlightTrace) {
      reasoningSpotlightEl.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-blue-400 text-[10px] font-bold uppercase">[${spotlightTrace.agent}]</span>
          <span class="text-slate-500 text-[10px]">${spotlightTrace.at}</span>
        </div>
        <div class="text-slate-300 text-[12px]">${spotlightTrace.thought}</div>
        <div class="text-blue-300 text-[12px] font-semibold mt-1">➔ ${spotlightTrace.action}</div>
      `;
    } else {
      reasoningSpotlightEl.textContent = "Waiting for agent reasoning...";
    }
  }

  const filteredTraces = selectedAgentFilter 
    ? state.agentTraces.filter(t => t.agent === selectedAgentFilter)
    : state.agentTraces;

  tracesEl.innerHTML = filteredTraces.slice(0, 8).map(t => `
    <div class="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
      <div class="flex justify-between items-center">
        <span class="text-blue-400 font-bold uppercase tracking-tighter text-[10px]">[${t.agent}]</span>
        <span class="text-slate-600 text-[9px]">${t.at}</span>
      </div>
      <div class="text-slate-400 italic text-[11px]">" ${t.thought} "</div>
      <div class="text-blue-300 font-bold text-[11px]">➔ ${t.action}</div>
    </div>
  `).join("");

  // Pending approvals
  const pending = state.pendingActions.filter(a => a.status === "pending");
  if (pending.length > 0) {
    pendingContainer.classList.remove("hidden");
    if (approveAllBtn) approveAllBtn.classList.remove("hidden");
    pendingEl.innerHTML = pending.map(a => `
      <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-3">
        <div class="flex justify-between items-start">
          <span class="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase">${a.source}</span>
          <span class="text-[10px] text-blue-400 mono">${new Date(a.createdAt).toLocaleTimeString()}</span>
        </div>
        <p class="text-sm font-medium text-slate-200">${a.action}</p>
        <button data-approve="${a.id}" class="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-all">
          APPROVE ACTION
        </button>
      </div>
    `).join("");
  } else {
    pendingContainer.classList.add("hidden");
    if (approveAllBtn) approveAllBtn.classList.add("hidden");
  }
};

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.querySelectorAll("button[data-type]").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!isAuthenticated) {
      showBanner("Waiting for secure login token...");
      return;
    }
    const type   = btn.dataset.type;
    const zoneId = type === "weather" ? "gate_a" : "gate_b";
    const label  = { crowd_surge: "Crowd Surge", medical: "Medical Emergency", fire: "Fire Alert", weather: "Rain Protocol" }[type] || type;
    showBanner(`[AGENT ACTION] ${label} triggered — agents activated`);
    try {
      await api("/api/incident", {
        method: "POST",
        body:   JSON.stringify({ type, zoneId, severity: type === "fire" ? "high" : "medium", message: `Simulated: ${label} detected.` })
      });
    } catch (e) { console.error(e); }
  });
});

reviewToggle.addEventListener("change", async () => {
  if (!isAuthenticated) return;
  try {
    await api("/api/toggle-review", { method: "POST", body: JSON.stringify({ enabled: reviewToggle.checked }) });
    showBanner(`Agent oversight ${reviewToggle.checked ? "enabled — high-risk actions need approval" : "disabled — full autonomous mode"}`);
  } catch (e) { console.error(e); }
});

pendingEl.addEventListener("click", async (e) => {
  if (!isAuthenticated) return;
  const btn = e.target.closest("button[data-approve]");
  if (!btn) return;
  btn.disabled    = true;
  btn.textContent = "EXECUTING...";
  try {
    await api(`/api/pending-actions/${btn.dataset.approve}/approve`, { method: "POST" });
    showBanner("[APPROVED] High-risk action executed by operator.");
  } catch (err) {
    showBanner(err.message || "Failed to approve action.");
    btn.disabled    = false;
    btn.textContent = "APPROVE ACTION";
  }
});

if (approveAllBtn) {
  approveAllBtn.addEventListener("click", async () => {
    if (!isAuthenticated) return;
    approveAllBtn.disabled = true;
    approveAllBtn.textContent = "Approving...";
    try {
      const result = await api("/api/pending-actions/approve-all", { method: "POST" });
      showBanner(`[APPROVED] Approved ${result.count} pending high-risk actions.`);
    } catch (err) {
      showBanner(err.message || "Failed to approve all actions.");
    } finally {
      approveAllBtn.disabled = false;
      approveAllBtn.textContent = "Approve All";
    }
  });
}

resetBtn.addEventListener("click", async () => {
  if (!isAuthenticated) return;
  if (!confirm("Reset all zone counts, incidents, and alerts to baseline?")) return;
  resetBtn.disabled    = true;
  resetBtn.textContent = "🔄 Resetting...";
  try {
    await api("/api/reset", { method: "POST" });
    showBanner("[SYSTEM RESET] Stadium cleared. All zones back to baseline.");
  } catch (e) {
    console.error(e);
  } finally {
    resetBtn.disabled    = false;
    resetBtn.textContent = "🔄 Reset System";
  }
});

fillBtn.addEventListener("click", async () => {
  if (!isAuthenticated) return;
  fillBtn.disabled    = true;
  fillBtn.textContent = "📈 Filling...";
  try {
    await api("/api/simulate-inflow", { method: "POST" });
    showBanner("[INFLOW] Sudden crowd increase simulated. Stadium reaching capacity.");
  } catch (e) {
    console.error(e);
  } finally {
    fillBtn.disabled    = false;
    fillBtn.textContent = "📈 Simulate Inflow";
  }
});

happyPathBtn.addEventListener("click", async () => {
  if (!isAuthenticated) return;
  happyPathBtn.disabled    = true;
  happyPathBtn.textContent = "🚀 Running...";
  const steps = [
    { type: "weather",    msg: "Rain front approaching stadium." },
    { type: "crowd_surge", msg: "Gate B density surge detected." },
    { type: "medical",    msg: "Fan collapsed near concourse." },
    { type: "parking_emergency", msg: "Parking entry blocked near emergency lane." }
  ];
  for (const step of steps) {
    showBanner(`[DEMO] Triggering ${step.type.replace("_", " ")}...`);
    try {
      await api("/api/incident", {
        method: "POST",
        body: JSON.stringify({
          type: step.type,
          zoneId: step.type === "weather" ? "gate_a" : step.type === "parking_emergency" ? "parking" : "gate_b",
          severity: step.type === "parking_emergency" ? "high" : "medium",
          message: step.msg
        })
      });
    } catch (e) { console.error(e); }
    await new Promise(r => setTimeout(r, 4000));
  }
  showBanner("[DEMO] Run Full Demo complete — all agents responded.");
  happyPathBtn.disabled    = false;
  happyPathBtn.textContent = "🚀 Run Full Demo";
});

socket.on("state:update", render);
setControlsEnabled(false);
login()
  .then(() => {
    isAuthenticated = true;
    setControlsEnabled(true);
    showBanner("Secure operator session established.");
  })
  .catch((err) => {
    console.error(err);
    showBanner("Login failed. Check DEMO_USERNAME / DEMO_PASSWORD.");
  });

// ─── Crowd Image Logic ────────────────────────────────────────────────────────
// (Logic moved into main render function to be density-driven)
