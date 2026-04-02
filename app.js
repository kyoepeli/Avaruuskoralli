const canvas = document.getElementById("drawSurface");
const clearButton = document.getElementById("clearButton");
const shareButton = document.getElementById("shareButton");
const shareStatus = document.getElementById("shareStatus");
const padStatus = document.getElementById("padStatus");
const attributeGrid = document.getElementById("attributeGrid");
const brainstormInput = document.getElementById("brainstormInput");
const ideaCards = document.getElementById("ideaCards");
const previewMode = document.getElementById("previewMode");
const previewSurface = document.getElementById("previewSurface");
const context = canvas.getContext("2d");

const METRIC_FIELDS = [
  {
    key: "generatorFamily",
    label: "Generator family",
    type: "select",
    options: ["fern-like", "conch-like", "dodecahedral", "fluffy-cloud", "cuboid"],
    unit: "algorithm"
  },
  { key: "averageSpeed", label: "Average speed", type: "number", min: 0, max: 5000, step: 1, unit: "px/s" },
  { key: "peakSpeed", label: "Peak speed", type: "number", min: 0, max: 12000, step: 1, unit: "px/s" },
  { key: "smoothness", label: "Smoothness", type: "number", min: 0, max: 100, step: 0.1, unit: "score" },
  { key: "jaggedness", label: "Jaggedness", type: "number", min: 0, max: 100, step: 0.1, unit: "score" },
  { key: "directness", label: "Directness", type: "number", min: 0, max: 1, step: 0.001, unit: "ratio" },
  { key: "turningIntensity", label: "Turning intensity", type: "number", min: 0, max: 0.2, step: 0.0001, unit: "turn/px" },
  { key: "selfCrossings", label: "Self-crossings", type: "number", min: 0, max: 250, step: 1, unit: "count" },
  {
    key: "endEdge",
    label: "Ending edge",
    type: "select",
    options: ["none", "left", "right", "top", "bottom"],
    unit: "bias"
  }
];

const DEFAULT_METRICS = {
  generatorFamily: "cuboid",
  averageSpeed: 1133.796874444895,
  peakSpeed: 6544.545512666832,
  smoothness: 20.00798820646227,
  jaggedness: 100,
  directness: 0.005615182118653293,
  turningIntensity: 0.009591349260873593,
  selfCrossings: 181,
  endEdge: "left"
};

const state = {
  points: [],
  drawing: false,
  metrics: { ...DEFAULT_METRICS },
  source: "manual"
};

const fieldElements = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
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
    return { ...DEFAULT_METRICS, generatorFamily: state.metrics.generatorFamily };
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
  const endEdge = detectEndEdge(points, canvas.clientWidth, canvas.clientHeight);

  return {
    generatorFamily: state.metrics.generatorFamily,
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

function createAttributeInputs() {
  attributeGrid.innerHTML = METRIC_FIELDS.map((field) => {
    if (field.type === "select") {
      return `
        <div class="attribute-card">
          <label for="field-${field.key}">${field.label}</label>
          <select id="field-${field.key}" data-key="${field.key}">
            ${field.options.map((option) => `<option value="${option}">${option}</option>`).join("")}
          </select>
          <div class="attribute-meta">${field.unit}</div>
        </div>
      `;
    }

    return `
      <div class="attribute-card">
        <label for="field-${field.key}">${field.label}</label>
        <input
          id="field-${field.key}"
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

  METRIC_FIELDS.forEach((field) => {
    const element = document.getElementById(`field-${field.key}`);
    fieldElements.set(field.key, element);
    element.addEventListener("input", () => {
      if (field.type === "select") {
        state.metrics[field.key] = element.value;
      } else {
        const numericValue = Number.parseFloat(element.value);
        state.metrics[field.key] = Number.isFinite(numericValue) ? numericValue : 0;
      }
      state.source = "manual";
      previewMode.textContent = "Live from manual edits";
      previewGenerator.syncFromMetrics(state.metrics);
      renderIdeaCards();
    });
  });
}

function syncInputsFromMetrics(metrics) {
  METRIC_FIELDS.forEach((field) => {
    const element = fieldElements.get(field.key);
    if (!element) return;

    if (field.type === "select") {
      element.value = metrics[field.key];
    } else {
      const digits = field.step < 1 ? String(field.step).split(".")[1].length : 0;
      element.value = formatNumber(metrics[field.key], digits);
    }
  });
}

function buildIdeaCards(metrics) {
  const crossingBudget = Math.min(Number(metrics.selfCrossings), 24);
  const recursionDepth = Math.min(2 + Math.floor(crossingBudget / 4), 7);
  const armCount = Math.max(3, Math.round(3 + metrics.jaggedness / 18 + crossingBudget / 8));
  const shellBias = metrics.directness > 0.55 ? "mothership" : "nest";
  const edgeBias = metrics.endEdge === "none" ? "centered" : `${metrics.endEdge}-leaning`;
  const note = brainstormInput.value.trim();
  const familyIdeas = {
    "fern-like": `Use branching rules with alternating angles and taper. Self-crossings can lift recursion depth to ${recursionDepth}, smoothness can soften leaflet curvature, and ${edgeBias} asymmetry can bias the main stem.`,
    "conch-like": `Map average and peak speed into shell radius and spiral pitch. Turning intensity can tighten the helix while self-crossings add chamber ridges or secondary shell lips.`,
    "dodecahedral": `Treat directness as structural discipline and grow a faceted polyhedral hub. Jaggedness can fracture faces into extra plates while the ${edgeBias} side receives heavier docking geometry.`,
    "fluffy-cloud": `Use metaball-like sphere clusters as a soft volume field. Smoothness keeps the silhouette cohesive, while self-crossings seed denser puff clusters and internal tunnels.`,
    "cuboid": `Build from a snapped voxel grammar. Peak speed scales the longest axis, turning intensity offsets stacked blocks, and self-crossings add sub-modules or buttresses.`
  };

  return [
    {
      title: "Current note",
      body: note || "Use this space to write production rules, morphology constraints, or silhouette goals for the current metric mix."
    },
    {
      title: "Selected family",
      body: familyIdeas[metrics.generatorFamily]
    },
    {
      title: "Crossing-driven L-system",
      body: `Start from a trunk symbol and raise recursion depth to ${recursionDepth}. Each self-crossing can unlock one more production branch until the cap, while turning intensity controls branch bend and smoothness controls taper continuity.`
    },
    {
      title: "Armature + shell hybrid",
      body: `Use ${armCount} radial arms around a core, then wrap them with a ${shellBias} shell. Peak speed can scale outer reach, average speed can widen chambers, and jaggedness can switch outer surfaces from sleek fins to spined ridges.`
    },
    {
      title: "Directional asymmetry rule",
      body: `Treat the ending edge as a migration vector. The current read is ${edgeBias}, so let that side receive a denser docking crown, coral bloom, or sensor prow while the opposite side stays more protected.`
    }
  ];
}

function renderIdeaCards() {
  const ideas = buildIdeaCards(state.metrics);
  ideaCards.innerHTML = ideas.map((idea) => `
    <article class="idea-card">
      <h3>${idea.title}</h3>
      <p>${idea.body}</p>
    </article>
  `).join("");
}

function resizeCanvas() {
  const frame = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(frame.width * ratio);
  canvas.height = Math.round(frame.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawScene();
}

function drawGuide() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  context.save();
  context.fillStyle = "rgba(238, 244, 255, 0.58)";
  context.font = "600 21px Georgia";
  context.fillText("Draw a control curve", 28, 40);
  context.font = "15px Avenir Next, Segoe UI, sans-serif";
  context.fillStyle = "rgba(238, 244, 255, 0.5)";
  context.fillText("The final point can mark a directional edge bias", 28, 64);
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.strokeRect(18.5, 18.5, width - 37, height - 37);
  context.restore();
}

function drawEdgeHints() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  context.save();
  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  context.font = "12px Avenir Next, Segoe UI, sans-serif";
  context.fillText("TOP", width / 2 - 14, 18);
  context.fillText("LEFT", 10, height / 2);
  context.fillText("RIGHT", width - 46, height / 2);
  context.fillText("BOTTOM", width / 2 - 24, height - 10);
  context.restore();
}

function drawStroke(points) {
  if (!points.length) return;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#ff8e5d";
  context.lineWidth = 5;
  context.shadowColor = "rgba(255, 142, 93, 0.28)";
  context.shadowBlur = 12;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }

  context.stroke();
  context.shadowBlur = 0;

  context.fillStyle = "#eef4ff";
  context.beginPath();
  context.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
  context.fill();

  const last = points[points.length - 1];
  context.fillStyle = "#87d7c7";
  context.beginPath();
  context.arc(last.x, last.y, 6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawScene() {
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawGuide();
  drawEdgeHints();
  drawStroke(state.points);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
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

function applyMetrics(metrics, sourceLabel) {
  state.metrics = {
    generatorFamily: metrics.generatorFamily,
    averageSpeed: metrics.averageSpeed,
    peakSpeed: metrics.peakSpeed,
    smoothness: metrics.smoothness,
    jaggedness: metrics.jaggedness,
    directness: metrics.directness,
    turningIntensity: metrics.turningIntensity,
    selfCrossings: metrics.selfCrossings,
    endEdge: metrics.endEdge
  };
  state.source = sourceLabel;
  syncInputsFromMetrics(state.metrics);
  renderIdeaCards();
  previewMode.textContent = sourceLabel === "curve" ? "Live from curve + edits" : "Live from manual edits";
  previewGenerator.syncFromMetrics(state.metrics);
}

function buildSharePayload() {
  return {
    version: "0.1",
    metrics: state.metrics,
    brainstorm: brainstormInput.value.trim()
  };
}

function serializeHabitatState() {
  return encodeURIComponent(JSON.stringify(buildSharePayload()));
}

function loadHabitatStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("state");
  if (!encoded) return;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (parsed.metrics) {
      state.metrics = {
        ...DEFAULT_METRICS,
        ...parsed.metrics
      };
    }
    if (typeof parsed.brainstorm === "string") {
      brainstormInput.value = parsed.brainstorm;
    }
  } catch (error) {
    shareStatus.textContent = "Could not load shared habitat state from URL.";
  }
}

async function copyCurrentSettings() {
  const shareUrl = `${window.location.origin}${window.location.pathname}?state=${serializeHabitatState()}`;

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
    shareStatus.textContent = "Shareable habitat link copied to clipboard.";
  } catch (error) {
    shareStatus.textContent = "Could not copy automatically. The current habitat state is still loaded locally.";
  }
}

function beginStroke(event) {
  event.preventDefault();
  state.drawing = true;
  state.points = [getCanvasPoint(event)];
  padStatus.textContent = "Drawing...";

  if (typeof canvas.setPointerCapture === "function" && Number.isFinite(event.pointerId)) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Mouse/touch fallback paths do not need pointer capture.
    }
  }

  drawScene();
}

function extendStroke(event) {
  if (!state.drawing) return;

  event.preventDefault();
  const point = getCanvasPoint(event);
  const lastPoint = state.points[state.points.length - 1];

  if (!lastPoint || distance(lastPoint, point) > 0.5 || point.time !== lastPoint.time) {
    state.points.push(point);
  }

  drawScene();
}

function endStroke(event) {
  if (!state.drawing) return;

  event.preventDefault();
  extendStroke(event);
  state.drawing = false;

  if (
    typeof canvas.hasPointerCapture === "function"
    && typeof canvas.releasePointerCapture === "function"
    && Number.isFinite(event.pointerId)
    && canvas.hasPointerCapture(event.pointerId)
  ) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (state.points.length > 1) {
    padStatus.textContent = "Stroke captured";
    applyMetrics(analyzeStroke(state.points), "curve");
  } else {
    padStatus.textContent = "Stroke too short";
  }
}

function clearStroke() {
  state.points = [];
  state.drawing = false;
  padStatus.textContent = "Waiting for a stroke";
  applyMetrics({ ...DEFAULT_METRICS }, "manual");
  drawScene();
}

function createPreviewGenerator() {
  const previewCanvas = document.createElement("canvas");
  previewSurface.innerHTML = "";
  previewSurface.appendChild(previewCanvas);
  const previewContext = previewCanvas.getContext("2d");

  const sceneState = {
    width: 1,
    height: 1,
    metrics: { ...DEFAULT_METRICS },
    cameraAngle: 0
  };

  function edgeBias(edge) {
    switch (edge) {
      case "left":
        return { x: -1, y: 0 };
      case "right":
        return { x: 1, y: 0 };
      case "top":
        return { x: 0, y: -1 };
      case "bottom":
        return { x: 0, y: 1 };
      default:
        return { x: 0, y: 0 };
    }
  }

  function project(point) {
    const depth = 7 + point.z;
    const scale = 230 / depth;
    return {
      x: sceneState.width * 0.5 + point.x * scale,
      y: sceneState.height * 0.5 - point.y * scale,
      scale,
      depth
    };
  }

  function rotatePoint(point, angleY, angleX = 0) {
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    const x1 = point.x * cosY - point.z * sinY;
    const z1 = point.x * sinY + point.z * cosY;
    const y2 = point.y * cosX - z1 * sinX;
    const z2 = point.y * sinX + z1 * cosX;
    return { x: x1, y: y2, z: z2 };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function drawSphere(point, radius, fillStyle, alpha = 1) {
    const projected = project(point);
    previewContext.save();
    previewContext.globalAlpha = alpha;
    previewContext.beginPath();
    previewContext.fillStyle = fillStyle;
    previewContext.arc(projected.x, projected.y, Math.max(2, radius * projected.scale), 0, Math.PI * 2);
    previewContext.fill();
    previewContext.restore();
  }

  function drawLine3D(a, b, width, strokeStyle, alpha = 1) {
    const pa = project(a);
    const pb = project(b);
    previewContext.save();
    previewContext.globalAlpha = alpha;
    previewContext.strokeStyle = strokeStyle;
    previewContext.lineWidth = Math.max(1, ((pa.scale + pb.scale) * 0.5) * width);
    previewContext.lineCap = "round";
    previewContext.beginPath();
    previewContext.moveTo(pa.x, pa.y);
    previewContext.lineTo(pb.x, pb.y);
    previewContext.stroke();
    previewContext.restore();
  }

  function drawRing(radius, y, tilt, color, alpha = 0.8) {
    const steps = 48;
    let previous = null;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const point = rotatePoint(
        {
          x: Math.cos(angle) * radius,
          y,
          z: Math.sin(angle) * radius
        },
        sceneState.cameraAngle + tilt,
        tilt * 0.35
      );
      if (previous) {
        drawLine3D(previous, point, 0.03, color, alpha);
      }
      previous = point;
    }
  }

  function drawBranch(startAngle, length, bend, width, color, bias) {
    const segments = 8;
    let previous = rotatePoint({
      x: Math.cos(startAngle) * 0.9 + bias.x * 0.35,
      y: bias.y * 0.35,
      z: Math.sin(startAngle) * 0.9
    }, sceneState.cameraAngle, bend * 0.03);

    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const radius = lerp(0.9, length, t);
      const point = rotatePoint({
        x: Math.cos(startAngle) * radius + bias.x * t * 0.9,
        y: Math.sin(t * Math.PI) * bend * 0.3 + bias.y * t * 0.9,
        z: Math.sin(startAngle) * radius
      }, sceneState.cameraAngle, bend * 0.03);
      drawLine3D(previous, point, width * (1 - t * 0.45), color, 0.95);
      previous = point;
    }

    return previous;
  }

  function drawCuboidCluster(metrics, bias) {
    const count = Math.min(40, Math.max(5, Math.round(4 + Math.min(metrics.selfCrossings, 24) + metrics.jaggedness / 20)));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + sceneState.cameraAngle * 0.3;
      const center = rotatePoint({
        x: Math.cos(angle) * (1.6 + i * 0.08) + bias.x * 0.7,
        y: Math.sin(i * 0.7) * 0.5 + bias.y * 0.9,
        z: Math.sin(angle) * (1.6 + i * 0.08)
      }, sceneState.cameraAngle, 0.25);
      const size = 0.25 + metrics.peakSpeed / 8000 + (i % 3) * 0.04;
      drawSphere(center, size, "rgba(255, 154, 104, 0.85)", 0.95);
      drawLine3D(
        { x: center.x - size, y: center.y, z: center.z },
        { x: center.x + size, y: center.y, z: center.z },
        0.035,
        "rgba(255, 236, 210, 0.55)"
      );
      drawLine3D(
        { x: center.x, y: center.y - size, z: center.z },
        { x: center.x, y: center.y + size, z: center.z },
        0.035,
        "rgba(255, 236, 210, 0.55)"
      );
    }
  }

  function drawConch(metrics, bias) {
    const turns = 70;
    let previous = null;
    for (let i = 0; i < turns; i += 1) {
      const t = i / (turns - 1);
      const angle = t * (Math.PI * 4.6 + metrics.turningIntensity * 25);
      const radius = 0.45 + t * (2.2 + metrics.averageSpeed / 2200);
      const point = rotatePoint({
        x: Math.cos(angle) * radius + bias.x * t,
        y: (t - 0.5) * 2.4 + bias.y * t,
        z: Math.sin(angle) * radius
      }, sceneState.cameraAngle, 0.35);
      if (previous) {
        drawLine3D(previous, point, 0.06 + (1 - t) * 0.08, "rgba(255, 154, 104, 0.92)");
      }
      previous = point;
    }
  }

  function drawDodecahedral(metrics, bias) {
    const points = [];
    const count = 12;
    for (let i = 0; i < count; i += 1) {
      const theta = (i / count) * Math.PI * 2;
      const phi = (i % 2 === 0 ? 0.7 : 2.1);
      points.push(rotatePoint({
        x: Math.cos(theta) * 1.8 + bias.x * 0.6,
        y: Math.sin(phi + i * 0.3) * 1.2 + bias.y * 0.5,
        z: Math.sin(theta) * 1.8
      }, sceneState.cameraAngle, 0.45));
    }
    for (let i = 0; i < points.length; i += 1) {
      drawSphere(points[i], 0.18 + metrics.smoothness / 300, "rgba(186, 199, 255, 0.94)");
      drawLine3D(points[i], points[(i + 1) % points.length], 0.04, "rgba(168, 198, 255, 0.6)");
      drawLine3D(points[i], points[(i + 4) % points.length], 0.03, "rgba(135, 215, 199, 0.4)");
    }
  }

  function drawFern(metrics, bias) {
    const branches = Math.min(28, Math.max(4, Math.round(4 + metrics.jaggedness / 18 + Math.min(metrics.selfCrossings, 24))));
    for (let i = 0; i < branches; i += 1) {
      const angle = (i / branches) * Math.PI * 2;
      const tip = drawBranch(
        angle,
        2.6 + metrics.peakSpeed / 2100,
        metrics.turningIntensity * 28 + i * 0.2,
        0.055 + metrics.smoothness / 1600,
        "rgba(255, 154, 104, 0.92)",
        bias
      );
      for (let j = 0; j < 3; j += 1) {
        const leafOffset = (j + 1) / 4;
        const leafBase = rotatePoint({
          x: lerp(Math.cos(angle) * 0.9, tip.x, leafOffset),
          y: lerp(bias.y * 0.35, tip.y, leafOffset),
          z: lerp(Math.sin(angle) * 0.9, tip.z, leafOffset)
        }, 0, 0);
        const leafTip = rotatePoint({
          x: leafBase.x + Math.cos(angle + (j % 2 === 0 ? 1.1 : -1.1)) * 0.65,
          y: leafBase.y + 0.25,
          z: leafBase.z + Math.sin(angle + (j % 2 === 0 ? 1.1 : -1.1)) * 0.65
        }, sceneState.cameraAngle, 0.1);
        drawLine3D(leafBase, leafTip, 0.03, "rgba(135, 215, 199, 0.78)");
      }
    }
  }

  function drawFluffy(metrics, bias) {
    const count = Math.min(48, Math.max(12, Math.round(10 + Math.min(metrics.selfCrossings, 18) * 2 + metrics.smoothness / 10)));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + sceneState.cameraAngle * 0.5;
      const radius = 1.2 + Math.sin(i * 1.9) * 0.35 + metrics.averageSpeed / 3000;
      const point = rotatePoint({
        x: Math.cos(angle) * radius + bias.x * 0.8,
        y: Math.sin(i * 0.8) * 0.9 + bias.y * 0.7,
        z: Math.sin(angle) * radius
      }, sceneState.cameraAngle, 0.2);
      drawSphere(point, 0.28 + metrics.smoothness / 140, "rgba(241, 245, 255, 0.8)", 0.8);
    }
  }

  function drawCore(metrics, bias) {
    const baseRadius = 0.9 + metrics.averageSpeed / 2600;
    const core = rotatePoint({
      x: bias.x * 0.4,
      y: bias.y * 0.35,
      z: 0
    }, sceneState.cameraAngle, metrics.turningIntensity * 6);
    const coreColor = metrics.directness > 0.55 ? "rgba(186, 199, 255, 0.95)" : "rgba(142, 207, 190, 0.95)";
    drawSphere(core, baseRadius, coreColor, 0.95);
    const ringCount = Math.min(1 + Math.round(Math.min(metrics.selfCrossings, 12) / 3), metrics.generatorFamily === "conch-like" ? 7 : 5);
    for (let i = 0; i < ringCount; i += 1) {
      drawRing(baseRadius + 0.55 + i * 0.24, bias.y * 0.3, 0.2 + i * 0.12, "rgba(156, 200, 255, 0.55)", 0.7);
    }
  }

  function render() {
    previewContext.clearRect(0, 0, sceneState.width, sceneState.height);

    const background = previewContext.createRadialGradient(
      sceneState.width * 0.5,
      sceneState.height * 0.26,
      20,
      sceneState.width * 0.5,
      sceneState.height * 0.5,
      sceneState.width * 0.65
    );
    background.addColorStop(0, "rgba(135, 215, 199, 0.15)");
    background.addColorStop(0.45, "rgba(255, 142, 93, 0.08)");
    background.addColorStop(1, "rgba(5, 11, 22, 0)");
    previewContext.fillStyle = background;
    previewContext.fillRect(0, 0, sceneState.width, sceneState.height);

    previewContext.strokeStyle = "rgba(95, 133, 175, 0.22)";
    previewContext.lineWidth = 1;
    previewContext.beginPath();
    previewContext.ellipse(sceneState.width * 0.5, sceneState.height * 0.72, sceneState.width * 0.22, sceneState.height * 0.06, 0, 0, Math.PI * 2);
    previewContext.stroke();

    const metrics = sceneState.metrics;
    const bias = edgeBias(metrics.endEdge);

    drawCore(metrics, bias);

    switch (metrics.generatorFamily) {
      case "conch-like":
        drawConch(metrics, bias);
        break;
      case "dodecahedral":
        drawDodecahedral(metrics, bias);
        break;
      case "fluffy-cloud":
        drawFluffy(metrics, bias);
        break;
      case "cuboid":
        drawCuboidCluster(metrics, bias);
        break;
      default:
        drawFern(metrics, bias);
        break;
    }
  }

  function resize() {
    const width = previewSurface.clientWidth;
    const height = previewSurface.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    previewCanvas.width = Math.round(width * ratio);
    previewCanvas.height = Math.round(height * ratio);
    previewCanvas.style.width = `${width}px`;
    previewCanvas.style.height = `${height}px`;
    previewContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    sceneState.width = width;
    sceneState.height = height;
    render();
  }

  function animate() {
    sceneState.cameraAngle += 0.008;
    render();
    requestAnimationFrame(animate);
  }

  resize();
  animate();

  return {
    resize,
    syncFromMetrics(metrics) {
      sceneState.metrics = { ...metrics };
      render();
    }
  };
}

const previewGenerator = createPreviewGenerator();

canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", extendStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("pointerleave", (event) => {
  if (state.drawing && event.buttons === 0) {
    endStroke(event);
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (window.PointerEvent) return;
  beginStroke(normalizeMouseEvent(event));
});

window.addEventListener("mousemove", (event) => {
  if (window.PointerEvent || !state.drawing) return;
  extendStroke(normalizeMouseEvent(event));
});

window.addEventListener("mouseup", (event) => {
  if (window.PointerEvent || !state.drawing) return;
  endStroke(normalizeMouseEvent(event));
});

canvas.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  beginStroke(normalizeTouchEvent(event, touch, 1));
}, { passive: false });

canvas.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (!touch || !state.drawing) return;
  extendStroke(normalizeTouchEvent(event, touch, 1));
}, { passive: false });

window.addEventListener("touchend", (event) => {
  if (!state.drawing) return;
  const touch = event.changedTouches[0];
  if (!touch) return;
  endStroke(normalizeTouchEvent(event, touch, 0));
}, { passive: false });

brainstormInput.addEventListener("input", () => {
  renderIdeaCards();
});

clearButton.addEventListener("click", clearStroke);
shareButton.addEventListener("click", copyCurrentSettings);
window.addEventListener("resize", () => {
  resizeCanvas();
  previewGenerator.resize();
});

createAttributeInputs();
loadHabitatStateFromUrl();
applyMetrics({ ...state.metrics }, "manual");
resizeCanvas();
drawScene();
