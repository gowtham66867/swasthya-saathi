// Ephemeral media only. All API operations remain application-owned callbacks.
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
    if (isBusy()) return;
    try {
      requireConsent();
      if (!mediaDevices?.getUserMedia || !Recorder)
        throw Error("Recording unavailable. Type the patient’s words.");
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
      ].find((t) => Recorder.isTypeSupported(t));
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
      recorder.onstop = () => {
        clock.clearInterval(timer);
        acquired.getTracks().forEach((t) => t.stop());
        stream = null;
        recording = null;
        setBusy(false);
        button.textContent = t(target ? "answer" : "record");
        $("voice-title").textContent = t("voice");
        document.querySelector(".voice-box").classList.remove("recording");
        if (flow.state === "cancelled" || !$("consent").checked)
          return status("Recording discarded.");
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
      stream?.getTracks().forEach((t) => t.stop());
      recording = null;
      setBusy(false);
      status(e.message);
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
