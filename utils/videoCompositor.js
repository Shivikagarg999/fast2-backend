const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const os = require("os");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansDevanagari-Bold.ttf");

// ffmpeg's drawtext filter treats these as special characters — escape them
// so a caption containing a colon, quote, etc. doesn't break the filtergraph.
const escapeDrawtext = (text) =>
  String(text)
    .replace(/\\/g, "")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/\n/g, " ");

/**
 * Merge a silent video with a voiceover track, and burn in the script as
 * captions (Devanagari-capable font) for muted-autoplay viewers. Output
 * duration is the shorter of video/audio (-shortest), which matters since
 * TTS duration and the generated video's native duration rarely match exactly.
 * @param {Buffer} videoBuffer - silent MP4
 * @param {Buffer} audioBuffer - MP3 voiceover
 * @param {string} captionText - Hindi script, burned in as a caption
 * @returns {Promise<Buffer>} final MP4
 */
const mergeVideoWithVoiceover = (videoBuffer, audioBuffer, captionText) => {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const stamp = Date.now();
    const videoPath = path.join(tmpDir, `gmkart_video_${stamp}.mp4`);
    const audioPath = path.join(tmpDir, `gmkart_audio_${stamp}.mp3`);
    const outputPath = path.join(tmpDir, `gmkart_final_${stamp}.mp4`);

    const cleanup = () => {
      for (const p of [videoPath, audioPath, outputPath]) {
        fs.unlink(p, () => {});
      }
    };

    try {
      fs.writeFileSync(videoPath, videoBuffer);
      fs.writeFileSync(audioPath, audioBuffer);
    } catch (err) {
      return reject(err);
    }

    const safeCaption = escapeDrawtext(captionText).slice(0, 180);
    const drawtextFilter = `drawtext=fontfile='${FONT_PATH.replace(/\\/g, "/").replace(/:/g, "\\:")}':text='${safeCaption}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h-th-80:line_spacing=6`;

    ffmpeg(videoPath)
      .input(audioPath)
      .outputOptions(["-shortest", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-c:a", "aac", "-vf", drawtextFilter])
      .save(outputPath)
      .on("end", () => {
        try {
          const finalBuffer = fs.readFileSync(outputPath);
          cleanup();
          resolve(finalBuffer);
        } catch (err) {
          cleanup();
          reject(err);
        }
      })
      .on("error", (err) => {
        cleanup();
        reject(err);
      });
  });
};

module.exports = { mergeVideoWithVoiceover };
