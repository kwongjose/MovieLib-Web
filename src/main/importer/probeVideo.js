import { existsSync } from 'node:fs'
import ffprobeStatic from 'ffprobe-static'
import ffmpeg from 'fluent-ffmpeg'

// ffprobe-static derives its path from its own __dirname. In a packaged app
// that lands inside app.asar, but an archived file has no real path on disk
// and cannot be executed - so the binary is listed in asarUnpack and the
// path has to be redirected to the unpacked copy sitting next to the
// archive. Without this every probe fails and every movie imports with a
// blank resolution, which is exactly what happened.
const ffprobePath = ffprobeStatic.path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

if (!existsSync(ffprobePath)) {
  console.error(`[probe] ffprobe binary missing at ${ffprobePath} - resolutions will not be detected`)
}

ffmpeg.setFfprobePath(ffprobePath)

// Resolves with nulls rather than rejecting - one corrupt or unreadable file
// shouldn't abort an import - but always says why, because a silent null is
// indistinguishable from "this file genuinely has no video stream".
export function probeResolution(filePath) {
  return new Promise((resolve) => {
    const unknown = { width: null, height: null, resolution_label: null }

    ffmpeg.ffprobe(filePath, (error, data) => {
      if (error) {
        console.warn(`[probe] failed for ${filePath}: ${error.message}`)
        resolve(unknown)
        return
      }

      const videoStream = data.streams?.find((s) => s.codec_type === 'video')
      if (!videoStream?.width || !videoStream?.height) {
        console.warn(`[probe] no video stream with dimensions in ${filePath}`)
        resolve(unknown)
        return
      }

      const { width, height } = videoStream
      resolve({ width, height, resolution_label: `${width} x ${height}` })
    })
  })
}
