import {
  createLogger,
  resetLogView,
  updateLogSectionVisibility,
} from "./logger.js";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const SELECTORS = {
  startButton: "start-button",
  stopButton: "stop-button",
  clearButton: "clear-button",
  downloadButton: "download-button",
  languageSelect: "language-select",
  statusIndicator: "status-indicator",
  statusText: "status-text",
  transcriptOutput: "transcript-output",
  clearLogButton: "clear-log-button",
  eventLog: "event-log",
  unsupportedTemplate: "unsupported-template",
};

const collectElements = () => {
  const byId = (id) => document.getElementById(id);
  return {
    startButton: byId(SELECTORS.startButton),
    stopButton: byId(SELECTORS.stopButton),
    clearButton: byId(SELECTORS.clearButton),
    downloadButton: byId(SELECTORS.downloadButton),
    languageSelect: byId(SELECTORS.languageSelect),
    statusIndicator: byId(SELECTORS.statusIndicator),
    statusText: byId(SELECTORS.statusText),
    transcriptOutput: byId(SELECTORS.transcriptOutput),
    clearLogButton: Boolean(window.debug_mode) ? byId(SELECTORS.clearLogButton) : null,
    logList: Boolean(window.debug_mode) ? byId(SELECTORS.eventLog) : null,
    logSection: document.querySelector(".logs"),
    unsupportedTemplate: byId(SELECTORS.unsupportedTemplate),
  };
};

const createState = () => ({
  isListening: false,
  manualStop: false,
  interimTranscript: "",
  finalSegments: [],
  restartTimerId: null,
  lastRenderedTranscript: "",
});

const buildTranscript = (state) => {
  const transcript = state.finalSegments.join("\n");
  const interim = state.interimTranscript.trim();
  return interim ? [transcript, interim].filter(Boolean).join("\n") : transcript;
};

const setStatus = (elements, text, isActive = false) => {
  elements.statusText.textContent = text;
  elements.statusIndicator.classList.toggle("status__indicator--listening", isActive);
  elements.statusIndicator.classList.toggle("status__indicator--idle", !isActive);
};

const renderTranscript = (state, elements, log) => {
  const transcript = buildTranscript(state);
  if (transcript === state.lastRenderedTranscript) {
    return;
  }

  elements.transcriptOutput.value = transcript;
  elements.transcriptOutput.textContent = transcript;
  elements.transcriptOutput.scrollTop = elements.transcriptOutput.scrollHeight;
  state.lastRenderedTranscript = transcript;

  log("info", "Transcript rendered to UI", {
    characters: transcript.length,
    lines: transcript ? transcript.split("\n").length : 0,
  });
};

const syncControlState = (state, elements) => {
  const hasFinal = state.finalSegments.length > 0;
  const hasAny = hasFinal || Boolean(state.interimTranscript.trim());

  elements.startButton.disabled = state.isListening;
  elements.stopButton.disabled = !state.isListening;
  elements.clearButton.disabled = !hasAny;
  elements.downloadButton.disabled = !hasFinal;
};

const clearRestartTimer = (state) => {
  if (state.restartTimerId) {
    window.clearTimeout(state.restartTimerId);
    state.restartTimerId = null;
  }
};

const scheduleAutoRestart = (state, recognition, log, updateStatus) => {
  if (state.manualStop) {
    log("info", "Auto-restart skipped because stop was requested manually");
    return;
  }

  if (document.visibilityState === "hidden") {
    log("warn", "Tab hidden - delaying recognition restart until it becomes visible");
    return;
  }

  clearRestartTimer(state);
  state.restartTimerId = window.setTimeout(() => {
    log("info", "Attempting to restart recognition after unexpected stop");
    try {
      recognition.start();
    } catch (error) {
      log("error", "Auto-restart failed", error);
      updateStatus("Idle (auto-restart failed)");
    }
  }, 350);
};

const handleUnsupported = (elements, log) => {
  log("error", "Web Speech API is unavailable in this browser");
  const fragment = elements.unsupportedTemplate?.content.cloneNode(true);
  if (fragment && elements.appContainer) {
    elements.appContainer.replaceChildren(fragment);
  }
};

const createRecognition = () => {
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
};

const attachControlHandlers = ({
  elements,
}) => {
  if (Boolean(window.debug_mode) && elements.clearLogButton) {
    elements.clearLogButton.addEventListener("click", onClearLogClick);
  }
  elements.startButton.addEventListener("click", onStartClick);
  elements.stopButton.addEventListener("click", onStopClick);
  elements.clearButton.addEventListener("click", onClearClick);
  elements.downloadButton.addEventListener("click", onDownloadClick);

};

const onDownloadClick = () => {
  if (state.finalSegments.length === 0) return;
  const transcript = state.finalSegments.join("\n").trim();
  if (!transcript) return;

  const blob = new Blob([`${transcript}\n`], { type: "text/plain" });
  const downloadLink = document.createElement("a");
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `transcript-${date}.txt`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  URL.revokeObjectURL(downloadLink.href);
  downloadLink.remove();
  log("info", "Transcript downloaded", { bytes: blob.size });
}

const onClearClick = () => {
  console.log("Clearing transcript as requested by user", state);
  resetTranscript();
  renderCurrentTranscript();
  syncControls();
  console.log(state);
};

const onStopClick = () => {
  if (!state.isListening) return;
  log("info", "Stop requested by user");
  state.manualStop = true;
  clearRestart();
  recognition.stop();
}

const onStartClick = () => {
  if (state.isListening) return;
  try {
    recognition.lang = elements.languageSelect.value;
    state.manualStop = false;
    log("info", "Start requested", { language: recognition.lang });
    recognition.start();
  } catch (error) {
    log("error", "Failed to start recognition", error);
    updateStatus("Start failed. Check console for details.");
  }
}

const onClearLogClick = () => {
  resetLogView(elements.logList);
  log("info", "Event log cleared by user");
}

const onRecStart = () => {
  state.isListening = true;
  clearRestart();
  updateStatus("Listening...", true);
  syncControls();
  log("info", "Recognition started");
};

const onRecEnd = () => {
  state.isListening = false;
  updateStatus("Idle");
  syncControls();
  log("warn", "Recognition ended", { manualStop: state.manualStop });
  scheduleRestart();
  state.manualStop = false;
};

const onRecError = (event) => {
  log("error", `Speech recognition error: ${event.error}`, event.message || event);
  updateStatus(`Error: ${event.error}`);
}

const onRecResult = (event) => {
  let interimAggregate = "";
  let newSegments = 0;

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const transcript = result[0].transcript.trim();
    const confidence = typeof result[0].confidence === "number"
      ? Number(result[0].confidence.toFixed(2))
      : null;

    if (result.isFinal) {
      if (transcript) {
        state.finalSegments.push(transcript);
        newSegments += 1;
        log("info", "Finalized segment", { transcript, confidence });
      }
    } else {
      interimAggregate += `${transcript} `;
    }
  }

  state.interimTranscript = interimAggregate.trim();
  renderCurrentTranscript();
  syncControls();

  if (!newSegments && state.interimTranscript) {
    log("info", "Receiving interim transcript", { interim: state.interimTranscript });
  }
};

const attachRecognitionHandlers = ({
  recognition,
  state,
  log,
  updateStatus,
}) => {
  recognition.onstart = onRecStart
  recognition.onend = onRecEnd
  recognition.onerror = onRecError
  recognition.onresult = onRecResult
  recognition.onaudiostart = () => { log("info", "Audio capture started"); };
  recognition.onaudioend = () => { if (state.isListening) { updateStatus("Audio stopped. Attempting to resume..."); } log("warn", "Audio stream ended while listening"); };
  recognition.onspeechstart = () => log("info", "Speech detected");
  recognition.onspeechend = () => log("info", "Speech ended");
  recognition.onsoundstart = () => log("info", "Sound detected");
  recognition.onsoundend = () => log("info", "Sound ended");
  recognition.onnomatch = () => log("warn", "Speech not recognized (no match)");
};

const attachVisibilityHandler = ({ state, scheduleRestart, log }) => {
  document.addEventListener("visibilitychange", () => {
    log("info", "Visibility changed", { state: document.visibilityState });
    if (document.visibilityState === "visible" && !state.isListening && !state.manualStop) {
      scheduleRestart();
    }
  });
};

const resetTranscript = () => {
  state.finalSegments.length = 0;
  state.interimTranscript = "";
};

const state = createState();
const elements = collectElements();
const recognition = createRecognition();

const updateStatus = (text, isActive = false) => setStatus(elements, text, isActive);
const renderCurrentTranscript = () => renderTranscript(state, elements, log);
const syncControls = () => syncControlState(state, elements);
const clearRestart = () => clearRestartTimer(state);
const scheduleRestart = () => scheduleAutoRestart(state, recognition, log, updateStatus);

updateLogSectionVisibility(elements.logSection);

const log = createLogger(elements.logList);
log("info", "Initializing speech-to-text demo");

if (!SpeechRecognition) {
  handleUnsupported(elements, log);
}

if (!elements.transcriptOutput) {
  log("error", "Transcript output element is missing from the DOM");
}


attachControlHandlers({ elements });
attachRecognitionHandlers({
  recognition,
  state,
  log,
  updateStatus,
});

attachVisibilityHandler({ state, scheduleRestart, log });

renderCurrentTranscript();
syncControls();


document.addEventListener("DOMContentLoaded", ()=>{});