const creatureCanvas = document.getElementById("creatureDrawSurface");
const creatureContext = creatureCanvas.getContext("2d");
const creatureShareButton = document.getElementById("creatureShareButton");
const creatureResetButton = document.getElementById("creatureResetButton");
const creatureShareStatus = document.getElementById("creatureShareStatus");
const creaturePadStatus = document.getElementById("creaturePadStatus");
const creatureAttributeGrid = document.getElementById("creatureAttributeGrid");
const creatureBrainstormInput = document.getElementById("creatureBrainstormInput");
const creatureIdeaCards = document.getElementById("creatureIdeaCards");
const swarmPreview = document.getElementById("swarmPreview");
const specimenPreview = document.getElementById("specimenPreview");

const CREATURE_FIELDS = [
  { key: "populationCount", label: "How many", type: "number", min: 6, max: 300, step: 1, unit: "creatures" },
  { key: "bodySize", label: "How large", type: "number", min: 0.4, max: 4, step: 0.1, unit: "relative size" },
  { key: "swimSpeed", label: "How fast", type: "number", min: 0.1, max: 5, step: 0.1, unit: "swim rate" },
  { key: "aggression", label: "Aggression", type: "number", min: 0, max: 100, step: 1, unit: "0 calm - 100 predatory" },
  { key: "sociability", label: "Social", type: "number", min: 0, max: 100, step: 1, unit: "0 solitary - 100 schooling" },
  { key: "squiggliness", label: "Squiggly", type: "number", min: 0, max: 100, step: 1, unit: "0 rigid - 100 elastic" },
  { key: "spikiness", label: "Spiky", type: "number", min: 0, max: 100, step: 1, unit: "0 round - 100 spiky" },
  { key: "luminosity", label: "Luminosity", type: "number", min: 0, max: 100, step: 1, unit: "glow strength" },
  {
    key: "surfaceStyle",
    label: "Surface style",
    type: "select",
    options: ["patterned", "gradiented", "single-color", "bumpy", "shiny", "hairy"],
    unit: "appearance"
  }
];

const DEFAULT_CURVE_METRICS = {
  averageSpeed: 1080,
  peakSpeed: 3200,
  smoothness: 62,
  jaggedness: 32,
  directness: 0.42,
  turningIntensity: 0.006,
  selfCrossings: 3,
  endEdge: "none"
};

const DEFAULT_TRAITS = {
  populationCount: 64,
  bodySize: 1.6,
  swimSpeed: 1.8,
  aggression: 34,
  sociability: 68,
  squiggliness: 63,
  spikiness: 38,
  luminosity: 30,
  surfaceStyle: "patterned"
};

const creatureState = {
  points: [],
  drawing: false,
  source: "manual",
  metrics: { ...DEFAULT_CURVE_METRICS },
  traits: { ...DEFAULT_TRAITS }
};

const creatureFieldElements = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatValue(value, step) {
  const digits = step < 1 ? String(step).split(".")[1].length : 0;
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross2d(a, b) {
  return a.x * b.y - a.y * b.x;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function seededNoise(seed) {
  const value = Math.sin(seed * 128.318 + seed * seed * 27.17) * 43758.5453;
  return value - Math.floor(value);
}

function rotatePoint(point, yaw, pitch = 0) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y2 = point.y * cosP - z1 * sinP;
  const z2 = point.y * sinP + z1 * cosP;
  return { x: x1, y: y2, z: z2 };
}

function segmentIntersection(a1, a2, b1, b2) {
  const r = subtract(a2, a1);
  const s = subtract(b2, b1);
  const denominator = cross2d(r, s);
  const qp = subtract(b1, a1);

  if (Math.abs(denominator) < 1e-6) {
    return false;
  }

  const t = cross2d(qp, s) / denominator;
  const u = cross2d(qp, r) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function countSelfCrossings(points) {
  let intersections = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = i + 2; j < points.length - 1; j += 1) {
      if (i === 0 && j === points.length - 2) {
        continue;
      }
      if (segmentIntersection(points[i], points[i + 1], points[j], points[j + 1])) {
        intersections += 1;
      }
    }
  }
  return intersections;
}

function detectEndEdge(points, width, height) {
  if (!points.length) {
    return "none";
  }

  const last = points[points.length - 1];
  const threshold = Math.max(24, Math.min(width, height) * 0.08);
  const distances = [
    { edge: "left", value: last.x },
    { edge: "right", value: width - last.x },
    { edge: "top", value: last.y },
    { edge: "bottom", value: height - last.y }
  ];
  distances.sort((a, b) => a.value - b.value);
  return distances[0].value <= threshold ? distances[0].edge : "none";
}

function analyzeStroke(points) {
  if (points.length < 2) {
    return { ...DEFAULT_CURVE_METRICS };
  }

  const headings = [];
  const speeds = [];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = distance(start, end);
    const dt = Math.max((end.time - start.time) / 1000, 1 / 240);
    const speed = length / dt;

    totalLength += length;
    speeds.push(speed);
    headings.push(Math.atan2(end.y - start.y, end.x - start.x));
  }

  const turnAngles = [];
  for (let index = 0; index < headings.length - 1; index += 1) {
    let delta = headings[index + 1] - headings[index];
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    turnAngles.push(Math.abs(delta));
  }

  const totalTurning = turnAngles.reduce((sum, value) => sum + value, 0);
  const turningIntensity = totalLength > 0 ? totalTurning / totalLength : 0;
  const turnVariance = standardDeviation(turnAngles);
  const directDistance = distance(points[0], points[points.length - 1]);
  const averageSpeed = speeds.reduce((sum, value) => sum + value, 0) / Math.max(speeds.length, 1);
  const peakSpeed = speeds.length ? Math.max(...speeds) : 0;
  const directness = totalLength > 0 ? directDistance / totalLength : 0;
  const selfCrossings = countSelfCrossings(points);
  const smoothness = clamp(100 / (1 + turnVariance * 8 + turningIntensity * 260), 0, 100);
  const jaggedness = clamp(turnVariance * 55 + turningIntensity * 240 + selfCrossings * 6, 0, 100);
  const endEdge = detectEndEdge(points, creatureCanvas.clientWidth, creatureCanvas.clientHeight);

  return {
    averageSpeed,
    peakSpeed,
    smoothness,
    jaggedness,
    directness,
    turningIntensity,
    selfCrossings,
    endEdge
  };
}

function suggestSurfaceStyle(metrics) {
  if (metrics.directness > 0.72) return "shiny";
  if (metrics.smoothness > 72) return "gradiented";
  if (metrics.jaggedness > 82) return "hairy";
  if (metrics.selfCrossings > 7) return "patterned";
  if (metrics.jaggedness > 58) return "bumpy";
  return "single-color";
}

function deriveTraitsFromMetrics(metrics) {
  const crossings = Math.min(metrics.selfCrossings, 24);
  const endGlow = metrics.endEdge === "top" ? 18 : metrics.endEdge === "bottom" ? 10 : 0;

  return {
    populationCount: clamp(Math.round(18 + crossings * 5 + metrics.smoothness * 0.28), 6, 300),
    bodySize: clamp(0.7 + metrics.averageSpeed / 2200 + metrics.directness * 1.5 - crossings * 0.03, 0.4, 4),
    swimSpeed: clamp(0.3 + metrics.peakSpeed / 2200, 0.1, 5),
    aggression: clamp(metrics.jaggedness * 0.72 + metrics.turningIntensity * 1100 + crossings * 1.3, 0, 100),
    sociability: clamp(metrics.smoothness * 0.68 + crossings * 1.6 - metrics.jaggedness * 0.18 + (metrics.endEdge === "none" ? 8 : 0), 0, 100),
    squiggliness: clamp(22 + metrics.smoothness * 0.32 + metrics.turningIntensity * 2200 - metrics.directness * 28, 0, 100),
    spikiness: clamp(metrics.jaggedness * 0.84 + crossings * 0.8, 0, 100),
    luminosity: clamp(12 + metrics.smoothness * 0.34 + endGlow + metrics.directness * 15, 0, 100),
    surfaceStyle: suggestSurfaceStyle(metrics)
  };
}

function getInternalBehaviour(traits, metrics) {
  return {
    schoolTightness: clamp(traits.sociability * 0.72 + metrics.smoothness * 0.2, 0, 100),
    territoriality: clamp(traits.aggression * 0.9 + metrics.jaggedness * 0.12, 0, 100),
    curiosity: clamp(24 + metrics.selfCrossings * 2.2 + metrics.directness * 45, 0, 100),
    awareness: clamp(18 + metrics.peakSpeed / 90 + metrics.turningIntensity * 2600, 0, 100),
    pulseRhythm: clamp(14 + metrics.averageSpeed / 28 + metrics.jaggedness * 0.2, 0, 100),
    depthBias: metrics.endEdge === "top" ? 82 : metrics.endEdge === "bottom" ? 24 : 54
  };
}

function createTraitInputs() {
  creatureAttributeGrid.innerHTML = CREATURE_FIELDS.map((field) => {
    if (field.type === "select") {
      return `
        <div class="attribute-card">
          <label for="creature-${field.key}">${field.label}</label>
          <select id="creature-${field.key}" data-key="${field.key}">
            ${field.options.map((option) => `<option value="${option}">${option}</option>`).join("")}
          </select>
          <div class="attribute-meta">${field.unit}</div>
        </div>
      `;
    }

    return `
      <div class="attribute-card">
        <label for="creature-${field.key}">${field.label}</label>
        <input
          id="creature-${field.key}"
          data-key="${field.key}"
          type="number"
          min="${field.min}"
          max="${field.max}"
          step="${field.step}"
        >
        <div class="attribute-meta">${field.unit}</div>
      </div>
    `;
  }).join("");

  CREATURE_FIELDS.forEach((field) => {
    const element = document.getElementById(`creature-${field.key}`);
    creatureFieldElements.set(field.key, element);
    element.addEventListener("input", () => {
      if (field.type === "select") {
        creatureState.traits[field.key] = element.value;
      } else {
        const parsed = Number.parseFloat(element.value);
        creatureState.traits[field.key] = Number.isFinite(parsed) ? parsed : field.min;
      }
      creatureState.source = "manual";
      syncPreviews();
    });
  });
}

function syncTraitInputs() {
  CREATURE_FIELDS.forEach((field) => {
    const element = creatureFieldElements.get(field.key);
    if (!element) return;
    if (field.type === "select") {
      element.value = creatureState.traits[field.key];
    } else {
      element.value = formatValue(creatureState.traits[field.key], field.step);
    }
  });
}

function buildCreatureIdeas(traits, metrics) {
  const note = creatureBrainstormInput.value.trim();
  const edgeRead = metrics.endEdge === "none" ? "internally centered" : `${metrics.endEdge}-directed`;
  const behaviour = getInternalBehaviour(traits, metrics);

  return [
    {
      title: "Current note",
      body: note || "Use this space for ecology notes, production rules, or links between creature temperament and habitat geometry."
    },
    {
      title: "Curve to creature mapping",
      body: `Peak speed becomes swim speed, jaggedness raises aggression and spikiness, smoothness lifts sociability and squiggliness, and self-crossings increase population pressure and visual complexity. The current stroke reads as ${edgeRead}.`
    },
    {
      title: "Behaviour layer",
      body: `Only a few visible traits are exposed now. School tightness ${Math.round(behaviour.schoolTightness)}, territoriality ${Math.round(behaviour.territoriality)}, curiosity ${Math.round(behaviour.curiosity)}, and awareness ${Math.round(behaviour.awareness)} are derived internally from the curve and visible traits.`
    },
    {
      title: "Surface treatment",
      body: `The current surface style is ${traits.surfaceStyle}. A good rule of thumb is: direct curves tend toward sleek or shiny skins, very smooth curves toward gradients, and heavily crossing or broken curves toward patterned, bumpy, or hairy treatments.`
    },
    {
      title: "Suggested future variables",
      body: "Good later additions, if you need them, are brood size, camouflage strength, threat display, docking affinity, scavenger tendency, and symbiosis dependence."
    }
  ];
}

function renderCreatureIdeas() {
  const ideas = buildCreatureIdeas(creatureState.traits, creatureState.metrics);
  creatureIdeaCards.innerHTML = ideas.map((idea) => `
    <article class="idea-card">
      <h3>${idea.title}</h3>
      <p>${idea.body}</p>
    </article>
  `).join("");
}

function drawGuide() {
  const width = creatureCanvas.clientWidth;
  const height = creatureCanvas.clientHeight;

  creatureContext.save();
  creatureContext.fillStyle = "rgba(238, 244, 255, 0.58)";
  creatureContext.font = "600 21px Georgia";
  creatureContext.fillText("Draw a creature control curve", 28, 40);
  creatureContext.font = "15px Avenir Next, Segoe UI, sans-serif";
  creatureContext.fillStyle = "rgba(238, 244, 255, 0.5)";
  creatureContext.fillText("Jaggedness can read as aggression. Peak speed can read as locomotion speed.", 28, 64);
  creatureContext.strokeStyle = "rgba(255, 255, 255, 0.08)";
  creatureContext.lineWidth = 1;
  creatureContext.strokeRect(18.5, 18.5, width - 37, height - 37);
  creatureContext.restore();
}

function drawEdgeHints() {
  const width = creatureCanvas.clientWidth;
  const height = creatureCanvas.clientHeight;

  creatureContext.save();
  creatureContext.fillStyle = "rgba(255, 255, 255, 0.08)";
  creatureContext.font = "12px Avenir Next, Segoe UI, sans-serif";
  creatureContext.fillText("TOP", width / 2 - 14, 18);
  creatureContext.fillText("LEFT", 10, height / 2);
  creatureContext.fillText("RIGHT", width - 46, height / 2);
  creatureContext.fillText("BOTTOM", width / 2 - 24, height - 10);
  creatureContext.restore();
}

function drawStroke(points) {
  if (!points.length) return;

  creatureContext.save();
  creatureContext.lineCap = "round";
  creatureContext.lineJoin = "round";
  creatureContext.strokeStyle = "#ff8e5d";
  creatureContext.lineWidth = 5;
  creatureContext.shadowColor = "rgba(255, 142, 93, 0.28)";
  creatureContext.shadowBlur = 12;
  creatureContext.beginPath();
  creatureContext.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    creatureContext.lineTo(points[index].x, points[index].y);
  }

  creatureContext.stroke();
  creatureContext.shadowBlur = 0;

  creatureContext.fillStyle = "#eef4ff";
  creatureContext.beginPath();
  creatureContext.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
  creatureContext.fill();

  const last = points[points.length - 1];
  creatureContext.fillStyle = "#87d7c7";
  creatureContext.beginPath();
  creatureContext.arc(last.x, last.y, 6, 0, Math.PI * 2);
  creatureContext.fill();
  creatureContext.restore();
}

function drawCreaturePad() {
  creatureContext.clearRect(0, 0, creatureCanvas.clientWidth, creatureCanvas.clientHeight);
  drawGuide();
  drawEdgeHints();
  drawStroke(creatureState.points);
}

function resizeCreatureCanvas() {
  const frame = creatureCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  creatureCanvas.width = Math.round(frame.width * ratio);
  creatureCanvas.height = Math.round(frame.height * ratio);
  creatureContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawCreaturePad();
}

function getCanvasPoint(event) {
  const rect = creatureCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    time: event.timeStamp
  };
}

function normalizeMouseEvent(event) {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: event.timeStamp,
    pointerId: 1,
    buttons: event.buttons ?? (event.type === "mouseup" ? 0 : 1),
    preventDefault() {
      event.preventDefault();
    }
  };
}

function normalizeTouchEvent(event, touch, activeButtons = 1) {
  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
    timeStamp: event.timeStamp,
    pointerId: touch.identifier ?? 1,
    buttons: activeButtons,
    preventDefault() {
      event.preventDefault();
    }
  };
}

function applyDerivedTraits(metrics) {
  const derived = deriveTraitsFromMetrics(metrics);
  creatureState.metrics = { ...metrics };
  creatureState.traits = { ...derived };
  creatureState.source = "curve";
  creaturePadStatus.textContent = "Creature stroke captured";
  syncTraitInputs();
  syncPreviews();
}

function beginStroke(event) {
  event.preventDefault();
  creatureState.drawing = true;
  creatureState.points = [getCanvasPoint(event)];
  creaturePadStatus.textContent = "Drawing...";

  if (typeof creatureCanvas.setPointerCapture === "function" && Number.isFinite(event.pointerId)) {
    try {
      creatureCanvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Fallback paths do not need pointer capture.
    }
  }

  drawCreaturePad();
}

function extendStroke(event) {
  if (!creatureState.drawing) return;

  event.preventDefault();
  const point = getCanvasPoint(event);
  const lastPoint = creatureState.points[creatureState.points.length - 1];

  if (!lastPoint || distance(lastPoint, point) > 0.5 || point.time !== lastPoint.time) {
    creatureState.points.push(point);
  }

  drawCreaturePad();
}

function endStroke(event) {
  if (!creatureState.drawing) return;

  event.preventDefault();
  extendStroke(event);
  creatureState.drawing = false;

  if (
    typeof creatureCanvas.hasPointerCapture === "function"
    && typeof creatureCanvas.releasePointerCapture === "function"
    && Number.isFinite(event.pointerId)
    && creatureCanvas.hasPointerCapture(event.pointerId)
  ) {
    creatureCanvas.releasePointerCapture(event.pointerId);
  }

  if (creatureState.points.length > 1) {
    applyDerivedTraits(analyzeStroke(creatureState.points));
  } else {
    creaturePadStatus.textContent = "Stroke too short";
  }
}

function resetCreatureState() {
  creatureState.points = [];
  creatureState.drawing = false;
  creatureState.metrics = { ...DEFAULT_CURVE_METRICS };
  creatureState.traits = { ...DEFAULT_TRAITS };
  creatureState.source = "manual";
  creaturePadStatus.textContent = "Waiting for a creature stroke";
  syncTraitInputs();
  syncPreviews();
  drawCreaturePad();
  creatureShareStatus.textContent = "Creature settings reset to default colony values.";
}

function buildCreatureSharePayload() {
  return {
    version: "0.2",
    type: "creature-foundry",
    metrics: creatureState.metrics,
    traits: creatureState.traits,
    brainstorm: creatureBrainstormInput.value.trim()
  };
}

function serializeCreatureState() {
  return encodeURIComponent(JSON.stringify(buildCreatureSharePayload()));
}

function loadCreatureStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("state");
  if (!encoded) return;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (parsed.metrics) {
      creatureState.metrics = {
        ...DEFAULT_CURVE_METRICS,
        ...parsed.metrics
      };
    }
    if (parsed.traits) {
      creatureState.traits = {
        ...DEFAULT_TRAITS,
        ...parsed.traits
      };
    }
    if (typeof parsed.brainstorm === "string") {
      creatureBrainstormInput.value = parsed.brainstorm;
    }
  } catch (error) {
    creatureShareStatus.textContent = "Could not load shared creature state from URL.";
  }
}

async function copyCreatureSettings() {
  const shareUrl = `${window.location.origin}${window.location.pathname}?state=${serializeCreatureState()}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const temp = document.createElement("textarea");
      temp.value = shareUrl;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    creatureShareStatus.textContent = "Shareable creature link copied to clipboard.";
  } catch (error) {
    creatureShareStatus.textContent = "Automatic copy failed. The current creature state is still loaded locally.";
  }
}

function createCreatureRenderer(mount, mode) {
  const canvas = document.createElement("canvas");
  mount.innerHTML = "";
  mount.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const viewState = {
    width: 1,
    height: 1,
    time: 0
  };

  function resize() {
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    viewState.width = width;
    viewState.height = height;
  }

  function surfacePalette(style, luminosity) {
    const glow = clamp(luminosity / 100, 0, 1);
    switch (style) {
      case "gradiented":
        return [`rgba(127, 208, 236, ${0.75 + glow * 0.2})`, `rgba(255, 174, 122, ${0.72 + glow * 0.2})`];
      case "single-color":
        return [`rgba(185, 218, 255, ${0.7 + glow * 0.22})`, `rgba(185, 218, 255, ${0.45 + glow * 0.18})`];
      case "bumpy":
        return [`rgba(160, 230, 203, ${0.78 + glow * 0.16})`, `rgba(92, 162, 154, ${0.65 + glow * 0.15})`];
      case "shiny":
        return [`rgba(240, 246, 255, ${0.82 + glow * 0.16})`, `rgba(132, 206, 255, ${0.55 + glow * 0.18})`];
      case "hairy":
        return [`rgba(255, 197, 160, ${0.75 + glow * 0.16})`, `rgba(255, 238, 210, ${0.48 + glow * 0.18})`];
      default:
        return [`rgba(255, 155, 104, ${0.78 + glow * 0.16})`, `rgba(137, 228, 204, ${0.54 + glow * 0.18})`];
    }
  }

  function project(point, cameraZ) {
    const depth = 8 + point.z - cameraZ;
    const scale = 190 / depth;
    return {
      x: viewState.width * 0.5 + point.x * scale,
      y: viewState.height * 0.5 - point.y * scale,
      scale
    };
  }

  function drawCreature(center, yaw, traits, behaviour, seed, cameraZ, focusScale = 1) {
    const size = traits.bodySize * focusScale;
    const bodySegments = 9;
    const wave = traits.squiggliness / 100;
    const spike = traits.spikiness / 100;
    const social = traits.sociability / 100;
    const pulse = 1 + Math.sin(viewState.time * (0.8 + behaviour.pulseRhythm / 70) + seed) * (behaviour.pulseRhythm / 300);
    const colors = surfacePalette(traits.surfaceStyle, traits.luminosity);
    const points = [];

    for (let index = 0; index < bodySegments; index += 1) {
      const t = index / (bodySegments - 1);
      const lateral = Math.sin(t * Math.PI * 2 + viewState.time * (0.8 + traits.swimSpeed * 0.4) + seed * 0.8) * wave * 0.75;
      const vertical = Math.cos(t * Math.PI * 1.5 + viewState.time * 0.4 + seed) * 0.18 * wave;
      const rawPoint = {
        x: center.x + (t - 0.42) * size * 3.4,
        y: center.y + vertical * size,
        z: center.z + lateral * size
      };
      const turned = rotatePoint({
        x: rawPoint.x - center.x,
        y: rawPoint.y - center.y,
        z: rawPoint.z - center.z
      }, yaw, 0.1 * wave);
      points.push({
        x: center.x + turned.x,
        y: center.y + turned.y,
        z: center.z + turned.z
      });
    }

    const projected = points.map((point) => project(point, cameraZ));
    for (let index = 0; index < projected.length - 1; index += 1) {
      const p1 = projected[index];
      const p2 = projected[index + 1];
      const width = (1.1 - index / projected.length) * size * (0.7 + social * 0.18) * pulse;
      ctx.strokeStyle = colors[index % 2];
      ctx.lineWidth = Math.max(1.4, width * ((p1.scale + p2.scale) * 0.5));
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    const head = projected[Math.floor(projected.length * 0.58)];
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.arc(head.x, head.y, Math.max(2.5, size * head.scale * 0.7 * pulse), 0, Math.PI * 2);
    ctx.fill();

    const tail = projected[projected.length - 1];
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = Math.max(1, size * tail.scale * 0.48);
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(tail.x + Math.cos(yaw) * 10 * wave * pulse, tail.y + Math.sin(yaw * 0.3) * 8 * wave * pulse);
    ctx.stroke();

    const finCount = 2 + Math.round(spike * 4);
    for (let fin = 0; fin < finCount; fin += 1) {
      const t = 0.2 + fin / (finCount + 1);
      const base = projected[Math.floor(t * (projected.length - 1))];
      const sign = fin % 2 === 0 ? 1 : -1;
      const finLength = (0.16 + spike * 0.42 + creatureState.metrics.selfCrossings * 0.01) * size * base.scale * 24;
      ctx.strokeStyle = colors[1];
      ctx.lineWidth = Math.max(0.8, size * base.scale * 0.14);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + Math.cos(yaw + sign * 1.1) * finLength, base.y + sign * finLength * 0.45);
      ctx.stroke();
    }

    if (traits.surfaceStyle === "patterned") {
      for (let stripe = 1; stripe < projected.length - 1; stripe += 2) {
        const point = projected[stripe];
        ctx.fillStyle = "rgba(10, 18, 36, 0.18)";
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(1.2, size * point.scale * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (traits.surfaceStyle === "bumpy") {
      for (let bump = 1; bump < projected.length - 2; bump += 2) {
        const point = projected[bump];
        ctx.fillStyle = "rgba(240, 248, 255, 0.22)";
        ctx.beginPath();
        ctx.arc(point.x + seededNoise(seed + bump) * 3, point.y - 1.5, Math.max(1, size * point.scale * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (traits.surfaceStyle === "hairy") {
      for (let hair = 1; hair < projected.length - 2; hair += 1) {
        const point = projected[hair];
        ctx.strokeStyle = "rgba(255, 243, 226, 0.38)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x + Math.sin(seed + hair) * 7, point.y - 8);
        ctx.stroke();
      }
    } else if (traits.surfaceStyle === "shiny") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
      ctx.lineWidth = Math.max(1, size * head.scale * 0.18);
      ctx.beginPath();
      ctx.moveTo(projected[1].x - 4, projected[1].y - 4);
      ctx.lineTo(projected[Math.min(4, projected.length - 1)].x + 4, projected[Math.min(4, projected.length - 1)].y - 2);
      ctx.stroke();
    }
  }

  function renderSwarm() {
    const traits = creatureState.traits;
    const behaviour = getInternalBehaviour(traits, creatureState.metrics);
    ctx.clearRect(0, 0, viewState.width, viewState.height);

    const gradient = ctx.createRadialGradient(
      viewState.width * 0.5,
      viewState.height * 0.25,
      20,
      viewState.width * 0.5,
      viewState.height * 0.5,
      viewState.width * 0.8
    );
    gradient.addColorStop(0, "rgba(135, 215, 199, 0.16)");
    gradient.addColorStop(0.5, "rgba(255, 142, 93, 0.08)");
    gradient.addColorStop(1, "rgba(5, 11, 22, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewState.width, viewState.height);

    const cycle = (Math.sin(viewState.time * 0.12) + 1) * 0.5;
    const dive = cycle > 0.82 ? (cycle - 0.82) / 0.18 : 0;
    const cameraZ = lerp(-9, 7, dive);
    const count = Math.round(traits.populationCount);
    const schoolRadius = lerp(7.2, 2.8, behaviour.schoolTightness / 100);
    const curiositySpread = lerp(0.7, 2.6, behaviour.curiosity / 100);
    const territorialPush = lerp(0.2, 1.4, behaviour.territoriality / 100);
    const awarenessSnap = lerp(0.3, 1.4, behaviour.awareness / 100);

    for (let index = 0; index < count; index += 1) {
      const seed = index * 0.73 + 3.7;
      const angle = viewState.time * (0.18 + traits.swimSpeed * 0.08 + awarenessSnap * 0.02) + seededNoise(seed) * Math.PI * 2;
      const ring = 0.5 + seededNoise(seed + 8) * schoolRadius + curiositySpread * Math.sin(viewState.time * 0.11 + seed);
      const center = {
        x: Math.cos(angle + seed) * ring * (1.4 + territorialPush * 0.35) + Math.sin(viewState.time * 0.17 + seed) * 0.4,
        y: Math.sin(angle * (1.1 + awarenessSnap * 0.15) + seed * 0.6) * (1.2 + behaviour.depthBias / 140) + (behaviour.depthBias - 50) / 70,
        z: Math.sin(angle + seed * 1.2) * ring * (1.1 + territorialPush * 0.25) + Math.cos(viewState.time * 0.16 + seed) * 0.7
      };
      const yaw = angle + Math.sin(viewState.time * (0.35 + awarenessSnap * 0.08) + seed) * (traits.squiggliness / 150);
      drawCreature(center, yaw, traits, behaviour, seed, cameraZ, 0.92);
    }

    ctx.strokeStyle = "rgba(143, 173, 214, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(viewState.width * 0.5, viewState.height * 0.8, viewState.width * 0.24, viewState.height * 0.04, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function renderSpecimen() {
    const traits = creatureState.traits;
    const behaviour = getInternalBehaviour(traits, creatureState.metrics);
    ctx.clearRect(0, 0, viewState.width, viewState.height);
    const gradient = ctx.createRadialGradient(
      viewState.width * 0.5,
      viewState.height * 0.28,
      10,
      viewState.width * 0.5,
      viewState.height * 0.5,
      viewState.width * 0.58
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    gradient.addColorStop(0.45, "rgba(135, 215, 199, 0.09)");
    gradient.addColorStop(1, "rgba(5, 11, 22, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewState.width, viewState.height);

    const yaw = viewState.time * 0.45;
    drawCreature({ x: 0, y: 0, z: 0 }, yaw, traits, behaviour, 2.4, -2.8, 1.8);
  }

  function render() {
    if (mode === "swarm") {
      renderSwarm();
    } else {
      renderSpecimen();
    }
  }

  function animate() {
    viewState.time += 0.016;
    render();
    requestAnimationFrame(animate);
  }

  resize();
  animate();

  return {
    resize,
    refresh() {
      render();
    }
  };
}

const swarmRenderer = createCreatureRenderer(swarmPreview, "swarm");
const specimenRenderer = createCreatureRenderer(specimenPreview, "specimen");

function syncPreviews() {
  renderCreatureIdeas();
  swarmRenderer.refresh();
  specimenRenderer.refresh();
}

creatureCanvas.addEventListener("pointerdown", beginStroke);
creatureCanvas.addEventListener("pointermove", extendStroke);
creatureCanvas.addEventListener("pointerup", endStroke);
creatureCanvas.addEventListener("pointercancel", endStroke);
creatureCanvas.addEventListener("pointerleave", (event) => {
  if (creatureState.drawing && event.buttons === 0) {
    endStroke(event);
  }
});

creatureCanvas.addEventListener("mousedown", (event) => {
  if (window.PointerEvent) return;
  beginStroke(normalizeMouseEvent(event));
});

window.addEventListener("mousemove", (event) => {
  if (window.PointerEvent || !creatureState.drawing) return;
  extendStroke(normalizeMouseEvent(event));
});

window.addEventListener("mouseup", (event) => {
  if (window.PointerEvent || !creatureState.drawing) return;
  endStroke(normalizeMouseEvent(event));
});

creatureCanvas.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  beginStroke(normalizeTouchEvent(event, touch, 1));
}, { passive: false });

creatureCanvas.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (!touch || !creatureState.drawing) return;
  extendStroke(normalizeTouchEvent(event, touch, 1));
}, { passive: false });

window.addEventListener("touchend", (event) => {
  if (!creatureState.drawing) return;
  const touch = event.changedTouches[0];
  if (!touch) return;
  endStroke(normalizeTouchEvent(event, touch, 0));
}, { passive: false });

creatureBrainstormInput.addEventListener("input", renderCreatureIdeas);
creatureShareButton.addEventListener("click", copyCreatureSettings);
creatureResetButton.addEventListener("click", resetCreatureState);
window.addEventListener("resize", () => {
  resizeCreatureCanvas();
  swarmRenderer.resize();
  specimenRenderer.resize();
});

createTraitInputs();
loadCreatureStateFromUrl();
syncTraitInputs();
resizeCreatureCanvas();
drawCreaturePad();
syncPreviews();
