const creatureShareButton = document.getElementById("creatureShareButton");
const creatureResetButton = document.getElementById("creatureResetButton");
const creatureShareStatus = document.getElementById("creatureShareStatus");
const creatureAttributeGrid = document.getElementById("creatureAttributeGrid");
const creatureBrainstormInput = document.getElementById("creatureBrainstormInput");
const creatureIdeaCards = document.getElementById("creatureIdeaCards");
const swarmPreview = document.getElementById("swarmPreview");
const specimenPreview = document.getElementById("specimenPreview");

const CREATURE_FIELDS = [
  { key: "populationCount", label: "How many", type: "number", min: 6, max: 300, step: 1, unit: "creatures" },
  { key: "bodySize", label: "How large", type: "number", min: 0.4, max: 4, step: 0.1, unit: "relative size" },
  { key: "swimSpeed", label: "How fast", type: "number", min: 0.1, max: 5, step: 0.1, unit: "swim rate" },
  { key: "squiggliness", label: "Squiggly", type: "number", min: 0, max: 100, step: 1, unit: "0 rigid - 100 elastic" },
  { key: "spikiness", label: "Spiky", type: "number", min: 0, max: 100, step: 1, unit: "0 round - 100 spiky" },
  { key: "sociability", label: "Social", type: "number", min: 0, max: 100, step: 1, unit: "0 solitary - 100 schooling" },
  {
    key: "surfaceStyle",
    label: "Surface style",
    type: "select",
    options: ["patterned", "gradiented", "single-color", "bumpy", "shiny", "hairy"],
    unit: "appearance"
  },
  { key: "luminosity", label: "Luminosity", type: "number", min: 0, max: 100, step: 1, unit: "glow strength" },
  { key: "curiosity", label: "Curiosity", type: "number", min: 0, max: 100, step: 1, unit: "exploration" },
  { key: "territoriality", label: "Territoriality", type: "number", min: 0, max: 100, step: 1, unit: "defense pressure" },
  { key: "schoolTightness", label: "School tightness", type: "number", min: 0, max: 100, step: 1, unit: "cohesion" },
  { key: "pulseRhythm", label: "Pulse rhythm", type: "number", min: 0, max: 100, step: 1, unit: "fin/body pulsing" },
  { key: "awareness", label: "Awareness", type: "number", min: 0, max: 100, step: 1, unit: "reaction speed" },
  { key: "depthBias", label: "Depth bias", type: "number", min: 0, max: 100, step: 1, unit: "0 reef-hugging - 100 open water" }
];

const DEFAULT_CREATURES = {
  populationCount: 84,
  bodySize: 1.5,
  swimSpeed: 1.7,
  squiggliness: 68,
  spikiness: 41,
  sociability: 76,
  surfaceStyle: "patterned",
  luminosity: 34,
  curiosity: 63,
  territoriality: 27,
  schoolTightness: 72,
  pulseRhythm: 58,
  awareness: 69,
  depthBias: 61
};

const creatureState = {
  traits: { ...DEFAULT_CREATURES }
};

const creatureFieldElements = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatValue(value, step) {
  const digits = step < 1 ? String(step).split(".")[1].length : 0;
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function seededNoise(seed) {
  const value = Math.sin(seed * 128.318 + seed * seed * 27.17) * 43758.5453;
  return value - Math.floor(value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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

function buildCreatureIdeas(traits) {
  const note = creatureBrainstormInput.value.trim();
  const schooling = traits.sociability > 65 ? "braided shoals" : "loose, drifting encounters";
  const silhouette = traits.spikiness > 60 ? "thorned fins and sensor spines" : "softer, rounded mantles";
  const texture = {
    patterned: "striped or spotted markings that ripple through the colony",
    gradiented: "body tones that shift from head to tail or core to rim",
    "single-color": "disciplined monochrome bodies with subtle value variation",
    bumpy: "raised nodules that make them feel coral-grown or bio-printed",
    shiny: "wet metallic skins that catch habitat light like polished hulls",
    hairy: "fine filaments that make the outline feel feathery or fungal"
  }[traits.surfaceStyle];

  return [
    {
      title: "Current note",
      body: note || "Use this space for ecology notes, behavioural rules, or surface material references."
    },
    {
      title: "Swarm logic",
      body: `At the current settings the species reads as ${schooling}. School tightness ${Math.round(traits.schoolTightness)} and curiosity ${Math.round(traits.curiosity)} can decide whether they maintain formations or keep peeling away to inspect the environment.`
    },
    {
      title: "Body plan",
      body: `The current body leans toward ${silhouette}. Squiggliness ${Math.round(traits.squiggliness)} can drive how much the spine undulates, while body size ${traits.bodySize.toFixed(1)} and speed ${traits.swimSpeed.toFixed(1)} shape tail length and cruising posture.`
    },
    {
      title: "Surface treatment",
      body: `Surface style is ${traits.surfaceStyle}, so emphasize ${texture}. Luminosity ${Math.round(traits.luminosity)} can decide whether the effect is faintly bioluminescent or mostly material-based.`
    },
    {
      title: "Additional variable candidates",
      body: "Good future candidates: lifespan, brood size, docking affinity, threat display intensity, cleaning behaviour, mimicry strength, day-night rhythm, and symbiosis dependence."
    }
  ];
}

function renderCreatureIdeas() {
  const ideas = buildCreatureIdeas(creatureState.traits);
  creatureIdeaCards.innerHTML = ideas.map((idea) => `
    <article class="idea-card">
      <h3>${idea.title}</h3>
      <p>${idea.body}</p>
    </article>
  `).join("");
}

function buildCreatureSharePayload() {
  return {
    version: "0.1",
    type: "creature-foundry",
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
    if (parsed.traits) {
      creatureState.traits = {
        ...DEFAULT_CREATURES,
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

  function drawCreature(center, yaw, traits, seed, cameraZ, focusScale = 1) {
    const size = traits.bodySize * focusScale;
    const bodySegments = 9;
    const wave = traits.squiggliness / 100;
    const spike = traits.spikiness / 100;
    const social = traits.sociability / 100;
    const pulse = 1 + Math.sin(viewState.time * (0.8 + traits.pulseRhythm / 70) + seed) * (traits.pulseRhythm / 300);
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
      const finLength = (0.16 + spike * 0.42) * size * base.scale * 24;
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
    const schoolRadius = lerp(6.8, 2.8, traits.schoolTightness / 100);
    const curiositySpread = lerp(0.7, 2.6, traits.curiosity / 100);
    const territorialPush = lerp(0.2, 1.4, traits.territoriality / 100);
    const awarenessSnap = lerp(0.3, 1.4, traits.awareness / 100);

    for (let index = 0; index < count; index += 1) {
      const seed = index * 0.73 + 3.7;
      const angle = viewState.time * (0.18 + traits.swimSpeed * 0.08 + awarenessSnap * 0.02) + seededNoise(seed) * Math.PI * 2;
      const ring = 0.5 + seededNoise(seed + 8) * schoolRadius + curiositySpread * Math.sin(viewState.time * 0.11 + seed);
      const center = {
        x: Math.cos(angle + seed) * ring * (1.4 + territorialPush * 0.35) + Math.sin(viewState.time * 0.17 + seed) * 0.4,
        y: Math.sin(angle * (1.1 + awarenessSnap * 0.15) + seed * 0.6) * (1.2 + traits.depthBias / 140) + (traits.depthBias - 50) / 70,
        z: Math.sin(angle + seed * 1.2) * ring * (1.1 + territorialPush * 0.25) + Math.cos(viewState.time * 0.16 + seed) * 0.7
      };
      const yaw = angle + Math.sin(viewState.time * (0.35 + awarenessSnap * 0.08) + seed) * (traits.squiggliness / 150);
      drawCreature(center, yaw, traits, seed, cameraZ, 0.92);
    }

    ctx.strokeStyle = "rgba(143, 173, 214, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(viewState.width * 0.5, viewState.height * 0.8, viewState.width * 0.24, viewState.height * 0.04, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function renderSpecimen() {
    const traits = creatureState.traits;
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
    drawCreature({ x: 0, y: 0, z: 0 }, yaw, traits, 2.4, -2.8, 1.8);
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

function resetCreatureState() {
  creatureState.traits = { ...DEFAULT_CREATURES };
  syncTraitInputs();
  syncPreviews();
  creatureShareStatus.textContent = "Creature settings reset to default colony values.";
}

creatureBrainstormInput.addEventListener("input", renderCreatureIdeas);
creatureShareButton.addEventListener("click", copyCreatureSettings);
creatureResetButton.addEventListener("click", resetCreatureState);
window.addEventListener("resize", () => {
  swarmRenderer.resize();
  specimenRenderer.resize();
});

createTraitInputs();
loadCreatureStateFromUrl();
syncTraitInputs();
syncPreviews();
