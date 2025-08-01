const VF = Vex.Flow;

  const scoreDiv = document.getElementById("score");
  const beatsPerMeasure = 4;
  const beatValue = 4;
  let notesData = [];
  let selectedDuration = "q";

  let BPM = 60;
  let beatDuration = 60 / BPM;

  // Audio context for playing sounds
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  async function unlockAudioContext() {
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
      console.log("AudioContext resumed");
    }
  }

  window.addEventListener("touchstart", unlockAudioContext, { once: true, passive: true });
  window.addEventListener("pointerdown", unlockAudioContext, { once: true, passive: true });
  window.addEventListener("click", unlockAudioContext, { once: true, passive: true });

  // Clear previous SVG and init context
  function initContext(width, height) {
    // Remove previous SVG content
    while (scoreDiv.firstChild) {
      scoreDiv.removeChild(scoreDiv.firstChild);
    }
    renderer.resize(width, height);
    context = renderer.getContext();
  }

  // Setup renderer and context
  const renderer = new VF.Renderer(scoreDiv, VF.Renderer.Backends.SVG);
  let context = null;
  initContext(scoreDiv.clientWidth || 600, 300);

  function getNoteDuration(duration) {
    const type = duration.replace("r", "");
    switch (type) {
      case "w":
        return 4;
      case "h":
        return 2;
      case "q":
        return 1;
      case "8":
        return 0.5;
      case "16":
        return 0.25;
      default:
        return 0;
    }
  }

  function getDurationStringFromBeats(beats) {
    if (beats === 4) return "w";
    if (beats === 2) return "h";
    if (beats === 1) return "q";
    if (beats === 0.5) return "8";
    if (beats === 0.25) return "16";
    return null;
  }

  function isRest(duration) {
    return duration.includes("r");
  }

  function snapTo16th(val) {
    const snap = [0, 0.25, 0.5, 0.75];
    let closest = snap.reduce((prev, curr) =>
      Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
    );
    return closest;
  }

  function estimateMeasureWidth(measureNotes) {
    const totalBeats = measureNotes.reduce((sum, n) => sum + getNoteDuration(n.duration), 0);
    const baseWidth = totalBeats * 50;
    const smallNotesCount = measureNotes.filter((n) => ["8", "16"].some((d) => n.duration.includes(d))).length;
    const extraWidth = smallNotesCount * 15;
    return Math.max(70, baseWidth + extraWidth);
  }

  function redrawScore() {
    const containerWidth = scoreDiv.clientWidth || 600;
    const lineHeight = 120;
    const marginX = 10;
    const marginY = 20;

    // ล้าง SVG แล้วสร้าง context ใหม่
    initContext(containerWidth, lineHeight * 5);

    const measures = [];
    let currentMeasure = [];
    let currentBeats = 0;

    notesData.forEach((note) => {
      const dur = getNoteDuration(note.duration);
      if (currentBeats + dur > beatsPerMeasure) {
        measures.push(currentMeasure);
        currentMeasure = [];
        currentBeats = 0;
      }
      currentMeasure.push(note);
      currentBeats += dur;
    });
    if (currentMeasure.length > 0) measures.push(currentMeasure);

    notesData.forEach((n) => delete n.vexNote);

    let lines = [[]];
    let currentLineWidth = 0;
    const maxLineWidth = containerWidth - marginX * 2;

    measures.forEach((measureNotes) => {
      const w = estimateMeasureWidth(measureNotes);
      if (currentLineWidth + w > maxLineWidth && currentLineWidth > 0) {
        lines.push([measureNotes]);
        currentLineWidth = w;
      } else {
        lines[lines.length - 1].push(measureNotes);
        currentLineWidth += w;
      }
    });

    let noteCounter = 0;

    lines.forEach((lineMeasures, lineIndex) => {
      let x = marginX;
      const y = marginY + lineIndex * lineHeight;

      lineMeasures.forEach((measureNotes, measureIndex) => {
        const tickables = [];

        measureNotes.forEach((noteInfo) => {
          const rest = isRest(noteInfo.duration);
          const durBeats = getNoteDuration(noteInfo.duration);
          const beatCountBefore = notesData
            .slice(0, noteCounter)
            .reduce((sum, n) => sum + getNoteDuration(n.duration), 0);

          const beatInMeasure = Math.floor(beatCountBefore % 4);
          const positionInBeat = beatCountBefore % 1;
          const rounded = snapTo16th(positionInBeat);

          const note = new VF.StaveNote({
            keys: [rest ? "b/4" : "a/4"],
            duration: noteInfo.duration,
            clef: "treble",
          });

          // Annotation text (คำอ่านโน้ต)
          let text = "";

          if (rest) {
            if (durBeats === 4) {
              text = "ย1 2 3 4";
            } else if (durBeats === 2) {
              const start = beatInMeasure + 1;
              const end = start + 1;
              if (end <= 4) text = `ย${start} ${end}`;
              else text = `ย${start}`;
            } else {
              const restMap = {
                0: "ย1",
                0.25: "ยe",
                0.5: "ย&",
                0.75: "ยa",
              };
              text = restMap[rounded] || "ยติ";
            }
          } else {
            if (durBeats === 4) {
              text = "1 2 3 4";
            } else if (durBeats === 2) {
              const start = beatInMeasure + 1;
              const end = start + 1;
              if (end <= 4) text = `${start} ${end}`;
              else text = `${start}`;
            } else {
              const map = {
                0: ["1", "2", "3", "4"][beatInMeasure],
                0.25: "e",
                0.5: "&",
                0.75: "a",
              };
              text = map[rounded] || "ติ";
            }
          }

          if (text) {
            const annotation = new VF.Annotation(text)
              .setFont("TH Sarabun New", 16, "normal")
              .setJustification(VF.Annotation.Justify.CENTER)
              .setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);
            note.addAnnotation(0, annotation);
          }

          noteInfo.vexNote = note;
          tickables.push(note);
          noteCounter++;
        });

        const staveNotes = tickables.filter((t) => t instanceof VF.StaveNote);
        const beams = VF.Beam.generateBeams(staveNotes.filter((n) => !isRest(n.duration)));

        const staveWidth = estimateMeasureWidth(measureNotes);
        const stave = new VF.Stave(x, y, staveWidth);
        if (lineIndex === 0 && measureIndex === 0) {
          stave.addTimeSignature(`${beatsPerMeasure}/${beatValue}`);
        }
        stave.setEndBarType(
          lineIndex === lines.length - 1 && measureIndex === lineMeasures.length - 1
            ? VF.Barline.type.END
            : VF.Barline.type.SINGLE
        );
        stave.setContext(context).draw();

        const voice = new VF.Voice({ num_beats: beatsPerMeasure, beat_value: beatValue });
        voice.setStrict(false);
        voice.addTickables(tickables);

        new VF.Formatter()
          .joinVoices([voice])
          .formatToStave([voice], stave, { paddingBetweenNotes: 8 });

        voice.draw(context, stave);
        beams.forEach((beam) => beam.setContext(context).draw());

        x += staveWidth;
      });
    });

    drawAllTies();
  }

  function drawAllTies() {
    for (let i = 0; i < notesData.length - 1; i++) {
      const current = notesData[i];
      const next = notesData[i + 1];
      if (current.tied && current.vexNote && next && next.vexNote) {
        new VF.StaveTie({
          first_note: current.vexNote,
          last_note: next.vexNote,
          first_indices: [0],
          last_indices: [0],
        }).setContext(context).draw();
      }
    }
  }

  function addNoteByDuration(duration) {
    const beatsToAdd = getNoteDuration(duration);
    const totalBeats = notesData.reduce((sum, n) => sum + getNoteDuration(n.duration), 0);
    const maxBeats = beatsPerMeasure * 4;

    if (totalBeats >= maxBeats) {
      alert("ใส่โน้ตได้สูงสุด 4 ห้องเท่านั้น");
      return;
    }

    const beatsInMeasure = totalBeats % beatsPerMeasure;
    const spaceLeft = (beatsInMeasure === 0 && totalBeats > 0) ? 0 : beatsPerMeasure - beatsInMeasure;
    const rest = isRest(duration);

    if (beatsToAdd > spaceLeft && spaceLeft > 0) {
      const firstPart = getDurationStringFromBeats(spaceLeft);
      const secondPart = getDurationStringFromBeats(beatsToAdd - spaceLeft);
      if (firstPart && secondPart) {
        notesData.push({ duration: rest ? `${firstPart}r` : firstPart, tied: true });
        notesData.push({ duration: rest ? `${secondPart}r` : secondPart, tied: false });
      } else {
        notesData.push({ duration, tied: false });
      }
    } else {
      notesData.push({ duration, tied: false });
    }

    redrawScore();
  }

  // โหลดเสียง
  const audioCache = {};

  async function loadSoundBuffer(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return audioCtx.decodeAudioData(arrayBuffer);
  }

  async function preloadAllAudio() {
    const words = ["หนึ่ง", "สอง", "สาม", "สี่", "อิ", "และ", "อะ", "ติ"];
    const clicks = { "click-1": "audio/click1.mp3", "click-other": "audio/click.mp3" };

    for (const word of words) {
      try {
        const buffer = await loadSoundBuffer(`audio/${word}.mp3`);
        audioCache[word] = buffer;
      } catch (e) {
        console.warn(`โหลดเสียง ${word} ไม่ได้`, e);
      }
    }
    for (const id in clicks) {
      try {
        const buffer = await loadSoundBuffer(clicks[id]);
        audioCache[id] = buffer;
      } catch (e) {
        console.warn(`โหลดเสียง ${id} ไม่ได้`, e);
      }
    }
  }

  function playBuffer(name, time) {
    const buffer = audioCache[name];
    if (!buffer) return;

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 1;
    source.connect(gainNode).connect(audioCtx.destination);
    source.start(time);
  }

  function playAudioWordAt(word, whenTime) {
    playBuffer(word, whenTime);
  }

  function playClick(time, isBeatOne = false) {
    const name = isBeatOne ? "click-1" : "click-other";
    playBuffer(name, time);
  }

  async function playMetronomeAndSpeak() {
    if (audioCtx.state === "suspended") await audioCtx.resume();

    const beatNames = ["หนึ่ง", "สอง", "สาม", "สี่"];
    const countInBeats = 4;
    const startTime = audioCtx.currentTime + 0.5;
    let currentTime = startTime;

    for (let i = 0; i < countInBeats; i++) {
      const t = startTime + i * beatDuration;
      playClick(t, i % 4 === 0);
    }

    const notesStartTime = startTime + countInBeats * beatDuration;
    currentTime = notesStartTime;
    let totalBeat = 0;

    const totalBeats = notesData.reduce((sum, n) => sum + getNoteDuration(n.duration), 0);

    for (let i = 0; i < Math.floor(totalBeats); i++) {
      const t = notesStartTime + i * beatDuration;
      playClick(t, i % 4 === 0);
    }

    for (let i = 0; i < notesData.length; i++) {
      const note = notesData[i];
      const dur = getNoteDuration(note.duration);

      if (isRest(note.duration)) {
        totalBeat += dur;
        currentTime += beatDuration * dur;
        continue;
      }

      const prevTied = i > 0 ? notesData[i - 1].tied : false;
      if (note.tied === false && prevTied === true) {
        totalBeat += dur;
        currentTime += beatDuration * dur;
        continue;
      }

      const positionInBeat = totalBeat % 1;
      const rounded = snapTo16th(positionInBeat);
      const beatIndex = Math.floor(totalBeat) % 4;

      const map = {
        0: beatNames[beatIndex],
        0.25: "อิ",
        0.5: "และ",
        0.75: "อะ",
      };

      const word = map[rounded] || "ติ";
      playAudioWordAt(word, currentTime);

      totalBeat += dur;
      currentTime += beatDuration * dur;
    }
  }

  // UI Event
  const noteButtons = document.querySelectorAll(".note-btn");
  noteButtons.forEach((btn) => {
    btn.addEventListener("pointerdown", () => {
      noteButtons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedDuration = btn.getAttribute("data-duration");
      addNoteByDuration(selectedDuration);
    });
  });

  let lastTouchTime = 0;
  document.addEventListener(
    "touchend",
    function (e) {
      const now = Date.now();
      if (now - lastTouchTime <= 300) e.preventDefault();
      lastTouchTime = now;
    },
    { passive: false }
  );

  document.getElementById("btn-delete").addEventListener("click", () => {
    notesData.pop();
    redrawScore();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    notesData = [];
    redrawScore();
  });

  document.getElementById("btn-speak").addEventListener("click", async () => {
    await unlockAudioContext();
    playMetronomeAndSpeak();
  });

  const tempoSlider = document.getElementById("tempo-range");
  const tempoLabel = document.getElementById("tempo-label");

  tempoSlider.addEventListener("input", () => {
    BPM = parseInt(tempoSlider.value);
    beatDuration = 60 / BPM;
    tempoLabel.textContent = BPM;
  });

  window.addEventListener("resize", () => {
    redrawScore();
  });

  // ตั้งค่าเริ่มต้น
  document.querySelector('.note-btn[data-duration="q"]').classList.add("selected");
  redrawScore();

  window.addEventListener("load", async () => {
    await preloadAllAudio();
    redrawScore();
  });
