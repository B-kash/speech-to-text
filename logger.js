
const toConsole = (level, message, detail) => {
  const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  if (detail) {
    console[consoleMethod](`[Speech] ${message}`, detail);
  } else {
    console[consoleMethod](`[Speech] ${message}`);
  }
};

export const createLogger = (logList, debugEnabled = Boolean(window.debug_mode)) => {

  return (level, message, detail) => {
      toConsole(level, message, detail);
  };

};

export const resetLogView = (logList) => {
  if (logList) {
    logList.innerHTML = "";
  }
};

export const updateLogSectionVisibility = (section, debugEnabled = Boolean(window.debug_mode)) => {
  if (section) {
    section.hidden = !debugEnabled;
    section.classList.toggle("hidden", !debugEnabled);
  }
};

const toView = (level, message, detail) => {
  const MAX_LOG_ENTRIES = 50;

  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("li");
  entry.className = `logs__entry logs__entry--${level}`;
  entry.innerHTML = `<span class="logs__time">${timestamp}</span><span class="logs__message">${message}</span>`;

  if (detail) {
    const detailText = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    entry.dataset.detail = detailText;
  }

  logList.prepend(entry);

  if (logList.children.length > MAX_LOG_ENTRIES) {
    logList.removeChild(logList.lastElementChild);
  }

  toConsole(level, message, detail);
}