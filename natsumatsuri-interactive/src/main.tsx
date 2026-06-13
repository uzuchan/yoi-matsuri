import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createGoldfishStallDialogue } from './game/dialogue'

// 合成点(D-008): 具象 DialogueController(店主会話 = GDD §3.1)を生成して App へ注入する。
// App は controller 注入時のみ DialogueScene を生成・登録・配線する。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={createGoldfishStallDialogue()} />
  </StrictMode>,
)
