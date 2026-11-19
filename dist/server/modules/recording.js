// Ephemeral media only. All API operations remain application-owned callbacks.
export function recordingError(error) {
  if (
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(
      error?.name,
    )
  )
    return "Microphone access was blocked. Allow the microphone in this browser’s site settings and in your device settings, then retry. If this is an in-app browser, open this page directly in Chrome or Safari.";
  if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name))
    return "No microphone was found. Connect or enable a microphone, then retry, or type the patient’s words.";
  if (
    ["NotReadableError", "TrackStartError", "AbortError"].includes(error?.name)
  )
    return "The microphone could not start. Close other apps using it, check your device’s microphone settings, and retry.";
  if (error?.name === "NotSupportedError")
    return "This browser cannot record a supported audio format. Open this page directly in Chrome or Safari, or type the patient’s words.";
  return (
    error?.message || "Recording failed. Retry or type the patient’s words."
  );
}
export function createRecording({
  $,
  t,
  flow,
  isBusy,
  getRevision,
  requireConsent,
  observeStart,
  resetDerived,
  move,
  setBusy,
  status,
  task,
  api,
  onTranscript,
  mediaDevices = globalThis.navigator?.mediaDevices,
  Recorder = globalThis.MediaRecorder,
  clock = globalThis,
}) {
  let recording = null,
    requesting = false,
    stream = null,
    timer = null,
    audioUrl = null;
  function cleanAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    $("audio").pause();
    $("audio").removeAttribute("src");
    $("audio").hidden = true;
  }
  async function speakText(text, onPlayed) {
    return task(async (signal, check) => {
      requireConsent();
      if (!text.trim()) throw Error("Add patient text first.");
      cleanAudio();
      status(t("speaking"));
      const data = await api(
        "speak",
        { text, language: $("language").value },
        signal,
      );
      check();
      audioUrl = URL.createObjectURL(
        new Blob(
          [Uint8Array.from(atob(data.audios[0]), (c) => c.charCodeAt(0))],
          { type: "audio/wav" },
        ),
      );
      $("audio").src = audioUrl;
      $("audio").hidden = false;
      try {
        await $("audio").play();
        onPlayed?.();
      } catch {
        status("Audio ready. Press play.");
      }
    });
  }
  async function startCapture(target = null, button = $("record")) {
    if (recording) {
      recording.stop();
      return;
    }
    if (requesting || isBusy()) return;
    try {
      requireConsent();
      if (!mediaDevices?.getUserMedia || !Recorder)
        throw Error(
          "Recording is unavailable in this browser. Open this HTTPS page directly in Chrome or Safari and allow microphone access, or type the patient’s words.",
        );
      requesting = true;
      status(
        "Waiting for microphone permission. Choose Allow in the browser prompt.",
      );
      const revision = getRevision();
      const acquired = await mediaDevices.getUserMedia({ audio: true });
      if (revision !== getRevision() || !$("consent").checked) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      observeStart();
      if (!target) {
        resetDerived();
        move("consented");
      }
      const chunks = [];
      const type = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => Recorder.isTypeSupported?.(t));
      const recorder = new Recorder(
        stream,
        type ? { mimeType: type } : undefined,
      );
      recording = recorder;
      const language = $("language").value;
      setBusy(true);
      button.disabled = false;
      $("consent").disabled = false;
      button.textContent = t("stop");
      document.querySelector(".voice-box").classList.add("recording");
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      let seconds = 0;
      timer = clock.setInterval(() => {
        $("voice-title").textContent = `${t("listening")} · ${++seconds}/25`;
        if (seconds >= 25 && recorder.state === "recording") recorder.stop();
      }, 1000);
      let captureError = null;
      const finishCapture = () => {
        clock.clearInterval(timer);
        acquired.getTracks().forEach((t) => t.stop());
        stream = null;
        recording = null;
        setBusy(false);
        button.textContent = t(target ? "answer" : "record");
        $("voice-title").textContent = t("voice");
        document.querySelector(".voice-box").classList.remove("recording");
      };
      recorder.onerror = (event) => {
        captureError =
          event.error ||
          new Error("Audio capture failed. Retry or type the patient’s words.");
        finishCapture();
        status(recordingError(captureError));
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.onstop = () => {
        finishCapture();
        if (captureError) return;
        if (flow.state === "cancelled" || !$("consent").checked)
          return status("Recording discarded.");
        if (!chunks.some((chunk) => chunk.size))
          return status(
            "No audio was captured. Check the microphone and try a longer recording, or type the patient’s words.",
          );
        task(async (signal, check) => {
          const form = new FormData();
          const extension = recorder.mimeType.includes("mp4")
            ? "m4a"
            : recorder.mimeType.includes("ogg")
              ? "ogg"
              : "webm";
          form.append(
            "file",
            new Blob(chunks, { type: recorder.mimeType }),
            "recording." + extension,
          );
          form.append("language", language);
          status(t("processing"));
          const data = await api("transcribe", form, signal);
          check();
          if (!data.transcript?.trim())
            throw Error("No speech detected. Try again or type.");
          if (target) {
            target.value = data.transcript;
            status(t("recorded"));
          } else {
            onTranscript(data.transcript);
          }
        });
      };
      recorder.start();
    } catch (e) {
      clock.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recording = null;
      setBusy(false);
      button.textContent = t(target ? "answer" : "record");
      $("voice-title").textContent = t("voice");
      document.querySelector(".voice-box")?.classList.remove("recording");
      status(recordingError(e));
    } finally {
      requesting = false;
    }
  }

  return {
    startCapture,
    speakText,
    cleanAudio,
    get active() {
      return Boolean(recording);
    },
    stop() {
      recording?.stop();
    },
    dispose() {
      clock.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      cleanAudio();
    },
  };
}
