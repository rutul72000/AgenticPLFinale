import "dotenv/config";
import http from "http";
import path from "path";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Server } from "socket.io";
import { z } from "zod";
import pino from "pino";
import Groq from "groq-sdk";

type IncidentType = "crowd_surge" | "medical" | "fire" | "weather" | "parking_emergency";

type Zone = {
  id: string;
  name: string;
  capacity: number;
  currentCount: number;
};

type Gate = {
  id: string;
  flowPerMin: number;
  status: "open" | "rerouted" | "closed";
};

type WeatherState = {
  temperature: number;
  rainProbability: number;
  windKmph: number;
};

type Incident = {
  id: string;
  type: IncidentType;
  zoneId: string;
  severity: "low" | "medium" | "high";
  message: string;
  createdAt: string;
  status: "open" | "accepted" | "rejected";
  reviewedAt?: string;
};

type PendingAction = {
  id: string;
  action: string;
  risk: "low" | "high";
  source: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
};

type AgentTrace = {
  at: string;
  agent: string;
  thought: string;
  action: string;
};

type CameraStats = {
  totalDetected: number;
  seatedFans: number;
  staffCount: number;
  confidence: number;
};

type ParkingManagement = {
  totalSpots: number;
  occupiedSpots: number;
  emergencyLaneOpen: boolean;
  overflowActive: boolean;
  incidentMode: boolean;
  updatedAt: string;
};

type CameraFocus = {
  zoneId: string;
  gateId: string;
  incidentType: IncidentType | "none";
  message: string;
  priority: "normal" | "high";
  updatedAt: string;
};

type AppState = {
  generatedAt: string;
  humanReviewEnabled: boolean;
  zones: Zone[];
  gates: Gate[];
  weather: WeatherState;
  cameraStats: CameraStats;
  parkingManagement: ParkingManagement;
  cameraFocus: CameraFocus;
  incidents: Incident[];
  alerts: string[];
  agentTraces: AgentTrace[];
  pendingActions: PendingAction[];
};

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error("JWT_SECRET env var is not set. Refusing to start.");
  process.exit(1);
}
const DEMO_USERNAME = process.env.DEMO_USERNAME || "security";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "admin123";
const demoPasswordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

const groqApiKey = process.env.GROQ_API_KEY;
const groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const AI_MAX_CALLS_PER_HOUR = Number(process.env.AI_MAX_CALLS_PER_HOUR || 60);
const AI_MIN_INTERVAL_MS = Number(process.env.AI_MIN_INTERVAL_MS || 12000);
const AI_ENABLE_INCIDENT_ANNOUNCEMENTS = process.env.AI_ENABLE_INCIDENT_ANNOUNCEMENTS === "true";

const state: AppState = {
  generatedAt: new Date().toISOString(),
  humanReviewEnabled: true,
  zones: [
    { id: "north",   name: "North Stand",       capacity: 10000, currentCount: 8500 },
    { id: "south",   name: "South Stand",       capacity: 10000, currentCount: 7200 },
    { id: "east",    name: "East Stand",        capacity: 10000, currentCount: 6800 },
    { id: "west",    name: "West Stand",        capacity: 10000, currentCount: 7900 },
    { id: "gate_a",  name: "Gate A Concourse",  capacity: 2500,  currentCount: 1200 },
    { id: "gate_b",  name: "Gate B Concourse",  capacity: 2500,  currentCount: 1400 },
    { id: "food",    name: "Food Court",        capacity: 2000,  currentCount: 800  },
    { id: "parking", name: "Parking Exit Lane", capacity: 2000,  currentCount: 400  },
    { id: "vip",     name: "VIP Box",           capacity: 500,   currentCount: 150  },
    { id: "media",   name: "Media Center",      capacity: 500,   currentCount: 80   }
  ],
  gates: [
    { id: "A", flowPerMin: 220, status: "open" },
    { id: "B", flowPerMin: 240, status: "open" },
    { id: "C", flowPerMin: 210, status: "open" },
    { id: "D", flowPerMin: 190, status: "open" }
  ],
  weather: {
    temperature: 31,
    rainProbability: 20,
    windKmph: 12
  },
  cameraStats: {
    totalDetected: 0,
    seatedFans: 0,
    staffCount: 0,
    confidence: 94
  },
  parkingManagement: {
    totalSpots: 6000,
    occupiedSpots: 2200,
    emergencyLaneOpen: true,
    overflowActive: false,
    incidentMode: false,
    updatedAt: new Date().toISOString()
  },
  cameraFocus: {
    zoneId: "",
    gateId: "",
    incidentType: "none",
    message: "General monitoring across stadium zones.",
    priority: "normal",
    updatedAt: new Date().toISOString()
  },
  incidents: [],
  alerts: ["System online. Monitoring crowd movement across all zones."],
  agentTraces: [],
  pendingActions: []
};

const authSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const incidentSchema = z.object({
  type: z.enum(["crowd_surge", "medical", "fire", "weather", "parking_emergency"]),
  zoneId: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  message: z.string().min(3).max(200)
});

const reviewSchema = z.object({
  enabled: z.boolean()
});

const incidentReviewSchema = z.object({
  decision: z.enum(["accept", "reject"])
});

// Track which incident IDs have already had a Comms Officer announcement
const announcedIncidents = new Set<string>();
// Track which incident IDs already have an Incident Commander response plan
const plannedIncidentResponses = new Set<string>();

const emitState = () => {
  state.generatedAt = new Date().toISOString();
  io.emit("state:update", state);
};

const addAlert = (message: string) => {
  state.alerts.unshift(`${new Date().toLocaleTimeString()} - ${message}`);
  state.alerts = state.alerts.slice(0, 40);
};

const addTrace = (agent: string, thought: string, action: string) => {
  state.agentTraces.unshift({
    at: new Date().toLocaleTimeString(),
    agent,
    thought,
    action
  });
  state.agentTraces = state.agentTraces.slice(0, 40);
};

const enqueueOrExecuteAction = (source: string, action: string, risk: "low" | "high") => {
  if (risk === "high" && state.humanReviewEnabled) {
    const pending: PendingAction = {
      id: `act_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      action,
      risk,
      source,
      createdAt: new Date().toISOString(),
      status: "pending"
    };
    state.pendingActions.unshift(pending);
    addAlert(`High-risk action queued for approval: ${action}`);
    return;
  }
  addAlert(`[AUTO] ${action}`);
};

const safePercent = (zone: Zone) => Math.round((zone.currentCount / zone.capacity) * 100);

const getZoneName = (zoneId: string) => state.zones.find((z) => z.id === zoneId)?.name || zoneId;

const mapZoneToGate = (zoneId: string) => {
  if (zoneId === "gate_a") return "A";
  if (zoneId === "gate_b") return "B";
  if (zoneId === "north" || zoneId === "vip") return "A";
  if (zoneId === "east" || zoneId === "media") return "B";
  if (zoneId === "south" || zoneId === "parking") return "C";
  return "D";
};

let lastAICallAt = 0;
const aiCallTimestamps: number[] = [];

const consumeAIBudget = (channel: "query" | "announcement"): boolean => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  while (aiCallTimestamps.length && aiCallTimestamps[0] < oneHourAgo) {
    aiCallTimestamps.shift();
  }

  if (channel === "announcement" && !AI_ENABLE_INCIDENT_ANNOUNCEMENTS) {
    return false;
  }

  if (aiCallTimestamps.length >= AI_MAX_CALLS_PER_HOUR) {
    return false;
  }

  if (now - lastAICallAt < AI_MIN_INTERVAL_MS) {
    return false;
  }

  aiCallTimestamps.push(now);
  lastAICallAt = now;
  return true;
};

const maybeAISummary = async (prompt: string): Promise<string | null> => {
  if (!groqClient) return null;
  if (!consumeAIBudget("announcement")) return null;
  try {
    const completion = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
      temperature: 0.4
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    logger.warn({ error }, "Groq AI summary failed");
    return null;
  }
};

// Smart rule-based fallback PA announcements when Gemini quota is exhausted
const buildFallbackAnnouncement = (incident: Incident): string => {
  const zone = state.zones.find(z => z.id === incident.zoneId);
  const zoneName = zone ? zone.name : incident.zoneId;
  const announcements: Record<IncidentType, string[]> = {
    fire: [
      `Attention all spectators: please calmly vacate ${zoneName} using the nearest marked exits. Do not use lifts.`,
      `Security alert in ${zoneName}. All fans please move to the opposite stands in an orderly manner.`,
    ],
    crowd_surge: [
      `Crowd flow advisory: ${zoneName} is at high density. Please use Gate C and D as alternate entry points.`,
      `For your safety, please move away from ${zoneName} concourse. Stewards are directing alternate routes.`,
    ],
    medical: [
      `Medical team has been dispatched to ${zoneName}. Security is clearing and sanitizing nearby area; please keep aisles open.`,
      `Medical assistance in progress near ${zoneName}. Security requests all spectators keep emergency pathways clear.`,
    ],
    weather: [
      `Weather advisory: rain expected shortly. Covered areas near Gates B and C are now open for shelter.`,
      `Lightning protocol activated. All spectators in open areas of ${zoneName} please move under cover.`,
    ],
    parking_emergency: [
      `Parking control update: emergency lane activated near ${zoneName}. Please follow staff routing instructions.`,
      `Parking advisory: overflow lot has opened due to emergency vehicle movement near ${zoneName}. Follow ground staff guidance.`,
    ]
  };
  const options = announcements[incident.type] || [`Attention near ${zoneName}: please follow staff instructions.`];
  return options[Math.floor(Math.random() * options.length)];
};

const runAgents = async () => {
  // 1. Sentinel: Crowd Density Monitoring
  const hotZones = state.zones.filter((zone) => safePercent(zone) >= 85);
  for (const zone of hotZones) {
    const thought = `${zone.name} is now at ${safePercent(zone)}% capacity. We're close to a bottleneck if inflow continues.`;
    const action = `I'm rerouting part of the incoming crowd and slowing entry at Gate ${state.gates[0].id} to reduce pressure.`;
    addTrace("Sentinel", thought, action);
    enqueueOrExecuteAction("Sentinel", `Reroute traffic from ${zone.name} to adjacent zones.`, "low");
    
    // Dynamically change gate status
    const gateToReroute = state.gates.find(g => g.status === "open");
    if (gateToReroute) gateToReroute.status = "rerouted";
  }

  // 2. Meteorologist: Weather Risk Assessment
  if (state.weather.rainProbability > 75) {
    const thought = `Rain risk is up to ${Math.round(state.weather.rainProbability)}%. We should prepare for rapid movement from exposed stands.`;
    const action = "Starting rain protocol now and opening secondary concourse shelters.";
    addTrace("Meteorologist", thought, action);
    enqueueOrExecuteAction("Meteorologist", "Deploy pitch covers and alert ground staff.", "low");
  } else if (state.weather.temperature > 38) {
    addTrace(
      "Meteorologist",
      `It's very hot right now (${Math.round(state.weather.temperature)}°C). Crowd comfort risk is increasing.`,
      "I've increased hydration and heat-safety alerts across all stands."
    );
  }

  // Keep parking system state realistic outside emergencies
  const hasOpenParkingEmergency = state.incidents.some(
    (incident) => incident.status === "open" && incident.type === "parking_emergency"
  );
  if (!hasOpenParkingEmergency) {
    state.parkingManagement.incidentMode = false;
    state.parkingManagement.emergencyLaneOpen = true;
  }

  // 3. Incident Commander: Emergency Response
  const recentIncident = state.incidents.find((incident) => incident.status === "open");
  if (
    recentIncident &&
    Date.now() - new Date(recentIncident.createdAt).getTime() < 45_000 &&
    !plannedIncidentResponses.has(recentIncident.id)
  ) {
    plannedIncidentResponses.add(recentIncident.id);
    if (plannedIncidentResponses.size > 100) {
      const first = plannedIncidentResponses.values().next().value;
      if (first) plannedIncidentResponses.delete(first);
    }

    const zoneName = getZoneName(recentIncident.zoneId);
    const targetGate = mapZoneToGate(recentIncident.zoneId);
    const thought = `We have a ${recentIncident.type.replace("_", " ")} incident near ${zoneName} (severity: ${recentIncident.severity}). I'm coordinating response now.`;
    let action = "";
    let risk: "low" | "high" = "low";

    if (recentIncident.type === "fire") {
      action = `We've told security to start evacuation around ${zoneName}, and fire response teams are moving in through Gate ${targetGate}.`;
      risk = "high";
      addAlert(`[AUTOMATION] Fire emergency: security instructed to evacuate ${zoneName} immediately.`);
      state.cameraFocus = {
        zoneId: recentIncident.zoneId,
        gateId: targetGate,
        incidentType: "fire",
        message: `High-priority camera focus on Gate ${targetGate} and ${zoneName} evacuation lanes.`,
        priority: "high",
        updatedAt: new Date().toISOString()
      };
    } else if (recentIncident.type === "crowd_surge") {
      action = `Security stewards are now redirecting crowd flow away from ${zoneName} through Gate ${targetGate} and nearby overflow routes.`;
      risk = "high";
      addAlert(`[AUTOMATION] Crowd surge: flow-control stewards sent to ${zoneName}.`);
      state.cameraFocus = {
        zoneId: recentIncident.zoneId,
        gateId: targetGate,
        incidentType: "crowd_surge",
        message: `AI tracking crowd pressure near ${zoneName}; focus shifted to Gate ${targetGate}.`,
        priority: "high",
        updatedAt: new Date().toISOString()
      };
    } else if (recentIncident.type === "medical") {
      action = `Medical response is active in ${zoneName}; security is clearing and sanitizing the area while paramedics enter through Gate ${targetGate}.`;
      risk = "low";
      addAlert(`[AUTOMATION] Medical: security notified to clear and sanitize area around ${zoneName}.`);
      state.cameraFocus = {
        zoneId: recentIncident.zoneId,
        gateId: targetGate,
        incidentType: "medical",
        message: `Camera focus on medical response corridor near ${zoneName} (Gate ${targetGate}).`,
        priority: "normal",
        updatedAt: new Date().toISOString()
      };
    } else if (recentIncident.type === "parking_emergency") {
      action = `Parking emergency protocol is active near ${zoneName}. Security has opened emergency lanes, redirected incoming vehicles, and enabled overflow parking.`;
      risk = "high";
      state.parkingManagement.incidentMode = true;
      state.parkingManagement.emergencyLaneOpen = true;
      state.parkingManagement.overflowActive = true;
      state.parkingManagement.updatedAt = new Date().toISOString();
      addAlert(`[AUTOMATION] Parking emergency: emergency lane opened and overflow lot activated near ${zoneName}.`);
      state.cameraFocus = {
        zoneId: recentIncident.zoneId,
        gateId: targetGate,
        incidentType: "parking_emergency",
        message: `Camera focus moved to parking ingress lanes near Gate ${targetGate} for emergency vehicle routing.`,
        priority: "high",
        updatedAt: new Date().toISOString()
      };
    } else {
      action = `Security teams are guiding spectators from exposed sections near ${zoneName} toward covered concourses via Gate ${targetGate}.`;
      risk = "low";
      addAlert(`[AUTOMATION] Weather protocol: shelter guidance started for sections near ${zoneName}.`);
      state.cameraFocus = {
        zoneId: recentIncident.zoneId,
        gateId: targetGate,
        incidentType: "weather",
        message: `Camera focus moved to exposed concourse near Gate ${targetGate} for weather safety checks.`,
        priority: "normal",
        updatedAt: new Date().toISOString()
      };
    }

    addTrace("Incident Commander", thought, action);
    enqueueOrExecuteAction("Incident Commander", action, risk);

    // 4. Comms Officer: ONE announcement per incident — never re-calls Gemini for the same event
    if (!announcedIncidents.has(recentIncident.id)) {
      announcedIncidents.add(recentIncident.id);
      if (announcedIncidents.size > 20) {
        // Prevent unbounded growth
        const first = announcedIncidents.values().next().value;
        if (first) announcedIncidents.delete(first);
      }

      const prompt = `You are a Stadium Safety AI. An incident occurred: ${recentIncident.message}. 
      Write a calm, 1-sentence public announcement for the stadium screens. 
      Do not use emojis. Focus on safety and clear instructions.`;

      const summary = await maybeAISummary(prompt);
      const commsAction = summary || buildFallbackAnnouncement(recentIncident);
      addTrace("Comms Officer", "I'm preparing a calm, clear message for spectators.", `PA: ${commsAction}`);
      enqueueOrExecuteAction("Comms Officer", `Broadcast PA: ${commsAction}`, "low");
    } else {
      addTrace("Comms Officer", "I'm keeping communication steady while teams are working.", "Safety guidance remains visible on all screens.");
    }
  }

  // 5. Supervisor: System Oversight
  const pendingCount = state.pendingActions.filter((a) => a.status === "pending").length;
  if (pendingCount > 0) {
    addTrace(
      "Supervisor",
      `There ${pendingCount === 1 ? "is" : "are"} ${pendingCount} high-risk action${pendingCount === 1 ? "" : "s"} waiting for control-room approval.`,
      "I'm monitoring approval timing and keeping the response queue prioritized."
    );
  }
};

const simulateTick = () => {
  let totalFans = 0;
  for (const zone of state.zones) {
    // Gentle drift: ±30 per tick, biased slightly upward for main stands
    const trend = (zone.id === 'north' || zone.id === 'south' || zone.id === 'east' || zone.id === 'west') ? 15 : 5;
    const change = Math.floor((Math.random() * 60 - 25) + trend);
    // Keep zones at realistic minimums: main stands ≥ 3000, others ≥ 200
    const minCount = (zone.capacity >= 5000) ? 3000 : 200;
    zone.currentCount = Math.max(minCount, Math.min(zone.capacity, zone.currentCount + change));
    totalFans += zone.currentCount;
  }

  // Update camera stats based on simulated crowd
  const staffBase = 1200;
  const staffVar = Math.floor(Math.random() * 100) - 50;
  state.cameraStats.staffCount = staffBase + staffVar;
  state.cameraStats.seatedFans = totalFans;
  state.cameraStats.totalDetected = state.cameraStats.seatedFans + state.cameraStats.staffCount;
  state.cameraStats.confidence = 92 + Math.floor(Math.random() * 5);

  // Parking lot occupancy derived from parking lane + concourse pressure
  const parkingZone = state.zones.find((z) => z.id === "parking");
  const gateAZone = state.zones.find((z) => z.id === "gate_a");
  const gateBZone = state.zones.find((z) => z.id === "gate_b");
  const parkingEstimate =
    (parkingZone?.currentCount || 0) * 6 +
    Math.floor(((gateAZone?.currentCount || 0) + (gateBZone?.currentCount || 0)) * 0.4);
  state.parkingManagement.occupiedSpots = Math.max(
    800,
    Math.min(state.parkingManagement.totalSpots, parkingEstimate)
  );
  const parkingPct = Math.round((state.parkingManagement.occupiedSpots / state.parkingManagement.totalSpots) * 100);
  if (!state.parkingManagement.incidentMode) {
    state.parkingManagement.overflowActive = parkingPct >= 88;
  }
  state.parkingManagement.updatedAt = new Date().toISOString();

  for (const gate of state.gates) {
    const delta = Math.floor(Math.random() * 60) - 30;
    gate.flowPerMin = Math.max(100, Math.min(400, gate.flowPerMin + delta));
  }

  // Weather drifts
  state.weather.temperature = Math.max(20, Math.min(42, state.weather.temperature + (Math.random() * 0.4 - 0.2)));
  state.weather.rainProbability = Math.max(0, Math.min(100, state.weather.rainProbability + (Math.random() * 4 - 2)));
  state.weather.windKmph = Math.max(2, Math.min(50, state.weather.windKmph + (Math.random() * 2 - 1)));
};

const createIncident = (incident: z.infer<typeof incidentSchema>) => {
  const payload: Incident = {
    id: `inc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: incident.type,
    zoneId: incident.zoneId,
    severity: incident.severity,
    message: incident.message,
    createdAt: new Date().toISOString(),
    status: "open"
  };
  state.incidents.unshift(payload);
  state.incidents = state.incidents.slice(0, 10);
  addAlert(`New ${payload.type} incident at ${payload.zoneId}: ${payload.message}`);
};

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    jwt.verify(token, JWT_SECRET as string);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(express.json({ limit: "16kb" }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com", "'unsafe-inline'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "https://grainy-gradients.vercel.app"],
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.static(path.join(process.cwd(), "public")));

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `auth:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "")}`
});

app.get("/api/health", (_req, res) => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const callsInWindow = aiCallTimestamps.filter((ts) => ts >= oneHourAgo).length;
  res.json({
    ok: true,
    aiEnabled: Boolean(groqClient),
    aiProvider: groqClient ? "groq" : "fallback",
    aiBudget: {
      maxCallsPerHour: AI_MAX_CALLS_PER_HOUR,
      callsUsedLastHour: callsInWindow,
      callsRemaining: Math.max(0, AI_MAX_CALLS_PER_HOUR - callsInWindow),
      minIntervalMs: AI_MIN_INTERVAL_MS,
      incidentAiEnabled: AI_ENABLE_INCIDENT_ANNOUNCEMENTS
    },
    humanReviewEnabled: state.humanReviewEnabled
  });
});

app.get("/api/state", (_req, res) => {
  res.json(state);
});

app.post("/api/auth/login", authLimiter, (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const { username, password } = parsed.data;
  if (username !== DEMO_USERNAME || !bcrypt.compareSync(password, demoPasswordHash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ username, role: "security-operator" }, JWT_SECRET as string, { expiresIn: "8h" });
  return res.json({ token });
});

app.post("/api/incident", requireAuth, async (req, res) => {
  const parsed = incidentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid incident payload" });
  }
  createIncident(parsed.data);
  await runAgents();
  emitState();
  return res.status(201).json({ ok: true });
});

app.post("/api/incidents/:id/review", requireAuth, (req, res) => {
  const parsed = incidentReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid review payload" });
  }

  const incident = state.incidents.find((item) => item.id === req.params.id);
  if (!incident) {
    return res.status(404).json({ error: "Incident not found" });
  }
  if (incident.status !== "open") {
    return res.status(400).json({ error: "Incident already reviewed" });
  }

  incident.status = parsed.data.decision === "accept" ? "accepted" : "rejected";
  incident.reviewedAt = new Date().toISOString();

  if (parsed.data.decision === "accept") {
    addAlert(`[CONTROL ROOM] Incident ${incident.id} accepted as handled by operator.`);
    addTrace("Supervisor", `Operator accepted incident ${incident.id}.`, "Marked incident lifecycle as handled.");
  } else {
    addAlert(`[CONTROL ROOM] Incident ${incident.id} rejected and escalated for additional response.`);
    addTrace("Supervisor", `Operator rejected incident ${incident.id}.`, "Escalation requested for manual intervention.");
  }

  emitState();
  return res.json({ ok: true, incidentId: incident.id, status: incident.status });
});

app.post("/api/toggle-review", requireAuth, (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  state.humanReviewEnabled = parsed.data.enabled;
  addAlert(`Human review is now ${state.humanReviewEnabled ? "enabled" : "disabled"}.`);
  emitState();
  return res.json({ ok: true, enabled: state.humanReviewEnabled });
});

app.post("/api/reset", requireAuth, (_req, res) => {
  // Reset to early-match baseline: stands ~30-40% full, concourses busy
  const baselines: Record<string, number> = {
    north: 3200, south: 2800, east: 2500, west: 3100,
    gate_a: 600, gate_b: 750, food: 400, parking: 200, vip: 120, media: 60
  };
  state.zones.forEach((z) => {
    const base = baselines[z.id] ?? 300;
    z.currentCount = base + Math.floor(Math.random() * 200) - 100;
  });
  state.gates.forEach((g) => {
    g.status = "open";
    g.flowPerMin = 180 + Math.floor(Math.random() * 60);
  });
  state.incidents = [];
  state.pendingActions = [];
  state.agentTraces = [];
  announcedIncidents.clear();
  plannedIncidentResponses.clear();
  state.cameraFocus = {
    zoneId: "",
    gateId: "",
    incidentType: "none",
    message: "General monitoring across stadium zones.",
    priority: "normal",
    updatedAt: new Date().toISOString()
  };
  state.parkingManagement = {
    totalSpots: 6000,
    occupiedSpots: 1800 + Math.floor(Math.random() * 500),
    emergencyLaneOpen: true,
    overflowActive: false,
    incidentMode: false,
    updatedAt: new Date().toISOString()
  };
  state.alerts = [`${new Date().toLocaleTimeString()} - System reset. Gates open — pre-match inflow in progress.`];
  emitState();
  return res.json({ ok: true });
});

app.post("/api/simulate-inflow", requireAuth, (_req, res) => {
  state.zones.forEach((z) => {
    // Increase to ~88-92% capacity
    const target = Math.floor(z.capacity * 0.88) + Math.floor(Math.random() * 100);
    z.currentCount = Math.min(z.capacity, target);
  });
  state.alerts.unshift(`${new Date().toLocaleTimeString()} - [SIMULATION] Sudden massive inflow detected across all stands.`);
  emitState();
  return res.json({ ok: true });
});

app.post("/api/simulate-parking-emergency", requireAuth, async (_req, res) => {
  createIncident({
    type: "parking_emergency",
    zoneId: "parking",
    severity: "high",
    message: "Simulated parking emergency: stalled vehicles blocking emergency access."
  });
  await runAgents();
  emitState();
  return res.json({ ok: true });
});

app.post("/api/pending-actions/:id/approve", requireAuth, (req, res) => {
  const action = state.pendingActions.find((item) => item.id === req.params.id);
  if (!action) {
    return res.status(404).json({ error: "Action not found" });
  }
  if (action.status !== "pending") {
    return res.status(400).json({ error: "Action is not pending" });
  }
  action.status = "approved";
  addAlert(`Approved action executed: ${action.action}`);
  emitState();
  return res.json({ ok: true });
});

app.post("/api/pending-actions/approve-all", requireAuth, (_req, res) => {
  const pending = state.pendingActions.filter((item) => item.status === "pending");
  if (pending.length === 0) {
    return res.status(400).json({ error: "No pending actions to approve" });
  }
  pending.forEach((item) => {
    item.status = "approved";
  });
  addAlert(`Approved all pending high-risk actions (${pending.length}).`);
  emitState();
  return res.json({ ok: true, count: pending.length });
});

app.post("/api/agents/:name/query", requireAuth, async (req, res) => {
  const agentName = String(req.params.name);
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query is required" });
  }

  const agentNameLower = agentName.toLowerCase();

  // Build smart data-driven fallback first (used if AI unavailable)
  const hot = state.zones.filter(z => (z.currentCount / z.capacity) >= 0.85);
  const busiest = [...state.zones].sort((a, b) => (b.currentCount / b.capacity) - (a.currentCount / a.capacity))[0];
  const totalFans = state.zones.reduce((s, z) => s + z.currentCount, 0);
  const temp = Math.round(state.weather.temperature);
  const rain = Math.round(state.weather.rainProbability);
  const pending = state.pendingActions.filter(a => a.status === "pending").length;

  const fallbackMap: Record<string, string> = {
    sentinel: `Currently tracking ${totalFans.toLocaleString()} fans across 10 zones. ${hot.length > 0 ? `${hot.length} critical zone(s) detected — ${hot.map(z => z.name).join(", ")} at ≥85% capacity. Dynamic rerouting is active.` : `All zones within safe thresholds. Highest density is ${busiest.name} at ${Math.round((busiest.currentCount / busiest.capacity) * 100)}%.`}`,
    meteorologist: `Atmospheric conditions: ${temp}°C, ${rain}% rain probability, wind ${Math.round(state.weather.windKmph)} km/h. ${rain > 60 ? "Rain protocol on standby — recommend activating covered shelter zones." : rain > 30 ? "Moderate rain risk. Monitoring cloud patterns." : "Conditions are stable. No weather-related advisories needed."}`,
    "incident commander": `${state.incidents.length > 0 ? `Coordinating response to ${state.incidents[0].type.replace("_"," ")} at ${state.incidents[0].zoneId} (severity: ${state.incidents[0].severity}). ${pending} action(s) pending operator approval.` : "No active incidents. All emergency response units are on standby. Response protocols are loaded and ready."}`,
    "comms officer": `Public information channels are active on all ${state.zones.length} zones. ${state.incidents.length > 0 ? `Broadcasting safety advisory for ${state.incidents[0].type.replace("_"," ")} at ${state.incidents[0].zoneId}.` : "No active announcements. PA system on standby with pre-loaded weather and safety messages."}`,
    supervisor: `System health nominal. ${pending} high-risk action(s) awaiting approval. Parking occupancy is ${Math.round((state.parkingManagement.occupiedSpots / state.parkingManagement.totalSpots) * 100)}%. Human-in-the-loop mode is ${state.humanReviewEnabled ? "enabled" : "disabled"}.`
  };
  const fallback = fallbackMap[agentNameLower] ?? `${agentName} is operational. Total crowd: ${totalFans.toLocaleString()}, temperature: ${temp}°C. All sensors nominal.`;

  if (!groqClient) {
    return res.json({ response: fallback });
  }

  if (!consumeAIBudget("query")) {
    return res.json({ response: `${fallback} AI budget mode is active; conserving model calls for critical moments.` });
  }

  const prompt = `You are the "${agentName}" AI agent for a cricket stadium safety command center.
Current Stadium State: total fans ${totalFans.toLocaleString()}, temp ${temp}°C, rain ${rain}%, ${hot.length} critical zones, ${pending} pending approvals.
Active incidents: ${state.incidents.length > 0 ? state.incidents[0].type + " at " + state.incidents[0].zoneId : "none"}.

Operator query: "${query}"

Respond as this agent. 2-3 sentences, professional, data-driven. No emojis.`;

  try {
    const completion = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.5
    });
    const response = completion.choices[0]?.message?.content?.trim() ?? fallback;
    return res.json({ response });
  } catch (error) {
    logger.error({ error }, "Groq agent query failed, using smart fallback");
    return res.json({ response: fallback });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("state:update", state);
  logger.info({ socketId: socket.id }, "Dashboard connected");
});

let loopRunning = false;
setInterval(async () => {
  if (loopRunning) {
    return;
  }
  loopRunning = true;
  try {
    simulateTick();
    await runAgents();
    emitState();
  } finally {
    loopRunning = false;
  }
}, 2000);

server.listen(PORT, () => {
  logger.info({ port: PORT, aiEnabled: Boolean(groqClient), aiProvider: groqClient ? "groq" : "fallback" }, "StadiumPulse server started");
});
