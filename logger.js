
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