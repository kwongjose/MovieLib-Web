import ffprobeStatic from 'ffprobe-static'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfprobePath(ffprobeStatic.path)

// Resolves with nulls on failure rather than rejecting - a corrupt or
// unreadable video shouldn't block the rest of the import.
export function probeResolution(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (error, data) => {
      if (error) {
        resolve({ width: null, height: null, resolution_label: null })
        return
      }

      const videoStream = data.streams?.find((s) => s.codec_type === 'video')
      if (!videoStream?.width || !videoStream?.height) {
        resolve({ width: null, height: null, resolution_label: null })
        return
      }

      const { width, height } = videoStream
      resolve({ width, height, resolution_label: `${width} x ${height}` })
    })
  })
}
