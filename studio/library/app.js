const state = {
  videos: [],
  filters: { subject: "", topic: "", language: "" },
};

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function populateSelect(select, values, currentValue) {
  const placeholder = select.querySelector("option[value='']");
  select.innerHTML = "";
  select.appendChild(placeholder);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = currentValue;
}

function matchesFilters(video) {
  const { subject, topic, language } = state.filters;
  if (subject && video.subject !== subject) return false;
  if (topic && video.topic !== topic) return false;
  if (language && video.language !== language) return false;
  return true;
}

function createTag(text, accent) {
  const span = document.createElement("span");
  span.className = accent ? "tag tag--accent" : "tag";
  span.textContent = text;
  return span;
}

function createReadyCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";

  const videoEl = document.createElement("video");
  videoEl.src = video.videoUrl;
  videoEl.controls = true;
  videoEl.preload = "metadata";
  card.appendChild(videoEl);

  card.appendChild(createCardBody(video));
  return card;
}

function createPendingCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";

  const placeholder = document.createElement("div");
  placeholder.className = "video-card__pending-placeholder";
  placeholder.textContent = "Not yet rendered";
  card.appendChild(placeholder);

  card.appendChild(createCardBody(video));
  return card;
}

function createCardBody(video) {
  const body = document.createElement("div");
  body.className = "video-card__body";

  const title = document.createElement("h3");
  title.className = "video-card__title";
  title.textContent = video.title;
  body.appendChild(title);

  const tags = document.createElement("div");
  tags.className = "video-card__tags";
  tags.appendChild(createTag(video.subject));
  tags.appendChild(createTag(video.topic, true));
  tags.appendChild(createTag(video.language.toUpperCase()));
  body.appendChild(tags);

  const meta = document.createElement("div");
  meta.className = "video-card__meta";
  meta.textContent =
    video.status === "ready"
      ? `${formatDuration(video.durationSeconds)} • ${video.exam} • ${video.sceneCount} scenes`
      : `${video.exam} • ${video.sceneCount} scenes`;
  body.appendChild(meta);

  return body;
}

function render() {
  const filtered = state.videos.filter(matchesFilters);
  const ready = filtered.filter((v) => v.status === "ready");
  const pending = filtered.filter((v) => v.status !== "ready");

  const readyGrid = document.getElementById("ready-grid");
  const pendingGrid = document.getElementById("pending-grid");
  readyGrid.innerHTML = "";
  pendingGrid.innerHTML = "";

  ready.forEach((video) => readyGrid.appendChild(createReadyCard(video)));
  pending.forEach((video) => pendingGrid.appendChild(createPendingCard(video)));

  document.getElementById("ready-empty").hidden = ready.length > 0;
  document.getElementById("pending-empty").hidden = pending.length > 0;
}

function wireFilters() {
  const subjectSelect = document.getElementById("filter-subject");
  const topicSelect = document.getElementById("filter-topic");
  const languageSelect = document.getElementById("filter-language");

  populateSelect(subjectSelect, uniqueSorted(state.videos.map((v) => v.subject)), "");
  populateSelect(topicSelect, uniqueSorted(state.videos.map((v) => v.topic)), "");
  populateSelect(languageSelect, uniqueSorted(state.videos.map((v) => v.language)), "");

  subjectSelect.addEventListener("change", () => {
    state.filters.subject = subjectSelect.value;
    render();
  });
  topicSelect.addEventListener("change", () => {
    state.filters.topic = topicSelect.value;
    render();
  });
  languageSelect.addEventListener("change", () => {
    state.filters.language = languageSelect.value;
    render();
  });

  document.getElementById("reset-filters").addEventListener("click", () => {
    state.filters = { subject: "", topic: "", language: "" };
    subjectSelect.value = "";
    topicSelect.value = "";
    languageSelect.value = "";
    render();
  });
}

async function main() {
  const summary = document.getElementById("summary");
  try {
    const response = await fetch("/library.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.videos = data.videos;

    const readyCount = state.videos.filter((v) => v.status === "ready").length;
    summary.textContent = `${readyCount} ready • ${state.videos.length - readyCount} pending • updated ${new Date(
      data.generatedAt
    ).toLocaleString()}`;

    wireFilters();
    render();
  } catch (error) {
    summary.textContent = "Failed to load library.json";
    console.error(error);
  }
}

main();
