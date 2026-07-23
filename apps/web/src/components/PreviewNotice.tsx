import { Download, Github, Info } from 'lucide-react'
import { PREVIEW_MODE } from '../lib/api'

const REPOSITORY_URL = 'https://github.com/jingyikcheah-hub/CyberVett'
const ZIP_URL = `${REPOSITORY_URL}/archive/refs/heads/main.zip`

export function PreviewNotice() {
  if (!PREVIEW_MODE) return null

  return (
    <aside className="preview-notice" aria-label="Deployment preview notice">
      <div className="preview-notice-copy">
        <Info size={17} />
        <span><strong>UI preview only.</strong> No live backend, database, real authentication, or Gemini API is connected.</span>
      </div>
      <div className="preview-notice-actions">
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={15} /> Repository</a>
        <a href={ZIP_URL}><Download size={15} /> Download ZIP</a>
      </div>
    </aside>
  )
}
