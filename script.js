const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline, StaveTie, Annotation } = Vex.Flow;

const scoreDiv = document.getElementById("score");
const renderer = new Renderer(scoreDiv, Renderer.Backends.SVG);
const context = renderer.getContext();

const beatsPerMeasure = 4;
const beatValue = 4;
let notesData = [];
let selectedDuration = "q";

const BPM = 60;
const beatDuration = 60000 / BPM;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audioCache = {};

function getNoteDuration(duration) {
    const type = duration.replace('r', '');
    switch (type) {
        case 'w': return 4;
        case 'h': return 2;
        case 'q': return 1;
        case '8': return 0.5;
        case '16': return 0.25;
        default: return 0;
    }
}

function getDurationStringFromBeats(beats) {
    if (beats === 4) return 'w';
    if (beats === 2) return 'h';
    if (beats === 1) return 'q';
    if (beats === 0.5) return '8';
    if (beats === 0.25) return '16';
    return null;
}

function isRest(duration) {
    return duration.includes('r');
}

function estimateMeasureWidth(measureNotes) {
    const totalBeats = measureNotes.reduce((sum, n) => sum + getNoteDuration(n.duration), 0);
    const baseWidth = totalBeats * 50;
    const smallNotesCount = measureNotes.filter(n => ['8', '16'].some(d => n.duration.includes(d))).length;
    const extraWidth = smallNotesCount * 15;
    return Math.max(70, baseWidth + extraWidth);
}

function redrawScore() {
    context.clear();

    const containerWidth = scoreDiv.clientWidth || 600;
    const lineHeight = 120;
    const marginX = 10;
    const marginY = 20;

    // แบ่ง notesData เป็น measures ตาม beatsPerMeasure
    const measures = [];
    let currentMeasure = [];
    let currentBeats = 0;

    notesData.forEach(note => {
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

    // ลบ vexNote เก่า
    notesData.forEach(n => delete n.vexNote);

    // แบ่ง measures เป็น lines ตาม container width
    let lines = [[]];
    let currentLineWidth = 0;
    const maxLineWidth = containerWidth - marginX * 2;

    measures.forEach(measureNotes => {
        const w = estimateMeasureWidth(measureNotes);
        if (currentLineWidth + w > maxLineWidth && currentLineWidth > 0) {
            lines.push([measureNotes]);
            currentLineWidth = w;
        } else {
            lines[lines.length - 1].push(measureNotes);
            currentLineWidth += w;
        }
    });

    renderer.resize(containerWidth, lineHeight * lines.length);

    let noteCounter = 0;

    lines.forEach((lineMeasures, lineIndex) => {
        let x = marginX;
        const y = marginY + lineIndex * lineHeight;

        lineMeasures.forEach((measureNotes, measureIndex) => {
            const tickables = [];

            measureNotes.forEach(noteInfo => {
                const rest = isRest(noteInfo.duration);
                const durBeats = getNoteDuration(noteInfo.duration);
                const beatCountBefore = notesData
                    .slice(0, noteCounter)
                    .reduce((sum, n) => sum + getNoteDuration(n.duration), 0);

                const beatInMeasure = Math.floor(beatCountBefore % 4);
                const positionInBeat = beatCountBefore % 1;
                const rounded = Math.round(positionInBeat * 100) / 100;

                const note = new StaveNote({
                    keys: [rest ? "b/4" : "a/4"],
                    duration: noteInfo.duration,
                    clef: "treble"
                });

                let text = "";

                if (rest) {
                    // ตัวหยุด
                    if (durBeats === 4) {
                        text = "ย1 2 3 4";
                    } else if (durBeats === 2) {
                        const start = beatInMeasure + 1;
                        const end = start + 1;
                        if (end <= 4) {
                            text = `ย${start} ${end}`;
                        } else {
                            text = `ย${start}`;
                        }
                    } else {
                        const restMap = {
                            0: "ย1",
                            0.25: "ยe",
                            0.5: "ย&",
                            0.75: "ยa"
                        };
                        text = restMap[rounded] || "ยติ";
                    }
                } else {
                    // ตัวโน้ต
                    if (durBeats === 4) {
                        text = "1 2 3 4";
                    } else if (durBeats === 2) {
                        const start = beatInMeasure + 1;
                        const end = start + 1;
                        if (end <= 4) {
                            text = `${start} ${end}`;
                        } else {
                            text = `${start}`;
                        }
                    } else {
                        const map = {
                            0: ["1", "2", "3", "4"][beatInMeasure],
                            0.25: "e",
                            0.5: "&",
                            0.75: "a"
                        };
                        text = map[rounded] || "ติ";
                    }
                }

                if (text) {
                    const annotation = new Annotation(text)
                        .setFont("TH Sarabun New", 16, "")
                        .setJustification(Annotation.Justify.CENTER)
                        .setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
                    note.addAnnotation(0, annotation);
                }

                noteInfo.vexNote = note;
                tickables.push(note);
                noteCounter++;
            });




            const staveNotes = tickables.filter(t => t instanceof StaveNote);
            const beams = Beam.generateBeams(staveNotes.filter(n => !isRest(n.duration)));

            const staveWidth = estimateMeasureWidth(measureNotes);
            const stave = new Stave(x, y, staveWidth);
            if (lineIndex === 0 && measureIndex === 0) {
                stave.addTimeSignature(`${beatsPerMeasure}/${beatValue}`);
            }
            stave.setEndBarType(
                lineIndex === lines.length - 1 && measureIndex === lineMeasures.length - 1
                    ? Barline.type.END
                    : Barline.type.SINGLE
            );
            stave.setContext(context).draw();

            const voice = new Voice({ num_beats: beatsPerMeasure, beat_value: beatValue });
            voice.setStrict(false);
            voice.addTickables(tickables);

            new Formatter().joinVoices([voice]).formatToStave([voice], stave, { paddingBetweenNotes: 8 });

            voice.draw(context, stave);
            beams.forEach(beam => beam.setContext(context).draw());

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
            new StaveTie({
                first_note: current.vexNote,
                last_note: next.vexNote,
                first_indices: [0],
                last_indices: [0]
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

function loadAudioSamples() {
    const words = ["หนึ่ง", "สอง", "สาม", "สี่", "อิ", "และ", "อะ", "ติ"];
    return Promise.all(
        words.map(word =>
            new Promise(resolve => {
                const audio = new Audio(`audio/${word}.mp3`);
                audioCache[word] = audio;
                audio.addEventListener("canplaythrough", resolve, { once: true });
            })
        )
    );
}

function playAudioWordAt(word, whenTime) {
    fetch(`audio/${word}.mp3`)
        .then(res => res.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
            const source = audioCtx.createBufferSource();
            source.buffer = decoded;
            source.connect(audioCtx.destination);
            source.start(whenTime);
        });
}

function playClick(time, isStrong = false) {
  const file = isStrong ? 'click1.mp3' : 'click.mp3';
  fetch(`audio/${file}`)
    .then(res => res.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => {
      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(audioCtx.destination);
      source.start(time);
    });
}



async function playMetronomeAndSpeak() {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    await loadAudioSamples();

    const beatNames = ["หนึ่ง", "สอง", "สาม", "สี่"];
    const countInBeats = 4; // นับนำเข้า 4 จังหวะ
    const startTime = audioCtx.currentTime + 0.5;
    let currentTime = startTime;

    // 🔊 นับนำเข้า
    for (let i = 0; i < countInBeats; i++) {
        const clickTime = startTime + (i * beatDuration) / 1000;
        const isStrong = i % 4 === 0;
        playClick(clickTime, isStrong);
    }

    const notesStartTime = startTime + (countInBeats * beatDuration) / 1000;
    currentTime = notesStartTime;
    let totalBeat = 0;

    const totalBeats = notesData.reduce((sum, n) => sum + getNoteDuration(n.duration), 0);

    // 🔔 คลิกพร้อมโน้ต
    for (let i = 0; i < Math.floor(totalBeats); i++) {
        const time = notesStartTime + (i * beatDuration) / 1000;
        const isStrong = i % 4 === 0;
        playClick(time, isStrong);
    }

    // 🔉 อ่านโน้ต
    for (let i = 0; i < notesData.length; i++) {
        const note = notesData[i];
        const dur = getNoteDuration(note.duration);

        if (isRest(note.duration)) {
            totalBeat += dur;
            currentTime += (beatDuration * dur) / 1000;
            continue;
        }

        const prevTied = i > 0 ? notesData[i - 1].tied : false;
        if (note.tied === false && prevTied === true) {
            totalBeat += dur;
            currentTime += (beatDuration * dur) / 1000;
            continue;
        }

        const positionInBeat = totalBeat % 1;
        const rounded = Math.round(positionInBeat * 100) / 100;
        const beatIndex = Math.floor(totalBeat) % 4;

        const map = {
            0: beatNames[beatIndex],
            0.25: "อิ",
            0.5: "และ",
            0.75: "อะ"
        };

        const word = map[rounded] || "ติ";
        playAudioWordAt(word, currentTime);

        totalBeat += dur;
        currentTime += (beatDuration * dur) / 1000;
    }
}



// UI event binding
const noteButtons = document.querySelectorAll(".note-btn");
noteButtons.forEach(btn => {
    btn.addEventListener('pointerdown', () => {
        noteButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedDuration = btn.getAttribute('data-duration');
        addNoteByDuration(selectedDuration);
    });
});

document.getElementById('btn-delete').addEventListener('click', () => {
    notesData.pop();
    redrawScore();
});

document.getElementById('btn-clear').addEventListener('click', () => {
    notesData = [];
    redrawScore();
});

document.getElementById('btn-speak').addEventListener('click', () => {
    playMetronomeAndSpeak();
});

document.querySelector('.note-btn[data-duration="q"]').classList.add('selected');
redrawScore();

window.addEventListener('resize', () => {
    redrawScore();
});
